const {
  SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter, gameColor } = require('../../../core/gameKit');
const { addPoints, pointsFor, notifyRewards } = require('../../../core/pointsManager');
const { t, tList } = require('../../../core/i18n');

// The gallows. Drawing, not wording: it is the same picture in every language,
// and the number of stages is what MAX_WRONG is derived from.
const STAGES = [
  '```\n  ___\n |   |\n |\n |\n |\n |\n_|_\n```',
  '```\n  ___\n |   |\n |   O\n |\n |\n |\n_|_\n```',
  '```\n  ___\n |   |\n |   O\n |   |\n |\n |\n_|_\n```',
  '```\n  ___\n |   |\n |   O\n |  /|\n |\n |\n_|_\n```',
  '```\n  ___\n |   |\n |   O\n |  /|\\\n |\n |\n_|_\n```',
  '```\n  ___\n |   |\n |   O\n |  /|\\\n |  /\n |\n_|_\n```',
  '```\n  ___\n |   |\n |   O\n |  /|\\\n |  / \\\n |\n_|_\n```',
];

const MAX_WRONG = STAGES.length - 1;
const FALLBACK_WORD = 'discord';

/**
 * The word list lives in the catalogue, not in the config: it is language, and
 * a German server needs German words. Only letters a-z are kept, because that
 * is what the guess input accepts — a word with an umlaut in it could never be
 * solved.
 */
function pickWord() {
  const words = tList('games.hangman.words').filter(w => /^[a-z]{3,}$/.test(w));
  return words.length ? words[Math.floor(Math.random() * words.length)] : FALLBACK_WORD;
}

function buildEmbed(game, result = '', char = '') {
  const stage = STAGES[Math.min(game.wrong, MAX_WRONG)];
  const displayWord = game.word.split('').map(c => (game.guessed.has(c) ? c : '\\_')).join(' ');
  const wrongLetters = [...game.guessed].filter(c => !game.word.includes(c)).sort().join(', ') || '—';

  let title, color, lead;
  if (result === 'won') {
    title = t('games.hangman.wonTitle');
    color = gameColor('win');
    lead = t('games.hangman.solution', { word: game.word.toUpperCase() });
  } else if (result === 'lost') {
    title = t('games.hangman.lostTitle');
    color = gameColor('lose');
    lead = t('games.hangman.solution', { word: game.word.toUpperCase() });
  } else if (result === 'correct') {
    title = t('games.hangman.correctTitle', { letter: char.toUpperCase() });
    color = gameColor('win');
    lead = t('games.hangman.wrongCount', { wrong: game.wrong, max: MAX_WRONG });
  } else if (result === 'wrong') {
    title = t('games.hangman.wrongTitle', { letter: char.toUpperCase() });
    color = gameColor('lose');
    lead = t('games.hangman.wrongCount', { wrong: game.wrong, max: MAX_WRONG });
  } else {
    title = t('games.hangman.title');
    color = gameColor('neutral');
    lead = t('games.hangman.wrongCount', { wrong: game.wrong, max: MAX_WRONG });
  }

  const footer = `${lead}  •  ${gameFooter('hangman', { delta: game.delta, total: game.total })}`;

  return new EmbedBuilder()
    .setTitle(title).setColor(color)
    .addFields(
      { name: t('games.hangman.gallows'),      value: stage,                inline: true },
      { name: t('games.hangman.word'),         value: `\`${displayWord}\``, inline: false },
      { name: t('games.hangman.wrongLetters'), value: wrongLetters,         inline: true },
    )
    .setFooter({ text: footer });
}

module.exports = {
  key: 'hangman',
  game: 'hangman',
  data: applyMeta(new SlashCommandBuilder(), 'hangman'),

  async execute(interaction) {
    const game = { word: pickWord(), guessed: new Set(), wrong: 0, delta: 0, total: 0 };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hm_guess').setLabel(t('games.hangman.button')).setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [buildEmbed(game)], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 180_000,
    });

    collector.on('collect', async i => {
      const modal = new ModalBuilder().setCustomId(`hm_modal_${Date.now()}`).setTitle(t('games.hangman.modalTitle'));
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('letter')
            .setLabel(t('games.hangman.modalLabel'))
            .setPlaceholder(t('games.hangman.modalPlaceholder'))
            .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(1).setRequired(true),
        ),
      );
      await i.showModal(modal);

      const submitted = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
      if (!submitted) return;

      const char = submitted.fields.getTextInputValue('letter').trim().toLowerCase();
      if (!/^[a-z]$/.test(char)) {
        return submitted.reply({ content: t('games.hangman.invalidLetter'), flags: MessageFlags.Ephemeral });
      }
      if (game.guessed.has(char)) {
        return submitted.reply({
          content: t('games.hangman.alreadyGuessed', { letter: char.toUpperCase() }),
          flags: MessageFlags.Ephemeral,
        });
      }

      game.guessed.add(char);
      let result;
      if (game.word.includes(char)) {
        result = [...game.word].every(c => game.guessed.has(c)) ? 'won' : 'correct';
      } else {
        game.wrong += 1;
        result = game.wrong >= MAX_WRONG ? 'lost' : 'wrong';
      }

      let oldPts = 0;
      if (result === 'won' || result === 'lost') {
        game.delta = pointsFor(interaction, 'hangman', result === 'won' ? 'win' : 'lose');
        const pts = await addPoints(interaction.user.id, game.delta);
        oldPts = pts.old;
        game.total = pts.new;
        row.components[0].setDisabled(true);
        collector.stop();
      }

      await submitted.update({ embeds: [buildEmbed(game, result, char)], components: [row] });
      if (result === 'won' || result === 'lost') await notifyRewards(submitted, oldPts, game.total);
    });

    collector.on('end', () => {
      row.components[0].setDisabled(true);
      interaction.editReply({ components: [row] }).catch(() => {});
    });
  },
};
