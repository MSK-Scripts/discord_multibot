# Graph Report - discord_multibot  (2026-09-01)

## Corpus Check
- 41 files · ~39,878 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 346 nodes · 623 edges · 19 communities (17 shown, 2 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 54 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e1ecd652`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Rewards and Minigames
- utils.js
- Audit Logging System
- pointsManager.js
- index.js
- harness.js
- tictactoe.js
- blackjack.js
- package.json
- connect4.js
- Discord Multi-Bot README (DE)
- config.js
- contextMenus.js
- eightball.js
- minigames/bot.js
- Auto Release Workflow
- dice.js
- CI Workflow
- mysql.js

## God Nodes (most connected - your core abstractions)
1. `embed()` - 20 edges
2. `getPts()` - 20 edges
3. `addPoints()` - 20 edges
4. `notifyRewards()` - 20 edges
5. `log()` - 19 edges
6. `pointsFooter()` - 19 edges
7. `makeEmbed()` - 14 edges
8. `hasAnyRole()` - 14 edges
9. `getAuditUser()` - 12 edges
10. `execute()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Discord Multi-Bot` --references--> `MSK Scripts Logo`  [INFERRED]
  README.md → assets/msk_logo.png
- `execute()` --calls--> `hasAnyRole()`  [EXTRACTED]
  bots/commands/commands/community.js → core/utils.js
- `execute()` --calls--> `hasAnyRole()`  [EXTRACTED]
  bots/commands/commands/minigames.js → core/utils.js
- `execute()` --calls--> `makeEmbed()`  [EXTRACTED]
  bots/commands/commands/support.js → core/utils.js
- `execute()` --calls--> `hasAnyRole()`  [EXTRACTED]
  bots/commands/commands/utility.js → core/utils.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Tag-Driven Release Automation Pipeline** — _github_workflows_release_auto_release_workflow, _github_workflows_release_tag_resolution, _github_workflows_release_release_body_generation, _github_workflows_release_concurrency_guard [EXTRACTED 1.00]
- **Project Governance and Compliance Documents** — code_of_conduct_contributor_covenant, license_agpl_v3, security_vulnerability_reporting_policy, _github_dependabot_dependabot_config [INFERRED 0.85]

## Communities (19 total, 2 thin omitted)

### Community 0 - "Rewards and Minigames"
Cohesion: 0.08
Nodes (43): { addPoints, getPts, notifyRewards, pointsFooter }, execute(), { makeEmbed }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder }, { addPoints, getPts, notifyRewards, pointsFooter }, buildEmbed(), execute(), { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } (+35 more)

### Community 1 - "utils.js"
Cohesion: 0.09
Nodes (26): execute(), { guild: gcfg }, { makeEmbed, hasAnyRole }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags }, { DATA_DIR, guild: gcfg }, execute(), FLACHWITZE_FILE, { join } (+18 more)

### Community 2 - "Audit Logging System"
Cohesion: 0.21
Nodes (26): CHANNEL_TYPE_NAMES, channelTypeName(), embed(), { EmbedBuilder, AuditLogEvent, ChannelType }, getAuditUser(), getLogChannel(), { guild: gcfg }, log() (+18 more)

### Community 3 - "pointsManager.js"
Cohesion: 0.12
Nodes (21): execute(), { getPoints }, { guild: gcfg }, { makeEmbed, hasAnyRole }, { SlashCommandBuilder, MessageFlags }, execute(), { getConfig, getPoints }, { SlashCommandBuilder, EmbedBuilder } (+13 more)

### Community 4 - "index.js"
Cohesion: 0.17
Nodes (13): DATA_DIR, addBalance(), connect(), DRIVERS, getBalance(), getMeta(), { parse }, setMeta() (+5 more)

### Community 5 - "harness.js"
Cohesion: 0.09
Nodes (13): assert, client, commands, { EventEmitter }, { execSync }, failures, FAKE_IDS, fs (+5 more)

### Community 6 - "tictactoe.js"
Cohesion: 0.25
Nodes (16): { addPoints, getPts, notifyRewards, pointsFooter }, aiEasy(), aiHard(), aiMedium(), available(), buildBoard(), buildEmbed(), CELL_EMOJIS (+8 more)

### Community 7 - "blackjack.js"
Cohesion: 0.23
Nodes (15): { addPoints, getPts, notifyRewards, pointsFooter }, buildButtons(), buildEmbed(), execute(), handStr(), handValue(), isBlackjack(), makeDeck() (+7 more)

### Community 8 - "package.json"
Cohesion: 0.09
Nodes (21): better-sqlite3, discord.js, dotenv, mysql2, dependencies, better-sqlite3, discord.js, dotenv (+13 more)

### Community 9 - "connect4.js"
Cohesion: 0.27
Nodes (13): { addPoints, getPts, notifyRewards, pointsFooter }, botMove(), buildComponents(), buildEmbed(), checkWin(), COL_NUMS, drop(), execute() (+5 more)

### Community 10 - "Discord Multi-Bot README (DE)"
Cohesion: 0.18
Nodes (11): Dependabot npm Update Config, Grouped Weekly Dependency Updates, MSK Scripts Logo, Contributor Covenant Code of Conduct v2.0, Community Impact Enforcement Ladder, GNU Affero General Public License v3, Network-Use Copyleft (AGPL Section 13), Discord Multi-Bot README (DE) (+3 more)

### Community 11 - "config.js"
Cohesion: 0.07
Nodes (31): attach(), {
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}, { guild: gcfg }, handlePersistentButton(), intents, { join }, partials, { readdirSync } (+23 more)

### Community 12 - "contextMenus.js"
Cohesion: 0.15
Nodes (21): { EMBED_COLOR, THUMBNAIL_URL, database, guild: gcfg, DATA_DIR }, { execFile }, execute(), { hasAnyRole, nowStr }, { join }, { mkdirSync, writeFileSync, unlinkSync }, showModal(), {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags,
} (+13 more)

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

### Community 18 - "mysql.js"
Cohesion: 0.24
Nodes (4): { SCHEMA }, { SCHEMA }, { SCHEMA }, SCHEMA

## Knowledge Gaps
- **148 isolated node(s):** `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }`, `{ guild: gcfg }`, `intents` (+143 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `guild` connect `config.js` to `utils.js`, `Audit Logging System`, `pointsManager.js`, `contextMenus.js`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `pointsFooter()` connect `Rewards and Minigames` to `connect4.js`, `pointsManager.js`, `tictactoe.js`, `blackjack.js`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `getPts()` connect `Rewards and Minigames` to `connect4.js`, `pointsManager.js`, `tictactoe.js`, `blackjack.js`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }` to the rest of the system?**
  _148 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Rewards and Minigames` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `utils.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09247311827956989 - nodes in this community are weakly interconnected._
- **Should `pointsManager.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11594202898550725 - nodes in this community are weakly interconnected._