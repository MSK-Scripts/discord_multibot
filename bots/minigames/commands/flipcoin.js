const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { makeEmbed }                        = require('../../../core/utils');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('flipcoin')
    .setDescription('Flip a coin – Heads or Tails?'),

  async execute(interaction) {
    const embed = makeEmbed({
      title:       '🪙 Flip a Coin',
      description: `${interaction.user}, choose your side!`,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('flip_heads').setLabel('🪙 Heads').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('flip_tails').setLabel('🔙 Tails').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000, max: 1,
    });

    collector.on('collect', async i => {
      const choice = i.customId === 'flip_heads' ? 'heads' : 'tails';
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const won    = choice === result;

      const pts_delta = getPts('flipcoin', won ? 'win' : 'lose');
      const { old: oldPts, new: newPts } = addPoints(interaction.user.id, pts_delta);

      for (const btn of row.components) btn.setDisabled(true);

      const resultEmbed = makeEmbed({
        title:       '🪙 Flip a Coin',
        description: `You chose: **${choice.charAt(0).toUpperCase() + choice.slice(1)}**\nResult:    **${result.charAt(0).toUpperCase() + result.slice(1)}**\n\n${won ? 'You won! 🎉' : 'You lost. 😔'}`,
        footerText:  `Flip a Coin  •  ${pointsFooter(pts_delta, newPts)}`,
      });

      await i.update({ embeds: [resultEmbed], components: [row] });
      await notifyRewards(i, oldPts, newPts);
    });

    collector.on('end', (collected) => {
      if (!collected.size) {
        for (const btn of row.components) btn.setDisabled(true);
        interaction.editReply({ components: [row] }).catch(() => {});
      }
    });
  },
};
