"""
bots/minigames/cogs/connect4.py
─────────────────────────────────
/connect4 – Connect Four against the bot.
Board: 6 rows × 7 columns. Column buttons split across two rows.
Bot AI: win → block → center preference → random.
"""

from __future__ import annotations

import logging
import random
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.points_manager import add_points, get_pts, notify_rewards, points_footer

log = logging.getLogger(__name__)

ROWS, COLS = 6, 7
EMPTY    = 0
PLAYER   = 1
BOT      = 2

P_EMOJI  = "🔴"
B_EMOJI  = "🟡"
E_EMOJI  = "⬛"

COL_NUMS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"]


# ─── Game logic ───────────────────────────────────────────────────────────────

def _new_board() -> list:
    return [[EMPTY] * COLS for _ in range(ROWS)]


def _drop(board: list, col: int, token: int) -> Optional[int]:
    """Drop token in column. Returns the row index, or None if full."""
    for row in range(ROWS - 1, -1, -1):
        if board[row][col] == EMPTY:
            board[row][col] = token
            return row
    return None


def _check_win(board: list, token: int) -> bool:
    # Horizontal
    for r in range(ROWS):
        for c in range(COLS - 3):
            if all(board[r][c + i] == token for i in range(4)):
                return True
    # Vertical
    for r in range(ROWS - 3):
        for c in range(COLS):
            if all(board[r + i][c] == token for i in range(4)):
                return True
    # Diagonal ↘
    for r in range(ROWS - 3):
        for c in range(COLS - 3):
            if all(board[r + i][c + i] == token for i in range(4)):
                return True
    # Diagonal ↙
    for r in range(ROWS - 3):
        for c in range(3, COLS):
            if all(board[r + i][c - i] == token for i in range(4)):
                return True
    return False


def _is_draw(board: list) -> bool:
    return all(board[0][c] != EMPTY for c in range(COLS))


def _valid_cols(board: list) -> list:
    return [c for c in range(COLS) if board[0][c] == EMPTY]


def _bot_move(board: list) -> int:
    """Simple AI: win > block > center > random."""
    valid = _valid_cols(board)

    # Win in one move
    for col in valid:
        import copy
        test = copy.deepcopy(board)
        _drop(test, col, BOT)
        if _check_win(test, BOT):
            return col

    # Block player win
    for col in valid:
        import copy
        test = copy.deepcopy(board)
        _drop(test, col, PLAYER)
        if _check_win(test, PLAYER):
            return col

    # Prefer center columns
    preferred = sorted(valid, key=lambda c: -abs(c - COLS // 2) * -1)
    center_order = [3, 2, 4, 1, 5, 0, 6]
    for col in center_order:
        if col in valid:
            return col

    return random.choice(valid)


def _render_board(board: list) -> str:
    lines = []
    for row in board:
        line = ""
        for cell in row:
            if cell == PLAYER: line += P_EMOJI
            elif cell == BOT:  line += B_EMOJI
            else:              line += E_EMOJI
        lines.append(line)
    lines.append("".join(COL_NUMS))
    return "\n".join(lines)


# ─── View ─────────────────────────────────────────────────────────────────────

class Connect4View(View):
    def __init__(self, player: discord.User) -> None:
        super().__init__(timeout=180)
        self.player    = player
        self.board     = _new_board()
        self.game_over = False
        self._build_buttons()

    def _build_buttons(self) -> None:
        self.clear_items()
        valid = _valid_cols(self.board)
        # Row 0: cols 0–3, Row 1: cols 4–6
        for col in range(COLS):
            btn = Button(
                label=str(col + 1),
                style=discord.ButtonStyle.secondary,
                custom_id=f"c4_col_{col}",
                row=0 if col < 4 else 1,
                disabled=self.game_over or col not in valid,
            )
            btn.callback = self._make_cb(col)
            self.add_item(btn)

    def _make_cb(self, col: int):
        async def callback(interaction: discord.Interaction) -> None:
            if interaction.user.id != self.player.id:
                await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
                return
            if self.game_over:
                await interaction.response.defer()
                return

            # Player move
            row = _drop(self.board, col, PLAYER)
            if row is None:
                await interaction.response.defer()
                return

            if _check_win(self.board, PLAYER):
                self.game_over = True
                self._build_buttons()
                pts_delta = get_pts("connect4", "win")
                old, new  = await add_points(interaction.user.id, pts_delta)
                await interaction.response.edit_message(
                    embed=_build_embed(self.board, self.player, "player_win", pts_delta, new), view=self
                )
                await notify_rewards(interaction, old, new)
                return

            if _is_draw(self.board):
                self.game_over = True
                self._build_buttons()
                pts_delta = get_pts("connect4", "draw")
                old, new  = await add_points(interaction.user.id, pts_delta)
                await interaction.response.edit_message(
                    embed=_build_embed(self.board, self.player, "draw", pts_delta, new), view=self
                )
                await notify_rewards(interaction, old, new)
                return

            # Bot move
            bot_col = _bot_move(self.board)
            _drop(self.board, bot_col, BOT)

            if _check_win(self.board, BOT):
                self.game_over = True
                self._build_buttons()
                pts_delta = get_pts("connect4", "lose")
                old, new  = await add_points(interaction.user.id, pts_delta)
                await interaction.response.edit_message(
                    embed=_build_embed(self.board, self.player, "bot_win", pts_delta, new), view=self
                )
                await notify_rewards(interaction, old, new)
                return

            if _is_draw(self.board):
                self.game_over = True

            self._build_buttons()
            if self.game_over:
                pts_delta = get_pts("connect4", "draw")
                old, new  = await add_points(interaction.user.id, pts_delta)
                await interaction.response.edit_message(
                    embed=_build_embed(self.board, self.player, "draw", pts_delta, new), view=self
                )
                await notify_rewards(interaction, old, new)
            else:
                await interaction.response.edit_message(
                    embed=_build_embed(self.board, self.player, None), view=self
                )

        return callback

    async def on_timeout(self) -> None:
        self.game_over = True
        for item in self.children:
            item.disabled = True


def _build_embed(board: list, player: discord.User, result: Optional[str], pts_delta: int = 0, total: int = 0) -> discord.Embed:
    board_str = _render_board(board)
    footer    = "Connect 4  •  /connect4 to play again"
    if pts_delta != 0:
        footer += f"  •  {points_footer(pts_delta, total)}"

    if result == "player_win":
        title, desc, color = "🏆 You win!", f"{player.mention} connected four {P_EMOJI}!", discord.Color.green()
    elif result == "bot_win":
        title, desc, color = "🤖 Bot wins!", f"The bot connected four {B_EMOJI}. Better luck next time!", discord.Color.red()
    elif result == "draw":
        title, desc, color = "🤝 Draw!", "The board is full. No winner!", discord.Color.gold()
    else:
        title = "🔵 Connect Four"
        desc  = f"{P_EMOJI} {player.mention} vs {B_EMOJI} Bot\nYour turn — choose a column!"
        color = discord.Color.blurple()

    embed = discord.Embed(title=title, description=f"{board_str}\n\n{desc}", color=color)
    embed.set_footer(text=footer)
    return embed


# ─── Cog ──────────────────────────────────────────────────────────────────────

class Connect4Cog(commands.Cog, name="Connect4"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="connect4", description="Play Connect Four against the bot!")
    async def connect4(self, interaction: discord.Interaction) -> None:
        view  = Connect4View(interaction.user)
        embed = _build_embed(view.board, interaction.user, None)
        await interaction.response.send_message(embed=embed, view=view)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Connect4Cog(bot))
