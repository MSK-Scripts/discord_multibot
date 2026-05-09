const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getConfig, getPoints } = require('../../../core/pointsManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('points')
    .setDescription('Show your current points and reward progress!'),

  async execute(interaction) {
    const userId  = interaction.user.id;
    const current = getPoints(userId);
    const rewards = [...(getConfig().rewards ?? [])].sort((a, b) => a.points - b.points);

    let nextReward = null;
    const lines = rewards.map(r => {
      if (current >= r.points) return `${r.description}  ✅  \`${r.points.toLocaleString()} pts\``;
      const rem = r.points - current;
      if (!nextReward) nextReward = r;
      return `${r.description}  🔒  \`${r.points.toLocaleString()} pts\` — **${rem.toLocaleString()} to go!**`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`🪙 Points – ${interaction.user.displayName}`)
      .setColor(0xFEE75C)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: 'Current Points', value: `**${current.toLocaleString()} 🪙**`, inline: false },
        { name: 'Rewards', value: lines.join('\n') || '*No rewards configured yet.*', inline: false },
      );

    if (nextReward) {
      const BAR = 20;
      const filled = Math.min(Math.floor((current / nextReward.points) * BAR), BAR);
      const bar    = '█'.repeat(filled) + '░'.repeat(BAR - filled);
      embed.addFields({
        name:  `Progress to ${nextReward.description}`,
        value: `\`${bar}\` ${current.toLocaleString()} / ${nextReward.points.toLocaleString()}`,
        inline: false,
      });
    } else {
      embed.addFields({ name: '🏆 Status', value: 'You have unlocked all rewards!', inline: false });
    }

    embed.setFooter({ text: 'Earn points by playing minigames! (8ball excluded)' });
    await interaction.reply({ embeds: [embed] });
  },
};
