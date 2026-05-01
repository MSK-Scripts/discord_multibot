"""
bots/minigames/cogs/tictactoe.py
──────────────────────────────────
TicTacToe – Player vs Bot.
Difficulty levels: Easy (random), Medium (logic), Hard (Minimax).
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.points_manager import add_points, get_pts, notify_rewards, points_footer

log = logging.getLogger(__name__)

EMPTY  = ""
PLAYER = "X"
BOT    = "O"

WINNING_COMBOS = [
    (0, 1, 2), (3, 4, 5), (6, 7, 8),
    (0, 3, 6), (1, 4, 7), (2, 5, 8),
    (0, 4, 8), (2, 4, 6),
]

DIFFICULTY_LABELS = {
    "easy":   "🟢 Easy",
    "medium": "🟡 Medium",
    "hard":   "🔴 Hard",
}

CELL_EMOJIS = {PLAYER: "❌", BOT: "⭕", EMPTY: "⬜"}


# ─── Game logic ───────────────────────────────────────────────────────────────

def check_winner(board: list) -> Optional[str]:
    for a, b, c in WINNING_COMBOS:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    return None


def is_draw(board: list) -> bool:
    return all(c != EMPTY for c in board) and check_winner(board) is None


def available_moves(board: list) -> list:
    return [i for i, c in enumerate(board) if c == EMPTY]


def _ai_easy(board: list) -> int:
    return random.choice(available_moves(board))


def _winning_move(board: list, symbol: str) -> Optional[int]:
    for move in available_moves(board):
        board[move] = symbol
        won = check_winner(board) == symbol
        board[move] = EMPTY
        if won:
            return move
    return None


def _ai_medium(board: list) -> int:
    if (m := _winning_move(board, BOT)) is not None:
        return m
    if (m := _winning_move(board, PLAYER)) is not None and random.random() > 0.25:
        return m
    if random.random() < 0.40:
        return random.choice(available_moves(board))
    for pos in [4, 0, 2, 6, 8, 1, 3, 5, 7]:
        if board[pos] == EMPTY:
            return pos
    return random.choice(available_moves(board))


def _minimax(board: list, maximizing: bool, depth: int = 0) -> int:
    winner = check_winner(board)
    if winner == BOT:    return 10 - depth
    if winner == PLAYER: return depth - 10
    if is_draw(board):   return 0
    if maximizing:
        best = -100
        for move in available_moves(board):
            board[move] = BOT
            best = max(best, _minimax(board, False, depth + 1))
            board[move] = EMPTY
        return best
    else:
        best = 100
        for move in available_moves(board):
            board[move] = PLAYER
            best = min(best, _minimax(board, True, depth + 1))
            board[move] = EMPTY
        return best


def _ai_hard(board: list) -> int:
    best_score, best_move = -100, -1
    for move in available_moves(board):
        board[move] = BOT
        score = _minimax(board, False)
        board[move] = EMPTY
        if score > best_score:
            best_score, best_move = score, move
    return best_move


# ─── Views ────────────────────────────────────────────────────────────────────

class DifficultyView(View):
    def __init__(self, player: discord.User) -> None:
        super().__init__(timeout=60)
        self.player = player
        for key, label in DIFFICULTY_LABELS.items():
            btn = Button(label=label, custom_id=f"ttt_diff_{key}", style=discord.ButtonStyle.primary)
            btn.callback = self._make_callback(key)
            self.add_item(btn)

    def _make_callback(self, difficulty: str):
        async def callback(interaction: discord.Interaction) -> None:
            if interaction.user.id != self.player.id:
                await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
                return
            self.stop()
            await interaction.response.defer()
            view = TicTacToeView(self.player, difficulty)
            await interaction.edit_original_response(embed=view.build_embed(), view=view)
        return callback

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True


class TicTacToeView(View):
    def __init__(self, player: discord.User, difficulty: str) -> None:
        super().__init__(timeout=120)
        self.player     = player
        self.difficulty = difficulty
        self.board      = [EMPTY] * 9
        self.game_over  = False
        self._rebuild()

    def _rebuild(self) -> None:
        self.clear_items()
        for i in range(9):
            cell  = self.board[i]
            style = (
                discord.ButtonStyle.danger    if cell == PLAYER else
                discord.ButtonStyle.primary   if cell == BOT    else
                discord.ButtonStyle.secondary
            )
            btn = Button(label=CELL_EMOJIS[cell], style=style,
                         custom_id=f"ttt_cell_{i}", row=i // 3,
                         disabled=self.game_over or cell != EMPTY)
            btn.callback = self._make_cb(i)
            self.add_item(btn)

    def _make_cb(self, index: int):
        async def callback(interaction: discord.Interaction) -> None:
            if interaction.user.id != self.player.id:
                await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
                return
            if self.game_over or self.board[index] != EMPTY:
                await interaction.response.defer()
                return
            self.board[index] = PLAYER
            result = self._eval()
            if result is None:
                await asyncio.sleep(0.4)
                move = (_ai_easy if self.difficulty == "easy" else
                        _ai_medium if self.difficulty == "medium" else _ai_hard)(self.board)
                self.board[move] = BOT
                result = self._eval()
            self._rebuild()

            # Punkte vergeben wenn Spiel beendet
            pts_delta, old, new = 0, 0, 0
            if result is not None:
                outcome = "win" if result == PLAYER else "lose" if result == BOT else "draw"
                pts_delta = get_pts("tictactoe", self.difficulty, outcome)
                old, new  = await add_points(interaction.user.id, pts_delta)

            await interaction.response.edit_message(
                embed=self.build_embed(result, pts_delta, new), view=self
            )
            if result is not None:
                await notify_rewards(interaction, old, new)
        return callback

    def _eval(self) -> Optional[str]:
        w = check_winner(self.board)
        if w:
            self.game_over = True
            return w
        if is_draw(self.board):
            self.game_over = True
            return "draw"
        return None

    def build_embed(self, result: Optional[str] = None, pts_delta: int = 0, total: int = 0) -> discord.Embed:
        diff   = DIFFICULTY_LABELS[self.difficulty]
        footer = "TicTacToe  •  /tictactoe to play again"
        if result is not None:
            footer += f"  •  {points_footer(pts_delta, total)}"
        if result is None:
            title, desc, color = "🎮 TicTacToe", f"Player: {self.player.mention} ❌ vs ⭕ Bot\nDifficulty: {diff}\n\nYour turn!", discord.Color.blurple()
        elif result == PLAYER:
            title, desc, color = "🏆 You won!", f"Well played, {self.player.mention}! ❌\nDifficulty: {diff}", discord.Color.green()
        elif result == BOT:
            title, desc, color = "🤖 Bot wins!", f"Better luck next time, {self.player.mention}.\nDifficulty: {diff}", discord.Color.red()
        else:
            title, desc, color = "🤝 Draw!", f"No winner this time, {self.player.mention}.\nDifficulty: {diff}", discord.Color.gold()
        embed = discord.Embed(title=title, description=desc, color=color)
        embed.set_footer(text=footer)
        return embed

    async def on_timeout(self) -> None:
        self.game_over = True
        for item in self.children:
            item.disabled = True


# ─── Cog ──────────────────────────────────────────────────────────────────────

class TicTacToeCog(commands.Cog, name="TicTacToe"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="tictactoe", description="Play TicTacToe against the bot!")
    async def tictactoe(self, interaction: discord.Interaction) -> None:
        embed = discord.Embed(
            title="🎮 TicTacToe – Choose Difficulty",
            description=f"Hello {interaction.user.mention}! You play as ❌.\n\nChoose a difficulty:",
            color=discord.Color.blurple(),
        )
        await interaction.response.send_message(embed=embed, view=DifficultyView(interaction.user))


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(TicTacToeCog(bot))
