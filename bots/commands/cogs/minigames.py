"""
bots/commands/cogs/minigames.py
─────────────────────────────────
Community-Minigames: Zahl raten, Flachwitz.
Hinweise:
  - Die geheime Zahl des Ratespiels wird im RAM gehalten (wird bei Bot-Neustart zurückgesetzt).
  - Flachwitze werden in data/flachwitze.json gespeichert.
  - /flipcoin wurde zum Minigames Bot verschoben.
"""

from __future__ import annotations

import logging
import random
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands

from core.config import DATA_DIR
from core.utils import make_embed, read_json, write_json

log = logging.getLogger(__name__)

FLACHWITZE_FILE: Path = DATA_DIR / "flachwitze.json"


class MinigamesCog(commands.Cog, name="Minigames"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        # Geheimzahl im Speicher halten (wird bei Bot-Neustart zurückgesetzt)
        self._secret_number: int = random.randint(1, 100)

    # ── /random (set secret number) ───────────────────────────────────────────

    @app_commands.command(name="random", description="Generiere eine Zufallszahl für das Ratespiel")
    @app_commands.describe(number1="Untere Grenze", number2="Obere Grenze")
    @app_commands.checks.has_any_role("Team")
    async def random_cmd(self, interaction: discord.Interaction, number1: int, number2: int) -> None:
        if number1 >= number2:
            await interaction.response.send_message(
                "❌ number1 muss kleiner als number2 sein.", ephemeral=True
            )
            return

        self._secret_number = random.randint(number1, number2)
        log.info("Neue Geheimzahl gesetzt: %d (Bereich %d–%d)", self._secret_number, number1, number2)

        embed = make_embed(
            title="🔢 Guess the Number",
            description=(
                f"Ich suche eine Zahl zwischen **{number1}** und **{number2}**\n"
                f"Nutze `/rg <number>` um die Zahl zu erraten!\n\n"
                f"*(EN)* Use `/rg <number>` to guess the number."
            ),
        )
        await interaction.response.send_message(embed=embed)

    # ── /rg (guess) ───────────────────────────────────────────────────────────

    @app_commands.command(name="rg", description="Guess the Number")
    @app_commands.describe(number="Deine Schätzung")
    async def rg(self, interaction: discord.Interaction, number: int) -> None:
        if number == self._secret_number:
            embed = make_embed(
                title="✅ Correct Number!",
                description=(
                    f"{interaction.user.mention} Number **{number}** is **correct**! 🎉\n\n"
                    "Öffne ein Giveaway-Ticket und fordere dein gewünschtes Skript an. **NUR mit Screenshot!**\n"
                    "*(EN)* Open a giveaway ticket and request your desired script. **ONLY with screenshot!**"
                ),
            )
            self._secret_number = random.randint(1, 100)
            log.info("Neue Geheimzahl nach Gewinn: %d", self._secret_number)
        else:
            embed = make_embed(
                title="❌ Wrong Number!",
                description=f"{interaction.user.mention} Number **{number}** is **not** correct.",
            )

        await interaction.response.send_message(embed=embed)

    # ── /flachwitz ────────────────────────────────────────────────────────────

    @app_commands.command(name="flachwitz", description="Füße hoch, der Witz kommt flach!")
    async def flachwitz(self, interaction: discord.Interaction) -> None:
        data = read_json(FLACHWITZE_FILE, default={})
        if not data:
            await interaction.response.send_message(
                "Noch keine Flachwitze vorhanden. Nutze `/add_flachwitz` um einen hinzuzufügen!",
                ephemeral=True,
            )
            return

        key   = str(random.randint(1, len(data)))
        embed = make_embed(title="🎤 Füße hoch, der Witz kommt flach!", description=data[key])
        await interaction.response.send_message(embed=embed)

    # ── /add_flachwitz ────────────────────────────────────────────────────────

    @app_commands.command(name="add_flachwitz", description="Einen Flachwitz hinzufügen")
    @app_commands.describe(witz="Wie lautet dein Flachwitz?")
    @app_commands.checks.has_any_role("Team")
    async def add_flachwitz(self, interaction: discord.Interaction, witz: str) -> None:
        data = read_json(FLACHWITZE_FILE, default={})
        new_key = str(len(data) + 1)
        data[new_key] = witz
        write_json(FLACHWITZE_FILE, data)

        embed = make_embed(title="✅ Flachwitz hinzugefügt", description=witz)
        await interaction.response.send_message(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(MinigamesCog(bot))
