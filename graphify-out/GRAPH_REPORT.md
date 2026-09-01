# Graph Report - discord_multibot  (2026-09-01)

## Corpus Check
- 96 files · ~86,310 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 998 nodes · 1821 edges · 81 communities (65 shown, 16 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 186 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8429a739`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- notifyRewards
- connect4.js
- logging.js
- pointsManager.js
- index.js
- harness.js
- i18n.js
- blackjack.js
- package.json
- commands/bot.js
- Discord Multi-Bot README (DE)
- core/config.js
- community.js
- trivia.js
- minigames/bot.js
- Auto Release Workflow
- commandKit.js
- CI Workflow
- mysql.js
- migrate-config.js
- server.js
- test/dashboard.js
- routes.js
- t
- BotSupervisor
- security.js
- inputs.jsx
- dashboard/settings.js
- dashboard/discord.js
- ui.jsx
- minigames.js
- dashboard/config.js
- gameKit.js
- dependencies
- App.jsx
- wordle.js
- admin.js
- Settings.jsx
- slots.js
- devDependencies
- support.js
- utility.js
- core/utils.js
- web/package.json
- BotControl.jsx
- Config.jsx
- envFile.js
- api.js
- alert.jsx
- badge.jsx
- button.jsx
- @fontsource/dm-sans
- @fontsource/syne
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-label
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-switch
- @radix-ui/react-tabs
- react
- react-dom

## God Nodes (most connected - your core abstractions)
1. `t()` - 80 edges
2. `gameColor()` - 24 edges
3. `embed()` - 23 edges
4. `applyMeta()` - 21 edges
5. `gameFooter()` - 21 edges
6. `notifyRewards()` - 21 edges
7. `addPoints()` - 20 edges
8. `f()` - 19 edges
9. `getPts()` - 19 edges
10. `log()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Discord Multi-Bot` --references--> `MSK Scripts Logo`  [INFERRED]
  README.md → assets/msk_logo.png
- `handleInteraction()` --calls--> `t()`  [EXTRACTED]
  bots/events/handlers/contextMenus.js → core/i18n.js
- `attach()` --calls--> `t()`  [EXTRACTED]
  bots/commands/bot.js → core/i18n.js
- `handleVerification()` --calls--> `t()`  [EXTRACTED]
  bots/commands/bot.js → core/i18n.js
- `toggleRole()` --calls--> `t()`  [EXTRACTED]
  bots/commands/bot.js → core/i18n.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Tag-Driven Release Automation Pipeline** — _github_workflows_release_auto_release_workflow, _github_workflows_release_tag_resolution, _github_workflows_release_release_body_generation, _github_workflows_release_concurrency_guard [EXTRACTED 1.00]
- **Project Governance and Compliance Documents** — code_of_conduct_contributor_covenant, license_agpl_v3, security_vulnerability_reporting_policy, _github_dependabot_dependabot_config [INFERRED 0.85]

## Communities (81 total, 16 thin omitted)

### Community 0 - "notifyRewards"
Cohesion: 0.15
Nodes (20): { addPoints, getPts, notifyRewards }, { applyMeta }, execute(), { gameFooter }, { makeEmbed }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder }, { t }, execute() (+12 more)

### Community 1 - "connect4.js"
Cohesion: 0.21
Nodes (16): { addPoints, getPts, notifyRewards }, { applyMeta }, botMove(), buildComponents(), buildEmbed(), checkWin(), COL_NUMS, drop() (+8 more)

### Community 2 - "logging.js"
Cohesion: 0.21
Nodes (35): actorText(), CHANNEL_TYPE_KEYS, channelTypeName(), color(), config, { dateStr }, embed(), { EmbedBuilder, AuditLogEvent, ChannelType } (+27 more)

### Community 3 - "pointsManager.js"
Cohesion: 0.12
Nodes (18): execute(), { applyMeta }, config, execute(), { gameColor }, { getPoints, rewards }, { SlashCommandBuilder, EmbedBuilder }, { t } (+10 more)

### Community 4 - "index.js"
Cohesion: 0.09
Nodes (26): DATA_DIR, addBalance(), connect(), deleteAccessRow(), DRIVERS, getAccessRows(), getBalance(), getMeta() (+18 more)

### Community 5 - "harness.js"
Cohesion: 0.07
Nodes (17): assert, client, commands, config, { EventEmitter }, { execSync }, failures, FIXTURE (+9 more)

### Community 6 - "i18n.js"
Cohesion: 0.05
Nodes (63): answerMessage(), cloneEmbed(), commentFeedback(), config, {
  ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
}, editEmbed(), editMessage(), { guardMenu } (+55 more)

### Community 7 - "blackjack.js"
Cohesion: 0.18
Nodes (18): { addPoints, getPts, notifyRewards }, { applyMeta }, buildButtons(), buildEmbed(), execute(), { gameFooter, gameColor }, handStr(), handValue() (+10 more)

### Community 8 - "package.json"
Cohesion: 0.07
Nodes (28): better-sqlite3, dotenv, express, helmet, mysql2, dependencies, better-sqlite3, discord.js (+20 more)

### Community 9 - "commands/bot.js"
Cohesion: 0.16
Nodes (16): attach(), buttonIdFromCustomId(), {
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}, config, { enabled }, findRoleButton(), handlePersistentButton(), handleVerification() (+8 more)

### Community 10 - "Discord Multi-Bot README (DE)"
Cohesion: 0.18
Nodes (11): Dependabot npm Update Config, Grouped Weekly Dependency Updates, MSK Scripts Logo, Contributor Covenant Code of Conduct v2.0, Community Impact Enforcement Ladder, GNU Affero General Public License v3, Network-Use Copyleft (AGPL Section 13), Discord Multi-Bot README (DE) (+3 more)

### Community 11 - "core/config.js"
Cohesion: 0.10
Nodes (33): ASSETS_DIR, BASE_DIR, brandLinks(), brandName(), channelId(), command(), commandKeys(), CONFIG_DIR (+25 more)

### Community 12 - "community.js"
Cohesion: 0.24
Nodes (15): { applyMeta, guard }, config, execute(), informationEmbed(), { makeEmbed, linkRow, buttonStyle }, postPanel(), roleMenuButtons(), roleMenuComponents() (+7 more)

### Community 13 - "trivia.js"
Cohesion: 0.18
Nodes (13): { addPoints, getPts, notifyRewards }, { applyMeta }, b64(), buildEmbed(), config, cooldowns, fetchQuestion(), { gameFooter, gameColor } (+5 more)

### Community 14 - "minigames/bot.js"
Cohesion: 0.09
Nodes (25): attach(), config, { GatewayIntentBits, Partials, Events }, intents, memberCountInterval(), partials, { presenceOptions }, scheduleMemberCountUpdate() (+17 more)

### Community 15 - "Auto Release Workflow"
Cohesion: 0.67
Nodes (4): Auto Release Workflow, Release Concurrency Guard, Release Body Generation from Git History, Tag Resolution and Optional Tag Creation

### Community 16 - "commandKit.js"
Cohesion: 0.12
Nodes (17): { applyMeta, optionText }, { gameColor }, SIDES, { SlashCommandBuilder, EmbedBuilder }, { t }, { applyMeta, optionText }, CATEGORIES, { gameColor } (+9 more)

### Community 18 - "mysql.js"
Cohesion: 0.24
Nodes (4): { SCHEMA }, { SCHEMA }, { SCHEMA }, SCHEMA

### Community 19 - "migrate-config.js"
Cohesion: 0.21
Nodes (11): BASE_DIR, buildConfig(), CONFIG_PATH, dryRun, env(), { existsSync, readFileSync, writeFileSync, copyFileSync }, force, { join } (+3 more)

### Community 21 - "server.js"
Cohesion: 0.09
Nodes (31): buildAuthorizeUrl(), exchangeCode(), fetchOAuthUser(), { redirectUri }, redirectUri(), canUseDashboard(), hasPermission(), resolvePermissions() (+23 more)

### Community 22 - "test/dashboard.js"
Cohesion: 0.06
Nodes (20): assert, CONFIG_PATH, crypto, db, discord, failures, fs, { loadDashboardConfig } (+12 more)

### Community 23 - "routes.js"
Cohesion: 0.12
Nodes (23): ENV_PATH, checkSelfEdit(), isPermission(), isSubjectType(), parsePermissions(), PERMISSION_LABELS, PERMISSIONS, SUBJECT_TYPES (+15 more)

### Community 24 - "t"
Cohesion: 0.20
Nodes (20): { addPoints, getPts, notifyRewards }, aiEasy(), aiHard(), aiMedium(), { applyMeta }, available(), buildBoard(), buildEmbed() (+12 more)

### Community 25 - "BotSupervisor"
Cohesion: 0.17
Nodes (8): BOT_ENTRY, BotSupervisor, config, ENV_PATH, EventEmitter, { fork, spawn }, fs, path

### Community 26 - "security.js"
Cohesion: 0.15
Nodes (14): b64url(), buckets, createOAuthState(), createSession(), createToken(), crypto, getSecret(), safeEqual() (+6 more)

### Community 27 - "inputs.jsx"
Cohesion: 0.10
Nodes (3): ACTIVITY_TYPES, BUTTON_STYLES, STATUSES

### Community 28 - "dashboard/settings.js"
Cohesion: 0.20
Nodes (17): clearFavicon(), config, DATA_DIR, detectFaviconType(), ensureDataDir(), FAVICON_BASE, FAVICON_TYPES, fs (+9 more)

### Community 29 - "dashboard/discord.js"
Cohesion: 0.23
Nodes (15): avatarUrl(), botToken(), cacheUser(), config, DiscordApiError, getGuild(), getGuildChannels(), getGuildLookups() (+7 more)

### Community 30 - "ui.jsx"
Cohesion: 0.21
Nodes (11): api, Banner(), BANNER_VARIANT, Empty(), fmtDate(), SectionTitle(), STATE_LABEL, STATE_VARIANT (+3 more)

### Community 31 - "minigames.js"
Cohesion: 0.16
Nodes (15): { applyMeta, optionText, guard }, config, execute(), { join }, JOKES_FILE, { makeEmbed, readJson, writeJson }, newRound(), settings() (+7 more)

### Community 32 - "dashboard/config.js"
Cohesion: 0.20
Nodes (14): config, crypto, ensureSessionSecret(), fs, isLoopback(), loadDashboardConfig(), path, { setEnvValue } (+6 more)

### Community 33 - "gameKit.js"
Cohesion: 0.16
Nodes (13): { addPoints, getPts, notifyRewards }, { applyMeta }, buildEmbed(), { gameFooter, gameColor }, {
  SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
}, STAGES, { t, tList }, config (+5 more)

### Community 34 - "dependencies"
Cohesion: 0.13
Nodes (15): class-variance-authority, clsx, @fontsource/space-mono, lucide-react, @radix-ui/react-slot, @radix-ui/react-tooltip, tailwind-merge, dependencies (+7 more)

### Community 35 - "App.jsx"
Cohesion: 0.23
Nodes (11): allowed(), App(), NAV, NavContent(), DETAIL_VIEWS, parseRoute(), SEGMENT_TO_VIEW, useRouter() (+3 more)

### Community 36 - "wordle.js"
Cohesion: 0.21
Nodes (12): execute(), pickWord(), { addPoints, getPts, notifyRewards }, { applyMeta }, buildEmbed(), evaluate(), execute(), { gameFooter, gameColor } (+4 more)

### Community 37 - "admin.js"
Cohesion: 0.20
Nodes (11): { applyMeta, guard }, config, { execFile }, execute(), { join }, { mkdirSync, writeFileSync, unlinkSync }, { nowStr }, showModal() (+3 more)

### Community 38 - "Settings.jsx"
Cohesion: 0.35
Nodes (8): ACCENT_VARS, applyAccent(), applyDashboardSettings(), applyFavicon(), hexToRgb(), loadAndApplyDashboardSettings(), readableForeground(), Settings()

### Community 39 - "slots.js"
Cohesion: 0.24
Nodes (10): { addPoints, getPts, notifyRewards }, { applyMeta }, buildEmbed(), evaluate(), execute(), { gameFooter, gameColor }, { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder }, spin() (+2 more)

### Community 40 - "devDependencies"
Cohesion: 0.18
Nodes (11): tailwindcss, @tailwindcss/vite, tw-animate-css, vite, @vitejs/plugin-react, devDependencies, tailwindcss, @tailwindcss/vite (+3 more)

### Community 43 - "support.js"
Cohesion: 0.27
Nodes (9): { applyMeta, optionText, guard }, buildData(), config, execute(), guides(), { makeEmbed, linkRow }, { SlashCommandBuilder, MessageFlags }, { t } (+1 more)

### Community 44 - "utility.js"
Cohesion: 0.24
Nodes (9): { applyMeta, optionText, guard }, config, execute(), { getPoints }, { makeEmbed, dateTimeStr }, { SlashCommandBuilder, MessageFlags }, { t }, guard() (+1 more)

### Community 45 - "core/utils.js"
Cohesion: 0.22
Nodes (9): ACTIVITY_TYPES, allowedByRoles(), BUTTON_STYLES, config, { dirname }, { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ActivityType }, hasAnyRole(), PRESENCE_STATUSES (+1 more)

### Community 46 - "web/package.json"
Cohesion: 0.20
Nodes (9): description, name, private, scripts, build, dev, preview, type (+1 more)

### Community 47 - "BotControl.jsx"
Cohesion: 0.27
Nodes (7): COLORS, parseAnsi(), fmtDuration(), BotControl(), DOT, LABEL, LogLine()

### Community 49 - "Config.jsx"
Cohesion: 0.22
Nodes (7): Field(), FeatureState(), Config(), FeatureDetail(), getPath(), ICONS, STATE_ORDER

### Community 52 - "envFile.js"
Cohesion: 0.52
Nodes (6): detectEol(), parseEnvFile(), quote(), setEnvValue(), splitLines(), unquote()

### Community 54 - "api.js"
Cohesion: 0.53
Nodes (4): ApiError, logout(), readCookie(), request()

## Knowledge Gaps
- **377 isolated node(s):** `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }`, `{ enabled }`, `{ t }` (+372 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `notifyRewards`, `connect4.js`, `logging.js`, `pointsManager.js`, `wordle.js`, `admin.js`, `i18n.js`, `blackjack.js`, `gameKit.js`, `commands/bot.js`, `slots.js`, `support.js`, `community.js`, `utility.js`, `minigames/bot.js`, `trivia.js`, `commandKit.js`, `minigames.js`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `BotSupervisor` connect `BotSupervisor` to `dashboard/config.js`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `getPath()` connect `i18n.js` to `t`, `core/config.js`, `wordle.js`, `trivia.js`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `embed()` (e.g. with `execute()` and `execute()`) actually correct?**
  _`embed()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{
  Collection, GatewayIntentBits, Events,
  ButtonStyle, ButtonBuilder, ActionRowBuilder, MessageFlags,
}`, `{ readdirSync }`, `{ join }` to the rest of the system?**
  _377 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `notifyRewards` be split into smaller, more focused modules?**
  _Cohesion score 0.1471861471861472 - nodes in this community are weakly interconnected._
- **Should `pointsManager.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12105263157894737 - nodes in this community are weakly interconnected._