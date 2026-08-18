# Graph Report - discord_multibot  (2026-08-18)

## Corpus Check
- 34 files · ~24,242 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 293 nodes · 569 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `84f44f3c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- utils.js
- addPoints
- Discord Multi-Bot README (EN)
- logging.js
- blackjack.js
- pointsManager.js
- tictactoe.js
- connect4.js
- package.json
- config.js
- eightball.js
- contextMenus.js
- minigames/bot.js
- dice.js

## God Nodes (most connected - your core abstractions)
1. `addPoints()` - 21 edges
2. `embed()` - 20 edges
3. `getPts()` - 20 edges
4. `notifyRewards()` - 20 edges
5. `log()` - 19 edges
6. `pointsFooter()` - 19 edges
7. `makeEmbed()` - 14 edges
8. `hasAnyRole()` - 14 edges
9. `getAuditUser()` - 12 edges
10. `execute()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Auto-Restart Supervision (10s)` --semantically_similar_to--> `Release Concurrency Guard`  [INFERRED] [semantically similar]
  README.md → .github/workflows/release.yml
- `Network-Use Copyleft (AGPL Section 13)` --conceptually_related_to--> `systemd Deployment (multibot-js.service)`  [AMBIGUOUS]
  LICENSE.md → README.md
- `execute()` --calls--> `hasAnyRole()`  [EXTRACTED]
  bots/commands/commands/community.js → core/utils.js
- `execute()` --calls--> `hasAnyRole()`  [EXTRACTED]
  bots/commands/commands/minigames.js → core/utils.js
- `execute()` --calls--> `readJson()`  [EXTRACTED]
  bots/commands/commands/minigames.js → core/utils.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Role Multi-Bot Architecture** — readme_commands_bot, readme_events_bot, readme_minigames_bot, readme_auto_restart_supervision, readme_env_configuration [EXTRACTED 1.00]
- **Tag-Driven Release Automation Pipeline** — _github_workflows_release_auto_release_workflow, _github_workflows_release_tag_resolution, _github_workflows_release_release_body_generation, _github_workflows_release_concurrency_guard [EXTRACTED 1.00]
- **Project Governance and Compliance Documents** — code_of_conduct_contributor_covenant, license_agpl_v3, security_vulnerability_reporting_policy, _github_dependabot_dependabot_config [INFERRED 0.85]

## Communities (14 total, 1 thin omitted)

### Community 0 - "utils.js"
Cohesion: 0.09
Nodes (26): execute(), { guild: gcfg }, { makeEmbed, hasAnyRole }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags }, { DATA_DIR, guild: gcfg }, execute(), FLACHWITZE_FILE, { join } (+18 more)

### Community 1 - "addPoints"
Cohesion: 0.08
Nodes (43): { addPoints, getPts, notifyRewards, pointsFooter }, execute(), { makeEmbed }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder }, { addPoints, getPts, notifyRewards, pointsFooter }, buildEmbed(), execute(), { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } (+35 more)

### Community 2 - "Discord Multi-Bot README (EN)"
Cohesion: 0.10
Nodes (28): Dependabot npm Update Config, Grouped Weekly Dependency Updates, Auto Release Workflow, Release Concurrency Guard, Release Body Generation from Git History, Tag Resolution and Optional Tag Creation, Contributor Covenant Code of Conduct v2.0, Community Impact Enforcement Ladder (+20 more)

### Community 3 - "logging.js"
Cohesion: 0.21
Nodes (26): CHANNEL_TYPE_NAMES, channelTypeName(), embed(), { EmbedBuilder, AuditLogEvent, ChannelType }, getAuditUser(), getLogChannel(), { guild: gcfg }, log() (+18 more)

### Community 4 - "blackjack.js"
Cohesion: 0.23
Nodes (15): { addPoints, getPts, notifyRewards, pointsFooter }, buildButtons(), buildEmbed(), execute(), handStr(), handValue(), isBlackjack(), makeDeck() (+7 more)

### Community 5 - "pointsManager.js"
Cohesion: 0.13
Nodes (19): execute(), { getPoints }, { guild: gcfg }, { makeEmbed, hasAnyRole }, { SlashCommandBuilder, MessageFlags }, execute(), { getConfig, getPoints }, { SlashCommandBuilder, EmbedBuilder } (+11 more)

### Community 6 - "tictactoe.js"
Cohesion: 0.25
Nodes (16): { addPoints, getPts, notifyRewards, pointsFooter }, aiEasy(), aiHard(), aiMedium(), available(), buildBoard(), buildEmbed(), CELL_EMOJIS (+8 more)

### Community 7 - "connect4.js"
Cohesion: 0.29
Nodes (13): { addPoints, getPts, notifyRewards, pointsFooter }, botMove(), buildComponents(), buildEmbed(), checkWin(), COL_NUMS, drop(), execute() (+5 more)

### Community 8 - "package.json"
Cohesion: 0.14
Nodes (13): discord.js, dotenv, dependencies, discord.js, dotenv, description, engines, node (+5 more)

### Community 9 - "config.js"
Cohesion: 0.08
Nodes (27): attach(), {
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}, { guild: gcfg }, handlePersistentButton(), intents, { join }, partials, { readdirSync } (+19 more)

### Community 10 - "eightball.js"
Cohesion: 0.32
Nodes (7): ALL, COLORS, execute(), NEGATIVE, NEUTRAL, POSITIVE, { SlashCommandBuilder, EmbedBuilder }

### Community 11 - "contextMenus.js"
Cohesion: 0.15
Nodes (21): { EMBED_COLOR, THUMBNAIL_URL, database, guild: gcfg, DATA_DIR }, { execFile }, execute(), { hasAnyRole, nowStr }, { join }, { mkdirSync, writeFileSync, unlinkSync }, showModal(), {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags,
} (+13 more)

### Community 13 - "minigames/bot.js"
Cohesion: 0.29
Nodes (5): {
  Collection, GatewayIntentBits, Events, ActivityType, MessageFlags,
}, intents, { join }, partials, { readdirSync }

## Ambiguous Edges - Review These
- `Network-Use Copyleft (AGPL Section 13)` → `systemd Deployment (multibot-js.service)`  [AMBIGUOUS]
  LICENSE.md · relation: conceptually_related_to

## Knowledge Gaps
- **111 isolated node(s):** `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }`, `{ guild: gcfg }`, `intents` (+106 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Network-Use Copyleft (AGPL Section 13)` and `systemd Deployment (multibot-js.service)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `guild` connect `config.js` to `utils.js`, `logging.js`, `contextMenus.js`, `pointsManager.js`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `pointsFooter()` connect `addPoints` to `blackjack.js`, `pointsManager.js`, `tictactoe.js`, `connect4.js`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `addPoints()` connect `addPoints` to `utils.js`, `blackjack.js`, `pointsManager.js`, `tictactoe.js`, `connect4.js`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }` to the rest of the system?**
  _111 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `utils.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08817204301075268 - nodes in this community are weakly interconnected._
- **Should `addPoints` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._