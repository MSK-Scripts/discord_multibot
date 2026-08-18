const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const { execFile }      = require('child_process');
const { join }          = require('path');
const { mkdirSync, writeFileSync, unlinkSync } = require('fs');
const { hasAnyRole, nowStr } = require('../../../core/utils');
const { EMBED_COLOR, THUMBNAIL_URL, database, guild: gcfg, DATA_DIR } = require('../../../core/config');

async function showModal(interaction, title, inputs) {
  const modal = new ModalBuilder().setCustomId(`modal_${Date.now()}`).setTitle(title);
  modal.addComponents(...inputs.map(i => new ActionRowBuilder().addComponents(i)));
  await interaction.showModal(modal);
  return interaction.awaitModalSubmit({ time: 300_000 }).catch(() => null);
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('backup_database')
      .setDescription('Backup Database [ONLY FOR FOUNDER ROLE]'),

    async execute(interaction) {
      if (!hasAnyRole(interaction, gcfg.FOUNDER_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const date       = new Date().toLocaleString('de-DE').replace(/[/:, ]/g, '-').slice(0, -1);
      const backupDir  = join(DATA_DIR, 'backups');
      mkdirSync(backupDir, { recursive: true });
      const backupFile = join(backupDir, `${database.NAME}_${date}.sql`);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Use execFile (not exec) to avoid shell injection with db credentials.
      // Capture stdout and write it to the file manually.
      execFile(
        'mysqldump',
        [`-h${database.HOST}`, `-u${database.USER}`, `-p${database.PASSWORD}`, database.NAME],
        { maxBuffer: 100 * 1024 * 1024 },
        async (err, stdout) => {
          if (err) {
            console.error('[backup_database]', err);
            return interaction.editReply({ content: '❌ Backup failed. Check server logs.' });
          }
          try {
            writeFileSync(backupFile, stdout, 'utf8');
            const logChannel = interaction.guild.channels.cache.get(String(gcfg.LOG_CHANNEL_ID));
            if (logChannel) {
              await logChannel.send({
                content: `New Backup created at ${date}`,
                files: [new AttachmentBuilder(backupFile)],
              });
            }
            await interaction.editReply({ content: 'Backup was successful. ✅' });
            setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
          } catch (uploadErr) {
            console.error('[backup_database] upload error:', uploadErr);
            await interaction.editReply({ content: '❌ Backup created but upload failed.' });
          } finally {
            unlinkSync(backupFile);
          }
        },
      );
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('send_message')
      .setDescription('Send a Message'),

    async execute(interaction) {
      if (!hasAnyRole(interaction, gcfg.FOUNDER_ROLE_ID, gcfg.MANAGER_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const input = new TextInputBuilder()
        .setCustomId('message_text')
        .setLabel('Description')
        .setPlaceholder('Insert Text')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const submitted = await showModal(interaction, 'Send Message', [input]);
      if (!submitted) return;

      // Acknowledge the modal submission immediately. A slow channel.send()
      // would otherwise blow past Discord's 3s interaction deadline — the user
      // sees a generic "interaction failed" and our later reply() throws a
      // silently-swallowed 10062.
      await submitted.deferReply({ flags: MessageFlags.Ephemeral });

      const text = submitted.fields.getTextInputValue('message_text');
      try {
        await interaction.channel.send(text);
      } catch (err) {
        console.error('[send_message]', err);
        return submitted.editReply({ content: '❌ Could not send the message. Check my permissions in this channel.' });
      }
      await submitted.editReply({ content: 'The message was sent successfully ✅' });
      setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('send_embed')
      .setDescription('Send an Embed Message'),

    async execute(interaction) {
      if (!hasAnyRole(interaction, gcfg.FOUNDER_ROLE_ID, gcfg.MANAGER_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const date = nowStr();
      const inputs = [
        new TextInputBuilder().setCustomId('title').setLabel('Title').setPlaceholder('Insert Title').setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('description').setLabel('Description').setPlaceholder('Insert Text').setStyle(TextInputStyle.Paragraph).setRequired(true),
        new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumbnail').setPlaceholder('Insert URL').setValue(THUMBNAIL_URL).setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('image').setLabel('Image').setPlaceholder('Insert URL').setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('footer').setLabel('Footer').setPlaceholder('Insert Footer Text').setValue(`© ${interaction.guild.name} • ${date}`).setStyle(TextInputStyle.Short).setRequired(false),
      ];

      const submitted = await showModal(interaction, 'Send Embed', inputs);
      if (!submitted) return;

      // Acknowledge the modal submission immediately (see send_message above).
      await submitted.deferReply({ flags: MessageFlags.Ephemeral });

      const title     = submitted.fields.getTextInputValue('title');
      const desc      = submitted.fields.getTextInputValue('description');
      const thumbnail = submitted.fields.getTextInputValue('thumbnail');
      const image     = submitted.fields.getTextInputValue('image');
      const footer    = submitted.fields.getTextInputValue('footer');

      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(title || null).setDescription(desc);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (image)     embed.setImage(image);
      if (footer)    embed.setFooter({ text: footer, iconURL: THUMBNAIL_URL });

      try {
        await interaction.channel.send({ embeds: [embed] });
      } catch (err) {
        console.error('[send_embed]', err);
        return submitted.editReply({ content: '❌ Could not send the embed. Check the URLs and my permissions in this channel.' });
      }
      await submitted.editReply({ content: 'The embed was sent successfully ✅' });
      setTimeout(() => submitted.deleteReply().catch(() => {}), 2000);
    },
  },
];
