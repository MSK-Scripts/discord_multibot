# Graph Report - .  (2026-07-27)

## Corpus Check
- Corpus is ~22,732 words - fits in a single context window. You may not need a graph.

## Summary
- 289 nodes · 563 edges · 15 communities (14 shown, 1 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.59)
- Token cost: 115,413 input · 0 output

## Community Hubs (Navigation)
- Slash Command Suite
- Points-Backed Minigames
- Docs, Governance & Release Automation
- Guild Event Logging
- Blackjack Game
- Points & Rewards Manager
- TicTacToe with AI Opponent
- Connect Four Game
- Package Manifest & Dependencies
- Commands Bot Wiring
- Magic 8-Ball Command
- Multi-Bot Launcher
- Events Bot Wiring
- Minigames Bot Wiring
- Dice Roll Command

## God Nodes (most connected - your core abstractions)
1. `embed()` - 21 edges
2. `addPoints()` - 21 edges
3. `getPts()` - 20 edges
4. `notifyRewards()` - 20 edges
5. `log()` - 19 edges
6. `pointsFooter()` - 19 edges
7. `makeEmbed()` - 14 edges
8. `hasAnyRole()` - 14 edges
9. `getAuditUser()` - 12 edges
10. `execute()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Auto-Restart Supervision (10s)` --semantically_similar_to--> `Release Concurrency Guard`  [INFERRED] [semantically similar]
  README.md → .github/workflows/release.yml
- `Network-Use Copyleft (AGPL Section 13)` --conceptually_related_to--> `systemd Deployment (multibot-js.service)`  [AMBIGUOUS]
  LICENSE.md → README.md
- `execute()` --calls--> `readJson()`  [EXTRACTED]
  bots/commands/commands/minigames.js → core/utils.js
- `execute()` --calls--> `makeEmbed()`  [EXTRACTED]
  bots/commands/commands/support.js → core/utils.js
- `execute()` --calls--> `getPoints()`  [EXTRACTED]
  bots/commands/commands/utility.js → core/pointsManager.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Role Multi-Bot Architecture** — readme_commands_bot, readme_events_bot, readme_minigames_bot, readme_auto_restart_supervision, readme_env_configuration [EXTRACTED 1.00]
- **Tag-Driven Release Automation Pipeline** — _github_workflows_release_auto_release_workflow, _github_workflows_release_tag_resolution, _github_workflows_release_release_body_generation, _github_workflows_release_concurrency_guard [EXTRACTED 1.00]
- **Project Governance and Compliance Documents** — code_of_conduct_contributor_covenant, license_agpl_v3, security_vulnerability_reporting_policy, _github_dependabot_dependabot_config [INFERRED 0.85]

## Communities (15 total, 1 thin omitted)

### Community 0 - "Slash Command Suite"
Cohesion: 0.06
Nodes (54): { EMBED_COLOR, THUMBNAIL_URL, database, guild: gcfg, DATA_DIR }, { execFile }, execute(), { hasAnyRole, nowStr }, { join }, { mkdirSync, writeFileSync, unlinkSync }, showModal(), {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags,
} (+46 more)

### Community 1 - "Points-Backed Minigames"
Cohesion: 0.08
Nodes (45): { addPoints, getPts, notifyRewards, pointsFooter }, execute(), { makeEmbed }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder }, { addPoints, getPts, notifyRewards, pointsFooter }, buildEmbed(), execute(), { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } (+37 more)

### Community 2 - "Docs, Governance & Release Automation"
Cohesion: 0.10
Nodes (28): Dependabot npm Update Config, Grouped Weekly Dependency Updates, Auto Release Workflow, Release Concurrency Guard, Release Body Generation from Git History, Tag Resolution and Optional Tag Creation, Contributor Covenant Code of Conduct v2.0, Community Impact Enforcement Ladder (+20 more)

### Community 3 - "Guild Event Logging"
Cohesion: 0.21
Nodes (26): CHANNEL_TYPE_NAMES, channelTypeName(), embed(), { EmbedBuilder, AuditLogEvent, ChannelType }, getAuditUser(), getLogChannel(), { guild: gcfg }, log() (+18 more)

### Community 4 - "Blackjack Game"
Cohesion: 0.23
Nodes (15): { addPoints, getPts, notifyRewards, pointsFooter }, buildButtons(), buildEmbed(), execute(), handStr(), handValue(), isBlackjack(), makeDeck() (+7 more)

### Community 5 - "Points & Rewards Manager"
Cohesion: 0.20
Nodes (13): execute(), { getConfig, getPoints }, { SlashCommandBuilder, EmbedBuilder }, CONFIG_FILE, { DATA_DIR, BASE_DIR }, getConfig(), getNewlyUnlockedRewards(), getPoints() (+5 more)

### Community 6 - "TicTacToe with AI Opponent"
Cohesion: 0.24
Nodes (14): { addPoints, getPts, notifyRewards, pointsFooter }, aiEasy(), aiHard(), aiMedium(), available(), buildBoard(), CELL_EMOJIS, checkWinner() (+6 more)

### Community 7 - "Connect Four Game"
Cohesion: 0.29
Nodes (13): { addPoints, getPts, notifyRewards, pointsFooter }, botMove(), buildComponents(), buildEmbed(), checkWin(), COL_NUMS, drop(), execute() (+5 more)

### Community 8 - "Package Manifest & Dependencies"
Cohesion: 0.14
Nodes (13): discord.js, dotenv, dependencies, discord.js, dotenv, description, engines, node (+5 more)

### Community 9 - "Commands Bot Wiring"
Cohesion: 0.24
Nodes (9): attach(), {
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}, { guild: gcfg }, handlePersistentButton(), intents, { join }, partials, { readdirSync } (+1 more)

### Community 10 - "Magic 8-Ball Command"
Cohesion: 0.32
Nodes (7): ALL, COLORS, execute(), NEGATIVE, NEUTRAL, POSITIVE, { SlashCommandBuilder, EmbedBuilder }

### Community 11 - "Multi-Bot Launcher"
Cohesion: 0.32
Nodes (7): tokens, botModules, { Client, Events, REST, Routes }, createRegistry(), main(), runGroup(), { tokens, guild: gcfg }

### Community 12 - "Events Bot Wiring"
Cohesion: 0.33
Nodes (6): attach(), {
  GatewayIntentBits, Partials, Events, ActivityType,
}, { guild: gcfg }, intents, partials, updateMemberCount()

### Community 13 - "Minigames Bot Wiring"
Cohesion: 0.29
Nodes (5): {
  Collection, GatewayIntentBits, Events, ActivityType, MessageFlags,
}, intents, { join }, partials, { readdirSync }

## Ambiguous Edges - Review These
- `Network-Use Copyleft (AGPL Section 13)` → `systemd Deployment (multibot-js.service)`  [AMBIGUOUS]
  LICENSE.md · relation: conceptually_related_to

## Knowledge Gaps
- **109 isolated node(s):** `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }`, `{ guild: gcfg }`, `intents` (+104 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Network-Use Copyleft (AGPL Section 13)` and `systemd Deployment (multibot-js.service)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `embed()` connect `Guild Event Logging` to `Slash Command Suite`, `Blackjack Game`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `execute()` connect `Blackjack Game` to `Points-Backed Minigames`, `Guild Event Logging`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `addPoints()` connect `Points-Backed Minigames` to `Slash Command Suite`, `Blackjack Game`, `Points & Rewards Manager`, `TicTacToe with AI Opponent`, `Connect Four Game`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `embed()` (e.g. with `execute()` and `execute()`) actually correct?**
  _`embed()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }` to the rest of the system?**
  _109 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Slash Command Suite` be split into smaller, more focused modules?**
  _Cohesion score 0.05501165501165501 - nodes in this community are weakly interconnected._