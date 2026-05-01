"""
bots/minigames/cogs/dice.py
────────────────────────────
/dice – Roll one or more dice with configurable sides.
Supported: d4, d6, d8, d10, d12, d20, d100
"""

from __future__ import annotations

import random
import logging

import discord
from discord import app_commands
from discord.ext import commands

log = logging.getLogger(__name__)


class DiceCog(commands.Cog, name="Dice"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="dice", description="Roll one or more dice!")
    @app_commands.describe(
        sides="Number of sides on the die",
        count="How many dice to roll (1–10, default 1)",
    )
    @app_commands.choices(sides=[
        app_commands.Choice(name="d4",   value=4),
        app_commands.Choice(name="d6",   value=6),
        app_commands.Choice(name="d8",   value=8),
        app_commands.Choice(name="d10",  value=10),
        app_commands.Choice(name="d12",  value=12),
        app_commands.Choice(name="d20",  value=20),
        app_commands.Choice(name="d100", value=100),
    ])
    async def dice(
        self,
        interaction: discord.Interaction,
        sides: app_commands.Choice[int],
        count: int = 1,
    ) -> None:
        count = max(1, min(count, 10))  # Clamp 1–10

        rolls  = [random.randint(1, sides.value) for _ in range(count)]
        total  = sum(rolls)
        d_name = f"d{sides.value}"

        # Build result display
        if count == 1:
            roll_display = f"**{rolls[0]}**"
            desc = f"🎲 You rolled a **{d_name}** and got: {roll_display}"
        else:
            roll_display = "  +  ".join(f"`{r}`" for r in rolls)
            desc = (
                f"🎲 You rolled **{count}x {d_name}**:\n"
                f"{roll_display}\n\n"
                f"**Total: {total}**"
            )

        # Highlight min/max rolls
        if count > 1:
            if total == count * sides.value:
                desc += "\n\n🔥 **Perfect roll!** All dice at maximum!"
            elif total == count:
                desc += "\n\n💀 **Critical fail!** All dice at minimum!"

        embed = discord.Embed(
            title=f"🎲 Dice Roll – {count}x {d_name}",
            description=desc,
            color=discord.Color.blurple(),
        )
        embed.set_footer(text=f"Rolled by {interaction.user.display_name}")
        await interaction.response.send_message(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(DiceCog(bot))
