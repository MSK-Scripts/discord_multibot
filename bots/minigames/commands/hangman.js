const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

const WORDS = [
  'python','discord','server','keyboard','monitor','internet','database','network','algorithm',
  'variable','function','library','chocolate','elephant','umbrella','hospital','calendar','mountain',
  'adventure','butterfly','computer','language','birthday','football','treasure','universe',
  'apartment','carnival','dinosaur','firework','geography','hamburger','iceberg','jellyfish',
  'kangaroo','labyrinth','marathon','newspaper','orchestra','passport','question','rainbow',
  'sandwich','telephone','vacation','waterfall','xylophone','yesterday','zeppelin',
];

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

function buildEmbed(game, result = '', char = '', ptsDelta = 0, total = 0) {
  const stage = STAGES[Math.min(game.wrong, MAX_WRONG)];
  const displayWord = game.word.split('').map(c => game.guessed.has(c) ? c : '\\_').join(' ');
  const wrongLetters = [...game.guessed].filter(c => !game.word.includes(c)).sort().join(', ') || '—';

  let title, color, footer;
  if (result === 'won') {
    [title, color, footer] = ['🏆 You won!', 0x57F287, `The word was: ${game.word.toUpperCase()}  •  ${pointsFooter(ptsDelta, total)}`];
  } else if (result === 'lost') {
    [title, color, footer] = ['💀 Game Over!', 0xED4245, `The word was: ${game.word.toUpperCase()}  •  ${pointsFooter(ptsDelta, total)}`];
  } else if (result === 'correct') {
    [title, color, footer] = [`✅ '${char.toUpperCase()}' is in the word!`, 0x57F287, `Wrong guesses: ${game.wrong}/${MAX_WRONG}`];
  } else if (result === 'wrong') {
    [title, color, footer] = [`❌ '${char.toUpperCase()}' is not in the word!`, 0xED4245, `Wrong guesses: ${game.wrong}/${MAX_WRONG}`];
  } else {
    [title, color, footer] = ['🎯 Hangman', 0x5865F2, `Wrong guesses: ${game.wrong}/${MAX_WRONG}`];
  }

  return new EmbedBuilder()
    .setTitle(title).setColor(color)
    .addFields(
      { name: 'Gallows',       value: stage,               inline: true },
      { name: 'Word',          value: `\`${displayWord}\``, inline: false },
      { name: 'Wrong Letters', value: wrongLetters,         inline: true },
    )
    .setFooter({ text: `${footer}  •  /hangman to play again` });
}

module.exports = {
  data: new SlashCommandBuilder().setName('hangman').setDescription('Play a game of Hangman!'),

  async execute(interaction) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const game = { word, guessed: new Set(), wrong: 0 };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hm_guess').setLabel('🔤 Guess Letter').setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [buildEmbed(game)], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 180_000,
    });

    collector.on('collect', async i => {
      // Show modal
      const modal = new ModalBuilder().setCustomId(`hm_modal_${Date.now()}`).setTitle('Guess a Letter');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('letter').setLabel('Enter a single letter').setPlaceholder('e.g. A').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(1).setRequired(true)
        )
      );
      await i.showModal(modal);

      const submitted = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
      if (!submitted) return;

      const char = submitted.fields.getTextInputValue('letter').trim().toLowerCase();
      if (!/^[a-z]$/.test(char)) {
        await submitted.reply({ content: '❌ Please enter a valid letter (A–Z).', flags: MessageFlags.Ephemeral });
        return;
      }

      if (game.guessed.has(char)) {
        await submitted.reply({ content: `⚠️ You already guessed **${char.toUpperCase()}**!`, flags: MessageFlags.Ephemeral });
        return;
      }

      game.guessed.add(char);
      let result;
      if (char in Object.fromEntries([...game.word].map(c => [c, true])) || game.word.includes(char)) {
        result = [...game.word].every(c => game.guessed.has(c)) ? 'won' : 'correct';
      } else {
        game.wrong++;
        result = game.wrong >= MAX_WRONG ? 'lost' : 'wrong';
      }

      let ptsDelta = 0, oldPts = 0, newPts = 0;
      if (result === 'won' || result === 'lost') {
        ptsDelta = getPts('hangman', result === 'won' ? 'win' : 'lose');
        const pts = addPoints(interaction.user.id, ptsDelta);
        oldPts = pts.old; newPts = pts.new;
        row.components[0].setDisabled(true);
        collector.stop();
      }

      await submitted.update({ embeds: [buildEmbed(game, result, char, ptsDelta, newPts)], components: [row] });
      if (result === 'won' || result === 'lost') await notifyRewards(submitted, oldPts, newPts);
    });

    collector.on('end', () => {
      row.components[0].setDisabled(true);
      interaction.editReply({ components: [row] }).catch(() => {});
    });
  },
};
