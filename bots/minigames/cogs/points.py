"""
bots/minigames/cogs/points.py
───────────────────────────────
/points – Zeigt den aktuellen Punktestand und den Fortschritt zu Belohnungen.
"""

from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from core.points_manager import get_config, get_points

log = logging.getLogger(__name__)


class PointsCog(commands.Cog, name="Points"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="points", description="Show your current points and reward progress!")
    async def points_cmd(self, interaction: discord.Interaction) -> None:
        user_id = interaction.user.id
        current = get_points(user_id)
        config  = get_config()
        rewards = sorted(config.get("rewards", []), key=lambda r: r["points"])

        # Belohnungs-Zeilen aufbauen
        lines       = []
        next_reward = None

        for reward in rewards:
            threshold = reward["points"]
            desc      = reward["description"]
            if current >= threshold:
                lines.append(f"{desc}  ✅  `{threshold:,} pts`")
            else:
                remaining = threshold - current
                lines.append(f"{desc}  🔒  `{threshold:,} pts` — **{remaining:,} to go!**")
                if next_reward is None:
                    next_reward = reward

        reward_text = "\n".join(lines) if lines else "*No rewards configured yet.*"

        embed = discord.Embed(
            title=f"🪙 Points – {interaction.user.display_name}",
            color=discord.Color.gold(),
        )
        embed.set_thumbnail(url=interaction.user.display_avatar.url)
        embed.add_field(name="Current Points", value=f"**{current:,} 🪙**", inline=False)
        embed.add_field(name="Rewards",        value=reward_text,           inline=False)

        # Fortschrittsbalken zur nächsten Belohnung
        if next_reward:
            threshold = next_reward["points"]
            remaining = threshold - current
            bar_total = 20
            filled    = min(int((current / threshold) * bar_total), bar_total)
            bar       = "█" * filled + "░" * (bar_total - filled)
            embed.add_field(
                name=f"Progress to {next_reward['description']}",
                value=f"`{bar}` {current:,} / {threshold:,}",
                inline=False,
            )
        else:
            embed.add_field(name="🏆 Status", value="You have unlocked all rewards!", inline=False)

        embed.set_footer(text="Earn points by playing minigames! (8ball excluded)")
        await interaction.response.send_message(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(PointsCog(bot))
