# MSK Scripts – Discord Multi-Bot

A modular multi-bot system for the MSK Scripts Discord server.
All bots run in a single process, each bot stays in its own module for clarity and maintainability.

---

## Project Structure

```
discord_multibot/
├── main.py                          # Entry point – starts all bots in parallel
├── .env                             # Tokens & IDs (never commit this!)
├── .env.example                     # Template for .env
├── .gitignore
├── requirements.txt
├── multibot.service                 # systemd unit file
├── multibot.log                     # Log file (created automatically)
│
├── data/                            # Persistent data (created automatically)
│   ├── flachwitze.json              # Joke database
│   └── points.json                  # Minigame points for all users
│
├── core/                            # Shared components used by all bots
│   ├── config.py                    # All settings loaded from .env
│   ├── utils.py                     # Embed builder, JSON helpers, BaseModal
│   └── points_manager.py            # Read/write points, handle reward unlocks
│
└── bots/
    ├── commands/                    # Main slash command bot
    │   ├── bot.py
    │   └── cogs/
    │       ├── admin.py             # /backup_database, /send_message, /send_embed
    │       ├── community.py         # /rules, /information + persistent views
    │       ├── minigames.py         # /random, /rg, /flachwitz, /add_flachwitz
    │       ├── support.py           # /script_guides
    │       └── utility.py           # /ping, /userinfo (incl. points), /clear
    │
    ├── events/                      # Event logging bot
    │   ├── bot.py
    │   └── cogs/
    │       ├── logging_cog.py       # All guild events as colored embeds
    │       ├── message_handler.py   # on_message, feedback channel handling
    │       └── context_menus.py     # Comment Feedback (+ DM), Answer/Edit Message, Edit Embed
    │
    └── minigames/                   # Minigames bot
        ├── bot.py
        ├── points_config.json       # Point values & rewards (user-editable)
        └── cogs/
            ├── tictactoe.py         # /tictactoe   – Easy / Medium / Hard AI
            ├── eightball.py         # /8ball        – Magic 8-Ball
            ├── dice.py              # /dice         – Roll dice (d4–d100)
            ├── flipcoin.py          # /flipcoin     – Flip a coin
            ├── rps.py               # /rps          – Rock Paper Scissors
            ├── slots.py             # /slots        – Slot machine with animation
            ├── trivia.py            # /trivia       – Multiple choice quiz
            ├── hangman.py           # /hangman      – Hangman with ASCII art
            ├── connect4.py          # /connect4     – Connect Four vs bot
            ├── wordle.py            # /wordle       – Guess the 5-letter word
            ├── blackjack.py         # /blackjack    – Blackjack with Double Down
            └── points.py            # /points       – Show points & reward progress
```

---

## Requirements

- **Python 3.9+**
- **pip**
- Optional: `mysqldump` for `/backup_database`

---

## Installation

### 1. Create directory and copy files

```bash
sudo mkdir -p /opt/discord_multibot
sudo chown $USER:$USER /opt/discord_multibot
cd /opt/discord_multibot
# Copy all project files here
```

### 2. Virtual environment & dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
nano .env    # Fill in your tokens and IDs
```

> **Note:** Each bot requires its own bot application in the
> [Discord Developer Portal](https://discord.com/developers/applications).
> Bots without a token are automatically skipped on startup.

### 4. Manual test run

```bash
source venv/bin/activate
python main.py
```

---

## systemd Service

### Create a system user (recommended)

```bash
# Create a dedicated system user (recommended — never run as root)
sudo useradd --system --no-create-home --shell /sbin/nologin discord

# Set permissions
sudo chown -R discord:discord /opt/discord_multibot
```

### Install & enable the service

```bash
sudo cp multibot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now multibot.service
```

### Useful commands

```bash
# Show status
sudo systemctl status multibot.service

# Live logs (journald)
sudo journalctl -u multibot.service -f

# File log
tail -f /opt/discord_multibot/multibot.log

# Restart (e.g. after .env changes)
sudo systemctl restart multibot.service

# Stop
sudo systemctl stop multibot.service

# Disable autostart
sudo systemctl disable multibot.service
```

---

## Bots & Commands

### Commands Bot

| Command            | Description                                        | Roles                       |
|--------------------|----------------------------------------------------|-----------------------------|
| `/ping`            | Show bot latency                                   | Everyone                    |
| `/userinfo`        | User info including minigame points                | Everyone                    |
| `/flachwitz`       | Random German flat joke                            | Everyone                    |
| `/rg`              | Guess the secret number                            | Everyone                    |
| `/script_guides`   | Support guides for MSK scripts                     | Everyone                    |
| `/clear`           | Delete messages (max. 100)                         | Team                        |
| `/random`          | Set secret number for the guessing game            | Team                        |
| `/add_flachwitz`   | Add a new flat joke                                | Team                        |
| `/send_message`    | Send a message via modal                           | Founder, Manager            |
| `/send_embed`      | Send an embed via modal                            | Founder, Manager            |
| `/information`     | Post the information embed                         | Founder, Manager            |
| `/rules`           | Post the rules embed                               | Founder, Manager            |
| `/backup_database` | Create a MySQL database backup                     | Founder                     |

---

### Events Bot

**Logged events (all as colored embeds with timestamp):**

| Category    | Events                                                                                              |
|-------------|-----------------------------------------------------------------------------------------------------|
| 👤 Member   | Join, Leave (incl. kick detection), Ban, Unban, Username/Nickname change, Roles added/removed       |
| 💬 Messages | Deleted (incl. attachments & who deleted), Bulk delete, Edited (before/after + jump link)          |
| 📁 Channels | Created, Deleted, Renamed, Topic/Slowmode/NSFW changed                                             |
| 🔑 Roles    | Created, Deleted, Renamed, Color/Permissions/Mentionable changed                                   |
| 🔊 Voice    | Joined, Left, Switched channel                                                                      |
| 🔗 Invites  | Created (with code, channel, expiry), Deleted                                                      |

**Context menu commands (right-click on a message):**

| Command          | Description                                                                 | Roles            |
|------------------|-----------------------------------------------------------------------------|------------------|
| Comment Feedback | Add a comment to a feedback embed. The original author receives a DM.       | Founder, Manager |
| Answer a Message | Reply to a message                                                          | Founder, Manager |
| Edit Message     | Edit a bot message                                                          | Founder, Manager |
| Edit Embed       | Edit a bot embed                                                            | Founder, Manager |

**Feedback channel behavior:**
- Messages posted in the feedback channel are automatically converted into embeds.
- When a team member comments on feedback via "Comment Feedback", the original author receives a **DM** containing the comment text and who wrote it.
- If the user has DMs disabled, the comment is still saved in the embed — only the DM is skipped.

---

### Minigames Bot

All games (except `/8ball`) are integrated into the **points system**.
Use `/points` to check your current score and progress toward rewards.

#### Commands

| Command      | Description                                          |
|--------------|------------------------------------------------------|
| `/tictactoe` | TicTacToe vs bot (Easy / Medium / Hard)              |
| `/8ball`     | Magic 8-Ball – yes/no questions                      |
| `/dice`      | Roll dice (d4, d6, d8, d10, d12, d20, d100)         |
| `/flipcoin`  | Flip a coin (Heads / Tails)                          |
| `/rps`       | Rock Paper Scissors                                  |
| `/slots`     | Slot machine with animation                          |
| `/trivia`    | Multiple choice quiz (OpenTrivia DB + local fallback)|
| `/hangman`   | Hangman with ASCII art                               |
| `/connect4`  | Connect Four vs bot                                  |
| `/wordle`    | Guess the 5-letter word in 6 tries                   |
| `/blackjack` | Blackjack with Hit / Stand / Double Down             |
| `/points`    | Show your points and reward progress                 |

#### Points System

| Game       | Points                                                                     |
|------------|----------------------------------------------------------------------------|
| TicTacToe  | Easy: Win +5 / Lose -2 / Draw +1 · Medium: +10/-4/+2 · Hard: +20/-5/+5   |
| Flipcoin   | Win +3 / Lose -1                                                           |
| RPS        | Win +5 / Lose -2 / Draw +0                                                |
| Slots      | Jackpot +50 / Mega +20 / Big +10 / Win +8 / Small +3 / No match -2        |
| Trivia     | Easy: +5/-1 · Medium: +10/-2 · Hard: +20/-3                               |
| Hangman    | Win +15 / Lose -3                                                          |
| Connect4   | Win +10 / Lose -3 / Draw +2                                               |
| Wordle     | 1 try +50 → 6 tries +5 / Lose -5                                          |
| Blackjack  | Win +15 / Blackjack +25 / Lose -5 / Draw +0                               |

> `/8ball` is excluded from the points system.

#### Reward Tiers

| Tier              | Points | Reward                                      |
|-------------------|--------|---------------------------------------------|
| 🥉 Bronze Player  | 500    | Role                                        |
| 🥈 Silver Player  | 1,500  | Role + 1 free encrypted script from the shop|
| 🥇 Gold Player    | 4,000  | Role                                        |
| 💎 Diamond Player | 10,000 | Role + 1 free source script from the shop   |

> Point values and rewards can be adjusted in `bots/minigames/points_config.json`.
> Add Discord role IDs there to enable automatic role assignment — restart the bot after changes.

---

## Disable a Bot

Leave the token empty in `.env` — the bot will be automatically skipped on startup:

```env
# Example: disable the Minigames Bot
MINIGAMES_BOT_TOKEN=
```

---

## Configure the Points System

All point values and rewards are defined in `bots/minigames/points_config.json`.
To enable automatic role assignment, add the Discord role ID:

```json
{ "points": 1500, "description": "🥈 Silver Player", "role_id": 123456789 }
```

---

## Security Notes

- Never commit `.env` — it is listed in `.gitignore`
- `/backup_database` uses `os.system` — only use on trusted servers
- The systemd service runs under a restricted `discord` user with no root privileges
- Permission changes on roles are highlighted in **red** in the log channel
