const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter, gameColor } = require('../../../core/gameKit');
const { addPoints, getPts, notifyRewards } = require('../../../core/pointsManager');
const { t } = require('../../../core/i18n');

// The rules of the game, not wording: `beats` is what decides the outcome, and
// the emoji is the same in every language. The NAMES are in the catalogue.
const CHOICES = {
  rock:     { emoji: '🪨', beats: 'scissors' },
  paper:    { emoji: '📄', beats: 'rock' },
  scissors: { emoji: '✂️', beats: 'paper' },
};

function outcomeOf(player, bot) {
  if (player === bot) return 'draw';
  return CHOICES[player].beats === bot ? 'win' : 'lose';
}

module.exports = {
  key: 'rps',
  game: 'rps',
  data: applyMeta(new SlashCommandBuilder(), 'rps'),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      ...Object.entries(CHOICES).map(([key, { emoji }]) =>
        new ButtonBuilder()
          .setCustomId(`rps_${key}`)
          .setLabel(`${emoji} ${t(`games.rps.${key}`)}`)
          .setStyle(ButtonStyle.Primary)),
    );

    const embed = new EmbedBuilder()
      .setTitle(t('games.rps.title'))
      .setDescription(t('games.rps.choose', { user: String(interaction.user) }))
      .setColor(gameColor('neutral'));

    await interaction.reply({ embeds: [embed], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000, max: 1,
    });

    collector.on('collect', async i => {
      const choice = i.customId.replace('rps_', '');
      const botChoice = Object.keys(CHOICES)[Math.floor(Math.random() * 3)];
      const outcome = outcomeOf(choice, botChoice);

      const vars = {
        player:      t(`games.rps.${choice}`),
        playerEmoji: CHOICES[choice].emoji,
        bot:         t(`games.rps.${botChoice}`),
        botEmoji:    CHOICES[botChoice].emoji,
      };
      const title = t(`games.rps.${outcome}Title`);
      const body  = t(`games.rps.${outcome}Body`, vars);
      const color = gameColor(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');

      const delta = getPts('rps', outcome);
      const { old: oldPts, new: newPts } = await addPoints(interaction.user.id, delta);

      for (const btn of row.components) btn.setDisabled(true);

      const resultEmbed = new EmbedBuilder()
        .setTitle(title).setDescription(body).setColor(color)
        .setFooter({ text: gameFooter('rps', { delta, total: newPts }) });

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
