const {
  ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { nowStr, hasAnyRole } = require('../../../core/utils');
const { guild: gcfg, THUMBNAIL_URL } = require('../../../core/config');

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
  if (ftr) embed.setFooter({ text: ftr, iconURL: source.footer?.iconURL ?? THUMBNAIL_URL });

  if (source.author?.name) embed.setAuthor({ name: source.author.name, url: source.author.url, iconURL: source.author.iconURL });
  for (const field of source.fields ?? []) embed.addFields(field);

  return embed;
}

// ─── Context menu command definitions ────────────────────────────────────────

function getCommands() {
  return [
    new ContextMenuCommandBuilder().setName('Comment Feedback').setType(ApplicationCommandType.Message),
    new ContextMenuCommandBuilder().setName('Answer a Message').setType(ApplicationCommandType.Message),
    new ContextMenuCommandBuilder().setName('Edit Message').setType(ApplicationCommandType.Message),
    new ContextMenuCommandBuilder().setName('Edit Embed').setType(ApplicationCommandType.Message),
  ];
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function commentFeedback(interaction) {
  if (!hasAnyRole(interaction, 'Founder', 'Manager')) {
    return interaction.reply({ content: '❌ No permission.', flags: MessageFlags.Ephemeral, fetchReply: false });
  }

  const message = interaction.targetMessage;
  if (message.channel.id !== String(gcfg.FEEDBACK_CHANNEL_ID)) {
    return interaction.reply({ content: 'Only allowed in #feedback ❌', flags: MessageFlags.Ephemeral });
  }
  if (!message.embeds.length) {
    return interaction.reply({ content: 'No embed found in this message.', flags: MessageFlags.Ephemeral });
  }

  const input = new TextInputBuilder()
    .setCustomId('comment')
    .setLabel('Message')
    .setPlaceholder('Insert the Comment')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const submitted = await showModal(interaction, 'Comment Feedback', [input]);
  if (!submitted) return;

  const comment  = submitted.fields.getTextInputValue('comment');
  const srcEmbed = message.embeds[0];
  const newDesc  = `${srcEmbed.description}\n\n______\n**Comment** – by ${interaction.user} (${interaction.user.username})\n${comment}`;
  const newEmbed = cloneEmbed(srcEmbed, { description: newDesc });

  await message.edit({ embeds: [newEmbed] });
  await submitted.reply({ content: 'Successfully commented the feedback ✅', flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);

  // DM feedback author
  const match = srcEmbed.description?.match(/<@!?(\d+)>/);
  if (match) {
    try {
      const author = await interaction.client.users.fetch(match[1]);
      const dmEmbed = new EmbedBuilder()
        .setTitle('📨 Your feedback has been commented!')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Comment by', value: `${interaction.user.displayName} (${interaction.user})`, inline: false },
          { name: 'Comment', value: comment, inline: false },
        )
        .setFooter({ text: `MSK Scripts • ${interaction.guild.name}` });
      await author.send({ embeds: [dmEmbed] });
    } catch {}
  }
}

async function answerMessage(interaction) {
  if (!hasAnyRole(interaction, 'Founder', 'Manager')) {
    return interaction.reply({ content: '❌ No permission.', flags: MessageFlags.Ephemeral });
  }

  const input = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel('Message')
    .setPlaceholder('Insert the Text')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const submitted = await showModal(interaction, 'Answer to this Message', [input]);
  if (!submitted) return;

  await interaction.targetMessage.reply(submitted.fields.getTextInputValue('answer'));
  await submitted.reply({ content: 'Successfully replied to the message ✅', flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
}

async function editMessage(interaction) {
  if (!hasAnyRole(interaction, 'Founder', 'Manager')) {
    return interaction.reply({ content: '❌ No permission.', flags: MessageFlags.Ephemeral });
  }

  const msg   = interaction.targetMessage;
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Message')
    .setPlaceholder('Insert the Text')
    .setValue(msg.content || '')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const submitted = await showModal(interaction, 'Edit this Message', [input]);
  if (!submitted) return;

  await msg.edit(submitted.fields.getTextInputValue('content'));
  await submitted.reply({ content: 'The message was edited successfully 🙂', flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
}

async function editEmbed(interaction) {
  if (!hasAnyRole(interaction, 'Founder', 'Manager')) {
    return interaction.reply({ content: '❌ No permission.', flags: MessageFlags.Ephemeral });
  }

  const msg = interaction.targetMessage;
  if (!msg.embeds.length) {
    return interaction.reply({ content: 'This message does not contain an embed.', flags: MessageFlags.Ephemeral });
  }

  const src = msg.embeds[0];
  const inputs = [
    new TextInputBuilder().setCustomId('title').setLabel('Title').setValue(src.title ?? '').setStyle(TextInputStyle.Short).setRequired(false),
    new TextInputBuilder().setCustomId('description').setLabel('Description').setValue(src.description ?? '').setStyle(TextInputStyle.Paragraph).setRequired(true),
    new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumbnail').setValue(src.thumbnail?.url ?? '').setStyle(TextInputStyle.Short).setRequired(false),
    new TextInputBuilder().setCustomId('image').setLabel('Image').setValue(src.image?.url ?? '').setStyle(TextInputStyle.Short).setRequired(false),
    new TextInputBuilder().setCustomId('footer').setLabel('Footer').setValue(src.footer?.text ?? '').setStyle(TextInputStyle.Short).setRequired(false),
  ];

  const submitted = await showModal(interaction, 'Edit this Embed', inputs);
  if (!submitted) return;

  const date  = nowStr();
  let footer  = submitted.fields.getTextInputValue('footer');
  if (footer) {
    const idx = footer.lastIndexOf('Edited');
    footer = idx !== -1 ? footer.slice(0, idx) + `Edited at ${date}` : `${footer} • Edited at ${date}`;
  }

  const newEmbed = cloneEmbed(src, {
    title:       submitted.fields.getTextInputValue('title'),
    description: submitted.fields.getTextInputValue('description'),
    thumbnail:   submitted.fields.getTextInputValue('thumbnail'),
    image:       submitted.fields.getTextInputValue('image'),
    footer,
  });

  await msg.edit({ embeds: [newEmbed] });
  await submitted.reply({ content: 'The message was edited successfully 🙂', flags: MessageFlags.Ephemeral });
  setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
}

// ─── Interaction router ───────────────────────────────────────────────────────

async function handleInteraction(interaction, client) {
  if (!interaction.isMessageContextMenuCommand()) return;
  try {
    switch (interaction.commandName) {
      case 'Comment Feedback': return commentFeedback(interaction);
      case 'Answer a Message': return answerMessage(interaction);
      case 'Edit Message':     return editMessage(interaction);
      case 'Edit Embed':       return editEmbed(interaction);
    }
  } catch (err) {
    console.error('[ContextMenus]', err);
    const msg = { content: '❌ An unexpected error occurred.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
}

module.exports = { getCommands, handleInteraction };
