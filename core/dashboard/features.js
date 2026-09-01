/**
 * What the dashboard shows, one entry per feature.
 *
 * WHY THIS IS A LIST OF FEATURES AND NOT A LIST OF FIELDS. The previous panel
 * rendered one generated form of 146 fields in 30 sections, nearly all of them
 * empty, and it was unusable — not because any single field was wrong but
 * because nothing told you which twelve of them mattered to you. Here each
 * entry is a thing the bot DOES, it reports whether it is on, off or half
 * configured, and its fields only appear once you open it.
 *
 * `status()` is the important part. "Incomplete" is a real state: a feature
 * switched on whose channel is empty does nothing at all, silently, and that is
 * exactly the failure this whole config layer exists to make visible.
 */

const { getPath } = require('../jsonc');

const SNOWFLAKE = /^\d{17,20}$/;

/** Is a value present in a way that would actually work? */
const filled = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

/** A role or channel reference resolves when it is a snowflake or a named entry. */
const resolves = (effective, group, ref) => {
  const value = String(ref ?? '').trim();
  if (!value) return false;
  if (SNOWFLAKE.test(value)) return true;
  return SNOWFLAKE.test(String(getPath(effective, `${group}.${value}`, '') ?? '').trim());
};

const channelResolves = (effective, ref, fallbackKey) =>
  resolves(effective, 'channels', ref)
  || (fallbackKey ? SNOWFLAKE.test(String(getPath(effective, `channels.${fallbackKey}`, '') ?? '').trim()) : false);

const F = (path, kind, label, extra = {}) => ({ path, kind, label, ...extra });

/**
 * The features, in the order the tiles are shown.
 *
 * `requires(effective)` returns the list of settings that are missing while the
 * feature is on. An empty list means it is ready.
 */
const FEATURES = [
  {
    id: 'branding',
    label: 'Branding',
    description: 'Name, colour, logo and the link buttons under every panel.',
    icon: 'palette',
    toggle: null,
    fields: [
      F('branding.name', 'text', 'Bot name', { help: 'Empty uses the Discord server\'s own name.' }),
      F('branding.color', 'color', 'Embed colour'),
      F('branding.thumbnailUrl', 'url', 'Logo URL', { help: 'Empty means no thumbnail and no footer icon.' }),
      F('branding.links', 'linkList', 'Link buttons', { help: 'Up to five. An entry without a URL is left out.' }),
      F('dateLocale', 'text', 'Date format', { help: 'e.g. de-DE or en-GB.' }),
      F('language', 'language', 'Language'),
    ],
    requires: () => [],
  },
  {
    id: 'presence',
    label: 'Bot status',
    description: 'What each of the three bots shows under its name.',
    icon: 'activity',
    toggle: null,
    fields: [
      F('presence.commands', 'presence', 'Commands bot'),
      F('presence.events', 'presence', 'Events bot'),
      F('presence.minigames', 'presence', 'Minigames bot'),
    ],
    requires: () => [],
  },
  {
    id: 'roles',
    label: 'Roles and channels',
    description: 'The roles and channels every other feature refers to by name.',
    icon: 'users',
    toggle: null,
    fields: [
      F('roles', 'roleMap', 'Named roles'),
      F('channels.log', 'channel', 'Log channel'),
      F('channels.memberCount', 'channel', 'Member count channel'),
      F('channels.feedback', 'channel', 'Feedback channel'),
    ],
    requires: (e) => (SNOWFLAKE.test(String(getPath(e, 'guildId', '') ?? '')) ? [] : ['guildId']),
  },
  {
    id: 'logging',
    label: 'Server logging',
    description: 'Joins, bans, edits, deletions, roles, voice and invites.',
    icon: 'scroll',
    toggle: 'features.logging.enabled',
    fields: [
      F('features.logging.channelId', 'channel', 'Log channel', { help: 'Empty uses the general log channel.' }),
      F('features.logging.events', 'eventGrid', 'Which events'),
      F('features.logging.ignoreChannels', 'channelList', 'Ignore these channels'),
      F('features.logging.ignoreUsers', 'idList', 'Ignore these users'),
      F('features.logging.colors', 'colorMap', 'Colours'),
    ],
    requires: (e) => (channelResolves(e, getPath(e, 'features.logging.channelId', ''), 'log')
      ? [] : ['features.logging.channelId']),
  },
  {
    id: 'memberCount',
    label: 'Member counter',
    description: 'Renames a channel to show how many members the server has.',
    icon: 'hash',
    toggle: 'features.memberCount.enabled',
    fields: [
      F('features.memberCount.channelId', 'channel', 'Channel'),
      F('features.memberCount.template', 'text', 'Name template', { help: '{count} and {guild} are filled in.' }),
      F('features.memberCount.intervalMinutes', 'number', 'Update every (minutes)', {
        help: 'Discord allows two renames per ten minutes, so five is the floor.',
        min: 5,
      }),
    ],
    requires: (e) => (channelResolves(e, getPath(e, 'features.memberCount.channelId', ''), 'memberCount')
      ? [] : ['features.memberCount.channelId']),
  },
  {
    id: 'feedback',
    label: 'Feedback channel',
    description: 'Turns a plain message into an embed staff can comment on.',
    icon: 'message',
    toggle: 'features.feedback.enabled',
    fields: [
      F('features.feedback.channelId', 'channel', 'Channel'),
      F('features.feedback.deleteOriginal', 'toggle', 'Delete the original message'),
      F('features.feedback.dmOnComment', 'toggle', 'DM the author when it is commented'),
    ],
    requires: (e) => (channelResolves(e, getPath(e, 'features.feedback.channelId', ''), 'feedback')
      ? [] : ['features.feedback.channelId']),
  },
  {
    id: 'autoReply',
    label: 'Auto-reply',
    description: 'Points people at a contact when they ask for them by name.',
    icon: 'reply',
    toggle: 'features.autoReply.enabled',
    fields: [
      F('features.autoReply.trigger', 'text', 'Trigger word'),
      F('features.autoReply.contactId', 'user', 'Contact'),
      F('features.autoReply.exemptRoles', 'roleList', 'Roles that are skipped'),
      F('features.autoReply.caseSensitive', 'toggle', 'Case sensitive'),
    ],
    requires: (e) => {
      const missing = [];
      if (!filled(getPath(e, 'features.autoReply.trigger', ''))) missing.push('features.autoReply.trigger');
      if (!SNOWFLAKE.test(String(getPath(e, 'features.autoReply.contactId', '') ?? '').trim())) {
        missing.push('features.autoReply.contactId');
      }
      return missing;
    },
  },
  {
    id: 'information',
    label: 'Information panel',
    description: 'The welcome panel posted by /information.',
    icon: 'info',
    toggle: null,
    command: 'information',
    fields: [
      F('features.information.title', 'text', 'Title', { help: 'Empty uses "Welcome to the … Discord!".' }),
      F('features.information.intro', 'textarea', 'Intro'),
      F('features.information.sections', 'sectionList', 'Sections'),
      F('features.information.roleListHeading', 'text', 'Role list heading'),
      F('features.information.roleList', 'roleLineList', 'Role legend'),
      F('features.information.inviteHeading', 'text', 'Invite heading'),
      F('features.information.inviteUrl', 'url', 'Invite link'),
      F('features.information.showLinkButtons', 'toggle', 'Show the link buttons'),
    ],
    requires: (e) => (filled(getPath(e, 'features.information.intro', ''))
      || filled(getPath(e, 'features.information.sections', []))
      ? [] : ['features.information.intro']),
  },
  {
    id: 'rules',
    label: 'Rules panel',
    description: 'The rules and the button that hands out the member role.',
    icon: 'gavel',
    toggle: null,
    command: 'rules',
    fields: [
      F('features.rules.title', 'text', 'Title'),
      F('features.rules.intro', 'textarea', 'Intro'),
      F('features.rules.rules', 'stringList', 'Rules', { help: 'Numbered automatically, in this order.' }),
      F('features.rules.consentText', 'textarea', 'Consent sentence', { help: '{role} becomes the role mention.' }),
      F('features.rules.button.enabled', 'toggle', 'Show the button'),
      F('features.rules.button.label', 'text', 'Button label'),
      F('features.rules.button.emoji', 'text', 'Button emoji'),
      F('features.rules.button.style', 'buttonStyle', 'Button style'),
      F('features.rules.button.grantsRole', 'role', 'Role it grants'),
      F('features.rules.showLinkButtons', 'toggle', 'Show the link buttons'),
    ],
    requires: (e) => {
      if (getPath(e, 'features.rules.button.enabled', true) === false) return [];
      return resolves(e, 'roles', getPath(e, 'features.rules.button.grantsRole', ''))
        ? [] : ['features.rules.button.grantsRole'];
    },
  },
  {
    id: 'roleMenu',
    label: 'Self-assign roles',
    description: 'The button panel members use to pick their own roles.',
    icon: 'tags',
    toggle: null,
    command: 'roles',
    fields: [
      F('features.roleMenu.title', 'text', 'Title'),
      F('features.roleMenu.description', 'textarea', 'Description'),
      F('features.roleMenu.buttons', 'roleButtonList', 'Buttons'),
      F('features.roleMenu.confirmRemoval', 'toggle', 'Ask before removing a role'),
      F('features.roleMenu.showLinkButtons', 'toggle', 'Show the link buttons'),
    ],
    requires: (e) => {
      const buttons = getPath(e, 'features.roleMenu.buttons', []) ?? [];
      const usable = buttons.filter(b => resolves(e, 'roles', b?.role));
      return usable.length ? [] : ['features.roleMenu.buttons'];
    },
  },
  {
    id: 'supportGuides',
    label: 'Help guides',
    description: 'The canned answers /script_guides offers.',
    icon: 'book',
    toggle: 'features.supportGuides.enabled',
    command: 'script_guides',
    fields: [
      F('features.supportGuides.guides', 'guideList', 'Guides'),
      F('features.supportGuides.showLinkButtons', 'toggle', 'Show the link buttons'),
    ],
    requires: (e) => (filled(getPath(e, 'features.supportGuides.guides', [])) ? [] : ['features.supportGuides.guides']),
  },
  {
    id: 'guessNumber',
    label: 'Guess the number',
    description: 'The /random and /rg giveaway game, with its rate limit.',
    icon: 'dice',
    toggle: 'features.guessNumber.enabled',
    fields: [
      F('features.guessNumber.defaultMin', 'number', 'Lower bound'),
      F('features.guessNumber.defaultMax', 'number', 'Upper bound'),
      F('features.guessNumber.maxGuessesPerRound', 'number', 'Guesses per round', {
        help: 'The rate limit, not the randomness, is what protects the prize.',
        min: 1,
      }),
      F('features.guessNumber.cooldownSeconds', 'number', 'Seconds between guesses', { min: 0 }),
      F('features.guessNumber.winNote', 'textarea', 'Added to the win message'),
    ],
    requires: () => [],
  },
  {
    id: 'minigames',
    label: 'Minigames',
    description: 'Twelve games, what each outcome pays and the reward tiers.',
    icon: 'gamepad',
    toggle: 'features.minigames.enabled',
    fields: [
      F('features.minigames.games', 'gameGrid', 'Which games'),
      F('features.minigames.points', 'pointsMatrix', 'Points per outcome'),
      F('features.minigames.multipliers', 'multiplierList', 'Bonus roles', {
        help: 'These roles earn more from every game. The highest factor wins, they do not stack.',
      }),
      F('features.minigames.multiplyLosses', 'toggle', 'Bonus roles also lose more', {
        help: 'Off means a bonus only ever helps: a loss costs the same for everybody.',
      }),
      F('features.minigames.rewards', 'rewardList', 'Reward tiers'),
      F('features.minigames.showPointsFooter', 'toggle', 'Show the points footer'),
      F('features.minigames.trivia.useApi', 'toggle', 'Pull trivia questions from opentdb.com', {
        help: 'The API is English only. Switch it off when the bot runs in another language.',
      }),
      F('features.minigames.colors', 'colorMap', 'Colours'),
    ],
    // A bonus row whose role is empty does nothing at all and says nothing
    // about it, which is precisely the state this tile exists to surface.
    requires: (e) => {
      const bonuses = getPath(e, 'features.minigames.multipliers', []);
      return Array.isArray(bonuses) && bonuses.some(m => m && !resolves(e, 'roles', m.role))
        ? ['features.minigames.multipliers'] : [];
    },
  },
  {
    id: 'jokes',
    label: 'Jokes',
    description: '/flachwitz and /add_flachwitz.',
    icon: 'smile',
    toggle: 'features.jokes.enabled',
    fields: [],
    requires: () => [],
  },
  {
    id: 'userinfo',
    label: 'User info',
    description: 'What /userinfo shows about a member.',
    icon: 'idcard',
    toggle: null,
    command: 'userinfo',
    fields: [
      F('features.userinfo.showAccountAge', 'toggle', 'Account age'),
      F('features.userinfo.showJoinedAt', 'toggle', 'Joined at'),
      F('features.userinfo.showRoles', 'toggle', 'Roles'),
      F('features.userinfo.showPoints', 'toggle', 'Minigame points'),
    ],
    requires: () => [],
  },
  {
    id: 'moderation',
    label: 'Moderation tools',
    description: '/clear, the message context menus and the database backup.',
    icon: 'shield',
    toggle: null,
    fields: [
      F('features.clear.maxMessages', 'number', 'Maximum messages per /clear', {
        help: 'Discord refuses more than 100 per call, so this can only ever lower the ceiling.',
        min: 1,
        max: 100,
      }),
      F('features.contextMenus', 'contextMenus', 'Message context menus'),
      F('features.backupDatabase.enabled', 'toggle', 'Enable /backup_database', {
        help: 'Needs mysqldump on the machine and the DB_* credentials in .env.',
      }),
      F('features.backupDatabase.channelId', 'channel', 'Where to post the dump'),
      F('features.backupDatabase.deleteLocalFile', 'toggle', 'Delete the local file afterwards'),
    ],
    requires: () => [],
  },
  {
    id: 'commands',
    label: 'Commands',
    description: 'Rename, switch off or restrict every slash command.',
    icon: 'terminal',
    toggle: null,
    fields: [
      F('commands', 'commandTable', 'Commands'),
    ],
    requires: () => [],
  },
];

/**
 * One tile's state.
 *
 * `off` beats `incomplete`: a feature somebody switched off is not a problem to
 * be fixed, and reporting it as one is how a list of warnings becomes noise
 * nobody reads.
 */
function statusOf(feature, effective) {
  const enabled = feature.toggle ? getPath(effective, feature.toggle, false) === true : true;
  if (!enabled) return { state: 'off', missing: [] };

  const missing = feature.requires(effective) ?? [];
  return { state: missing.length ? 'incomplete' : 'ready', missing };
}

/** The tiles, with their current state. Fields are included so the UI can render a detail view. */
function describe(effective) {
  return FEATURES.map(f => ({
    id: f.id,
    label: f.label,
    description: f.description,
    icon: f.icon,
    toggle: f.toggle,
    command: f.command ?? null,
    fields: f.fields,
    ...statusOf(f, effective),
  }));
}

module.exports = { FEATURES, describe, statusOf };
