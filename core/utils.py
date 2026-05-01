"""
core/utils.py
─────────────
Gemeinsam genutzte Hilfsfunktionen für alle Bots.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import discord

from core.config import EMBED_COLOR, THUMBNAIL_URL

log = logging.getLogger(__name__)


# ─── Datum / Zeit ─────────────────────────────────────────────────────────────

def now_str() -> str:
    """Gibt das aktuelle Datum + Uhrzeit als formatierten String zurück."""
    return datetime.now().strftime("%d/%m/%Y %H:%M:%S")


# ─── Embed-Builder ────────────────────────────────────────────────────────────

def make_embed(
    *,
    title:       str = "",
    description: str = "",
    color:       int = EMBED_COLOR,
    thumbnail:   bool | str = True,
    footer_text: str | None = None,
    guild_name:  str = "",
) -> discord.Embed:
    """
    Erstellt ein vorkonfiguriertes Embed mit einheitlichem Branding.

    Args:
        thumbnail: True = Standard-URL, False = kein Thumbnail, str = eigene URL
        footer_text: Überschreibt den automatischen Footer (Guild-Name + Datum)
    """
    embed = discord.Embed(title=title, description=description, color=color)

    if thumbnail is True:
        embed.set_thumbnail(url=THUMBNAIL_URL)
    elif isinstance(thumbnail, str) and thumbnail:
        embed.set_thumbnail(url=thumbnail)

    if footer_text is None and guild_name:
        footer_text = f"© {guild_name} • {now_str()}"
    if footer_text:
        embed.set_footer(text=footer_text, icon_url=THUMBNAIL_URL)

    return embed


# ─── JSON-Hilfsfunktionen ─────────────────────────────────────────────────────

def read_json(path: Path, default: Any = None) -> Any:
    """Liest eine JSON-Datei; gibt `default` zurück, wenn die Datei nicht existiert."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        log.debug("JSON-Datei nicht gefunden: %s – verwende Default.", path)
        return default
    except json.JSONDecodeError as exc:
        log.error("JSON-Fehler in %s: %s", path, exc)
        return default


def write_json(path: Path, data: Any) -> None:
    """Schreibt Daten atomar in eine JSON-Datei."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    tmp.replace(path)


# ─── Modal-Basisklasse ───────────────────────────────────────────────────────

class BaseModal(discord.ui.Modal):
    """Modal, das nach dem Absenden die Interaction speichert und stoppt."""

    async def on_submit(self, interaction: discord.Interaction) -> None:
        self.interaction = interaction
        self.stop()
