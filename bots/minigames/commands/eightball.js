const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { applyMeta, optionText } = require('../../../core/commandKit');
const { gameColor } = require('../../../core/gameKit');
const { t, tList } = require('../../../core/i18n');

/**
 * The answers are three lists in the catalogue, so they can be translated and
 * rewritten. Which list an answer came from decides the colour, which is why
 * they stay three lists rather than one.
 */
const CATEGORIES = [
  { key: 'positive', color: 'win' },
  { key: 'neutral',  color: 'draw' },
  { key: 'negative', color: 'lose' },
];

module.exports = {
  key: '8ball',
  game: 'eightball',
  data: applyMeta(new SlashCommandBuilder(), '8ball')
    .addStringOption(o => o.setName('question').setDescription(optionText('8ball', 'question')).setRequired(true)),

  async execute(interaction) {
    // Weighted by how many answers each list has, which is what the original
    // did by concatenating them. An emptied list simply never comes up.
    const pool = CATEGORIES.flatMap(c => tList(`games.eightball.${c.key}`).map(text => ({ text, color: c.color })));
    if (!pool.length) {
      return interaction.reply({ content: t('common.featureDisabled'), flags: MessageFlags.Ephemeral });
    }

    const answer = pool[Math.floor(Math.random() * pool.length)];
    const question = interaction.options.getString('question');

    const embed = new EmbedBuilder()
      .setColor(gameColor(answer.color))
      .setAuthor({ name: t('games.eightball.author') })
      .addFields(
        { name: t('games.eightball.question'), value: question, inline: false },
        { name: t('games.eightball.answer'),   value: `*${answer.text}*`, inline: false },
      )
      .setFooter({ text: t('games.eightball.askedBy', { name: interaction.user.displayName }) });

    await interaction.reply({ embeds: [embed] });
  },
};
