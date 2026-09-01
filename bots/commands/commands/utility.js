const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { makeEmbed, dateTimeStr } = require('../../../core/utils');
const { applyMeta, optionText, guard } = require('../../../core/commandKit');
const { getPoints } = require('../../../core/pointsManager');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');

module.exports = [
  {
    key: 'ping',
    data: applyMeta(new SlashCommandBuilder(), 'ping'),

    async execute(interaction) {
      if (!await guard(interaction, 'ping')) return;
      const latency = Math.round(interaction.client.ws.ping);
      await interaction.reply(t('utility.ping', { latency }));
    },
  },

  {
    key: 'userinfo',
    data: applyMeta(new SlashCommandBuilder(), 'userinfo')
      .addUserOption(o => o.setName('member').setDescription(optionText('userinfo', 'member')).setRequired(true)),

    async execute(interaction) {
      if (!await guard(interaction, 'userinfo')) return;

      const member = interaction.options.getMember('member');
      if (!member) {
        return interaction.reply({ content: t('utility.userinfo.notFound'), flags: MessageFlags.Ephemeral });
      }
      const user = member.user;

      const embed = makeEmbed({
        title:       t('utility.userinfo.title', { username: user.username }),
        description: t('utility.userinfo.description', { mention: String(member) }),
      });

      if (config.get('features.userinfo.showAccountAge', true)) {
        embed.addFields({ name: t('utility.userinfo.accountCreated'), value: dateTimeStr(user.createdAt), inline: true });
      }
      if (config.get('features.userinfo.showJoinedAt', true)) {
        embed.addFields({
          name:  t('utility.userinfo.joinedServer'),
          value: member.joinedAt ? dateTimeStr(member.joinedAt) : t('common.unknown'),
          inline: true,
        });
      }
      embed.addFields({ name: t('utility.userinfo.userId'), value: user.id, inline: false });

      if (config.get('features.userinfo.showRoles', true)) {
        const roles = member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).join('\n');
        if (roles) embed.addFields({ name: t('utility.userinfo.roles'), value: roles, inline: false });
      }

      if (config.get('features.userinfo.showPoints', true) && config.get('features.minigames.enabled', true)) {
        const points = await getPoints(user.id);
        embed.addFields({
          name:  t('utility.userinfo.points'),
          value: `**${points.toLocaleString(config.dateLocale())}**`,
          inline: false,
        });
      }

      if (user.avatarURL()) embed.setThumbnail(user.avatarURL());

      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    key: 'clear',
    // The limit is read once, when the command is built, because it is part of
    // the option's description that Discord stores.
    data: applyMeta(new SlashCommandBuilder(), 'clear')
      .addIntegerOption(o => o
        .setName('amount')
        .setDescription(optionText('clear', 'amount', { max: Math.min(Number(config.get('features.clear.maxMessages', 100)) || 100, 100) }))
        .setRequired(true)),

    async execute(interaction) {
      if (!await guard(interaction, 'clear')) return;

      // Discord itself refuses more than 100 per call, so the configured limit
      // can only ever make the ceiling lower, never higher.
      const max = Math.min(Number(config.get('features.clear.maxMessages', 100)) || 100, 100);
      const amount = interaction.options.getInteger('amount');

      if (amount > max) return interaction.reply({ content: t('utility.clear.tooMany', { max }), flags: MessageFlags.Ephemeral });
      if (amount < 1)   return interaction.reply({ content: t('utility.clear.tooFew'), flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.editReply({ content: t('utility.clear.done', { count: deleted.size }) });
    },
  },
];
