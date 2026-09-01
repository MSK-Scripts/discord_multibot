const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  AttachmentBuilder, MessageFlags,
} = require('discord.js');
const { execFile } = require('child_process');
const { join } = require('path');
const { mkdirSync, writeFileSync, unlinkSync } = require('fs');
const { nowStr } = require('../../../core/utils');
const { buildMessage } = require('../../../core/messageComposer');
const { applyMeta, guard } = require('../../../core/commandKit');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');

async function showModal(interaction, title, inputs) {
  const modal = new ModalBuilder().setCustomId(`modal_${Date.now()}`).setTitle(title);
  modal.addComponents(...inputs.map(i => new ActionRowBuilder().addComponents(i)));
  await interaction.showModal(modal);
  return interaction.awaitModalSubmit({ time: 300_000 }).catch(() => null);
}

module.exports = [
  {
    key: 'backup_database',
    feature: 'backupDatabase',
    data: applyMeta(new SlashCommandBuilder(), 'backup_database'),

    async execute(interaction) {
      if (!await guard(interaction, 'backup_database')) return;

      const date = new Date().toLocaleString(config.dateLocale()).replace(/[/:, ]/g, '-').replace(/-+$/, '');
      const backupDir = join(config.DATA_DIR, 'backups');
      mkdirSync(backupDir, { recursive: true });
      const backupFile = join(backupDir, `${config.database.NAME}_${date}.sql`);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // execFile, not exec: the database password is an argument here, and a
      // shell in between would make it a string somebody can break out of.
      execFile(
        'mysqldump',
        [`-h${config.database.HOST}`, `-u${config.database.USER}`, `-p${config.database.PASSWORD}`, config.database.NAME],
        { maxBuffer: 100 * 1024 * 1024 },
        async (err, stdout) => {
          if (err) {
            console.error('[backup_database]', err);
            return interaction.editReply({ content: t('admin.backup.failed') });
          }
          try {
            writeFileSync(backupFile, stdout, 'utf8');

            const channelId = config.channelId(config.get('features.backupDatabase.channelId', ''), 'log');
            const channel = channelId ? interaction.guild.channels.cache.get(String(channelId)) : null;
            if (!channel) {
              // The dump exists but nobody can reach it, which is worth saying
              // out loud rather than reporting a success nothing came of.
              return interaction.editReply({ content: t('admin.backup.noChannel') });
            }

            await channel.send({
              content: t('admin.backup.logMessage', { date }),
              files: [new AttachmentBuilder(backupFile)],
            });
            await interaction.editReply({ content: t('admin.backup.success') });
            setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
          } catch (uploadErr) {
            console.error('[backup_database] upload error:', uploadErr);
            await interaction.editReply({ content: t('admin.backup.uploadFailed') });
          } finally {
            if (config.get('features.backupDatabase.deleteLocalFile', true)) {
              try { unlinkSync(backupFile); } catch { /* never written, or already gone */ }
            }
          }
        },
      );
    },
  },

  {
    key: 'send_message',
    data: applyMeta(new SlashCommandBuilder(), 'send_message'),

    async execute(interaction) {
      if (!await guard(interaction, 'send_message')) return;

      const input = new TextInputBuilder()
        .setCustomId('message_text')
        .setLabel(t('admin.sendMessage.label'))
        .setPlaceholder(t('admin.sendMessage.placeholder'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const submitted = await showModal(interaction, t('admin.sendMessage.modalTitle'), [input]);
      if (!submitted) return;

      // Acknowledge the modal submission immediately. A slow channel.send()
      // would otherwise blow past Discord's 3s interaction deadline: the user
      // sees a generic "interaction failed" and our later reply() throws a
      // silently swallowed 10062.
      await submitted.deferReply({ flags: MessageFlags.Ephemeral });

      const text = submitted.fields.getTextInputValue('message_text');
      // Built by the shared composer, so what this posts and what the
      // dashboard's announcement screen posts are the same message.
      const built = buildMessage({ mode: 'text', body: text });
      if (!built.ok) return submitted.editReply({ content: built.error });
      try {
        await interaction.channel.send(built.payload);
      } catch (err) {
        console.error('[send_message]', err);
        return submitted.editReply({ content: t('admin.sendMessage.failed') });
      }
      await submitted.editReply({ content: t('admin.sendMessage.success') });
      setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
    },
  },

  {
    key: 'send_embed',
    data: applyMeta(new SlashCommandBuilder(), 'send_embed'),

    async execute(interaction) {
      if (!await guard(interaction, 'send_embed')) return;

      const thumbUrl = config.thumbnailUrl();
      const inputs = [
        new TextInputBuilder().setCustomId('title').setLabel(t('admin.sendEmbed.labelTitle'))
          .setPlaceholder(t('admin.sendEmbed.placeholderTitle')).setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('description').setLabel(t('admin.sendEmbed.labelDescription'))
          .setPlaceholder(t('admin.sendEmbed.placeholderDescription')).setStyle(TextInputStyle.Paragraph).setRequired(true),
        new TextInputBuilder().setCustomId('thumbnail').setLabel(t('admin.sendEmbed.labelThumbnail'))
          .setPlaceholder(t('admin.sendEmbed.placeholderUrl')).setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('image').setLabel(t('admin.sendEmbed.labelImage'))
          .setPlaceholder(t('admin.sendEmbed.placeholderUrl')).setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('footer').setLabel(t('admin.sendEmbed.labelFooter'))
          .setPlaceholder(t('admin.sendEmbed.placeholderFooter'))
          .setValue(`© ${interaction.guild.name} • ${nowStr()}`).setStyle(TextInputStyle.Short).setRequired(false),
      ];
      // Prefilled only when there IS a logo. setValue('') is not the same as
      // leaving it out: it makes the field look answered with nothing in it.
      if (thumbUrl) inputs[2].setValue(thumbUrl);

      const submitted = await showModal(interaction, t('admin.sendEmbed.modalTitle'), inputs);
      if (!submitted) return;

      // Acknowledge the modal submission immediately (see send_message above).
      await submitted.deferReply({ flags: MessageFlags.Ephemeral });

      const title     = submitted.fields.getTextInputValue('title');
      const desc      = submitted.fields.getTextInputValue('description');
      const thumbnail = submitted.fields.getTextInputValue('thumbnail');
      const image     = submitted.fields.getTextInputValue('image');
      const footer    = submitted.fields.getTextInputValue('footer');

      // Same composer as the dashboard's announcement screen. The empty-url
      // trap lives in there now: an EMPTY iconURL is an invalid-URL error from
      // Discord and not a no-op, so an unbranded installation would otherwise
      // fail to post at all.
      const built = buildMessage({
        mode: 'embed', title, body: desc, thumbnail, image, footer,
        guildName: interaction.guild.name,
      });
      if (!built.ok) return submitted.editReply({ content: built.error });

      try {
        await interaction.channel.send(built.payload);
      } catch (err) {
        console.error('[send_embed]', err);
        return submitted.editReply({ content: t('admin.sendEmbed.failed') });
      }
      await submitted.editReply({ content: t('admin.sendEmbed.success') });
      setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
    },
  },
];
