"""
main.py
────────
Startet alle Bots parallel in einem einzigen Python-Prozess.

Jeder Bot läuft in seiner eigenen asyncio-Task.
Fällt ein Bot aus, werden die anderen nicht beeinflusst.

Starten:
    python main.py

Mit systemd:
    systemctl start multibot.service
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
from typing import Callable

from core.config import tokens

# ─── Logging konfigurieren ────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("multibot.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("main")


# ─── Bot-Definitionen ─────────────────────────────────────────────────────────

def _get_bots() -> list[tuple[str, Callable, str]]:
    """
    Gibt eine Liste von (Name, Factory-Funktion, Token) zurück.
    Bots ohne Token werden übersprungen (Warnung).
    """
    from bots.commands.bot    import create_bot as create_commands_bot
    from bots.events.bot      import create_bot as create_events_bot
    from bots.minigames.bot   import create_bot as create_minigames_bot

    candidates = [
        ("Commands Bot",   create_commands_bot,  tokens.COMMANDS),
        ("Events Bot",     create_events_bot,    tokens.EVENTS),
        ("Minigames Bot",  create_minigames_bot, tokens.MINIGAMES),
    ]

    active = []
    for name, factory, token in candidates:
        if token:
            active.append((name, factory, token))
        else:
            log.warning("⚠️  '%s' übersprungen – kein Token in .env gesetzt.", name)

    return active


# ─── Einzelner Bot-Runner ─────────────────────────────────────────────────────

async def run_bot(name: str, factory: Callable, token: str) -> None:
    """Startet einen einzelnen Bot mit Fehlerbehandlung und automatischem Retry."""
    while True:
        bot = factory()
        try:
            log.info("▶  Starte '%s' …", name)
            async with bot:
                await bot.start(token)
        except Exception:
            log.exception("💥  '%s' ist abgestürzt. Neustart in 10 s …", name)
            await asyncio.sleep(10)
        else:
            log.info("⏹  '%s' wurde sauber beendet.", name)
            break


# ─── Graceful Shutdown ────────────────────────────────────────────────────────

def _install_signal_handlers(loop: asyncio.AbstractEventLoop) -> None:
    """Installiert SIGINT/SIGTERM Handler für sauberes Beenden."""

    def _shutdown(signame: str) -> None:
        log.info("Signal %s empfangen – beende alle Bots …", signame)
        for task in asyncio.all_tasks(loop):
            task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda s=sig.name: _shutdown(s))
        except NotImplementedError:
            # Windows unterstützt add_signal_handler nicht
            pass


# ─── Einstiegspunkt ───────────────────────────────────────────────────────────

async def main() -> None:
    bots = _get_bots()
    if not bots:
        log.error("Keine Bots mit gültigem Token gefunden. Bitte .env prüfen.")
        return

    log.info("═" * 55)
    log.info("  MSK Scripts Discord Multi-Bot startet")
    log.info("  Aktive Bots: %d", len(bots))
    for name, _, _ in bots:
        log.info("    • %s", name)
    log.info("═" * 55)

    tasks = [asyncio.create_task(run_bot(name, factory, token)) for name, factory, token in bots]

    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        log.info("Alle Tasks abgebrochen – Shutdown abgeschlossen.")


if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    _install_signal_handlers(loop)
    try:
        loop.run_until_complete(main())
    finally:
        loop.close()
        log.info("Event-Loop geschlossen.")
