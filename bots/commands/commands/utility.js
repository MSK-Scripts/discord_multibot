const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { makeEmbed, hasAnyRole } = require('../../../core/utils');
const { getPoints } = require('../../../core/pointsManager');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('ping')
      .setDescription("Responds with Pong and the bot's current latency"),

    async execute(interaction) {
      const latency = Math.round(interaction.client.ws.ping);
      await interaction.reply(`🏓 Pong!\nLatency: \`${latency}ms\``);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Information about a specific User')
      .addUserOption(o => o.setName('member').setDescription('The user you want info about').setRequired(true)),

    async execute(interaction) {
      const member = interaction.options.getMember('member');
      if (!member) {
        return interaction.reply({ content: '❌ User not found or no longer in this server.', flags: MessageFlags.Ephemeral });
      }
      const user = member.user;

      const embed = makeEmbed({
        title:       `Userinfo for ${user.username}`,
        description: `Information about ${member}`,
      });

      embed
        .addFields(
          { name: 'Account created at', value: user.createdAt.toLocaleString('de-DE'), inline: true },
          { name: 'Server joined at',   value: member.joinedAt?.toLocaleString('de-DE') ?? 'Unknown', inline: true },
          { name: 'User ID',            value: user.id, inline: false },
        );

      const roles = member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).join('\n');
      if (roles) embed.addFields({ name: 'Roles', value: roles, inline: false });

      const points = getPoints(user.id);
      embed.addFields({ name: '🪙 Minigame Points', value: `**${points.toLocaleString()}**`, inline: false });

      if (user.avatarURL()) embed.setThumbnail(user.avatarURL());

      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Clears a specific amount of messages')
      .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (max 100)').setRequired(true)),

    async execute(interaction) {
      if (!hasAnyRole(interaction, 'Team')) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const amount = interaction.options.getInteger('amount');
      if (amount > 100) return interaction.reply({ content: '❌ You cannot delete more than 100 messages at once.', flags: MessageFlags.Ephemeral });
      if (amount < 1)   return interaction.reply({ content: '❌ Amount must be at least 1.', flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.editReply({ content: `✅ ${deleted.size} message(s) deleted.` });
    },
  },
];
