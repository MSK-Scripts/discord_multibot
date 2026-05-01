"""
bots/commands/cogs/support.py
───────────────────────────────
Support-Guides für MSK-Scripts.
"""

from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.utils import make_embed

log = logging.getLogger(__name__)

# ─── Guide-Definitionen ───────────────────────────────────────────────────────
# Jeder Eintrag: { "title": ..., "description": ... }
# Leere Einträge fallen durch (return ohne Senden).

_GUIDES: dict[str, dict[str, str]] = {
    "documentation": {
        "title":       "Documentation",
        "description": "[Documentation](https://docu.msk-scripts.de/)",
    },
    "msk_core_dependency": {
        "title":       "Support Guide for MSK Core Dependency",
        "description": (
            "**You need `msk_core` to use our Scripts!**\n"
            "Download it from [Github](https://github.com/MSK-Scripts/msk_core/releases/latest)"
        ),
    },
    "change_notification": {
        "title":       "Support Guide for Changing Notifications",
        "description": "Documentation: https://docu.msk-scripts.de/docs/miscellaneous/change-notifications",
    },
    "garage": {
        "title":       "Support Guide for MSK Garage",
        "description": (
            "1. Install [msk_core](https://github.com/MSK-Scripts/msk_core/releases/latest)\n"
            "2. Update the script to the latest version!\n"
            "3. Set `Config.Debug = true` and restart your Server\n"
            "4. Do again what causes the issue\n"
            "5. Send us screenshots from Client F8 Console and txAdmin Live Console\n"
            "6. Send us your current `config.lua` and tell us which version you are using *(fxmanifest.lua)*\n"
            "7. Send us your `owned_vehicles` table from database"
        ),
    },
    "handcuffs": {
        "title":       "Support Guide for MSK Handcuffs",
        "description": (
            "**Documentation – Implement it into esx_policejob or jobs_creator**\n"
            "Documentation: https://docu.msk-scripts.de/docs/msk_handcuffs/guides/\n\n"
            "1. Install [msk_core](https://github.com/MSK-Scripts/msk_core/releases/latest)\n"
            "2. Update the script to the latest version!\n"
            "3. Set `Config.Debug = true` and restart your Server\n"
            "4. Do again what causes the issue\n"
            "5. Send us screenshots from Client F8 Console and txAdmin Live Console\n"
            "6. Send us your current `config.lua` and tell us which version you are using *(fxmanifest.lua)*"
        ),
    },
}


class SupportCog(commands.Cog, name="Support"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="script_guides", description="Help Guide for a specified Script")
    @app_commands.describe(script="Choose the Script you want to get the Help Guide from")
    @app_commands.choices(script=[
        app_commands.Choice(name="Documentation",          value="documentation"),
        app_commands.Choice(name="Dependency: msk_core",   value="msk_core_dependency"),
        app_commands.Choice(name="change_notification",    value="change_notification"),
        app_commands.Choice(name="msk_garage",             value="garage"),
        app_commands.Choice(name="msk_handcuffs",          value="handcuffs"),
    ])
    async def script_guides(
        self, interaction: discord.Interaction, script: app_commands.Choice[str]
    ) -> None:
        guide = _GUIDES.get(script.value)
        if not guide:
            await interaction.response.send_message("❌ Kein Guide für dieses Script gefunden.", ephemeral=True)
            return

        view = View()
        view.add_item(Button(label="Tebex",         style=discord.ButtonStyle.gray, url="https://www.msk-scripts.de/"))
        view.add_item(Button(label="Documentation", style=discord.ButtonStyle.gray, url="https://docu.msk-scripts.de/"))
        view.add_item(Button(label="Github",        style=discord.ButtonStyle.gray, url="https://github.com/MSK-Scripts"))

        embed = make_embed(
            title=guide["title"],
            description=guide["description"],
            guild_name=interaction.guild.name,
        )
        await interaction.response.send_message(embed=embed, view=view)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(SupportCog(bot))
