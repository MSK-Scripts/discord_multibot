"""
core/config.py
──────────────
Lädt alle Konfigurationswerte aus der .env-Datei.
Hardcodierte IDs oder Tokens gehören ausschließlich in die .env, nie in den Code.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ─── Pfade ────────────────────────────────────────────────────────────────────

BASE_DIR   = Path(__file__).parent.parent
DATA_DIR   = BASE_DIR / "data"
ASSETS_DIR = BASE_DIR / "assets"

DATA_DIR.mkdir(exist_ok=True)
ASSETS_DIR.mkdir(exist_ok=True)


# ─── Hilfsfunktion ───────────────────────────────────────────────────────────

def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default

def _bool(key: str, default: bool) -> bool:
    return os.getenv(key, str(default)).lower() == "true"


# ─── Konfigurationsklassen ────────────────────────────────────────────────────

@dataclass(frozen=True)
class _GuildConfig:
    ID:                      int = _int("GUILD_ID",                 900394679634370640)
    LOG_CHANNEL_ID:          int = _int("LOG_CHANNEL_ID",           900394680137699389)
    MEMBER_COUNT_CHANNEL_ID: int = _int("MEMBER_COUNT_CHANNEL_ID",  1083912480503382119)
    FEEDBACK_CHANNEL_ID:     int = _int("FEEDBACK_CHANNEL_ID",      953762590285234196)
    # Roles
    MEMBER_ROLE_ID:          int = _int("MEMBER_ROLE_ID",           900395164470767616)
    UPDATE_NOTIFY_ROLE_ID:   int = _int("UPDATE_NOTIFY_ROLE_ID",    1036345069361442846)
    GIVEAWAY_NOTIFY_ROLE_ID: int = _int("GIVEAWAY_NOTIFY_ROLE_ID",  1051120654063251476)
    TEAM_ROLE_ID:            int = _int("TEAM_ROLE_ID",             900395689182380073)


@dataclass(frozen=True)
class _DatabaseConfig:
    HOST:     str = os.getenv("DB_HOST", "localhost")
    USER:     str = os.getenv("DB_USER", "")
    PASSWORD: str = os.getenv("DB_PASS", "")
    NAME:     str = os.getenv("DB_NAME", "es_extended")


@dataclass(frozen=True)
class _BotTokens:
    COMMANDS:   str = os.getenv("COMMANDS_BOT_TOKEN",   "")
    EVENTS:     str = os.getenv("EVENTS_BOT_TOKEN",     "")
    MINIGAMES:  str = os.getenv("MINIGAMES_BOT_TOKEN",  "")


# ─── Globale Instanzen ────────────────────────────────────────────────────────

guild    = _GuildConfig()
database = _DatabaseConfig()
tokens   = _BotTokens()

# ─── Embed-Defaults ───────────────────────────────────────────────────────────

EMBED_COLOR   = 0x5E9F71           # 6205745 (grün)
THUMBNAIL_URL = "https://i.imgur.com/PizJGsh.png"
