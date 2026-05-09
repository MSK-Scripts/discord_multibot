const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { makeEmbed } = require('../../../core/utils');

const GUIDES = {
  documentation: {
    title:       'Documentation',
    description: '[Documentation](https://docu.msk-scripts.de/)',
  },
  msk_core_dependency: {
    title:       'Support Guide for MSK Core Dependency',
    description: '**You need `msk_core` to use our Scripts!**\nDownload it from [Github](https://github.com/MSK-Scripts/msk_core/releases/latest)',
  },
  change_notification: {
    title:       'Support Guide for Changing Notifications',
    description: 'Documentation: https://docu.msk-scripts.de/docs/miscellaneous/change-notifications',
  },
  garage: {
    title:       'Support Guide for MSK Garage',
    description: [
      '1. Install [msk_core](https://github.com/MSK-Scripts/msk_core/releases/latest)',
      '2. Update the script to the latest version!',
      '3. Set `Config.Debug = true` and restart your Server',
      '4. Do again what causes the issue',
      '5. Send us screenshots from Client F8 Console and txAdmin Live Console',
      '6. Send us your current `config.lua` and tell us which version you are using *(fxmanifest.lua)*',
      '7. Send us your `owned_vehicles` table from database',
    ].join('\n'),
  },
  handcuffs: {
    title:       'Support Guide for MSK Handcuffs',
    description: [
      '**Documentation – Implement it into esx_policejob or jobs_creator**',
      'Documentation: https://docu.msk-scripts.de/docs/msk_handcuffs/guides/\n',
      '1. Install [msk_core](https://github.com/MSK-Scripts/msk_core/releases/latest)',
      '2. Update the script to the latest version!',
      '3. Set `Config.Debug = true` and restart your Server',
      '4. Do again what causes the issue',
      '5. Send us screenshots from Client F8 Console and txAdmin Live Console',
      '6. Send us your current `config.lua` and tell us which version you are using *(fxmanifest.lua)*',
    ].join('\n'),
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('script_guides')
    .setDescription('Help Guide for a specified Script')
    .addStringOption(o =>
      o.setName('script')
        .setDescription('Choose the Script you want to get the Help Guide from')
        .setRequired(true)
        .addChoices(
          { name: 'Documentation',        value: 'documentation' },
          { name: 'Dependency: msk_core', value: 'msk_core_dependency' },
          { name: 'change_notification',  value: 'change_notification' },
          { name: 'msk_garage',           value: 'garage' },
          { name: 'msk_handcuffs',        value: 'handcuffs' },
        )
    ),

  async execute(interaction) {
    const key   = interaction.options.getString('script');
    const guide = GUIDES[key];
    if (!guide) return interaction.reply({ content: '❌ No guide found for this script.', flags: MessageFlags.Ephemeral });

    const embed = makeEmbed({ title: guide.title, description: guide.description, guildName: interaction.guild.name });
    const row   = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Tebex').setStyle(ButtonStyle.Link).setURL('https://www.msk-scripts.de/'),
      new ButtonBuilder().setLabel('Documentation').setStyle(ButtonStyle.Link).setURL('https://docu.msk-scripts.de/'),
      new ButtonBuilder().setLabel('Github').setStyle(ButtonStyle.Link).setURL('https://github.com/MSK-Scripts'),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
