"""
bots/commands/cogs/orders.py
──────────────────────────────
Auftrags-Commands: Spendenlink, Nutzungsbedingungen, Preisbestätigung.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.config import ASSETS_DIR
from core.utils import make_embed

log = logging.getLogger(__name__)

PAYPAL_URL   = "https://www.paypal.com/donate/?hosted_button_id=GPNT2YCFMM882"
TERMS_FILE   = ASSETS_DIR / "Nutzungsbedingungen_GER.pdf"


def _lang(language: Optional[str], ger: str, eng: str) -> str:
    return eng if language == "eng" else ger


class OrdersCog(commands.Cog, name="Orders"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # ── /donation ─────────────────────────────────────────────────────────────

    @app_commands.command(name="donation", description="Spenden Text")
    @app_commands.describe(language="ger / eng")
    @app_commands.checks.has_any_role("Founder", "Manager")
    async def donation(self, interaction: discord.Interaction, language: Optional[str] = None) -> None:
        header = _lang(language, "Spende",   "Donation")
        text   = _lang(
            language,
            "Über eine Spende würden wir uns sehr freuen!\n"
            "Damit unterstützt du unsere kostenlos zur Verfügung gestellten Scripts auf Github.",
            "We would be very happy about a donation!\n"
            "This way you support our free scripts on Github.",
        )

        view = View()
        view.add_item(Button(label="PayPal", style=discord.ButtonStyle.gray, url=PAYPAL_URL))

        embed = make_embed(title=header, description=text, guild_name=interaction.guild.name)
        await interaction.response.send_message(embed=embed, view=view)

    # ── /order_terms ──────────────────────────────────────────────────────────

    @app_commands.command(name="order_terms", description="Nutzungsbedingungen für Aufträge")
    @app_commands.describe(language="ger / eng")
    @app_commands.checks.has_any_role("Founder", "Manager", "Developer")
    async def order_terms(self, interaction: discord.Interaction, language: Optional[str] = None) -> None:
        t = {
            "accept":           _lang(language, "Akzeptieren",                        "Accept"),
            "reject":           _lang(language, "Ablehnen",                           "Reject"),
            "btn_accepted":     _lang(language, "Nutzungsbedingungen akzeptiert",      "Terms and conditions accepted"),
            "btn_rejected":     _lang(language, "Nutzungsbedingungen abgelehnt",       "Terms and conditions rejected"),
            "msg_accepted":     _lang(language, "hat die Nutzungsbedingungen akzeptiert.", "has accepted the Terms and conditions."),
            "msg_rejected":     _lang(language, "hat die Nutzungsbedingungen abgelehnt.", "has rejected the Terms and conditions."),
            "header":           _lang(language, "Nutzungsbedingungen",                 "Terms and conditions of use"),
            "desc":             _lang(language,
                "Bitte bestätige diese Nutzungsbedingungen damit wir Deinen Auftrag bearbeiten können.",
                "Please confirm these terms of use so that we can process your order.",
            ),
        }

        btn_accept = Button(label=t["accept"], style=discord.ButtonStyle.green)
        btn_reject = Button(label=t["reject"], style=discord.ButtonStyle.red)
        view = View(timeout=None)
        view.add_item(btn_accept)
        view.add_item(btn_reject)

        embed = make_embed(title=t["header"], description=t["desc"], guild_name=interaction.guild.name)

        kwargs: dict = {"embed": embed, "view": view}
        if TERMS_FILE.exists():
            kwargs["file"] = discord.File(str(TERMS_FILE))

        await interaction.response.send_message(**kwargs)

        async def accept_callback(action: discord.Interaction) -> None:
            btn_accept.disabled = True
            btn_reject.disabled = True
            btn_accept.label = t["btn_accepted"]
            view.remove_item(btn_reject)
            await action.response.edit_message(view=view)
            await action.followup.send(f"{action.user.mention} {t['msg_accepted']}")

        async def reject_callback(action: discord.Interaction) -> None:
            btn_accept.disabled = True
            btn_reject.disabled = True
            btn_reject.label = t["btn_rejected"]
            view.remove_item(btn_accept)
            await action.response.edit_message(view=view)
            await action.followup.send(f"{action.user.mention} {t['msg_rejected']}")

        btn_accept.callback = accept_callback
        btn_reject.callback = reject_callback

    # ── /order_price ──────────────────────────────────────────────────────────

    @app_commands.command(name="order_price", description="Preis für einen Auftrag")
    @app_commands.describe(price="Preis in Euro", language="ger / eng")
    @app_commands.checks.has_any_role("Founder", "Manager", "Developer")
    async def order_price(self, interaction: discord.Interaction, price: str, language: Optional[str] = None) -> None:
        t = {
            "accept":       _lang(language, "Akzeptieren",    "Accept"),
            "reject":       _lang(language, "Ablehnen",       "Reject"),
            "btn_accepted": _lang(language, "Preis akzeptiert", "Price accepted"),
            "btn_rejected": _lang(language, "Preis abgelehnt",  "Price rejected"),
            "msg_accepted": _lang(language, "hat den Preis akzeptiert.", "has accepted the Price."),
            "msg_rejected": _lang(language, "hat den Preis abgelehnt.", "has rejected the Price."),
            "header":       _lang(language, "Preis für den Auftrag", "Order Price"),
            "desc":         _lang(language,
                "Bitte bestätige den angegebenen Preis für Deinen Auftrag.",
                "Please confirm the indicated price for your order.",
            ),
            "price_label":  _lang(language, f"Preis: {price}€", f"Price: {price}€"),
        }

        btn_accept = Button(label=t["accept"], style=discord.ButtonStyle.green)
        btn_reject = Button(label=t["reject"], style=discord.ButtonStyle.red)
        view = View(timeout=None)
        view.add_item(btn_accept)
        view.add_item(btn_reject)

        embed = make_embed(
            title=t["header"],
            description=f"{t['desc']}\n\n{t['price_label']}",
            guild_name=interaction.guild.name,
        )
        await interaction.response.send_message(embed=embed, view=view)

        async def accept_callback(action: discord.Interaction) -> None:
            btn_accept.disabled = True
            btn_reject.disabled = True
            btn_accept.label = t["btn_accepted"]
            view.remove_item(btn_reject)
            await action.response.edit_message(view=view)
            await action.followup.send(f"{action.user.mention} {t['msg_accepted']}")

        async def reject_callback(action: discord.Interaction) -> None:
            btn_accept.disabled = True
            btn_reject.disabled = True
            btn_reject.label = t["btn_rejected"]
            view.remove_item(btn_accept)
            await action.response.edit_message(view=view)
            await action.followup.send(f"{action.user.mention} {t['msg_rejected']}")

        btn_accept.callback = accept_callback
        btn_reject.callback = reject_callback


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(OrdersCog(bot))
