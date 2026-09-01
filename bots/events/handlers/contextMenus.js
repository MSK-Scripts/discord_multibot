const {
  ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { nowStr } = require('../../../core/utils');
const { guardMenu } = require('../../../core/commandKit');
const { t, raw } = require('../../../core/i18n');
const config = require('../../../core/config');

/**
 * The four message context menus (right-click a message, Apps).
 *
 * EACH HAS A KEY AND A NAME. The key is what this file switches on; the name is
 * what Discord shows and is the operator's to change. `NAMES` is filled while
 * the commands are built and read again when one is used, so a rename applies
 * to both halves at once.
 */

const MENUS = ['commentFeedback', 'answerMessage', 'editMessage', 'editEmbed'];

/** Registered name -> key. Rebuilt on every getCommands() call. */
let NAMES = new Map();

async function showModal(interaction, title, inputs) {
  const modal = new ModalBuilder().setCustomId(`ctxmenu_${Date.now()}`).setTitle(title);
  modal.addComponents(...inputs.map(i => new ActionRowBuilder().addComponents(i)));
  await interaction.showModal(modal);
  return interaction.awaitModalSubmit({ time: 300_000 }).catch(() => null);
}

function cloneEmbed(source, { title, description, thumbnail, image, footer } = {}) {
  const embed = new EmbedBuilder()
    .setColor(source.color ?? null)
    .setTitle(title !== undefined ? (title || null) : (source.title || null))
    .setDescription(description !== undefined ? (description || null) : (source.description || null));

  const thumb = thumbnail !== undefined ? thumbnail : (source.thumbnail?.url ?? '');
  if (thumb) embed.setThumbnail(thumb);

  const img = image !== undefined ? image : (source.image?.url ?? '');
  if (img) embed.setImage(img);

  const ftr = footer !== undefined ? footer : (source.footer?.text ?? '');
  if (ftr) {
    // The icon is optional in both directions: keep the original's if it had
    // one, fall back to the configured logo, and set no icon at all when there
    // is none. An empty iconURL is an error from Discord, not a no-op.
    const iconURL = source.footer?.iconURL || config.thumbnailUrl();
    embed.setFooter(iconURL ? { text: ftr, iconURL } : { text: ftr });
  }

  if (source.author?.name) embed.setAuthor({ name: source.author.name, url: source.author.url, iconURL: source.author.iconURL });
  for (const field of source.fields ?? []) embed.addFields(field);

  return embed;
}

// ─── Command definitions ──────────────────────────────────────────────────────

function getCommands() {
  NAMES = new Map();
  const commands = [];

  for (const key of MENUS) {
    const meta = config.contextMenu(key);
    if (!meta.enabled) continue;
    // Context menu names may contain spaces and capitals, unlike slash
    // commands. Discord's limit is 32 characters.
    const name = meta.name.slice(0, 32);
    NAMES.set(name, key);
    commands.push(new ContextMenuCommandBuilder().setName(name).setType(ApplicationCommandType.Message));
  }

  return commands;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function commentFeedback(interaction) {
  if (!await guardMenu(interaction, 'commentFeedback')) return;

  const message = interaction.targetMessage;
  const feedbackChannel = config.channelId(config.get('features.feedback.channelId', ''), 'feedback');
  if (!feedbackChannel || message.channel.id !== String(feedbackChannel)) {
    return interaction.reply({ content: t('contextMenus.commentFeedback.wrongChannel'), flags: MessageFlags.Ephemeral });
  }
  if (!message.embeds.length) {
    return interaction.reply({ content: t('contextMenus.commentFeedback.noEmbed'), flags: MessageFlags.Ephemeral });
  }

  const input = new TextInputBuilder()
    .setCustomId('comment')
    .setLabel(t('contextMenus.commentFeedback.label'))
    .setPlaceholder(t('contextMenus.commentFeedback.placeholder'))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const submitted = await showModal(interaction, t('contextMenus.commentFeedback.modalTitle'), [input]);
  if (!submitted) return;

  const comment = submitted.fields.getTextInputValue('comment');
  const srcEmbed = message.embeds[0];
  const newDesc = (srcEmbed.description ?? '') + t('contextMenus.commentFeedback.commentBlock', {
    user: String(interaction.user),
    name: interaction.user.username,
    comment,
  });

  await message.edit({ embeds: [cloneEmbed(srcEmbed, { description: newDesc })] });
  await submitted.reply({ content: t('contextMenus.commentFeedback.success'), flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);

  if (config.get('features.feedback.dmOnComment', true) === false) return;

  // Tell the author. The id is read back out of the embed the bot wrote itself,
  // which is why the feedback embed always starts with the author's mention.
  const match = srcEmbed.description?.match(/<@!?(\d+)>/);
  if (!match) return;
  try {
    const author = await interaction.client.users.fetch(match[1]);
    const brand = config.brandName();
    const dmEmbed = new EmbedBuilder()
      .setTitle(t('contextMenus.commentFeedback.dmTitle'))
      .setColor(config.embedColor())
      .addFields(
        { name: t('contextMenus.commentFeedback.dmCommentBy'), value: `${interaction.user.displayName} (${interaction.user})`, inline: false },
        { name: t('contextMenus.commentFeedback.dmComment'), value: comment, inline: false },
      )
      // The brand name when there is one, otherwise just the server.
      .setFooter({ text: brand ? `${brand} • ${interaction.guild.name}` : interaction.guild.name });
    await author.send({ embeds: [dmEmbed] });
  } catch { /* DMs closed, or the account is gone */ }
}

async function answerMessage(interaction) {
  if (!await guardMenu(interaction, 'answerMessage')) return;

  const input = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel(t('contextMenus.answerMessage.label'))
    .setPlaceholder(t('contextMenus.answerMessage.placeholder'))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const submitted = await showModal(interaction, t('contextMenus.answerMessage.modalTitle'), [input]);
  if (!submitted) return;

  await interaction.targetMessage.reply(submitted.fields.getTextInputValue('answer'));
  await submitted.reply({ content: t('contextMenus.answerMessage.success'), flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
}

async function editMessage(interaction) {
  if (!await guardMenu(interaction, 'editMessage')) return;

  const msg = interaction.targetMessage;
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel(t('contextMenus.editMessage.label'))
    .setPlaceholder(t('contextMenus.editMessage.placeholder'))
    .setValue(msg.content || '')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const submitted = await showModal(interaction, t('contextMenus.editMessage.modalTitle'), [input]);
  if (!submitted) return;

  await msg.edit(submitted.fields.getTextInputValue('content'));
  await submitted.reply({ content: t('contextMenus.editMessage.success'), flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
}

async function editEmbed(interaction) {
  if (!await guardMenu(interaction, 'editEmbed')) return;

  const msg = interaction.targetMessage;
  if (!msg.embeds.length) {
    return interaction.reply({ content: t('contextMenus.editEmbed.noEmbed'), flags: MessageFlags.Ephemeral });
  }

  const src = msg.embeds[0];
  const inputs = [
    new TextInputBuilder().setCustomId('title').setLabel(t('contextMenus.editEmbed.labelTitle'))
      .setValue(src.title ?? '').setStyle(TextInputStyle.Short).setRequired(false),
    new TextInputBuilder().setCustomId('description').setLabel(t('contextMenus.editEmbed.labelDescription'))
      .setValue(src.description ?? '').setStyle(TextInputStyle.Paragraph).setRequired(true),
    new TextInputBuilder().setCustomId('thumbnail').setLabel(t('contextMenus.editEmbed.labelThumbnail'))
      .setValue(src.thumbnail?.url ?? '').setStyle(TextInputStyle.Short).setRequired(false),
    new TextInputBuilder().setCustomId('image').setLabel(t('contextMenus.editEmbed.labelImage'))
      .setValue(src.image?.url ?? '').setStyle(TextInputStyle.Short).setRequired(false),
    new TextInputBuilder().setCustomId('footer').setLabel(t('contextMenus.editEmbed.labelFooter'))
      .setValue(src.footer?.text ?? '').setStyle(TextInputStyle.Short).setRequired(false),
  ];

  const submitted = await showModal(interaction, t('contextMenus.editEmbed.modalTitle'), inputs);
  if (!submitted) return;

  const stamp = t('contextMenus.editEmbed.editedAt', { date: nowStr() });
  let footer = submitted.fields.getTextInputValue('footer');
  if (footer) {
    // Replace an existing stamp instead of appending a second one, so an embed
    // edited five times does not grow five timestamps. The marker comes from
    // the template rather than from a hardcoded English word, which is what
    // used to break the moment the wording changed.
    const marker = raw('contextMenus.editEmbed.editedAt').split('{date}')[0].trim();
    const idx = marker ? footer.lastIndexOf(marker) : -1;
    footer = idx !== -1 ? `${footer.slice(0, idx)}${stamp}` : `${footer} • ${stamp}`;
  }

  const newEmbed = cloneEmbed(src, {
    title:       submitted.fields.getTextInputValue('title'),
    description: submitted.fields.getTextInputValue('description'),
    thumbnail:   submitted.fields.getTextInputValue('thumbnail'),
    image:       submitted.fields.getTextInputValue('image'),
    footer,
  });

  await msg.edit({ embeds: [newEmbed] });
  await submitted.reply({ content: t('contextMenus.editEmbed.success'), flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
}

const HANDLERS = { commentFeedback, answerMessage, editMessage, editEmbed };

// ─── Interaction router ───────────────────────────────────────────────────────

async function handleInteraction(interaction, client) {
  if (!interaction.isMessageContextMenuCommand()) return;

  // Routed by the name it was REGISTERED under. If getCommands() has not run in
  // this process the map is empty, so fall back to matching the configured name
  // directly rather than silently ignoring the click.
  const key = NAMES.get(interaction.commandName)
    ?? MENUS.find(k => config.contextMenu(k).name === interaction.commandName);
  const handler = key ? HANDLERS[key] : null;
  if (!handler) return;

  try {
    await handler(interaction);
  } catch (err) {
    if (err.code === 10062) return;
    console.error('[ContextMenus]', err);
    const msg = { content: t('common.unexpectedError'), flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
}

module.exports = { getCommands, handleInteraction };
