# Graph Report - discord_multibot  (2026-09-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 305 nodes · 567 edges · 19 communities (17 shown, 2 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.85)
- Token cost: 983 input · 42 output

## Graph Freshness
- Built from commit: `155b9bb0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Rewards and Minigames
- Community Support Utilities
- Audit Logging System
- pointsManager.js
- contextMenus.js
- harness.js
- tictactoe.js
- blackjack.js
- package.json
- connect4.js
- Discord Multi-Bot README (DE)
- commands/bot.js
- events/bot.js
- eightball.js
- minigames/bot.js
- Auto Release Workflow
- dice.js
- CI Workflow

## God Nodes (most connected - your core abstractions)
1. `addPoints()` - 21 edges
2. `getPts()` - 20 edges
3. `notifyRewards()` - 20 edges
4. `embed()` - 20 edges
5. `pointsFooter()` - 19 edges
6. `log()` - 19 edges
7. `makeEmbed()` - 14 edges
8. `hasAnyRole()` - 14 edges
9. `getAuditUser()` - 12 edges
10. `execute()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Discord Multi-Bot` --references--> `MSK Scripts Logo`  [INFERRED]
  README.md → assets/msk_logo.png
- `execute()` --calls--> `makeEmbed()`  [EXTRACTED]
  bots/minigames/commands/flipcoin.js → core/utils.js
- `execute()` --calls--> `addPoints()`  [EXTRACTED]
  bots/minigames/commands/blackjack.js → core/pointsManager.js
- `execute()` --calls--> `addPoints()`  [EXTRACTED]
  bots/minigames/commands/connect4.js → core/pointsManager.js
- `execute()` --calls--> `addPoints()`  [EXTRACTED]
  bots/minigames/commands/tictactoe.js → core/pointsManager.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Tag-Driven Release Automation Pipeline** — _github_workflows_release_auto_release_workflow, _github_workflows_release_tag_resolution, _github_workflows_release_release_body_generation, _github_workflows_release_concurrency_guard [EXTRACTED 1.00]
- **Project Governance and Compliance Documents** — code_of_conduct_contributor_covenant, license_agpl_v3, security_vulnerability_reporting_policy, _github_dependabot_dependabot_config [INFERRED 0.85]

## Communities (19 total, 2 thin omitted)

### Community 0 - "Rewards and Minigames"
Cohesion: 0.08
Nodes (43): { addPoints, getPts, notifyRewards, pointsFooter }, execute(), { makeEmbed }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder }, { addPoints, getPts, notifyRewards, pointsFooter }, buildEmbed(), execute(), { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } (+35 more)

### Community 1 - "Community Support Utilities"
Cohesion: 0.07
Nodes (34): execute(), { guild: gcfg }, { makeEmbed, hasAnyRole }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags }, execute(), GUIDES, { makeEmbed }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } (+26 more)

### Community 2 - "Audit Logging System"
Cohesion: 0.21
Nodes (26): CHANNEL_TYPE_NAMES, channelTypeName(), embed(), { EmbedBuilder, AuditLogEvent, ChannelType }, getAuditUser(), getLogChannel(), { guild: gcfg }, log() (+18 more)

### Community 3 - "pointsManager.js"
Cohesion: 0.11
Nodes (23): { DATA_DIR, guild: gcfg }, execute(), FLACHWITZE_FILE, { join }, { makeEmbed, hasAnyRole, readJson, writeJson }, newRound(), round, { SlashCommandBuilder, MessageFlags } (+15 more)

### Community 4 - "contextMenus.js"
Cohesion: 0.16
Nodes (20): { EMBED_COLOR, THUMBNAIL_URL, database, guild: gcfg, DATA_DIR }, { execFile }, execute(), { hasAnyRole, nowStr }, { join }, { mkdirSync, writeFileSync, unlinkSync }, showModal(), {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags,
} (+12 more)

### Community 5 - "harness.js"
Cohesion: 0.10
Nodes (12): assert, client, commands, { EventEmitter }, { execSync }, failures, fs, { guild: gcfg } (+4 more)

### Community 6 - "tictactoe.js"
Cohesion: 0.25
Nodes (16): { addPoints, getPts, notifyRewards, pointsFooter }, aiEasy(), aiHard(), aiMedium(), available(), buildBoard(), buildEmbed(), CELL_EMOJIS (+8 more)

### Community 7 - "blackjack.js"
Cohesion: 0.23
Nodes (15): { addPoints, getPts, notifyRewards, pointsFooter }, buildButtons(), buildEmbed(), execute(), handStr(), handValue(), isBlackjack(), makeDeck() (+7 more)

### Community 8 - "package.json"
Cohesion: 0.13
Nodes (14): discord.js, dotenv, dependencies, discord.js, dotenv, description, engines, node (+6 more)

### Community 9 - "connect4.js"
Cohesion: 0.27
Nodes (13): { addPoints, getPts, notifyRewards, pointsFooter }, botMove(), buildComponents(), buildEmbed(), checkWin(), COL_NUMS, drop(), execute() (+5 more)

### Community 10 - "Discord Multi-Bot README (DE)"
Cohesion: 0.18
Nodes (11): Dependabot npm Update Config, Grouped Weekly Dependency Updates, MSK Scripts Logo, Contributor Covenant Code of Conduct v2.0, Community Impact Enforcement Ladder, GNU Affero General Public License v3, Network-Use Copyleft (AGPL Section 13), Discord Multi-Bot README (DE) (+3 more)

### Community 11 - "commands/bot.js"
Cohesion: 0.24
Nodes (9): attach(), {
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}, { guild: gcfg }, handlePersistentButton(), intents, { join }, partials, { readdirSync } (+1 more)

### Community 12 - "events/bot.js"
Cohesion: 0.36
Nodes (7): attach(), {
  GatewayIntentBits, Partials, Events, ActivityType,
}, { guild: gcfg }, intents, partials, scheduleMemberCountUpdate(), updateMemberCount()

### Community 13 - "eightball.js"
Cohesion: 0.25
Nodes (6): ALL, COLORS, NEGATIVE, NEUTRAL, POSITIVE, { SlashCommandBuilder, EmbedBuilder }

### Community 14 - "minigames/bot.js"
Cohesion: 0.29
Nodes (5): {
  Collection, GatewayIntentBits, Events, ActivityType, MessageFlags,
}, intents, { join }, partials, { readdirSync }

### Community 15 - "Auto Release Workflow"
Cohesion: 0.67
Nodes (4): Auto Release Workflow, Release Concurrency Guard, Release Body Generation from Git History, Tag Resolution and Optional Tag Creation

## Knowledge Gaps
- **132 isolated node(s):** `{ addPoints, getPts, notifyRewards, pointsFooter }`, `{ makeEmbed }`, `{ SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder }`, `{ addPoints, getPts, notifyRewards, pointsFooter }`, `{ SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags }` (+127 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `guild` connect `Community Support Utilities` to `Audit Logging System`, `pointsManager.js`, `contextMenus.js`, `commands/bot.js`, `events/bot.js`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `pointsFooter()` connect `Rewards and Minigames` to `connect4.js`, `pointsManager.js`, `tictactoe.js`, `blackjack.js`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `addPoints()` connect `Rewards and Minigames` to `connect4.js`, `pointsManager.js`, `tictactoe.js`, `blackjack.js`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `{ addPoints, getPts, notifyRewards, pointsFooter }`, `{ makeEmbed }`, `{ SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder }` to the rest of the system?**
  _132 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Rewards and Minigames` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community Support Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.0664451827242525 - nodes in this community are weakly interconnected._
- **Should `pointsManager.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11384615384615385 - nodes in this community are weakly interconnected._