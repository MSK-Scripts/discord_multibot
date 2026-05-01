"""
bots/events/cogs/message_handler.py
──────────────────────────────────────
Verarbeitet eingehende Nachrichten:
  - Musiker15-Erwähnungen → automatische Antwort
  - Feedback-Channel      → Nachrichten in Embeds umwandeln
"""

from __future__ import annotations

import logging

import discord
from discord.ext import commands

from core.config import guild as gcfg
from core.utils import make_embed

log = logging.getLogger(__name__)

MUSIKER15_ID   = 283339135068930048
MUSIKER15_NAME = "Musiker15"


class MessageHandlerCog(commands.Cog, name="MessageHandler"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def _is_team(self, member: discord.Member) -> bool:
        """Prüft, ob das Mitglied die Team-Rolle hat."""
        if not hasattr(member, "roles"):
            return False
        return any(role.name == "Team" for role in member.roles)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        # Bot-Nachrichten ignorieren
        if message.author.bot:
            return

        # ── Musiker15-Erwähnung ────────────────────────────────────────────
        is_team = await self._is_team(message.author)
        if not is_team:
            content_lower = message.content.lower()
            if MUSIKER15_NAME.lower() in content_lower:
                await message.channel.send(
                    f"Hey <@{message.author.id}>, "
                    f"<@{MUSIKER15_ID}> wird sich zeitnah bei dir melden!"
                )

        # ── Feedback-Channel ───────────────────────────────────────────────
        if message.channel.id == gcfg.FEEDBACK_CHANNEL_ID:
            await message.delete()
            embed = make_embed(
                title="Feedback",
                description=(
                    f"**Feedback sent by** {message.author.mention} "
                    f"({message.author.display_name})\n\n{message.content}"
                ),
            )
            await message.channel.send(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(MessageHandlerCog(bot))
