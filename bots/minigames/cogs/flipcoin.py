"""
bots/minigames/cogs/flipcoin.py
─────────────────────────────────
/flipcoin – Coin flip game with Heads/Tails buttons and points integration.
"""

from __future__ import annotations

import logging
import random

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.points_manager import add_points, get_pts, notify_rewards, points_footer
from core.utils import make_embed

log = logging.getLogger(__name__)


# ─── View ─────────────────────────────────────────────────────────────────────

class FlipCoinView(View):
    def __init__(self, player: discord.User) -> None:
        super().__init__(timeout=60)
        self.player = player

    @discord.ui.button(label="🪙 Heads", style=discord.ButtonStyle.primary,  custom_id="flip_heads")
    async def heads(self, interaction: discord.Interaction, button: Button) -> None:
        await self._flip(interaction, "heads")

    @discord.ui.button(label="🔙 Tails", style=discord.ButtonStyle.secondary, custom_id="flip_tails")
    async def tails(self, interaction: discord.Interaction, button: Button) -> None:
        await self._flip(interaction, "tails")

    async def _flip(self, interaction: discord.Interaction, choice: str) -> None:
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
            return

        result = random.choice(["heads", "tails"])
        won    = result == choice

        # Punkte vergeben
        outcome   = "win" if won else "lose"
        pts_delta = get_pts("flipcoin", outcome)
        old, new  = await add_points(interaction.user.id, pts_delta)

        for item in self.children:
            item.disabled = True
        self.stop()

        embed = make_embed(
            title="🪙 Flip a Coin",
            description=(
                f"You chose: **{choice.capitalize()}**\n"
                f"Result:    **{result.capitalize()}**\n\n"
                + ("You won! 🎉" if won else "You lost. 😔")
            ),
            footer_text=f"Flip a Coin  •  {points_footer(pts_delta, new)}",
        )
        await interaction.response.edit_message(embed=embed, view=self)
        await notify_rewards(interaction, old, new)

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True


# ─── Cog ──────────────────────────────────────────────────────────────────────

class FlipCoinCog(commands.Cog, name="FlipCoin"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="flipcoin", description="Flip a coin – Heads or Tails?")
    async def flipcoin(self, interaction: discord.Interaction) -> None:
        embed = make_embed(
            title="🪙 Flip a Coin",
            description=f"{interaction.user.mention}, choose your side!",
        )
        await interaction.response.send_message(embed=embed, view=FlipCoinView(interaction.user))


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(FlipCoinCog(bot))
