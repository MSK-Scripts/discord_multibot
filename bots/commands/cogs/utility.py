"""
bots/commands/cogs/utility.py
───────────────────────────────
Nützliche Allzweck-Commands: ping, userinfo, clear.
"""

from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from core.utils import make_embed
from core.points_manager import get_points

log = logging.getLogger(__name__)


class UtilityCog(commands.Cog, name="Utility"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # ── /ping ─────────────────────────────────────────────────────────────────

    @app_commands.command(name="ping", description="Responds with Pong and the bot's current latency")
    async def ping(self, interaction: discord.Interaction) -> None:
        latency_ms = round(self.bot.latency * 1000)
        await interaction.response.send_message(f"🏓 Pong!\nLatency: `{latency_ms}ms`")

    # ── /userinfo ─────────────────────────────────────────────────────────────

    @app_commands.command(name="userinfo", description="Information about a specific User")
    @app_commands.describe(member="Der User, über den du Infos haben möchtest")
    async def userinfo(self, interaction: discord.Interaction, member: discord.Member) -> None:
        embed = make_embed(
            title=f"Userinfo for {member.name}",
            description=f"Information about {member.mention}",
        )
        embed.add_field(name="Account created at", value=member.created_at.strftime("%d/%m/%Y %H:%M:%S"), inline=True)
        embed.add_field(name="Server joined at",   value=member.joined_at.strftime("%d/%m/%Y %H:%M:%S"),  inline=True)
        embed.add_field(name="User ID",            value=str(member.id),                                  inline=False)

        roles = "\n".join(role.mention for role in member.roles if not role.is_default())
        if roles:
            embed.add_field(name="Roles", value=roles, inline=False)

        points = get_points(member.id)
        embed.add_field(name="🪙 Minigame Points", value=f"**{points:,}**", inline=False)

        if member.avatar:
            embed.set_thumbnail(url=member.avatar.url)

        await interaction.response.send_message(embed=embed)

    # ── /clear ────────────────────────────────────────────────────────────────

    @app_commands.command(name="clear", description="Clears a specific amount of messages")
    @app_commands.describe(amount="Anzahl der zu löschenden Nachrichten (max. 100)")
    @app_commands.checks.has_any_role("Team")
    async def clear(self, interaction: discord.Interaction, amount: int) -> None:
        if amount > 100:
            await interaction.response.send_message(
                "❌ You cannot delete more than 100 messages at once.", ephemeral=True
            )
            return
        if amount < 1:
            await interaction.response.send_message(
                "❌ amount muss mindestens 1 sein.", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True)
        deleted = await interaction.channel.purge(limit=amount, reason=f"Mass delete via /clear by {interaction.user}")
        await interaction.followup.send(
            f"✅ {len(deleted)} message(s) deleted.", ephemeral=True
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(UtilityCog(bot))
