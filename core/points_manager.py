"""
core/points_manager.py
───────────────────────
Thread-safe Punkte-Verwaltung für alle Minigame-Bots.
Punkte werden in data/points.json gespeichert: { "user_id": punkte }

Öffentliche API:
    get_points(user_id)              → int
    add_points(user_id, amount)      → (old, new)
    get_config()                     → dict  (gecacht)
    get_pts(game, key)               → int   (Hilfsfunktion für Cogs)
    notify_rewards(interaction, old, new)
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

import discord

from core.config import BASE_DIR, DATA_DIR
from core.utils import read_json, write_json

log = logging.getLogger(__name__)

_POINTS_FILE: Path = DATA_DIR / "points.json"
_CONFIG_FILE: Path = BASE_DIR / "bots" / "minigames" / "points_config.json"

# Asyncio-Lock für thread-sichere Schreibzugriffe
_lock = asyncio.Lock()

# Config-Cache (wird beim ersten Aufruf befüllt)
_config_cache: Optional[dict] = None


# ─── Config ───────────────────────────────────────────────────────────────────

def get_config() -> dict:
    """Gibt die Punkte-Config zurück (gecacht nach erstem Laden)."""
    global _config_cache
    if _config_cache is None:
        _config_cache = read_json(_CONFIG_FILE, default={})
        if not _config_cache:
            log.warning("points_config.json nicht gefunden oder leer: %s", _CONFIG_FILE)
    return _config_cache


def get_pts(game: str, *keys: str) -> int:
    """
    Hilfsfunktion für Cogs: liest einen Punktwert aus der Config.
    Beispiel: get_pts("tictactoe", "easy", "win")  → 5
              get_pts("flipcoin", "win")            → 3
    Gibt 0 zurück wenn der Pfad nicht existiert.
    """
    cfg = get_config().get("games", {}).get(game, {})
    for key in keys:
        if isinstance(cfg, dict):
            cfg = cfg.get(key, 0)
        else:
            return 0
    return cfg if isinstance(cfg, int) else 0


# ─── Punkte lesen / schreiben ─────────────────────────────────────────────────

def get_points(user_id: int) -> int:
    """Gibt den aktuellen Punktestand eines Users zurück (0 wenn nicht vorhanden)."""
    data = read_json(_POINTS_FILE, default={})
    return data.get(str(user_id), 0)


async def add_points(user_id: int, amount: int) -> tuple:
    """
    Addiert (oder subtrahiert) Punkte für einen User. Punkte können nicht unter 0 fallen.
    Gibt (alte_punkte, neue_punkte) zurück.
    """
    async with _lock:
        data = read_json(_POINTS_FILE, default={})
        key  = str(user_id)
        old  = data.get(key, 0)
        new  = max(0, old + amount)
        data[key] = new
        write_json(_POINTS_FILE, data)
    log.debug("Punkte für %s: %d → %d (%+d)", user_id, old, new, amount)
    return old, new


# ─── Belohnungen ──────────────────────────────────────────────────────────────

def get_newly_unlocked_rewards(old: int, new: int) -> list:
    """Gibt Belohnungen zurück, die durch den Punktesprung neu freigeschaltet wurden."""
    rewards = get_config().get("rewards", [])
    return [r for r in rewards if old < r["points"] <= new]


async def notify_rewards(interaction: discord.Interaction, old: int, new: int) -> None:
    """Vergibt Rollen und sendet Glückwunsch-Benachrichtigungen für neue Belohnungen."""
    unlocked = get_newly_unlocked_rewards(old, new)
    if not unlocked:
        return

    for reward in unlocked:
        role_id = reward.get("role_id")
        desc    = reward["description"]

        # Rolle vergeben wenn konfiguriert
        if role_id and interaction.guild:
            role = interaction.guild.get_role(int(role_id))
            if role:
                try:
                    await interaction.user.add_roles(role)
                    log.info("Rolle '%s' an %s vergeben.", role.name, interaction.user)
                except discord.Forbidden:
                    log.warning("Keine Berechtigung für Rolle %d.", role_id)

        # Ephemere Glückwunschnachricht
        try:
            await interaction.followup.send(
                f"🎉 **Reward unlocked!** You reached **{reward['points']:,} points** "
                f"and earned: **{desc}**!",
                ephemeral=True,
            )
        except Exception as exc:
            log.warning("Reward-Benachrichtigung fehlgeschlagen: %s", exc)


# ─── Hilfsfunktion für Embed-Footer ──────────────────────────────────────────

def points_footer(amount: int, new_total: int) -> str:
    """Erzeugt einen kurzen Punkte-String für Embed-Footer."""
    if amount > 0:
        delta = f"+{amount}"
    elif amount < 0:
        delta = str(amount)
    else:
        delta = "±0"
    return f"{delta} 🪙  (Total: {new_total:,} 🪙)"
