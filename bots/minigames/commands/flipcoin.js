const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { makeEmbed } = require('../../../core/utils');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter } = require('../../../core/gameKit');
const { addPoints, getPts, notifyRewards } = require('../../../core/pointsManager');
const { t } = require('../../../core/i18n');

module.exports = {
  key: 'flipcoin',
  game: 'flipcoin',
  data: applyMeta(new SlashCommandBuilder(), 'flipcoin'),

  async execute(interaction) {
    const embed = makeEmbed({
      title:       t('games.flipcoin.title'),
      description: t('games.flipcoin.choose', { user: String(interaction.user) }),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('flip_heads').setLabel(t('games.flipcoin.headsButton')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('flip_tails').setLabel(t('games.flipcoin.tailsButton')).setStyle(ButtonStyle.Secondary),
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
      const won = choice === result;

      const delta = getPts('flipcoin', won ? 'win' : 'lose');
      const { old: oldPts, new: newPts } = await addPoints(interaction.user.id, delta);

      for (const btn of row.components) btn.setDisabled(true);

      const resultEmbed = makeEmbed({
        title: t('games.flipcoin.title'),
        description: t('games.flipcoin.result', {
          choice:  t(`games.flipcoin.${choice}`),
          result:  t(`games.flipcoin.${result}`),
          outcome: won ? t('games.flipcoin.won') : t('games.flipcoin.lost'),
        }),
        footerText: gameFooter('flipcoin', { delta, total: newPts }),
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
