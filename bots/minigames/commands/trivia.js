const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

const API_URL = 'https://opentdb.com/api.php?amount=1&type=multiple&encode=base64';

const DIFF_COLORS = { easy: 0x57F287, medium: 0xFEE75C, hard: 0xED4245 };
const LABELS = ['🇦', '🇧', '🇨', '🇩'];

const LOCAL_QUESTIONS = [
  { category: 'Science',      difficulty: 'easy',   question: 'What is the chemical symbol for water?',           correct_answer: 'H₂O',         incorrect_answers: ['O₂','CO₂','H₂'] },
  { category: 'Science',      difficulty: 'easy',   question: 'How many planets are in our solar system?',        correct_answer: '8',            incorrect_answers: ['7','9','10'] },
  { category: 'Science',      difficulty: 'medium', question: 'What is the speed of light (approx.) in km/s?',   correct_answer: '300,000',      incorrect_answers: ['150,000','450,000','1,000,000'] },
  { category: 'Science',      difficulty: 'medium', question: 'What gas do plants absorb from the atmosphere?',  correct_answer: 'Carbon dioxide',incorrect_answers: ['Oxygen','Nitrogen','Hydrogen'] },
  { category: 'Science',      difficulty: 'hard',   question: 'What is the atomic number of gold?',              correct_answer: '79',            incorrect_answers: ['47','82','78'] },
  { category: 'Science',      difficulty: 'hard',   question: 'What is the powerhouse of the cell?',            correct_answer: 'Mitochondria', incorrect_answers: ['Nucleus','Ribosome','Golgi apparatus'] },
  { category: 'Geography',    difficulty: 'easy',   question: 'What is the capital of France?',                 correct_answer: 'Paris',        incorrect_answers: ['London','Berlin','Madrid'] },
  { category: 'Geography',    difficulty: 'easy',   question: 'What is the largest ocean on Earth?',            correct_answer: 'Pacific Ocean',incorrect_answers: ['Atlantic Ocean','Indian Ocean','Arctic Ocean'] },
  { category: 'Geography',    difficulty: 'medium', question: 'Which country has the most natural lakes?',      correct_answer: 'Canada',       incorrect_answers: ['Russia','USA','Finland'] },
  { category: 'Geography',    difficulty: 'hard',   question: 'What is the smallest country in the world?',    correct_answer: 'Vatican City', incorrect_answers: ['Monaco','San Marino','Liechtenstein'] },
  { category: 'History',      difficulty: 'easy',   question: 'In which year did World War II end?',            correct_answer: '1945',         incorrect_answers: ['1943','1944','1946'] },
  { category: 'History',      difficulty: 'easy',   question: 'Who was the first President of the United States?', correct_answer: 'George Washington', incorrect_answers: ['Abraham Lincoln','Thomas Jefferson','John Adams'] },
  { category: 'History',      difficulty: 'medium', question: 'In which year did the Berlin Wall fall?',        correct_answer: '1989',         incorrect_answers: ['1987','1991','1985'] },
  { category: 'Technology',   difficulty: 'easy',   question: "What does 'CPU' stand for?",                    correct_answer: 'Central Processing Unit', incorrect_answers: ['Central Power Unit','Computer Processing Unit','Core Processing Unit'] },
  { category: 'Technology',   difficulty: 'medium', question: 'Which programming language was created by Guido van Rossum?', correct_answer: 'Python', incorrect_answers: ['Java','Ruby','Perl'] },
  { category: 'Mathematics',  difficulty: 'easy',   question: 'What is the value of Pi (to 2 decimal places)?', correct_answer: '3.14',        incorrect_answers: ['3.12','3.16','3.41'] },
  { category: 'Mathematics',  difficulty: 'hard',   question: 'What is the derivative of sin(x)?',             correct_answer: 'cos(x)',       incorrect_answers: ['-cos(x)','tan(x)','-sin(x)'] },
];

function b64(s) { return Buffer.from(s, 'base64').toString('utf8'); }

async function fetchQuestion() {
  try {
    const res  = await fetch(API_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return localQuestion();
    const data = await res.json();
    if (data.response_code !== 0 || !data.results?.length) return localQuestion();
    const q = data.results[0];
    return {
      category:          b64(q.category),
      difficulty:        b64(q.difficulty),
      question:          b64(q.question),
      correct_answer:    b64(q.correct_answer),
      incorrect_answers: q.incorrect_answers.map(b64),
      source: 'api',
    };
  } catch {
    return localQuestion();
  }
}

function localQuestion() {
  const q = LOCAL_QUESTIONS[Math.floor(Math.random() * LOCAL_QUESTIONS.length)];
  return { ...q, source: 'local' };
}

function buildEmbed(question, answers, color, result = '', ptsDelta = 0, total = 0) {
  const diff    = question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1);
  const options = answers.map((a, i) => `${LABELS[i]}  ${a}`).join('\n');
  let footer    = 'Trivia  •  /trivia for a new question';
  if (ptsDelta !== 0) footer += `  •  ${pointsFooter(ptsDelta, total)}`;

  const embed = new EmbedBuilder()
    .setTitle(`🧠 Trivia – ${question.category}`)
    .setDescription(`**${question.question}**\n\n${options}`)
    .setColor(color)
    .addFields({ name: 'Difficulty', value: diff, inline: true })
    .setFooter({ text: footer });

  if (result) embed.addFields({ name: 'Result', value: result, inline: false });
  return embed;
}

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Answer a random multiple-choice trivia question!'),

  async execute(interaction) {
    // Simple 5s cooldown
    const now = Date.now();
    if (cooldowns.has(interaction.user.id) && cooldowns.get(interaction.user.id) > now) {
      const rem = ((cooldowns.get(interaction.user.id) - now) / 1000).toFixed(1);
      return interaction.reply({ content: `⏳ Slow down! Try again in **${rem}s**.`, flags: MessageFlags.Ephemeral });
    }
    cooldowns.set(interaction.user.id, now + 5000);

    await interaction.deferReply();
    const question = await fetchQuestion();

    const answers    = [...question.incorrect_answers, question.correct_answer].sort(() => Math.random() - 0.5);
    const correctIdx = answers.indexOf(question.correct_answer);
    const color      = DIFF_COLORS[question.difficulty] ?? 0x5865F2;

    const buttons = answers.map((a, i) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${i}`)
        .setLabel(`${LABELS[i]}  ${a.slice(0, 75)}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
    );

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
      const chosen  = parseInt(i.customId.split('_')[1]);
      const correct = chosen === correctIdx;
      const diff    = question.difficulty;
      const outcome = correct ? 'win' : 'lose';
      const ptsDelta = getPts('trivia', diff, outcome);
      const { old: oldPts, new: newPts } = addPoints(interaction.user.id, ptsDelta);

      buttons.forEach((btn, idx) => {
        btn.setDisabled(true);
        if (idx === correctIdx)           btn.setStyle(ButtonStyle.Success);
        else if (idx === chosen && !correct) btn.setStyle(ButtonStyle.Danger);
        else                              btn.setStyle(ButtonStyle.Secondary);
      });

      const resultText = correct
        ? '✅ **Correct!** Well done!'
        : `❌ **Wrong!** The correct answer was:\n**${LABELS[correctIdx]}  ${answers[correctIdx]}**`;

      await i.update({
        embeds:     [buildEmbed(question, answers, correct ? 0x57F287 : 0xED4245, resultText, ptsDelta, newPts)],
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
