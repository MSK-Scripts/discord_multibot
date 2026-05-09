const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { makeEmbed, hasAnyRole } = require('../../../core/utils');
const { guild: gcfg }           = require('../../../core/config');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('information')
      .setDescription('Information Message with URL Buttons'),

    async execute(interaction) {
      if (!hasAnyRole(interaction, 'Manager', 'Founder')) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const description = [
        '**Welcome to the MSK Scripts Discord!**',
        "We're glad to have you here. Take a moment to explore the server and don't hesitate to reach out if you have any questions.\n",
        '**Channel Access**',
        'To gain access to all channels, please head over to <#901154918923120720>, read the rules carefully and confirm them. You will then automatically receive access to the full server.\n',
        '**Server Roles**',
        '<@&900395427147436092> — Has purchased a product from our Tebex Shop',
        '<@&953771038519459840> — Tests new scripts and updates prior to public release',
        '<@&900396090208174130> — Experienced with Lua and assists members in <#939628758229471242>',
        '<@&900396252724854844> — Responsible for maintaining order and enforcing the server rules\n',
        '**Invite Link**\nhttps://discord.gg/5hHSBRHvJE',
      ].join('\n');

      const embed = makeEmbed({ description, guildName: interaction.guild.name });
      const row   = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Website').setStyle(ButtonStyle.Link).setURL('https://www.msk-scripts.de/'),
        new ButtonBuilder().setLabel('Documentation').setStyle(ButtonStyle.Link).setURL('https://docu.msk-scripts.de/'),
        new ButtonBuilder().setLabel('Github').setStyle(ButtonStyle.Link).setURL('https://github.com/MSK-Scripts'),
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: 'Information was successfully sent to this channel.', flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('rules')
      .setDescription('Rules Message with Reaction Buttons'),

    async execute(interaction) {
      if (!hasAnyRole(interaction, 'Manager', 'Founder')) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const description = [
        '**1.** All communication must be conducted in German or English only.',
        '**2.** Spamming or flooding any channel with messages is not permitted.',
        '**3.** NSFW content of any kind is strictly prohibited.',
        '**4.** Treat all members with respect. Inappropriate or offensive language will not be tolerated.',
        '**5.** Harassment, discrimination, or hate speech of any form — including but not limited to racism, sexism, transphobia, and homophobia — will result in an immediate ban.',
        '**6.** Self-promotion, soliciting, advertising, or reselling — whether in channels or via DMs — is not allowed.',
        '**7.** Please keep discussions on-topic and use the appropriate channels.',
        '**8.** Sharing links is only permitted if explicitly approved by a moderator.',
        '**9.** Avoid unnecessary @mentions of members or roles.',
        `**10.** All digital products provided by MSK Scripts are licensed, not sold. Redistribution, resale, or unauthorized sharing of any of our products is strictly forbidden.\n`,
        `By clicking the button below, you confirm that you have read and agreed to the rules above and will receive the <@&${gcfg.MEMBER_ROLE_ID}> role.`,
      ].join('\n');

      const embed = makeEmbed({ title: 'Discord Rules', description, guildName: interaction.guild.name });
      const row   = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rules_verification').setLabel('Verification').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('rules_giveaway_notify').setLabel('Giveaway Notify').setStyle(ButtonStyle.Primary).setEmoji('🎁'),
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: 'Rules were successfully sent to this channel.', flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('roles')
      .setDescription('Roles Message with Script Notification Buttons'),

    async execute(interaction) {
      if (!hasAnyRole(interaction, 'Manager', 'Founder')) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const description = [
        '**Script Update Notifications**',
        'Select the scripts you own to receive notifications whenever a new update is released.\n',
        'Click a button to add or remove the corresponding role at any time.',
      ].join('\n');

      const embed = makeEmbed({ title: 'Script Roles', description, guildName: interaction.guild.name });
      const row   = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('roles_garage').setLabel('Garage').setStyle(ButtonStyle.Success).setEmoji('⏰'),
        new ButtonBuilder().setCustomId('roles_handcuffs').setLabel('Handcuffs').setStyle(ButtonStyle.Success).setEmoji('⏰'),
        new ButtonBuilder().setCustomId('roles_storage').setLabel('Storage').setStyle(ButtonStyle.Success).setEmoji('⏰'),
        new ButtonBuilder().setCustomId('roles_vehicle_keys').setLabel('Vehicle Keys').setStyle(ButtonStyle.Success).setEmoji('⏰'),
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: 'Roles message was successfully sent to this channel.', flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
    },
  },
];
