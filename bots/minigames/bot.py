"""
bots/minigames/bot.py
──────────────────────
Minigames Bot – hostet alle Minigame-Slash-Commands.
"""

from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

log = logging.getLogger(__name__)

_COGS = [
    "bots.minigames.cogs.tictactoe",
    "bots.minigames.cogs.eightball",
    "bots.minigames.cogs.dice",
    "bots.minigames.cogs.flipcoin",
    "bots.minigames.cogs.rps",
    "bots.minigames.cogs.slots",
    "bots.minigames.cogs.trivia",
    "bots.minigames.cogs.hangman",
    "bots.minigames.cogs.connect4",
    "bots.minigames.cogs.wordle",
    "bots.minigames.cogs.blackjack",
    "bots.minigames.cogs.points",
]


class MinigamesBot(commands.Bot):
    """Bot-Klasse für alle Minigames."""

    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self) -> None:
        for cog in _COGS:
            try:
                await self.load_extension(cog)
                log.info("Cog geladen: %s", cog)
            except Exception:
                log.exception("Cog konnte nicht geladen werden: %s", cog)

        synced = await self.tree.sync()
        log.info("Minigames Slash-Commands synchronisiert: %d", len(synced))

        # Stumm schalten von CommandNotFound falls Token geteilt wird
        @self.tree.error
        async def on_tree_error(
            interaction: discord.Interaction,
            error: app_commands.AppCommandError,
        ) -> None:
            if isinstance(error, app_commands.CommandNotFound):
                return
            if isinstance(error, app_commands.CommandOnCooldown):
                await interaction.response.send_message(
                    f"⏳ Slow down! Try again in **{error.retry_after:.1f}s**.",
                    ephemeral=True,
                )
                return
            log.error("Unhandled app command error: %s", error)

    async def on_ready(self) -> None:
        log.info("Minigames Bot bereit: %s (ID: %s)", self.user, self.user.id)
        await self.change_presence(
            activity=discord.Game("Minigames 🎮"),
            status=discord.Status.online,
        )


def create_bot() -> MinigamesBot:
    return MinigamesBot()
