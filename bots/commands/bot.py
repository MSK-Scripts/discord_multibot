"""
bots/commands/bot.py
────────────────────
Haupt-Slash-Command-Bot. Lädt alle Command-Cogs und registriert persistente Views.
"""

from __future__ import annotations

import logging

import discord
from discord.ext import commands

log = logging.getLogger(__name__)

_COGS = [
    "bots.commands.cogs.admin",
    "bots.commands.cogs.community",
    "bots.commands.cogs.minigames",
    "bots.commands.cogs.orders",
    "bots.commands.cogs.support",
    "bots.commands.cogs.utility",
]


class CommandsBot(commands.Bot):
    """Bot-Klasse für alle Slash-Commands."""

    def __init__(self) -> None:
        intents = discord.Intents.all()
        super().__init__(command_prefix="/", intents=intents)

    async def setup_hook(self) -> None:
        # Cogs laden
        for cog in _COGS:
            try:
                await self.load_extension(cog)
                log.info("Cog geladen: %s", cog)
            except Exception:
                log.exception("Cog konnte nicht geladen werden: %s", cog)

        # Persistente Views registrieren (überleben Neustarts, da custom_id gesetzt)
        from bots.commands.cogs.community import InformationView, RulesView
        self.add_view(InformationView())
        self.add_view(RulesView())
        log.info("Persistente Views registriert.")

        synced = await self.tree.sync()
        log.info("Slash-Commands synchronisiert: %d", len(synced))

        # Wenn mehrere Bots denselben Token nutzen, empfangen alle dieselben
        # Interaction-Events. CommandNotFound tritt auf, wenn ein anderer Bot
        # den Command verwaltet. Wird hier still ignoriert.
        @self.tree.error
        async def on_tree_error(
            interaction: discord.Interaction,
            error: discord.app_commands.AppCommandError,
        ) -> None:
            if isinstance(error, discord.app_commands.CommandNotFound):
                return
            await self.on_app_command_error(interaction, error)

    async def on_ready(self) -> None:
        log.info("Commands Bot bereit: %s (ID: %s)", self.user, self.user.id)

    async def on_app_command_error(
        self, interaction: discord.Interaction, error: discord.app_commands.AppCommandError
    ) -> None:
        if isinstance(error, discord.app_commands.MissingAnyRole):
            await interaction.response.send_message(
                "❌ You do not have the required role for this command.",
                ephemeral=True,
            )
        else:
            log.error("App-Command-Fehler: %s", error)
            if not interaction.response.is_done():
                await interaction.response.send_message(
                    "❌ An unexpected error occurred.", ephemeral=True
                )


def create_bot() -> CommandsBot:
    return CommandsBot()
