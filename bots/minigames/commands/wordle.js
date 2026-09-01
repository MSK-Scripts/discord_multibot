const {
  SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter, gameColor } = require('../../../core/gameKit');
const { addPoints, getPts, notifyRewards } = require('../../../core/pointsManager');
const { t, tList } = require('../../../core/i18n');

const MAX_TRIES = 6;
const LENGTH = 5;
const FALLBACK_WORD = 'crane';

/**
 * The word list lives in the catalogue: it is language, not configuration. Only
 * five plain letters count, because that is what the guess field accepts.
 */
function words() {
  return tList('games.wordle.words').filter(w => new RegExp(`^[a-z]{${LENGTH}}$`).test(w));
}

function evaluate(guess, target) {
  const result = Array(LENGTH).fill('⬛');
  const remaining = [...target];

  // Greens first, and the matched letter is struck out of `remaining`, so a
  // doubled letter in the guess cannot claim the same letter twice.
  for (let i = 0; i < LENGTH; i++) {
    if (guess[i] === target[i]) { result[i] = '🟩'; remaining[i] = null; }
  }
  for (let i = 0; i < LENGTH; i++) {
    if (result[i] === '🟩') continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) { result[i] = '🟨'; remaining[idx] = null; }
  }
  return result;
}

function buildEmbed(guesses, word, { won = false, lost = false, delta = 0, total = 0 } = {}) {
  const blank = '⬛'.repeat(LENGTH) + '\n`' + Array(LENGTH).fill('_').join(' ') + '`';
  const rows = [
    ...guesses.map(([g, fb]) => `${fb.join('')}\n\`${g.toUpperCase().split('').join('  ')}\``),
    ...Array(Math.max(0, MAX_TRIES - guesses.length)).fill(blank),
  ];
  const board = rows.join('\n\n');

  let title, color, description;
  if (won) {
    title = t('games.wordle.wonTitle', { tries: guesses.length, max: MAX_TRIES });
    color = gameColor('win');
    description = `${board}\n\n${t('games.wordle.wonBody', { word: word.toUpperCase() })}`;
  } else if (lost) {
    title = t('games.wordle.lostTitle');
    color = gameColor('lose');
    description = `${board}\n\n${t('games.wordle.lostBody', { word: word.toUpperCase() })}`;
  } else {
    title = t('games.wordle.title', { tries: guesses.length, max: MAX_TRIES });
    color = gameColor('neutral');
    description = `${board}\n\n${t('games.wordle.legend')}`;
  }

  return new EmbedBuilder()
    .setTitle(title).setDescription(description).setColor(color)
    .setFooter({ text: gameFooter('wordle', { delta, total }) });
}

module.exports = {
  key: 'wordle',
  game: 'wordle',
  data: applyMeta(new SlashCommandBuilder(), 'wordle'),

  async execute(interaction) {
    const list = words();
    const word = list.length ? list[Math.floor(Math.random() * list.length)] : FALLBACK_WORD;
    const guesses = [];
    let gameOver = false;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wordle_guess').setLabel(t('games.wordle.button')).setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [buildEmbed(guesses, word)], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300_000,
    });

    collector.on('collect', async i => {
      if (gameOver) { await i.deferUpdate(); return; }

      const modal = new ModalBuilder().setCustomId(`wordle_modal_${Date.now()}`).setTitle(t('games.wordle.modalTitle'));
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('guess')
            .setLabel(t('games.wordle.modalLabel'))
            .setPlaceholder(t('games.wordle.modalPlaceholder'))
            .setStyle(TextInputStyle.Short).setMinLength(LENGTH).setMaxLength(LENGTH).setRequired(true),
        ),
      );
      await i.showModal(modal);

      const submitted = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
      if (!submitted) return;

      const guess = submitted.fields.getTextInputValue('guess').trim().toLowerCase();
      if (!new RegExp(`^[a-z]{${LENGTH}}$`).test(guess)) {
        return submitted.reply({ content: t('games.wordle.invalid'), flags: MessageFlags.Ephemeral });
      }

      const feedback = evaluate(guess, word);
      guesses.push([guess, feedback]);

      const won = feedback.every(f => f === '🟩');
      const lost = guesses.length >= MAX_TRIES && !won;
      let delta = 0, oldPts = 0, newPts = 0;

      if (won || lost) {
        gameOver = true;
        delta = getPts('wordle', won ? `${guesses.length}_try` : 'lose');
        const pts = await addPoints(interaction.user.id, delta);
        oldPts = pts.old; newPts = pts.new;
        row.components[0].setDisabled(true);
        collector.stop();
      }

      await submitted.update({
        embeds: [buildEmbed(guesses, word, { won, lost, delta, total: newPts })],
        components: [row],
      });
      if (won || lost) await notifyRewards(submitted, oldPts, newPts);
    });

    collector.on('end', () => {
      if (!gameOver) {
        row.components[0].setDisabled(true);
        interaction.editReply({ components: [row] }).catch(() => {});
      }
    });
  },
};
