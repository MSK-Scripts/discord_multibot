"""
bots/commands/cogs/community.py
────────────────────────────────
Community-Commands und persistente Views für Rules & Information.
"""

from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.config import guild as gcfg
from core.utils import make_embed

log = logging.getLogger(__name__)


# ─── Persistente Views ────────────────────────────────────────────────────────

class InformationView(discord.ui.View):
    """Link-Buttons für das Information-Embed. Persistent (kein Timeout)."""

    def __init__(self) -> None:
        super().__init__(timeout=None)
        links = [
            ("Tebex",         "https://www.msk-scripts.de/"),
            ("Documentation", "https://docu.msk-scripts.de/"),
            ("Github",        "https://github.com/MSK-Scripts"),
            ("Donations",     "https://www.paypal.com/donate/?hosted_button_id=GPNT2YCFMM882"),
        ]
        for label, url in links:
            self.add_item(Button(label=label, style=discord.ButtonStyle.gray, url=url))


class RulesView(discord.ui.View):
    """Buttons für das Rules-Embed. Persistent (kein Timeout, custom_ids gesetzt)."""

    def __init__(self) -> None:
        super().__init__(timeout=None)
        self.add_item(Button(label="Tebex TOS", style=discord.ButtonStyle.gray, url="https://checkout.tebex.io/terms"))

    # ── Verification ─────────────────────────────────────────────────────────

    @discord.ui.button(label="Verification", style=discord.ButtonStyle.green, emoji="✅", custom_id="rules_verification")
    async def rules_verification(self, interaction: discord.Interaction, button: Button) -> None:
        role   = interaction.guild.get_role(gcfg.MEMBER_ROLE_ID)
        member = interaction.user

        if not member.get_role(gcfg.MEMBER_ROLE_ID):
            await member.add_roles(role)
            await interaction.response.send_message(
                f"Role <@&{gcfg.MEMBER_ROLE_ID}> was added to you.",
                ephemeral=True, delete_after=5,
            )
        else:
            await interaction.response.send_message(
                f"You already have the role <@&{gcfg.MEMBER_ROLE_ID}>.\nYou cannot remove this role!",
                ephemeral=True, delete_after=5,
            )

    # ── Update Notify ─────────────────────────────────────────────────────────

    @discord.ui.button(label="Update Notify", style=discord.ButtonStyle.red, emoji="⏰", custom_id="rules_update_notify")
    async def rules_update_notify(self, interaction: discord.Interaction, button: Button) -> None:
        await self._toggle_role(interaction, gcfg.UPDATE_NOTIFY_ROLE_ID)

    # ── Giveaway Notify ───────────────────────────────────────────────────────

    @discord.ui.button(label="Giveaway Notify", style=discord.ButtonStyle.primary, emoji="🎁", custom_id="rules_giveaway_notify")
    async def rules_giveaway_notify(self, interaction: discord.Interaction, button: Button) -> None:
        await self._toggle_role(interaction, gcfg.GIVEAWAY_NOTIFY_ROLE_ID)

    # ── Shared: Role-Toggle-Logik ─────────────────────────────────────────────

    async def _toggle_role(self, interaction: discord.Interaction, role_id: int) -> None:
        """Fügt eine Rolle hinzu oder bietet das Entfernen an."""
        role   = interaction.guild.get_role(role_id)
        member = interaction.user

        if not member.get_role(role_id):
            await member.add_roles(role)
            await interaction.response.send_message(
                f"Role <@&{role_id}> was added to you.", ephemeral=True, delete_after=5
            )
            return

        # Rolle vorhanden → Entfernen anbieten
        remove_btn = Button(
            label="Remove Role",
            style=discord.ButtonStyle.red,
            custom_id=f"remove_role_{role_id}",
        )
        confirm_view = View(timeout=15)
        confirm_view.add_item(remove_btn)

        await interaction.response.send_message(
            "Want to remove the role?", view=confirm_view, ephemeral=True
        )

        async def remove_callback(action: discord.Interaction) -> None:
            await action.user.remove_roles(role)
            await action.response.send_message(
                f"Role <@&{role_id}> was removed.", ephemeral=True, delete_after=5
            )

        remove_btn.callback = remove_callback


# ─── Cog ──────────────────────────────────────────────────────────────────────

class CommunityCog(commands.Cog, name="Community"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="information", description="Information Message with URL Buttons")
    @app_commands.checks.has_any_role("Manager", "Founder")
    async def information_command(self, interaction: discord.Interaction) -> None:
        description = (
            "**Welcome to our Discord!**\n"
            "Great, that you are here! Look around and have fun :slight_smile:\n\n"
            "**Why do I see nothing?**\n"
            "@everyone have to read the <#901154918923120720> and react to them. "
            "Then you will be activated for the other channels!\n\n"
            "**The Roles**\n"
            "<@&900395427147436092> → Has purchased something in our Tebex Shop\n"
            "<@&976914898485383290> → Get Leaks, Updates and Beta Versions before everyone else\n"
            "<@&953771038519459840> → Testing new Scripts and Updates before release\n"
            "<@&900396090208174130> → Have knowledge in lua and will help you in <#939628758229471242>\n"
            "<@&900396252724854844> → Make sure everything is alright here\n\n"
            "**Discord Invite**\nhttps://discord.gg/5hHSBRHvJE"
        )
        embed = make_embed(description=description, guild_name=interaction.guild.name)
        await interaction.channel.send(embed=embed, view=InformationView())
        await interaction.response.send_message(
            "Information was successfully sent to this channel.", ephemeral=True, delete_after=2
        )

    @app_commands.command(name="rules", description="Rules Message with Reaction Buttons")
    @app_commands.checks.has_any_role("Manager", "Founder")
    async def rules_command(self, interaction: discord.Interaction) -> None:
        description = (
            f"**1.** For moderation purposes, all channels are German or English only!\n"
            "**2.** No spamming or flooding chats with messages.\n"
            "**3.** No NSFW content.\n"
            "**4.** No inappropriate language. Remain respectful to others at all times.\n"
            "**5.** No harassment of other members. Racism, Sexism, Transphobia, Homophobia, etc.\n"
            "**6.** No self-promotion, soliciting, reselling, or advertising on the server. This includes DMs.\n"
            "**7.** Keep all discussions civil and in the right channels.\n"
            "**8.** Links are not allowed unless they are approved.\n"
            "**9.** Don't @mention members unnecessarily.\n"
            "**10.** All digital software we provide is licensed, not sold. You may not distribute, "
            "resell or share any digital items we provide.\n\n"
            f"Please confirm that you have read the rules to get the <@&{gcfg.MEMBER_ROLE_ID}> role."
        )
        embed = make_embed(title="Discord Rules", description=description, guild_name=interaction.guild.name)
        await interaction.channel.send(embed=embed, view=RulesView())
        await interaction.response.send_message(
            "Rules were successfully sent to this channel.", ephemeral=True, delete_after=2
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(CommunityCog(bot))
