<img width="1978" height="394" alt="msk_multi_bot_banner" src="https://github.com/user-attachments/assets/24114a67-6acf-43c7-a8d8-32d1d30c75e0" />

<div align="center">

# Discord Multi-Bot

A modular Discord bot system built with **discord.js v14**, running three independent bots in a single Node.js process.

[![Version](https://img.shields.io/github/v/release/MSK-Scripts/discord_multibot?style=flat-square&label=Version&color=5eb131)](https://github.com/MSK-Scripts/discord_multibot/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blueviolet?style=flat-square)](https://www.gnu.org/licenses/agpl-3.0)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=flat-square&logo=discord)](https://discord.js.org)
[![Documentation](https://img.shields.io/badge/Docs-docu.msk--scripts.de-5eb131?style=flat-square)](https://docu.msk-scripts.de/discord/discord_multibot/getting-started)

📄 [Readme (EN)](README.md) · [Readme (DE)](README_DE.md)

</div>

---

## Overview

| Bot | Purpose |
|---|---|
| **Commands Bot** | Server management slash commands: rules, roles, information, orders, support, admin tools, utility |
| **Events Bot** | Guild event logging, context menus, automated message handling |
| **Minigames Bot** | 12 interactive minigames with a shared points & reward system |

All three bots run in parallel. If one crashes, it automatically restarts after 10 seconds without affecting the others.

---

## Requirements

- **Node.js >= 18** (built-in `fetch` required for the Trivia API)
- **npm**
- A Discord application with three bot tokens (one per bot)
- A Discord server (guild) with the required roles and channels configured

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/MSK-Scripts/discord-multibot-js.git
cd discord-multibot-js

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# → Fill in your tokens, IDs and database credentials in .env

# 4. Start all bots
node main.js
```

---

## Deployment (Linux / Debian)

### systemd Service

A ready-to-use systemd unit file is included at `multibot-js.service`.

**1. Adjust the paths and user in the file if necessary** (default: user `deploy`, path `/home/deploy/discord_multibot_js`).

**2. Copy the service file to systemd:**

```bash
sudo cp multibot-js.service /etc/systemd/system/
```

**3. Reload systemd and enable the service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable multibot-js
sudo systemctl start multibot-js
```

**4. Check the status:**

```bash
sudo systemctl status multibot-js
```

**Useful commands:**

```bash
# View live logs
journalctl -u multibot-js -f

# Restart after update
sudo systemctl restart multibot-js

# Stop the bots
sudo systemctl stop multibot-js
```

> **Note:** The service reads the `.env` file via `EnvironmentFile=`. Make sure the file exists at the configured path and is readable by the service user.

---

## Configuration

All configuration is done via a `.env` file in the root directory. Copy `.env.example` and fill in the values.

### Required

```env
COMMANDS_BOT_TOKEN=your_commands_bot_token
EVENTS_BOT_TOKEN=your_events_bot_token
MINIGAMES_BOT_TOKEN=your_minigames_bot_token
GUILD_ID=your_guild_id
```

### Optional (fall back to hardcoded MSK Scripts defaults)

```env
# Logging & channels
LOG_CHANNEL_ID=
FEEDBACK_CHANNEL_ID=
MEMBER_COUNT_CHANNEL_ID=

# Role IDs
MEMBER_ROLE_ID=
TEAM_ROLE_ID=
GIVEAWAY_NOTIFY_ROLE_ID=
GARAGE_ROLE_ID=
HANDCUFFS_ROLE_ID=
STORAGE_ROLE_ID=
VEHICLEKEYS_ROLE_ID=

# Database (for /backup_database)
DB_HOST=localhost
DB_USER=
DB_PASS=
DB_NAME=es_extended
```

---

## Features

### Commands Bot

| Command | Description | Role-restricted |
|---|---|---|
| `/information` | Posts a branded server information embed | ✅ Manager / Founder |
| `/rules` | Posts the server rules with Verification & Giveaway Notify buttons | ✅ Manager / Founder |
| `/roles` | Posts script update notification role buttons | ✅ Manager / Founder |
| `/script_guides` | Links to documentation for a chosen script | ✅ Support+ |
| `/donation` | Displays donation options with payment links | ✅ Manager / Founder |
| `/order_terms` | Sends the terms of service PDF with Accept / Reject buttons | ✅ Developer / Manager / Founder |
| `/order_price` | Shows an order price with Accept / Reject buttons | ✅ Developer / Manager / Founder |
| `/send_message` | Sends a custom message to any channel via modal | ✅ Manager / Founder |
| `/send_embed` | Sends a fully customizable embed to any channel | ✅ Manager / Founder |
| `/backup_database` | Creates a MySQL database backup and uploads it to the log channel | ✅ Founder |
| `/ping` | Shows bot latency and API response time | — |
| `/userinfo` | Shows info and minigame points for a user | — |
| `/clear` | Bulk-deletes up to 100 messages | ✅ Team |
| `/random` | Picks a random number in a given range (for guess games) | ✅ Team |
| `/rg` | Guess the currently active secret number | — |
| `/flachwitz` | Posts a random flat joke from the local collection | — |
| `/add_flachwitz` | Adds a new joke to the collection | ✅ Team |

**Persistent role-toggle buttons** (survive bot restarts):
- `✅ Verification` — assigns the Member role
- `🎁 Giveaway Notify` — toggles the Giveaway notification role
- `⏰ Garage / Handcuffs / Storage / Vehicle Keys` — toggles script update notification roles

### Events Bot

**Guild logging** — All events are posted as colored embeds to the configured log channel:

| Category | Events logged |
|---|---|
| Members | Join, Leave, Kick, Ban, Unban, Timeout set/removed |
| Roles | Role Added (incl. added by), Role Removed (incl. removed by) |
| Username / Nickname | Username changed, Nickname changed |
| Messages | Edited, Deleted (incl. deleted by), Bulk delete (incl. deleted by) |
| Channels | Created, Deleted, Updated (name, topic, slowmode, NSFW) |
| Roles | Created, Deleted, Updated (name, color, permissions diff) |
| Voice | Joined, Left, Moved, Server Muted/Unmuted, Server Deafened/Undeafened |
| Invites | Created (with max uses & expiry), Deleted |

- **Auto-reply** — Automatically responds when non-team members mention "Musiker15"
- **Feedback embed** — Messages posted in the feedback channel are auto-converted to branded embeds and the original is deleted
- **Context menus** (right-click on messages):
  - `📝 Comment Feedback` — Adds a moderator comment to a feedback embed and DMs the author
  - `💬 Answer a Message` — Sends a reply to any message via modal
  - `✏️ Edit Message` — Edits a bot message via modal
  - `🖼️ Edit Embed` — Edits a bot embed (title, description, thumbnail, image, footer) via modal

### Minigames Bot

All minigames are session-based (no global state) and award or deduct points on each outcome.

| Command | Description |
|---|---|
| `/8ball` | Magic 8-Ball — asks a yes/no question |
| `/dice` | Roll a die — d4 to d100, 1–10 dice |
| `/flipcoin` | Flip a coin — Heads or Tails |
| `/rps` | Rock Paper Scissors vs. the bot |
| `/slots` | Slot machine with animated spin and 7 symbol tiers |
| `/trivia` | Multiple-choice trivia (OpenTrivia DB + local fallback) |
| `/hangman` | Classic Hangman with letter-modal input |
| `/wordle` | Wordle — guess the 5-letter word in 6 tries |
| `/tictactoe` | TicTacToe — Easy / Medium / Minimax Hard AI |
| `/connect4` | Connect Four — bot AI with win/block/center logic |
| `/blackjack` | Blackjack — Hit, Stand, Double Down vs. the dealer |
| `/points` | Shows your current point balance with a progress bar |

---

## Points & Rewards System

Points are stored persistently in `data/points.json`. Each game awards or deducts points depending on the outcome and difficulty. Reward milestones automatically assign Discord roles and notify the user.

Default reward thresholds:

| Points | Reward |
|---|---|
| 500 | 🥉 Bronze Player |
| 1,500 | 🥈 Silver Player |
| 4,000 | 🥇 Gold Player |
| 10,000 | 💎 Diamond Player |

Point values per game are configurable in `bots/minigames/points_config.json`.

---

## Project Structure

```
discord_multibot_js/
├── main.js                          ← Starts all 3 bots, handles auto-restart
├── package.json
├── .env                             ← Not committed (see .gitignore)
├── .github/
│   └── dependabot.yml               ← Weekly dependency update checks
├── core/
│   ├── config.js                    ← Environment config
│   ├── utils.js                     ← Shared helpers (makeEmbed, readJson, …)
│   └── pointsManager.js             ← Points read/write + reward notifications
├── data/
│   ├── points.json                  ← Persistent user points (auto-created)
│   └── backups/                     ← Database backup files (auto-created, auto-deleted)
├── assets/                          ← Static files, e.g. terms PDF
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

## Dependencies

| Package | Version |
|---|---|
| [discord.js](https://discord.js.org) | `^14.26.4` |
| [dotenv](https://github.com/motdotla/dotenv) | `^16.6.1` |

Dependency updates are monitored automatically via [Dependabot](.github/dependabot.yml) (weekly, grouped).

---

## Links

- **Website:** [msk-scripts.de](https://www.msk-scripts.de)
- **Documentation:** [docu.msk-scripts.de](https://docu.msk-scripts.de)
- **GitHub:** [github.com/MSK-Scripts](https://github.com/MSK-Scripts)
- **Discord:** [discord.gg/5hHSBRHvJE](https://discord.gg/5hHSBRHvJE)

---

*© MSK Scripts – Musiker15*
