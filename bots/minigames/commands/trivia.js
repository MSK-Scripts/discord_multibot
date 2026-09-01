const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter, gameColor } = require('../../../core/gameKit');
const { addPoints, getPts, notifyRewards } = require('../../../core/pointsManager');
const { t, tData } = require('../../../core/i18n');
const config = require('../../../core/config');

const API_URL = 'https://opentdb.com/api.php?amount=1&type=multiple&encode=base64';
const LABELS = ['🇦', '🇧', '🇨', '🇩'];
const COOLDOWN_MS = 5000;

const b64 = s => Buffer.from(s, 'base64').toString('utf8');

/**
 * A question from the shipped list.
 *
 * The list lives in the catalogue because a German server needs German
 * questions, and a question list sitting next to the channel ids is one nobody
 * ever translates.
 */
function localQuestion() {
  const list = (tData('games.trivia.localQuestions', []) || [])
    .filter(q => q && q.question && q.correct && Array.isArray(q.wrong) && q.wrong.length);
  if (!list.length) return null;
  const q = list[Math.floor(Math.random() * list.length)];
  return {
    category:   String(q.category ?? ''),
    difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
    question:   String(q.question),
    correct:    String(q.correct),
    wrong:      q.wrong.map(String),
  };
}

/**
 * A question from OpenTDB, falling back to the local list on anything at all.
 *
 * THE API IS ENGLISH ONLY. An installation running in another language should
 * switch it off, or every question arrives in a language the rest of the embed
 * is not in.
 */
async function fetchQuestion() {
  if (config.get('features.minigames.trivia.useApi', true) === false) return localQuestion();
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return localQuestion();
    const data = await res.json();
    if (data.response_code !== 0 || !data.results?.length) return localQuestion();
    const q = data.results[0];
    return {
      category:   b64(q.category),
      difficulty: b64(q.difficulty),
      question:   b64(q.question),
      correct:    b64(q.correct_answer),
      wrong:      q.incorrect_answers.map(b64),
    };
  } catch {
    return localQuestion();
  }
}

function buildEmbed(question, answers, color, result = '', delta = 0, total = 0) {
  const difficulty = question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1);
  const options = answers.map((a, i) => `${LABELS[i]}  ${a}`).join('\n');

  const footer = `${gameFooter('trivia', { delta, total })}`;

  const embed = new EmbedBuilder()
    .setTitle(t('games.trivia.title', { category: question.category }))
    .setDescription(t('games.trivia.body', { question: question.question, options }))
    .setColor(color)
    .addFields({ name: t('games.trivia.difficulty'), value: difficulty, inline: true })
    .setFooter({ text: footer });

  if (result) embed.addFields({ name: t('games.trivia.result'), value: result, inline: false });
  return embed;
}

const cooldowns = new Map();

module.exports = {
  key: 'trivia',
  game: 'trivia',
  data: applyMeta(new SlashCommandBuilder(), 'trivia'),

  async execute(interaction) {
    const now = Date.now();
    const until = cooldowns.get(interaction.user.id) ?? 0;
    if (until > now) {
      return interaction.reply({
        content: t('games.trivia.cooldown', { seconds: ((until - now) / 1000).toFixed(1) }),
        flags: MessageFlags.Ephemeral,
      });
    }
    cooldowns.set(interaction.user.id, now + COOLDOWN_MS);

    await interaction.deferReply();
    const question = await fetchQuestion();
    if (!question) {
      // No API and an empty question list. Saying so beats an empty embed.
      return interaction.editReply({ content: t('common.featureDisabled') });
    }

    const answers = [...question.wrong, question.correct].sort(() => Math.random() - 0.5);
    const correctIdx = answers.indexOf(question.correct);
    const color = gameColor(question.difficulty === 'easy' ? 'win' : question.difficulty === 'hard' ? 'lose' : 'draw');

    const buttons = answers.map((a, i) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${i}`)
        // Discord caps a button label at 80 characters and a long answer from
        // the API would otherwise make the whole row fail to render.
        .setLabel(`${LABELS[i]}  ${a}`.slice(0, 78))
        .setStyle(ButtonStyle.Primary));

    const rows = [
      new ActionRowBuilder().addComponents(...buttons.slice(0, 2)),
      new ActionRowBuilder().addComponents(...buttons.slice(2, 4)),
    ];

    await interaction.editReply({ embeds: [buildEmbed(question, answers, color)], components: rows });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 30_000, max: 1,
    });

    collector.on('collect', async i => {
      const chosen = Number.parseInt(i.customId.split('_')[1], 10);
      const correct = chosen === correctIdx;
      const delta = getPts('trivia', question.difficulty, correct ? 'win' : 'lose');
      const { old: oldPts, new: newPts } = await addPoints(interaction.user.id, delta);

      buttons.forEach((btn, idx) => {
        btn.setDisabled(true);
        if (idx === correctIdx) btn.setStyle(ButtonStyle.Success);
        else if (idx === chosen) btn.setStyle(ButtonStyle.Danger);
        else btn.setStyle(ButtonStyle.Secondary);
      });

      const resultText = correct
        ? t('games.trivia.correct')
        : t('games.trivia.wrong', { answer: `${LABELS[correctIdx]}  ${answers[correctIdx]}` });

      await i.update({
        embeds: [buildEmbed(question, answers, gameColor(correct ? 'win' : 'lose'), resultText, delta, newPts)],
        components: rows,
      });
      await notifyRewards(i, oldPts, newPts);
    });

    collector.on('end', (collected) => {
      if (!collected.size) {
        buttons.forEach((btn, idx) => {
          btn.setDisabled(true);
          if (idx === correctIdx) btn.setStyle(ButtonStyle.Success);
        });
        interaction.editReply({ components: rows }).catch(() => {});
      }
    });
  },
};
