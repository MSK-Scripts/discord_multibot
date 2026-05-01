"""
bots/events/bot.py
───────────────────
Event-Bot: Mitglied-Events, Moderations-Logging, Context-Menu-Commands.
"""

from __future__ import annotations

import logging

import discord
from discord.ext import commands

from core.config import guild as gcfg

log = logging.getLogger(__name__)

_COGS = [
    "bots.events.cogs.logging_cog",
    "bots.events.cogs.message_handler",
    "bots.events.cogs.context_menus",
]


class EventsBot(commands.Bot):
    """Bot-Klasse für alle Guild-Events und Context-Menu-Commands."""

    def __init__(self) -> None:
        intents = discord.Intents.all()
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self) -> None:
        for cog in _COGS:
            try:
                await self.load_extension(cog)
                log.info("Cog geladen: %s", cog)
            except Exception:
                log.exception("Cog konnte nicht geladen werden: %s", cog)

        # Context-Menus sind guild-spezifisch registriert → guild-sync verwenden
        # (sofort aktiv, kein 1h-Delay wie bei globalem Sync)
        guild_obj = discord.Object(id=gcfg.ID)
        synced = await self.tree.sync(guild=guild_obj)
        log.info("App-Commands synchronisiert (guild): %d", len(synced))

    async def on_ready(self) -> None:
        log.info("Events Bot bereit: %s (ID: %s)", self.user, self.user.id)
        await self.change_presence(
            activity=discord.Game("MSK Scripts"),
            status=discord.Status.online,
        )
        await self._update_member_count()

    async def _update_member_count(self) -> None:
        guild = self.get_guild(gcfg.ID)
        if not guild:
            return
        channel = self.get_channel(gcfg.MEMBER_COUNT_CHANNEL_ID)
        if channel:
            await channel.edit(name=f"𝑴𝒆𝒎𝒃𝒆𝒓𝒔: {guild.member_count}")


def create_bot() -> EventsBot:
    return EventsBot()
