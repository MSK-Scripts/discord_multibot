# MSK Scripts – Discord Multi-Bot

Ein modulares Discord-Bot-System auf Basis von **discord.js v14**, das drei unabhängige Bots in einem einzigen Node.js-Prozess betreibt. Entwickelt und gepflegt von [MSK Scripts](https://www.msk-scripts.de).

📄 [Readme (EN)](README.md) · [Readme (DE)](README_DE.md)

---

## Übersicht

| Bot | Aufgabe |
|---|---|
| **Commands Bot** | Server-Management-Slash-Commands: Regeln, Rollen, Informationen, Bestellungen, Support, Admin-Tools, Utility |
| **Events Bot** | Server-Event-Logging, Kontextmenüs, automatisierte Nachrichtenverarbeitung |
| **Minigames Bot** | 12 interaktive Minispiele mit gemeinsamem Punkte- & Belohnungssystem |

Alle drei Bots laufen parallel. Stürzt einer ab, wird er nach 10 Sekunden automatisch neu gestartet, ohne die anderen zu beeinflussen.

---

## Voraussetzungen

- **Node.js >= 18** (integriertes `fetch` wird für die Trivia-API benötigt)
- **npm**
- Eine Discord-Anwendung mit drei Bot-Tokens (einer pro Bot)
- Ein Discord-Server (Guild) mit den entsprechend konfigurierten Rollen und Channels

---

## Installation

```bash
# 1. Repository klonen
git clone https://github.com/MSK-Scripts/discord-multibot-js.git
cd discord-multibot-js

# 2. Abhängigkeiten installieren
npm install

# 3. Umgebungsvariablen konfigurieren
cp .env.example .env
# → Tokens, IDs und Datenbankzugangsdaten in .env eintragen

# 4. Alle Bots starten
node main.js
```

---

## Deployment (Linux / Debian)

### systemd-Dienst

Eine fertige systemd-Unit-Datei liegt unter `multibot-js.service` bereit.

**1. Pfade und Benutzer in der Datei bei Bedarf anpassen** (Standard: Benutzer `deploy`, Pfad `/home/deploy/discord_multibot_js`).

**2. Service-Datei nach systemd kopieren:**

```bash
sudo cp multibot-js.service /etc/systemd/system/
```

**3. systemd neu laden und Dienst aktivieren:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable multibot-js
sudo systemctl start multibot-js
```

**4. Status prüfen:**

```bash
sudo systemctl status multibot-js
```

**Nützliche Befehle:**

```bash
# Live-Logs anzeigen
journalctl -u multibot-js -f

# Nach einem Update neu starten
sudo systemctl restart multibot-js

# Bots stoppen
sudo systemctl stop multibot-js
```

> **Hinweis:** Der Dienst liest die `.env`-Datei über `EnvironmentFile=`. Stelle sicher, dass die Datei am konfigurierten Pfad vorhanden und vom Service-Benutzer lesbar ist.

---

## Konfiguration

Die gesamte Konfiguration erfolgt über eine `.env`-Datei im Stammverzeichnis. `.env.example` kopieren und die Werte eintragen.

### Pflichtfelder

```env
COMMANDS_BOT_TOKEN=dein_commands_bot_token
EVENTS_BOT_TOKEN=dein_events_bot_token
MINIGAMES_BOT_TOKEN=dein_minigames_bot_token
GUILD_ID=deine_guild_id
```

### Optional (ohne Angabe werden die MSK Scripts Standardwerte verwendet)

```env
# Logging & Channels
LOG_CHANNEL_ID=
FEEDBACK_CHANNEL_ID=
MEMBER_COUNT_CHANNEL_ID=

# Rollen-IDs
MEMBER_ROLE_ID=
TEAM_ROLE_ID=
GIVEAWAY_NOTIFY_ROLE_ID=
GARAGE_ROLE_ID=
HANDCUFFS_ROLE_ID=
STORAGE_ROLE_ID=
VEHICLEKEYS_ROLE_ID=

# Datenbank (für /backup_database)
DB_HOST=localhost
DB_USER=
DB_PASS=
DB_NAME=es_extended
```

---

## Features

### Commands Bot

| Befehl | Beschreibung | Rollengeschützt |
|---|---|---|
| `/information` | Sendet ein gebrandetes Server-Informations-Embed | ✅ Manager / Founder |
| `/rules` | Sendet die Serverregeln mit Verifikations- & Giveaway-Notify-Button | ✅ Manager / Founder |
| `/roles` | Sendet Rollen-Buttons für Script-Update-Benachrichtigungen | ✅ Manager / Founder |
| `/script_guides` | Verlinkt die Dokumentation für ein gewähltes Script | ✅ Support+ |
| `/donation` | Zeigt Spendenoptionen mit Zahlungslinks | ✅ Manager / Founder |
| `/order_terms` | Sendet die AGB als PDF mit Akzeptieren-/Ablehnen-Button | ✅ Developer / Manager / Founder |
| `/order_price` | Sendet einen Auftragspreis mit Akzeptieren-/Ablehnen-Button | ✅ Developer / Manager / Founder |
| `/send_message` | Sendet eine benutzerdefinierte Nachricht per Modal | ✅ Manager / Founder |
| `/send_embed` | Sendet ein vollständig anpassbares Embed per Modal | ✅ Manager / Founder |
| `/backup_database` | Erstellt ein MySQL-Datenbank-Backup und lädt es in den Log-Channel hoch | ✅ Founder |
| `/ping` | Zeigt Bot-Latenz und API-Antwortzeit | — |
| `/userinfo` | Zeigt Infos und Minigame-Punkte eines Benutzers | — |
| `/clear` | Löscht bis zu 100 Nachrichten auf einmal | ✅ Team |
| `/random` | Zieht eine Zufallszahl in einem definierten Bereich (für Ratespiele) | ✅ Team |
| `/rg` | Errate die aktuell aktive Geheimzahl | — |
| `/flachwitz` | Postet einen zufälligen Flachwitze aus der lokalen Sammlung | — |
| `/add_flachwitz` | Fügt einen neuen Witz zur Sammlung hinzu | ✅ Team |

**Persistente Rollen-Toggle-Buttons** (bleiben nach Bot-Neustart aktiv):
- `✅ Verification` — vergibt die Member-Rolle
- `🎁 Giveaway Notify` — schaltet die Giveaway-Benachrichtigungsrolle um
- `⏰ Garage / Handcuffs / Storage / Vehicle Keys` — schaltet Script-Update-Rollen um

### Events Bot

**Guild-Logging** — Alle Events werden als farbige Embeds in den konfigurierten Log-Channel gepostet:

| Kategorie | Geloggte Events |
|---|---|
| Mitglieder | Beigetreten, Verlassen, Gekickt, Gebannt, Entbannt, Timeout gesetzt/entfernt |
| Rollen | Rolle hinzugefügt (inkl. von wem), Rolle entfernt (inkl. von wem) |
| Name / Nickname | Benutzername geändert, Nickname geändert |
| Nachrichten | Bearbeitet, Gelöscht (inkl. von wem gelöscht), Massen-Löschen (inkl. von wem) |
| Channels | Erstellt, Gelöscht, Aktualisiert (Name, Topic, Slowmode, NSFW) |
| Server-Rollen | Erstellt, Gelöscht, Aktualisiert (Name, Farbe, Berechtigungen) |
| Voice | Beigetreten, Verlassen, Gewechselt, Server-Mute/Unmute, Server-Deafen/Undeafen |
| Einladungen | Erstellt (inkl. max. Nutzungen & Ablaufdatum), Gelöscht |

- **Auto-Antwort** — Reagiert automatisch, wenn Nicht-Team-Mitglieder „Musiker15" erwähnen
- **Feedback-Embed** — Nachrichten im Feedback-Channel werden automatisch in gebrandete Embeds umgewandelt, die Original-Nachricht wird gelöscht
- **Kontextmenüs** (Rechtsklick auf Nachrichten):
  - `📝 Comment Feedback` — Fügt einem Feedback-Embed einen Moderator-Kommentar hinzu und benachrichtigt den Autor per DM
  - `💬 Answer a Message` — Antwortet per Modal auf eine beliebige Nachricht
  - `✏️ Edit Message` — Bearbeitet eine Bot-Nachricht per Modal
  - `🖼️ Edit Embed` — Bearbeitet ein Bot-Embed (Titel, Beschreibung, Thumbnail, Bild, Footer) per Modal

### Minigames Bot

Alle Minispiele sind sitzungsbasiert (kein globaler Zustand) und vergeben oder ziehen Punkte je nach Ergebnis ab.

| Befehl | Beschreibung |
|---|---|
| `/8ball` | Magic 8-Ball — beantwortet Ja/Nein-Fragen |
| `/dice` | Würfeln — W4 bis W100, 1–10 Würfel |
| `/flipcoin` | Münze werfen — Kopf oder Zahl |
| `/rps` | Schere Stein Papier gegen den Bot |
| `/slots` | Spielautomat mit animiertem Drehen und 7 Symbolstufen |
| `/trivia` | Multiple-Choice-Quiz (OpenTrivia DB + lokale Fallback-Fragen) |
| `/hangman` | Klassisches Galgenmännchen mit Modal-Eingabe |
| `/wordle` | Wordle — errate das 5-Buchstaben-Wort in 6 Versuchen |
| `/tictactoe` | Tic-Tac-Toe — Einfach / Mittel / Schwer (Minimax-KI) |
| `/connect4` | Vier gewinnt — Bot-KI mit Gewinn-/Block-/Zentrumstrategie |
| `/blackjack` | Blackjack — Ziehen, Stehen, Verdoppeln gegen den Dealer |
| `/points` | Zeigt deinen aktuellen Punktestand mit Fortschrittsbalken |

---

## Punkte- & Belohnungssystem

Punkte werden dauerhaft in `data/points.json` gespeichert. Jedes Spiel vergibt oder zieht Punkte je nach Ergebnis und Schwierigkeit ab. Belohnungsschwellen vergeben automatisch Discord-Rollen und benachrichtigen den Benutzer.

Standard-Belohnungsschwellen:

| Punkte | Belohnung |
|---|---|
| 500 | 🥉 Bronze Player |
| 1.500 | 🥈 Silver Player |
| 4.000 | 🥇 Gold Player |
| 10.000 | 💎 Diamond Player |

Die Punktwerte pro Spiel sind in `bots/minigames/points_config.json` konfigurierbar.

---

## Projektstruktur

```
discord_multibot_js/
├── main.js                          ← Startet alle 3 Bots, Auto-Restart-Logik
├── package.json
├── .env                             ← Nicht eingecheckt (siehe .gitignore)
├── .github/
│   └── dependabot.yml               ← Wöchentliche Dependency-Update-Prüfung
├── core/
│   ├── config.js                    ← Umgebungskonfiguration
│   ├── utils.js                     ← Gemeinsame Helfer (makeEmbed, readJson, …)
│   └── pointsManager.js             ← Punkte lesen/schreiben + Reward-Benachrichtigungen
├── data/
│   ├── points.json                  ← Persistente Benutzerpunkte (wird automatisch erstellt)
│   └── backups/                     ← Datenbank-Backups (automatisch erstellt & gelöscht)
├── assets/                          ← Statische Dateien, z. B. AGB-PDF
└── bots/
    ├── commands/
    │   ├── bot.js
    │   └── commands/
    │       ├── community.js          ← /information, /rules, /roles
    │       ├── admin.js              ← /backup_database, /send_message, /send_embed
    │       ├── support.js            ← /script_guides
    │       ├── orders.js             ← /donation, /order_terms, /order_price
    │       ├── utility.js            ← /ping, /userinfo, /clear
    │       └── minigames.js          ← /random, /rg, /flachwitz, /add_flachwitz
    ├── events/
    │   ├── bot.js
    │   └── handlers/
    │       ├── logging.js
    │       ├── messageHandler.js
    │       └── contextMenus.js
    └── minigames/
        ├── bot.js
        ├── points_config.json
        └── commands/
            ├── eightball.js
            ├── dice.js
            ├── flipcoin.js
            ├── rps.js
            ├── slots.js
            ├── trivia.js
            ├── hangman.js
            ├── wordle.js
            ├── tictactoe.js
            ├── connect4.js
            ├── blackjack.js
            └── points.js
```

---

## Abhängigkeiten

| Paket | Version |
|---|---|
| [discord.js](https://discord.js.org) | `^14.26.4` |
| [dotenv](https://github.com/motdotla/dotenv) | `^16.6.1` |

Dependency-Updates werden automatisch über [Dependabot](.github/dependabot.yml) überwacht (wöchentlich, gruppiert).

---

## Links

- **Website:** [msk-scripts.de](https://www.msk-scripts.de)
- **Dokumentation:** [docu.msk-scripts.de](https://docu.msk-scripts.de)
- **GitHub:** [github.com/MSK-Scripts](https://github.com/MSK-Scripts)
- **Discord:** [discord.gg/5hHSBRHvJE](https://discord.gg/5hHSBRHvJE)

---

*© MSK Scripts – Musiker15*
