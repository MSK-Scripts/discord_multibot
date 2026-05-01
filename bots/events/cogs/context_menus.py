"""
bots/events/cogs/context_menus.py
────────────────────────────────────
Rechtsklick-Context-Menus auf Nachrichten:
  - Comment Feedback  (nur im Feedback-Channel)
  - Answer a Message
  - Edit Message
  - Edit Embed
"""

from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import TextInput

from core.config import guild as gcfg
from core.utils import BaseModal, now_str

log = logging.getLogger(__name__)

_GUILD = discord.Object(id=gcfg.ID)


class ContextMenusCog(commands.Cog, name="ContextMenus"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        # Context-Menus manuell registrieren (werden in setup_hook gesynct)
        # HINWEIS: guild= gehört zu tree.add_command(), NICHT zum ContextMenu()-Konstruktor!
        self.bot.tree.add_command(
            app_commands.ContextMenu(name="Comment Feedback", callback=self.comment_feedback),
            guild=_GUILD,
        )
        self.bot.tree.add_command(
            app_commands.ContextMenu(name="Answer a Message", callback=self.answer_message),
            guild=_GUILD,
        )
        self.bot.tree.add_command(
            app_commands.ContextMenu(name="Edit Message", callback=self.edit_message),
            guild=_GUILD,
        )
        self.bot.tree.add_command(
            app_commands.ContextMenu(name="Edit Embed", callback=self.edit_embed),
            guild=_GUILD,
        )

    async def cog_unload(self) -> None:
        for name in ("Comment Feedback", "Answer a Message", "Edit Message", "Edit Embed"):
            self.bot.tree.remove_command(name, type=discord.AppCommandType.message, guild=_GUILD)

    # ── Comment Feedback ──────────────────────────────────────────────────────

    @app_commands.checks.has_any_role("Founder", "Manager")
    async def comment_feedback(
        self, interaction: discord.Interaction, message: discord.Message
    ) -> None:
        if message.channel.id != gcfg.FEEDBACK_CHANNEL_ID:
            await interaction.response.send_message(
                "Only allowed in #feedback :x:", ephemeral=True, delete_after=2
            )
            return
        if not message.embeds:
            await interaction.response.send_message(
                "Keine Embed-Nachricht gefunden.", ephemeral=True, delete_after=2
            )
            return

        modal = BaseModal(title="Comment Feedback")
        modal.add_item(
            TextInput(label="Message", placeholder="Insert the Comment",
                      style=discord.TextStyle.paragraph, required=True)
        )
        await interaction.response.send_modal(modal)
        await modal.wait()

        last_embed = message.embeds[0]
        comment    = modal.children[0].value
        new_desc   = (
            f"{last_embed.description}\n\n"
            f"______\n**Comment** – by {interaction.user.mention} ({interaction.user.name})\n"
            f"{comment}"
        )

        embed = _clone_embed(last_embed, description=new_desc)
        await message.edit(embed=embed)
        await modal.interaction.response.send_message(
            "Successfully commented the feedback :white_check_mark:", ephemeral=True, delete_after=2
        )

        # ── DM an den Feedback-Autor senden ────────────────────────────────────
        # User-ID aus dem Embed-Description-Mention extrahieren (<@USER_ID>)
        author_id = None
        if last_embed.description:
            import re
            match = re.search(r"<@!?(\d+)>", last_embed.description)
            if match:
                author_id = int(match.group(1))

        if author_id:
            try:
                feedback_author = await interaction.client.fetch_user(author_id)
                dm_embed = discord.Embed(
                    title="📨 Your feedback has been commented!",
                    color=discord.Color.blurple(),
                )
                dm_embed.add_field(
                    name="Comment by",
                    value=f"{interaction.user.display_name} ({interaction.user.mention})",
                    inline=False,
                )
                dm_embed.add_field(
                    name="Comment",
                    value=comment,
                    inline=False,
                )
                dm_embed.set_footer(text=f"MSK Scripts • {interaction.guild.name}")
                await feedback_author.send(embed=dm_embed)
                log.info("DM an Feedback-Autor %s gesendet.", feedback_author)
            except discord.Forbidden:
                log.warning("Konnte keine DM an User %d senden (DMs deaktiviert).", author_id)
            except discord.NotFound:
                log.warning("Feedback-Autor mit ID %d nicht gefunden.", author_id)
            except Exception as exc:
                log.error("Fehler beim Senden der DM: %s", exc)

    # ── Answer a Message ──────────────────────────────────────────────────────

    @app_commands.checks.has_any_role("Founder", "Manager")
    async def answer_message(
        self, interaction: discord.Interaction, message: discord.Message
    ) -> None:
        modal = BaseModal(title="Answer to this Message")
        modal.add_item(
            TextInput(label="Message", placeholder="Insert the Text",
                      style=discord.TextStyle.paragraph, required=True)
        )
        await interaction.response.send_modal(modal)
        await modal.wait()

        await message.reply(content=modal.children[0].value)
        await modal.interaction.response.send_message(
            "Successfully replied to the message :white_check_mark:", ephemeral=True, delete_after=2
        )

    # ── Edit Message ──────────────────────────────────────────────────────────

    @app_commands.checks.has_any_role("Founder", "Manager")
    async def edit_message(
        self, interaction: discord.Interaction, message: discord.Message
    ) -> None:
        modal = BaseModal(title="Edit this Message")
        modal.add_item(
            TextInput(label="Message", placeholder="Insert the Text",
                      default=message.content, style=discord.TextStyle.paragraph, required=True)
        )
        await interaction.response.send_modal(modal)
        await modal.wait()

        await message.edit(content=modal.children[0].value)
        await modal.interaction.response.send_message(
            "The message was edited successfully :slight_smile:", ephemeral=True, delete_after=2
        )

    # ── Edit Embed ────────────────────────────────────────────────────────────

    @app_commands.checks.has_any_role("Founder", "Manager")
    async def edit_embed(
        self, interaction: discord.Interaction, message: discord.Message
    ) -> None:
        if not message.embeds:
            await interaction.response.send_message(
                "Diese Nachricht enthält kein Embed.", ephemeral=True, delete_after=2
            )
            return

        last_embed = message.embeds[0]
        modal = BaseModal(title="Edit this Embed")
        modal.add_item(TextInput(label="Title",       default=last_embed.title or "",            style=discord.TextStyle.short,     required=False))
        modal.add_item(TextInput(label="Description", default=last_embed.description or "",      style=discord.TextStyle.paragraph, required=True))
        modal.add_item(TextInput(label="Thumbnail",   default=last_embed.thumbnail.url or "",    style=discord.TextStyle.short,     required=False))
        modal.add_item(TextInput(label="Image",       default=last_embed.image.url or "",        style=discord.TextStyle.short,     required=False))
        modal.add_item(TextInput(label="Footer",      default=last_embed.footer.text or "",      style=discord.TextStyle.short,     required=False))

        await interaction.response.send_modal(modal)
        await modal.wait()

        date      = now_str()
        title     = modal.children[0].value
        desc      = modal.children[1].value
        thumbnail = modal.children[2].value
        image     = modal.children[3].value
        footer    = modal.children[4].value

        # Footer: "Edited at …" aktualisieren oder anhängen
        if footer:
            idx = footer.rfind("Edited")
            if idx != -1:
                footer = footer[:idx] + f"Edited at {date}"
            else:
                footer = f"{footer} • Edited at {date}"

        embed = _clone_embed(
            last_embed,
            title=title,
            description=desc,
            thumbnail=thumbnail,
            image=image,
            footer=footer,
        )
        await message.edit(embed=embed)
        await modal.interaction.response.send_message(
            "The message was edited successfully :slight_smile:", ephemeral=True, delete_after=2
        )


# ─── Hilfsfunktion ───────────────────────────────────────────────────────────

def _clone_embed(
    source: discord.Embed,
    *,
    title: str | None       = None,
    description: str | None = None,
    thumbnail: str | None   = None,
    image: str | None       = None,
    footer: str | None      = None,
) -> discord.Embed:
    """Klont ein Embed und überschreibt optional einzelne Felder."""
    embed = discord.Embed(
        title=title if title is not None else (source.title or ""),
        description=description if description is not None else (source.description or ""),
        color=source.color,
    )
    _thumb = thumbnail if thumbnail is not None else (source.thumbnail.url or "")
    if _thumb:
        embed.set_thumbnail(url=_thumb)

    _img = image if image is not None else (source.image.url or "")
    if _img:
        embed.set_image(url=_img)

    _footer = footer if footer is not None else (source.footer.text or "")
    if _footer:
        icon = source.footer.icon_url or ""
        embed.set_footer(text=_footer, icon_url=icon)

    if source.author and source.author.name:
        embed.set_author(
            name=source.author.name,
            url=source.author.url or "",
            icon_url=source.author.icon_url or "",
        )
    for field in source.fields:
        embed.add_field(name=field.name, value=field.value, inline=field.inline)

    return embed


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ContextMenusCog(bot))
