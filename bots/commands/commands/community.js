const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const { makeEmbed, linkRow, buttonStyle } = require('../../../core/utils');
const { applyMeta, guard } = require('../../../core/commandKit');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');

/**
 * The three panels a server posts once and leaves standing: the welcome
 * information, the rules with their verification button, and the self-assign
 * role menu.
 *
 * ALL THREE ARE BUILT FROM THE CONFIG, TEXT AND ALL. They used to be written
 * out here — ten rules naming one shop, six channel and role ids, four buttons
 * with hardcoded role names — which meant a fresh clone posted somebody else's
 * server rules to its own members.
 *
 * A LINE WHOSE ID IS UNSET IS LEFT OUT, never rendered. An unresolved `<@&123>`
 * shows up as a raw number to every reader, which looks like a bug in the bot
 * rather than a setting somebody has not filled in yet.
 */

/** Post the panel into the current channel and confirm ephemerally. */
async function postPanel(interaction, { embed, components, confirmation }) {
  await interaction.channel.send({ embeds: [embed], components });
  await interaction.reply({ content: confirmation, flags: MessageFlags.Ephemeral });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
}

// ─── /information ─────────────────────────────────────────────────────────────

function informationEmbed(interaction) {
  const cfg = config.get('features.information', {});
  const lines = [];

  const intro = String(cfg.intro ?? '').trim();
  if (intro) lines.push(intro, '');

  for (const section of Array.isArray(cfg.sections) ? cfg.sections : []) {
    const text = String(section?.text ?? '').trim();
    if (!text) continue;

    // A section that WANTS a channel and has none is dropped whole: its
    // sentence is built around the mention, so without it the text is a
    // fragment pointing nowhere.
    const wantsChannel = text.includes('{channel}');
    const channel = config.channelId(section?.channel ?? '');
    if (wantsChannel && !channel) continue;

    const heading = String(section?.heading ?? '').trim();
    if (heading) lines.push(`**${heading}**`);
    lines.push(text.replace(/\{channel\}/g, `<#${channel}>`), '');
  }

  const roleLines = (Array.isArray(cfg.roleList) ? cfg.roleList : [])
    .map(entry => ({ id: config.roleId(entry?.role ?? ''), text: String(entry?.text ?? '').trim() }))
    .filter(entry => entry.id && entry.text)
    .map(entry => `<@&${entry.id}>: ${entry.text}`);

  if (roleLines.length) {
    const heading = String(cfg.roleListHeading ?? '').trim();
    if (heading) lines.push(`**${heading}**`);
    lines.push(...roleLines, '');
  }

  const invite = String(cfg.inviteUrl ?? '').trim();
  if (invite) {
    const heading = String(cfg.inviteHeading ?? '').trim();
    lines.push(heading ? `**${heading}**\n${invite}` : invite);
  }

  const description = lines.join('\n').trim();
  if (!description) return null;

  // The server's own name when nothing is branded, which reads correctly
  // everywhere instead of welcoming people to somebody else's Discord.
  const brand = config.brandName() || interaction.guild.name;
  const title = String(cfg.title ?? '').trim() || t('panels.information.defaultTitle', { brand });

  return makeEmbed({ title, description, guildName: interaction.guild.name });
}

// ─── /rules ───────────────────────────────────────────────────────────────────

function rulesEmbed(interaction) {
  const cfg = config.get('features.rules', {});
  const lines = [];

  const intro = String(cfg.intro ?? '').trim();
  if (intro) lines.push(intro, '');

  const rules = (Array.isArray(cfg.rules) ? cfg.rules : [])
    .map(r => String(r ?? '').trim())
    .filter(Boolean);
  // Numbered from the position in the list, so inserting a rule renumbers the
  // rest on its own and the text never has to carry its own number.
  rules.forEach((text, index) => lines.push(t('panels.rules.ruleLine', { number: index + 1, text })));

  const grantsRole = config.roleId(cfg.button?.grantsRole ?? '');
  const consent = String(cfg.consentText ?? '').trim();
  // The consent sentence names the role it grants. Without a role there is
  // nothing to consent TO, so it is left out rather than promising a mention
  // that would render as a raw id.
  if (consent && grantsRole && cfg.button?.enabled !== false) {
    lines.push('', consent.replace(/\{role\}/g, `<@&${grantsRole}>`));
  }

  const description = lines.join('\n').trim();
  if (!description) return null;

  return makeEmbed({
    title: String(cfg.title ?? '').trim(),
    description,
    guildName: interaction.guild.name,
  });
}

function rulesComponents() {
  const cfg = config.get('features.rules', {});
  const rows = [];

  const button = cfg.button ?? {};
  if (button.enabled !== false && config.roleId(button.grantsRole ?? '')) {
    const b = new ButtonBuilder()
      .setCustomId('rules_verification')
      .setLabel(String(button.label ?? '').trim() || 'Verify')
      .setStyle(buttonStyle(button.style));
    const emoji = String(button.emoji ?? '').trim();
    if (emoji) b.setEmoji(emoji);
    rows.push(new ActionRowBuilder().addComponents(b));
  }

  if (cfg.showLinkButtons) rows.push(...linkRow());
  return rows;
}

// ─── /roles ───────────────────────────────────────────────────────────────────

/**
 * The self-assign buttons, five per row.
 *
 * `id` is what Discord sends back on a click, so it is prefixed once here and
 * matched the same way in bot.js. A button whose role does not resolve is left
 * out: it would render fine and then fail on the first press.
 */
function roleMenuButtons() {
  return (config.get('features.roleMenu.buttons', []) || [])
    .map(b => ({
      id:    String(b?.id ?? '').trim(),
      label: String(b?.label ?? '').trim(),
      emoji: String(b?.emoji ?? '').trim(),
      style: b?.style,
      role:  config.roleId(b?.role ?? ''),
    }))
    .filter(b => b.id && b.label && b.role)
    .slice(0, 25);
}

function roleMenuComponents() {
  const rows = [];
  const buttons = roleMenuButtons();

  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const b of buttons.slice(i, i + 5)) {
      const builder = new ButtonBuilder()
        .setCustomId(`rolemenu_${b.id}`)
        .setLabel(b.label)
        .setStyle(buttonStyle(b.style));
      if (b.emoji) builder.setEmoji(b.emoji);
      row.addComponents(builder);
    }
    rows.push(row);
  }

  if (config.get('features.roleMenu.showLinkButtons', false)) rows.push(...linkRow());
  return rows;
}

module.exports = [
  {
    key: 'information',
    data: applyMeta(new SlashCommandBuilder(), 'information'),

    async execute(interaction) {
      if (!await guard(interaction, 'information')) return;

      const embed = informationEmbed(interaction);
      if (!embed) {
        return interaction.reply({ content: t('panels.nothingToPost'), flags: MessageFlags.Ephemeral });
      }

      await postPanel(interaction, {
        embed,
        components: config.get('features.information.showLinkButtons', true) ? linkRow() : [],
        confirmation: t('panels.sentInformation'),
      });
    },
  },

  {
    key: 'rules',
    data: applyMeta(new SlashCommandBuilder(), 'rules'),

    async execute(interaction) {
      if (!await guard(interaction, 'rules')) return;

      const embed = rulesEmbed(interaction);
      if (!embed) {
        return interaction.reply({ content: t('panels.nothingToPost'), flags: MessageFlags.Ephemeral });
      }

      await postPanel(interaction, {
        embed,
        components: rulesComponents(),
        confirmation: t('panels.sentRules'),
      });
    },
  },

  {
    key: 'roles',
    data: applyMeta(new SlashCommandBuilder(), 'roles'),

    async execute(interaction) {
      if (!await guard(interaction, 'roles')) return;

      const components = roleMenuComponents();
      if (!components.length) {
        return interaction.reply({ content: t('panels.nothingToPost'), flags: MessageFlags.Ephemeral });
      }

      const cfg = config.get('features.roleMenu', {});
      const embed = makeEmbed({
        title:       String(cfg.title ?? '').trim(),
        description: String(cfg.description ?? '').trim(),
        guildName:   interaction.guild.name,
      });

      await postPanel(interaction, { embed, components, confirmation: t('panels.sentRoles') });
    },
  },
];
