const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter, gameColor } = require('../../../core/gameKit');
const { addPoints, getPts, notifyRewards } = require('../../../core/pointsManager');
const { t } = require('../../../core/i18n');

// The reel. Weights, not wording: how often a symbol shows up is the game's
// maths, and changing it changes what a spin is worth.
const SYMBOLS_WEIGHTED = [
  ...Array(30).fill('🍒'),
  ...Array(25).fill('🍋'),
  ...Array(20).fill('🍊'),
  ...Array(15).fill('🍇'),
  ...Array(6).fill('⭐'),
  ...Array(3).fill('💎'),
  ...Array(1).fill('7️⃣'),
];

const spin = () => Array.from({ length: 3 }, () => SYMBOLS_WEIGHTED[Math.floor(Math.random() * SYMBOLS_WEIGHTED.length)]);

function evaluate(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === '7️⃣') return { mult: 50, key: 'jackpot' };
    if (a === '💎') return { mult: 20, key: 'mega_win' };
    if (a === '⭐') return { mult: 10, key: 'big_win' };
    return { mult: 5, key: 'win' };
  }
  if (a === b || b === c || a === c) return { mult: 2, key: 'small_win' };
  return { mult: 0, key: 'no_match' };
}

function buildEmbed(reels, resultText, color, delta = 0, total = 0) {
  return new EmbedBuilder()
    .setTitle(t('games.slots.title'))
    .setDescription(`## ${reels.join('  |  ')}\n\n${resultText}`)
    .setColor(color)
    .setFooter({ text: gameFooter('slots', { delta, total }) });
}

module.exports = {
  key: 'slots',
  game: 'slots',
  data: applyMeta(new SlashCommandBuilder(), 'slots'),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slots_spin').setLabel(t('games.slots.spinButton')).setStyle(ButtonStyle.Success),
    );

    await interaction.reply({
      embeds: [buildEmbed(['🎰', '🎰', '🎰'], t('games.slots.start'), gameColor('neutral'))],
      components: [row],
    });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
    });

    let spinning = false;

    collector.on('collect', async i => {
      if (spinning) { await i.deferUpdate(); return; }
      spinning = true;
      row.components[0].setDisabled(true).setLabel(t('games.slots.spinningButton'));
      await i.update({
        embeds: [buildEmbed(['❓', '❓', '❓'], t('games.slots.spinning'), gameColor('draw'))],
        components: [row],
      });

      // Animation frames. Purely cosmetic: the result is drawn afterwards.
      for (let f = 0; f < 4; f++) {
        await new Promise(r => setTimeout(r, 550));
        await interaction.editReply({
          embeds: [buildEmbed(spin(), t('games.slots.spinning'), gameColor('draw'))],
        }).catch(() => {});
      }

      await new Promise(r => setTimeout(r, 550));
      const finalReels = spin();
      // Evaluated ONCE. It used to be called twice, so the multiplier used for
      // the colour came from a second evaluation of the same reels.
      const { key, mult } = evaluate(finalReels);
      const text = t(`games.slots.outcomes.${key}`, { symbols: finalReels.join('') });

      const delta = getPts('slots', key);
      const { old: oldPts, new: newPts } = await addPoints(interaction.user.id, delta);
      const color = gameColor(mult >= 20 ? 'draw' : mult > 0 ? 'win' : 'lose');

      row.components[0].setDisabled(false).setLabel(t('games.slots.spinAgain'));
      spinning = false;

      await interaction.editReply({
        embeds: [buildEmbed(finalReels, text, color, delta, newPts)],
        components: [row],
      }).catch(() => {});
      await notifyRewards(i, oldPts, newPts);
    });

    collector.on('end', () => {
      row.components[0].setDisabled(true);
      interaction.editReply({ components: [row] }).catch(() => {});
    });
  },
};
