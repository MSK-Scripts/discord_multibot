"""
bots/minigames/cogs/slots.py
──────────────────────────────
/slots – Slot machine with animated spinning and win detection.
"""

from __future__ import annotations

import asyncio
import random
import logging

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.points_manager import add_points, get_pts, notify_rewards, points_footer

log = logging.getLogger(__name__)

# Symbole mit Gewichtung (niedrigere Gewichtung = seltener)
_SYMBOLS = [
    ("🍒", 30),   # Häufig
    ("🍋", 25),
    ("🍊", 20),
    ("🍇", 15),
    ("⭐", 6),
    ("💎", 3),
    ("7️⃣", 1),   # Sehr selten
]

_POOL    = [s for s, w in _SYMBOLS for _ in range(w)]
_SPIN_FRAMES = 4  # Animationsschritte


def _spin() -> list:
    return [random.choice(_POOL) for _ in range(3)]


def _evaluate(reels: list) -> tuple:
    """Returns (multiplier, result_text)."""
    a, b, c = reels

    if a == b == c:
        symbol = a
        if symbol == "7️⃣":    return 50, "🎰 **JACKPOT!** 7️⃣7️⃣7️⃣ — **×50**!"
        if symbol == "💎":    return 20, "💎 **MEGA WIN!** 💎💎💎 — **×20**!"
        if symbol == "⭐":    return 10, "⭐ **BIG WIN!** ⭐⭐⭐ — **×10**!"
        return 5, f"🎉 **WIN!** {symbol}{symbol}{symbol} — **×5**!"

    if a == b or b == c or a == c:
        return 2, "🙂 **Small win!** Two matching symbols — **×2**!"

    return 0, "😔 **No match.** Better luck next time!"


class SlotsView(View):
    def __init__(self, player: discord.User) -> None:
        super().__init__(timeout=60)
        self.player  = player
        self.spinning = False

    @discord.ui.button(label="🎰 Spin!", style=discord.ButtonStyle.green, custom_id="slots_spin")
    async def spin(self, interaction: discord.Interaction, button: Button) -> None:
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
            return
        if self.spinning:
            await interaction.response.defer()
            return

        self.spinning    = True
        button.disabled  = True
        button.label     = "⏳ Spinning..."
        await interaction.response.edit_message(
            embed=_build_embed(["❓", "❓", "❓"], "Spinning...", discord.Color.yellow()),
            view=self,
        )

        # Animationsframes
        for _ in range(_SPIN_FRAMES):
            await asyncio.sleep(0.55)
            frame = _spin()
            try:
                await interaction.edit_original_response(
                    embed=_build_embed(frame, "Spinning...", discord.Color.yellow())
                )
            except discord.HTTPException:
                pass

        # Finales Ergebnis
        await asyncio.sleep(0.55)
        result_reels            = _spin()
        multiplier, result_text = _evaluate(result_reels)

        # Slot-Key für Punkte bestimmen
        if multiplier == 50:   slot_key = "jackpot"
        elif multiplier == 20: slot_key = "mega_win"
        elif multiplier == 10: slot_key = "big_win"
        elif multiplier == 5:  slot_key = "win"       # 3 gleiche normale Symbole
        elif multiplier == 2:  slot_key = "small_win" # 2 gleiche Symbole
        else:                  slot_key = "no_match"

        pts_delta = get_pts("slots", slot_key)
        old, new  = await add_points(interaction.user.id, pts_delta)

        color = (
            discord.Color.gold()  if multiplier >= 20 else
            discord.Color.green() if multiplier > 0   else
            discord.Color.red()
        )

        button.disabled = False
        button.label    = "🎰 Spin again!"
        self.spinning   = False

        await interaction.edit_original_response(
            embed=_build_embed(result_reels, result_text, color, pts_delta, new),
            view=self,
        )
        await notify_rewards(interaction, old, new)

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True


def _build_embed(reels: list, result_text: str, color: discord.Color, pts_delta: int = 0, total: int = 0) -> discord.Embed:
    reel_display = "  |  ".join(reels)
    footer = "Slots  •  /slots to play"
    if pts_delta != 0:
        footer += f"  •  {points_footer(pts_delta, total)}"
    embed = discord.Embed(
        title="🎰 Slot Machine",
        description=f"## {reel_display}\n\n{result_text}",
        color=color,
    )
    embed.set_footer(text=footer)
    return embed


class SlotsCog(commands.Cog, name="Slots"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="slots", description="Try your luck on the slot machine!")
    async def slots(self, interaction: discord.Interaction) -> None:
        view  = SlotsView(interaction.user)
        embed = _build_embed(["🎰", "🎰", "🎰"], "Press **Spin** to start!", discord.Color.blurple())
        await interaction.response.send_message(embed=embed, view=view)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(SlotsCog(bot))
