# MSK Scripts – Discord Multi-Bot

Modulares Multi-Bot-System für den MSK Scripts Discord-Server.
Alle Bots laufen in einem einzigen Prozess, jeder Bot bleibt in seinem eigenen Modul.

---

## Projektstruktur

```
discord_multibot/
├── main.py                          # Einstiegspunkt – startet alle Bots parallel
├── .env                             # Tokens & IDs (nicht committen!)
├── .env.example                     # Vorlage für .env
├── requirements.txt
├── multibot.service                 # systemd-Unit
├── multibot.log                     # Log-Datei (wird automatisch erstellt)
│
├── data/                            # Persistente Daten (automatisch erstellt)
│   ├── flachwitze.json              # Flachwitz-Datenbank
│   └── points.json                  # Punkte aller User
│
├── core/                            # Geteilte Komponenten
│   ├── config.py                    # Alle Einstellungen aus .env
│   ├── utils.py                     # Embed-Builder, JSON-Helfer, BaseModal
│   └── points_manager.py            # Punkte lesen/schreiben, Belohnungen vergeben
│
└── bots/
    ├── commands/                    # Haupt-Slash-Command-Bot
    │   ├── bot.py
    │   └── cogs/
    │       ├── admin.py             # /backup_database, /send_message, /send_embed
    │       ├── community.py         # /rules, /information + persistente Views
    │       ├── minigames.py         # /random, /rg, /flachwitz, /add_flachwitz
    │       ├── support.py           # /script_guides
    │       └── utility.py           # /ping, /userinfo (inkl. Punkte), /clear
    │
    ├── events/                      # Event-Logging-Bot
    │   ├── bot.py
    │   └── cogs/
    │       ├── logging_cog.py       # Alle Guild-Events als farbige Embeds
    │       ├── message_handler.py   # on_message, Feedback-Channel
    │       └── context_menus.py     # Comment Feedback, Answer/Edit Message, Edit Embed
    │
    └── minigames/                   # Minigames-Bot
        ├── bot.py
        ├── points_config.json       # Punktwerte & Belohnungen (editierbar)
        └── cogs/
            ├── tictactoe.py         # /tictactoe  – Easy / Medium / Hard KI
            ├── eightball.py         # /8ball       – Magic 8-Ball
            ├── dice.py              # /dice        – Würfeln (d4–d100)
            ├── flipcoin.py          # /flipcoin    – Münze werfen
            ├── rps.py               # /rps         – Rock Paper Scissors
            ├── slots.py             # /slots       – Einarmiger Bandit
            ├── trivia.py            # /trivia      – Multiple-Choice Quiz
            ├── hangman.py           # /hangman     – Galgenmännchen
            ├── connect4.py          # /connect4    – Vier Gewinnt
            ├── wordle.py            # /wordle      – 5-Buchstaben-Wort erraten
            ├── blackjack.py         # /blackjack   – Blackjack mit Double Down
            └── points.py            # /points      – Punktestand & Fortschritt
```

---

## Voraussetzungen

- **Python 3.9+**
- **pip**
- Optional: `mysqldump` für `/backup_database`

---

## Installation

### 1. Ordner anlegen & Dateien kopieren

```bash
sudo mkdir -p /opt/discord_multibot
sudo chown $USER:$USER /opt/discord_multibot
cd /opt/discord_multibot
# Alle Projektdateien hierher kopieren
```

### 2. Virtuelle Umgebung & Abhängigkeiten

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
nano .env    # Tokens und IDs eintragen
```

> **Hinweis:** Jeder Bot benötigt eine eigene Bot-Application im
> [Discord Developer Portal](https://discord.com/developers/applications).
> Bots ohne Token werden beim Start automatisch übersprungen.

### 4. Manueller Test

```bash
source venv/bin/activate
python main.py
```

---

## systemd-Service

### Systembenutzer erstellen (empfohlen)

```bash
sudo useradd --system --no-create-home --shell /sbin/nologin discord
sudo chown -R discord:discord /opt/discord_multibot
```

### Service installieren & aktivieren

```bash
sudo cp multibot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now multibot.service
```

### Nützliche Befehle

```bash
# Status anzeigen
sudo systemctl status multibot.service

# Live-Logs (journald)
sudo journalctl -u multibot.service -f

# Datei-Log
tail -f /opt/discord_multibot/multibot.log

# Neustart (z. B. nach .env-Änderung)
sudo systemctl restart multibot.service

# Stoppen
sudo systemctl stop multibot.service

# Service deaktivieren
sudo systemctl disable multibot.service
```

---

## Bots & Commands

### Commands Bot

| Command            | Beschreibung                                      | Rollen                          |
|--------------------|---------------------------------------------------|---------------------------------|
| `/ping`            | Bot-Latenz anzeigen                               | Alle                            |
| `/userinfo`        | Infos über einen User (inkl. Minigame-Punkte)     | Alle                            |
| `/flachwitz`       | Zufälliger Flachwitz                              | Alle                            |
| `/rg`              | Zahl raten                                        | Alle                            |
| `/script_guides`   | Support-Guides für MSK-Scripts                    | Alle                            |
| `/clear`           | Nachrichten löschen (max. 100)                    | Team                            |
| `/random`          | Geheimzahl für Ratespiel setzen                   | Team                            |
| `/add_flachwitz`   | Flachwitz hinzufügen                              | Team                            |
| `/send_message`    | Nachricht über Modal senden                       | Founder, Manager                |
| `/send_embed`      | Embed über Modal senden                           | Founder, Manager                |
| `/information`     | Information-Embed senden                          | Founder, Manager                |
| `/rules`           | Regelwerk senden                                  | Founder, Manager                |
| `/backup_database` | MySQL-Backup erstellen                            | Founder                         |

---

### Events Bot

**Geloggte Events (alle als farbige Embeds mit Timestamp):**

| Kategorie   | Events                                                                                        |
|-------------|-----------------------------------------------------------------------------------------------|
| 👤 Member   | Join, Leave (inkl. Kick-Erkennung), Ban, Unban, Username/Nickname-Änderung, Rollen vergeben/entzogen |
| 💬 Messages | Gelöscht (inkl. Anhänge & Löscher), Bulk-Delete, Bearbeitet (Vorher/Nachher + Jump-Link)     |
| 📁 Channels | Erstellt, Gelöscht, Umbenannt, Topic/Slowmode/NSFW geändert                                  |
| 🔑 Roles    | Erstellt, Gelöscht, Umbenannt, Farbe/Berechtigungen/Mentionable geändert                     |
| 🔊 Voice    | Joined, Left, Gewechselt                                                                      |
| 🔗 Invites  | Erstellt (mit Code, Channel, Ablaufdatum), Gelöscht                                          |

**Context-Menu-Commands (Rechtsklick auf Nachricht):**

| Command            | Beschreibung                          | Rollen           |
|--------------------|---------------------------------------|------------------|
| Comment Feedback   | Kommentar zu Feedback hinzufügen      | Founder, Manager |
| Answer a Message   | Auf eine Nachricht antworten          | Founder, Manager |
| Edit Message       | Nachricht des Bots bearbeiten         | Founder, Manager |
| Edit Embed         | Embed des Bots bearbeiten             | Founder, Manager |

---

### Minigames Bot

Alle Spiele (außer `/8ball`) sind in das **Punktesystem** integriert.
Mit `/points` können User ihren Stand und Fortschritt zu Belohnungen einsehen.

#### Commands

| Command       | Beschreibung                                        |
|---------------|-----------------------------------------------------|
| `/tictactoe`  | TicTacToe gegen den Bot (Easy / Medium / Hard)      |
| `/8ball`      | Magic 8-Ball – Ja/Nein-Fragen                       |
| `/dice`       | Würfeln (d4, d6, d8, d10, d12, d20, d100)          |
| `/flipcoin`   | Münze werfen (Heads / Tails)                        |
| `/rps`        | Rock Paper Scissors                                 |
| `/slots`      | Einarmiger Bandit mit Animation                     |
| `/trivia`     | Multiple-Choice Quiz (OpenTrivia DB + Fallback-Bank)|
| `/hangman`    | Galgenmännchen mit ASCII-Art                        |
| `/connect4`   | Vier Gewinnt gegen den Bot                          |
| `/wordle`     | 5-Buchstaben-Wort in 6 Versuchen erraten            |
| `/blackjack`  | Blackjack mit Hit / Stand / Double Down             |
| `/points`     | Punktestand & Fortschrittsbalken anzeigen           |

#### Punktesystem

| Spiel      | Punkte                                                                    |
|------------|---------------------------------------------------------------------------|
| TicTacToe  | Easy: Win +5 / Lose -2 / Draw +1 · Medium: +10/-4/+2 · Hard: +20/-5/+5  |
| Flipcoin   | Win +3 / Lose -1                                                          |
| RPS        | Win +5 / Lose -2 / Draw +0                                               |
| Slots      | Jackpot +50 / Mega +20 / Big +10 / Win +8 / Small +3 / No match -2       |
| Trivia     | Easy: +5/-1 · Medium: +10/-2 · Hard: +20/-3                              |
| Hangman    | Win +15 / Lose -3                                                         |
| Connect4   | Win +10 / Lose -3 / Draw +2                                              |
| Wordle     | 1 try +50 → 6 tries +5 / Lose -5                                         |
| Blackjack  | Win +15 / Blackjack +25 / Lose -5 / Draw +0                              |

#### Belohnungsstufen

| Stufe             | Punkte | Belohnung |
|-------------------|--------|-----------|
| 🥉 Bronze Player  | 500    | Rolle     |
| 🥈 Silver Player  | 1.500  | Rolle     |
| 🥇 Gold Player    | 4.000  | Rolle     |
| 💎 Diamond Player | 10.000 | Rolle     |

> Belohnungen und Punktwerte können in `bots/minigames/points_config.json` angepasst werden.
> Rollen-IDs werden dort ebenfalls konfiguriert – nach Änderungen Bot neu starten.

---

## Einzelnen Bot deaktivieren

Token in `.env` leer lassen – der Bot wird beim Start automatisch übersprungen:

```env
# Beispiel: Minigames Bot deaktivieren
MINIGAMES_BOT_TOKEN=
```

---

## Punktesystem konfigurieren

Alle Punktwerte und Belohnungen befinden sich in `bots/minigames/points_config.json`.
Rollen-IDs für automatische Rollenvergabe dort eintragen:

```json
{ "points": 1500, "description": "🥈 Silver Player", "role_id": 123456789 }
```

---

## Sicherheitshinweise

- `.env` niemals committen – in `.gitignore` eintragen
- `/backup_database` nutzt `os.system` – nur auf vertrauenswürdigen Servern einsetzen
- Der systemd-Service läuft unter einem eingeschränkten `discord`-Benutzer ohne Root-Rechte
- Berechtigungsänderungen an Rollen werden im Log-Channel **rot** hervorgehoben
