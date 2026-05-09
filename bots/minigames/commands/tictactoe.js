const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

const EMPTY  = '';
const PLAYER = 'X';
const BOT    = 'O';

const WINNING_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

const CELL_EMOJIS = { [PLAYER]: '❌', [BOT]: '⭕', [EMPTY]: '⬜' };
const DIFF_LABELS  = { easy: '🟢 Easy', medium: '🟡 Medium', hard: '🔴 Hard' };

function checkWinner(board) {
  for (const [a, b, c] of WINNING_COMBOS) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

function isDraw(board) { return board.every(c => c !== EMPTY) && !checkWinner(board); }
function available(board) { return board.map((c, i) => c === EMPTY ? i : -1).filter(i => i !== -1); }

function aiEasy(board) { const m = available(board); return m[Math.floor(Math.random() * m.length)]; }

function winningMove(board, sym) {
  for (const move of available(board)) {
    board[move] = sym;
    const won = checkWinner(board) === sym;
    board[move] = EMPTY;
    if (won) return move;
  }
  return null;
}

function aiMedium(board) {
  let m;
  if ((m = winningMove(board, BOT))    !== null) return m;
  if ((m = winningMove(board, PLAYER)) !== null && Math.random() > 0.25) return m;
  if (Math.random() < 0.4) return aiEasy(board);
  for (const pos of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
    if (board[pos] === EMPTY) return pos;
  }
  return aiEasy(board);
}

function minimax(board, maximizing, depth = 0) {
  const w = checkWinner(board);
  if (w === BOT)    return 10 - depth;
  if (w === PLAYER) return depth - 10;
  if (isDraw(board)) return 0;
  if (maximizing) {
    let best = -100;
    for (const move of available(board)) {
      board[move] = BOT;
      best = Math.max(best, minimax(board, false, depth + 1));
      board[move] = EMPTY;
    }
    return best;
  } else {
    let best = 100;
    for (const move of available(board)) {
      board[move] = PLAYER;
      best = Math.min(best, minimax(board, true, depth + 1));
      board[move] = EMPTY;
    }
    return best;
  }
}

function aiHard(board) {
  let bestScore = -100, bestMove = -1;
  for (const move of available(board)) {
    board[move] = BOT;
    const score = minimax(board, false);
    board[move] = EMPTY;
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }
  return bestMove;
}

function buildBoard(board, difficulty, gameOver) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i    = r * 3 + c;
      const cell = board[i];
      const style = cell === PLAYER ? ButtonStyle.Danger
                  : cell === BOT    ? ButtonStyle.Primary
                  : ButtonStyle.Secondary;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_cell_${i}`)
          .setLabel(CELL_EMOJIS[cell])
          .setStyle(style)
          .setDisabled(gameOver || cell !== EMPTY)
      );
    }
    rows.push(row);
  }
  return rows;
}

function buildEmbed(player, difficulty, result = null, ptsDelta = 0, total = 0) {
  const diff   = DIFF_LABELS[difficulty];
  let footer   = 'TicTacToe  •  /tictactoe to play again';
  if (result !== null) footer += `  •  ${pointsFooter(ptsDelta, total)}`;

  let title, desc, color;
  if (result === null) {
    title = '🎮 TicTacToe';
    desc  = `Player: ${player} ❌ vs ⭕ Bot\nDifficulty: ${diff}\n\nYour turn!`;
    color = 0x5865F2;
  } else if (result === PLAYER) {
    title = '🏆 You won!';
    desc  = `Well played, ${player}! ❌\nDifficulty: ${diff}`;
    color = 0x57F287;
  } else if (result === BOT) {
    title = '🤖 Bot wins!';
    desc  = `Better luck next time, ${player}.\nDifficulty: ${diff}`;
    color = 0xED4245;
  } else {
    title = '🤝 Draw!';
    desc  = `No winner this time, ${player}.\nDifficulty: ${diff}`;
    color = 0xFEE75C;
  }
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setFooter({ text: footer });
}

module.exports = {
  data: new SlashCommandBuilder().setName('tictactoe').setDescription('Play TicTacToe against the bot!'),

  async execute(interaction) {
    const diffRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ttt_diff_easy').setLabel('🟢 Easy').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ttt_diff_medium').setLabel('🟡 Medium').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ttt_diff_hard').setLabel('🔴 Hard').setStyle(ButtonStyle.Danger),
    );

    const startEmbed = new EmbedBuilder()
      .setTitle('🎮 TicTacToe – Choose Difficulty')
      .setDescription(`Hello ${interaction.user}! You play as ❌.\n\nChoose a difficulty:`)
      .setColor(0x5865F2);

    await interaction.reply({ embeds: [startEmbed], components: [diffRow] });
    const reply = await interaction.fetchReply();

    const diffCollector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId.startsWith('ttt_diff_'),
      time: 60_000, max: 1,
    });

    diffCollector.on('collect', async diffInter => {
      const difficulty = diffInter.customId.replace('ttt_diff_', '');
      const board = Array(9).fill(EMPTY);
      let gameOver = false;

      await diffInter.update({
        embeds: [buildEmbed(interaction.user, difficulty)],
        components: buildBoard(board, difficulty, false),
      });

      const gameCollector = reply.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId.startsWith('ttt_cell_'),
        time: 120_000,
      });

      gameCollector.on('collect', async i => {
        if (gameOver) { await i.deferUpdate(); return; }

        const idx = parseInt(i.customId.replace('ttt_cell_', ''));
        if (board[idx] !== EMPTY) { await i.deferUpdate(); return; }

        board[idx] = PLAYER;
        let result = checkWinner(board) ? PLAYER : isDraw(board) ? 'draw' : null;

        if (result === null) {
          const aiMove = difficulty === 'easy' ? aiEasy(board) : difficulty === 'medium' ? aiMedium(board) : aiHard(board);
          board[aiMove] = BOT;
          result = checkWinner(board) ? BOT : isDraw(board) ? 'draw' : null;
        }

        if (result !== null) {
          gameOver = true;
          gameCollector.stop();
        }

        let ptsDelta = 0, oldPts = 0, newPts = 0;
        if (result !== null) {
          const outcome = result === PLAYER ? 'win' : result === BOT ? 'lose' : 'draw';
          ptsDelta = getPts('tictactoe', difficulty, outcome);
          const pts = addPoints(interaction.user.id, ptsDelta);
          oldPts = pts.old; newPts = pts.new;
        }

        await i.update({
          embeds: [buildEmbed(interaction.user, difficulty, result, ptsDelta, newPts)],
          components: buildBoard(board, difficulty, gameOver),
        });

        if (result !== null) await notifyRewards(i, oldPts, newPts);
      });

      gameCollector.on('end', () => {
        if (!gameOver) {
          interaction.editReply({ components: buildBoard(board, difficulty, true) }).catch(() => {});
        }
      });
    });

    diffCollector.on('end', (collected) => {
      if (!collected.size) {
        for (const btn of diffRow.components) btn.setDisabled(true);
        interaction.editReply({ components: [diffRow] }).catch(() => {});
      }
    });
  },
};
