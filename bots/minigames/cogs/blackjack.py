"""
bots/minigames/cogs/blackjack.py
──────────────────────────────────
/blackjack – Classic Blackjack against the dealer (bot).

Rules:
  - Dealer hits until 17+, stands on 17+
  - Blackjack (A + 10-value) pays 1.5×
  - Double Down available on first two cards
  - Ace = 11 (or 1 if bust)
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

_WIN_OUTCOMES  = {"blackjack", "dealer_bust", "win"}
_LOSE_OUTCOMES = {"bust", "dealer_bj", "lose"}
_DRAW_OUTCOMES = {"push", "push_bj"}


def _outcome_to_pts_key(outcome: str) -> str:
    """Gibt den Config-Key für Punkte zurück."""
    if outcome == "blackjack":    return "blackjack"
    if outcome in _WIN_OUTCOMES:  return "win"
    if outcome in _LOSE_OUTCOMES: return "lose"
    return "draw"  # push / push_bj

# ─── Card definitions ─────────────────────────────────────────────────────────

_SUITS  = ["♠", "♥", "♦", "♣"]
_RANKS  = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
_VALUES = {"A": 11, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
           "8": 8, "9": 9, "10": 10, "J": 10, "Q": 10, "K": 10}

# Suit colours for readability (red suits stand out)
_RED_SUITS = {"♥", "♦"}


def _card_str(rank: str, suit: str) -> str:
    return f"`{rank}{suit}`"


def _deck() -> list:
    """Returns a shuffled deck of (rank, suit) tuples."""
    cards = [(r, s) for r in _RANKS for s in _SUITS]
    random.shuffle(cards)
    return cards


def _hand_value(hand: list) -> int:
    """Calculate best hand value (ace = 11 or 1)."""
    total = sum(_VALUES[r] for r, _ in hand)
    aces  = sum(1 for r, _ in hand if r == "A")
    while total > 21 and aces:
        total -= 10
        aces  -= 1
    return total


def _hand_str(hand: list, hide_second: bool = False) -> str:
    cards = [_card_str(r, s) for r, s in hand]
    if hide_second and len(cards) >= 2:
        cards[1] = "`?`"
    return "  ".join(cards)


def _is_blackjack(hand: list) -> bool:
    return len(hand) == 2 and _hand_value(hand) == 21


# ─── View ─────────────────────────────────────────────────────────────────────

class BlackjackView(View):
    def __init__(self, player: discord.User) -> None:
        super().__init__(timeout=120)
        self.player    = player
        self.deck      = _deck()
        self.p_hand    = [self.deck.pop(), self.deck.pop()]
        self.d_hand    = [self.deck.pop(), self.deck.pop()]
        self.game_over = False
        self.doubled   = False

    def _can_double(self) -> bool:
        return len(self.p_hand) == 2 and not self.game_over

    def _hit(self) -> None:
        self.p_hand.append(self.deck.pop())

    def _dealer_play(self) -> None:
        """Dealer draws until 17+."""
        while _hand_value(self.d_hand) < 17:
            self.d_hand.append(self.deck.pop())

    def _resolve(self) -> str:
        """Returns outcome string after dealer plays."""
        p_val = _hand_value(self.p_hand)
        d_val = _hand_value(self.d_hand)
        p_bj  = _is_blackjack(self.p_hand)
        d_bj  = _is_blackjack(self.d_hand)

        if p_bj and d_bj: return "push_bj"
        if p_bj:           return "blackjack"
        if d_bj:           return "dealer_bj"
        if p_val > 21:     return "bust"
        if d_val > 21:     return "dealer_bust"
        if p_val > d_val:  return "win"
        if p_val < d_val:  return "lose"
        return "push"

    # ── Hit ───────────────────────────────────────────────────────────────────

    @discord.ui.button(label="🃏 Hit", style=discord.ButtonStyle.primary, custom_id="bj_hit", row=0)
    async def hit(self, interaction: discord.Interaction, button: Button) -> None:
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
            return
        if self.game_over:
            await interaction.response.defer()
            return

        self._hit()

        if _hand_value(self.p_hand) > 21:
            self.game_over = True
            self._disable_all()
            pts_delta = get_pts("blackjack", "lose")
            old, new  = await add_points(interaction.user.id, pts_delta)
            await interaction.response.edit_message(embed=self._build_embed("bust", pts_delta, new), view=self)
            await notify_rewards(interaction, old, new)
            return

        # Disable Double after first hit
        for item in self.children:
            if hasattr(item, "custom_id") and item.custom_id == "bj_double":
                item.disabled = True

        await interaction.response.edit_message(embed=self._build_embed(), view=self)

    # ── Stand ─────────────────────────────────────────────────────────────────

    @discord.ui.button(label="✋ Stand", style=discord.ButtonStyle.secondary, custom_id="bj_stand", row=0)
    async def stand(self, interaction: discord.Interaction, button: Button) -> None:
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
            return
        if self.game_over:
            await interaction.response.defer()
            return

        self._dealer_play()
        self.game_over = True
        self._disable_all()
        outcome   = self._resolve()
        pts_key   = _outcome_to_pts_key(outcome)
        pts_delta = get_pts("blackjack", pts_key)
        old, new  = await add_points(interaction.user.id, pts_delta)
        await interaction.response.edit_message(embed=self._build_embed(outcome, pts_delta, new), view=self)
        await notify_rewards(interaction, old, new)

    # ── Double Down ───────────────────────────────────────────────────────────

    @discord.ui.button(label="✖️ Double Down", style=discord.ButtonStyle.danger, custom_id="bj_double", row=0)
    async def double_down(self, interaction: discord.Interaction, button: Button) -> None:
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
            return
        if self.game_over or not self._can_double():
            await interaction.response.defer()
            return

        self.doubled = True
        self._hit()

        if _hand_value(self.p_hand) > 21:
            self.game_over = True
            self._disable_all()
            pts_delta = get_pts("blackjack", "lose")
            old, new  = await add_points(interaction.user.id, pts_delta)
            await interaction.response.edit_message(embed=self._build_embed("bust", pts_delta, new), view=self)
            await notify_rewards(interaction, old, new)
            return

        # Forced stand after double
        self._dealer_play()
        self.game_over = True
        self._disable_all()
        outcome   = self._resolve()
        pts_key   = _outcome_to_pts_key(outcome)
        pts_delta = get_pts("blackjack", pts_key)
        old, new  = await add_points(interaction.user.id, pts_delta)
        await interaction.response.edit_message(embed=self._build_embed(outcome, pts_delta, new), view=self)
        await notify_rewards(interaction, old, new)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _disable_all(self) -> None:
        for item in self.children:
            item.disabled = True

    def _build_embed(self, outcome: Optional[str] = None, pts_delta: int = 0, total: int = 0) -> discord.Embed:
        reveal  = outcome is not None
        p_val   = _hand_value(self.p_hand)
        d_val   = _hand_value(self.d_hand)
        p_cards = _hand_str(self.p_hand)
        d_cards = _hand_str(self.d_hand, hide_second=not reveal)

        _OUTCOMES = {
            "blackjack":   ("🃏 Blackjack! You win 1.5×!", discord.Color.gold()),
            "push_bj":     ("🤝 Both Blackjack – Push!",    discord.Color.gold()),
            "dealer_bj":   ("🤖 Dealer Blackjack – You lose!", discord.Color.red()),
            "bust":        ("💥 Bust! You lose!",            discord.Color.red()),
            "dealer_bust": ("💥 Dealer busts – You win!",    discord.Color.green()),
            "win":         ("🏆 You win!",                   discord.Color.green()),
            "lose":        ("💀 You lose!",                  discord.Color.red()),
            "push":        ("🤝 Push – It's a tie!",         discord.Color.gold()),
        }

        if outcome and outcome in _OUTCOMES:
            title, color = _OUTCOMES[outcome]
        else:
            title, color = "🃏 Blackjack", discord.Color.blurple()

        doubled_note = "  *(doubled)*" if self.doubled else ""
        footer = "Blackjack  •  /blackjack to play again"
        if reveal and pts_delta != 0:
            footer += f"  •  {points_footer(pts_delta, total)}"

        embed = discord.Embed(title=title, color=color)
        embed.add_field(name=f"Your Hand  ({p_val}{doubled_note})", value=p_cards, inline=False)
        embed.add_field(name=f"Dealer's Hand  ({'?' if not reveal else d_val})", value=d_cards, inline=False)
        embed.set_footer(text=footer if reveal else "Hit, Stand or Double Down  •  /blackjack to play again")
        return embed

    async def on_ready(self) -> None:
        """Check for natural blackjack on deal."""
        pass

    async def on_timeout(self) -> None:
        self.game_over = True
        self._disable_all()


# ─── Cog ──────────────────────────────────────────────────────────────────────

class BlackjackCog(commands.Cog, name="Blackjack"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="blackjack", description="Play Blackjack against the dealer!")
    async def blackjack(self, interaction: discord.Interaction) -> None:
        view = BlackjackView(interaction.user)

        # Sofortiger Blackjack beim Deal → direkt auswerten und Punkte vergeben
        if _is_blackjack(view.p_hand):
            view._dealer_play()
            view.game_over = True
            view._disable_all()
            outcome   = view._resolve()
            pts_key   = _outcome_to_pts_key(outcome)
            pts_delta = get_pts("blackjack", pts_key)
            old, new  = await add_points(interaction.user.id, pts_delta)
            embed     = view._build_embed(outcome, pts_delta, new)
            await interaction.response.send_message(embed=embed, view=view)
            await notify_rewards(interaction, old, new)
        else:
            await interaction.response.send_message(embed=view._build_embed(), view=view)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(BlackjackCog(bot))
