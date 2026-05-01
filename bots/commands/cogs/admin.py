"""
bots/commands/cogs/admin.py
────────────────────────────
Admin-Commands: Datenbank-Backup, Nachrichten/Embed senden.
Zugriff: Founder, Manager
"""

from __future__ import annotations

import logging
import os

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import TextInput

from core.config import EMBED_COLOR, THUMBNAIL_URL, database, guild as gcfg
from core.utils import BaseModal, make_embed, now_str

log = logging.getLogger(__name__)


class AdminCog(commands.Cog, name="Admin"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # ── /backup_database ──────────────────────────────────────────────────────

    @app_commands.command(name="backup_database", description="Backup Database [ONLY FOR FOUNDER ROLE]")
    @app_commands.checks.has_any_role("Founder")
    async def backup_database(self, interaction: discord.Interaction) -> None:
        """Erstellt einen mysqldump-Backup und sendet ihn in den Log-Channel."""
        from datetime import datetime

        current_time = datetime.now().strftime("%d-%m-%Y_%H-%M-%S")
        backup_file = f"{database.NAME}_{current_time}.sql"
        command = (
            f"mysqldump -h{database.HOST} -u{database.USER}"
            f" -p{database.PASSWORD} {database.NAME} > {backup_file}"
        )

        os.system(command)  # nosec – nur intern, keine User-Eingaben

        log_channel = self.bot.get_channel(gcfg.LOG_CHANNEL_ID)
        if log_channel:
            await log_channel.send(
                f"New Backup created at {current_time}",
                file=discord.File(backup_file),
            )

        await interaction.response.send_message(
            "Backup was successful. :white_check_mark:", ephemeral=True, delete_after=2
        )

    # ── /send_message ─────────────────────────────────────────────────────────

    @app_commands.command(name="send_message", description="Send a Message")
    @app_commands.checks.has_any_role("Founder", "Manager")
    async def send_message_cmd(self, interaction: discord.Interaction) -> None:
        """Öffnet ein Modal und sendet die eingegebene Nachricht in den Channel."""
        modal = BaseModal(title="Send Message")
        modal.add_item(
            TextInput(
                label="Description",
                placeholder="Insert Text",
                style=discord.TextStyle.paragraph,
                required=True,
            )
        )

        await interaction.response.send_modal(modal)
        await modal.wait()

        await interaction.channel.send(modal.children[0].value)
        await modal.interaction.response.send_message(
            "The message was sent successfully :white_check_mark:", ephemeral=True, delete_after=2
        )

    # ── /send_embed ───────────────────────────────────────────────────────────

    @app_commands.command(name="send_embed", description="Send an Embed Message")
    @app_commands.checks.has_any_role("Founder", "Manager")
    async def send_embed_cmd(self, interaction: discord.Interaction) -> None:
        """Öffnet ein Modal und sendet das Embed in den Channel."""
        modal = BaseModal(title="Send Embed")
        date = now_str()

        title_input       = TextInput(label="Title",       placeholder="Insert Title",       style=discord.TextStyle.short,     required=False)
        description_input = TextInput(label="Description", placeholder="Insert Text",        style=discord.TextStyle.paragraph, required=True)
        thumbnail_input   = TextInput(label="Thumbnail",   placeholder="Insert URL",         default=THUMBNAIL_URL,             style=discord.TextStyle.short, required=False)
        image_input       = TextInput(label="Image",       placeholder="Insert URL",         style=discord.TextStyle.short,     required=False)
        footer_input      = TextInput(label="Footer",      placeholder="Insert Footer Text", default=f"© {interaction.guild.name} • {date}", style=discord.TextStyle.short, required=False)

        for item in [title_input, description_input, thumbnail_input, image_input, footer_input]:
            modal.add_item(item)

        await interaction.response.send_modal(modal)
        await modal.wait()

        embed = discord.Embed(
            title=title_input.value,
            description=description_input.value,
            color=EMBED_COLOR,
        )
        if thumbnail_input.value:
            embed.set_thumbnail(url=thumbnail_input.value)
        if image_input.value:
            embed.set_image(url=image_input.value)
        if footer_input.value:
            embed.set_footer(text=footer_input.value, icon_url=THUMBNAIL_URL)

        await interaction.channel.send(embed=embed)
        await modal.interaction.response.send_message(
            "The embed was sent successfully :white_check_mark:", ephemeral=True, delete_after=2
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(AdminCog(bot))
