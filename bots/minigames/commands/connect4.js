const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter, gameColor } = require('../../../core/gameKit');
const { addPoints, getPts, notifyRewards } = require('../../../core/pointsManager');
const { t } = require('../../../core/i18n');

const ROWS = 6, COLS = 7;
const EMPTY = 0, PLAYER = 1, BOT = 2;
const P_EMOJI = '🔴', B_EMOJI = '🟡', E_EMOJI = '⬛';
const COL_NUMS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣'];

function newBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY)); }

function drop(board, col, token) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === EMPTY) { board[row][col] = token; return row; }
  }
  return null;
}

function checkWin(board, token) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 3; c++)
      if ([0,1,2,3].every(i => board[r][c+i] === token)) return true;
  for (let r = 0; r < ROWS - 3; r++)
    for (let c = 0; c < COLS; c++)
      if ([0,1,2,3].every(i => board[r+i][c] === token)) return true;
  for (let r = 0; r < ROWS - 3; r++)
    for (let c = 0; c < COLS - 3; c++)
      if ([0,1,2,3].every(i => board[r+i][c+i] === token)) return true;
  for (let r = 0; r < ROWS - 3; r++)
    for (let c = 3; c < COLS; c++)
      if ([0,1,2,3].every(i => board[r+i][c-i] === token)) return true;
  return false;
}

function isDraw(board) { return board[0].every(c => c !== EMPTY); }
function validCols(board) { return Array.from({ length: COLS }, (_, c) => c).filter(c => board[0][c] === EMPTY); }

function botMove(board) {
  const valid = validCols(board);
  const testBoard = board => board.map(r => [...r]);

  for (const col of valid) {
    const b = testBoard(board); drop(b, col, BOT);
    if (checkWin(b, BOT)) return col;
  }
  for (const col of valid) {
    const b = testBoard(board); drop(b, col, PLAYER);
    if (checkWin(b, PLAYER)) return col;
  }
  const center = [3,2,4,1,5,0,6];
  for (const col of center) { if (valid.includes(col)) return col; }
  return valid[Math.floor(Math.random() * valid.length)];
}

function renderBoard(board) {
  const lines = board.map(row =>
    row.map(c => c === PLAYER ? P_EMOJI : c === BOT ? B_EMOJI : E_EMOJI).join('')
  );
  lines.push(COL_NUMS.join(''));
  return lines.join('\n');
}

function buildComponents(board, gameOver) {
  const valid = validCols(board);
  const rows = [];
  for (let group = 0; group < 2; group++) {
    const start = group * 4, end = group === 0 ? 4 : 7;
    const row = new ActionRowBuilder();
    for (let col = start; col < end; col++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`c4_col_${col}`)
          .setLabel(String(col + 1))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(gameOver || !valid.includes(col))
      );
    }
    rows.push(row);
  }
  return rows;
}

function buildEmbed(board, player, result, delta = 0, total = 0) {
  const boardStr = renderBoard(board);

  let title, body, color;
  if (result === 'player_win') {
    title = t('games.connect4.winTitle');
    body  = t('games.connect4.winBody', { player: String(player), emoji: P_EMOJI });
    color = gameColor('win');
  } else if (result === 'bot_win') {
    title = t('games.connect4.loseTitle');
    body  = t('games.connect4.loseBody', { emoji: B_EMOJI });
    color = gameColor('lose');
  } else if (result === 'draw') {
    title = t('games.connect4.drawTitle');
    body  = t('games.connect4.drawBody');
    color = gameColor('draw');
  } else {
    title = t('games.connect4.title');
    body  = t('games.connect4.intro', { player: String(player), playerEmoji: P_EMOJI, botEmoji: B_EMOJI });
    color = gameColor('neutral');
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(`${boardStr}

${body}`)
    .setColor(color)
    .setFooter({ text: gameFooter('connect4', { delta, total }) });
}

module.exports = {
  key: 'connect4',
  game: 'connect4',
  data: applyMeta(new SlashCommandBuilder(), 'connect4'),

  async execute(interaction) {
    const board = newBoard();
    let gameOver = false;

    await interaction.reply({
      embeds: [buildEmbed(board, interaction.user, null)],
      components: buildComponents(board, false),
    });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 180_000,
    });

    collector.on('collect', async i => {
      if (gameOver) { await i.deferUpdate(); return; }

      const col = parseInt(i.customId.replace('c4_col_', ''));
      if (drop(board, col, PLAYER) === null) { await i.deferUpdate(); return; }

      const finishGame = async (result) => {
        gameOver = true;
        collector.stop();
        const outcome = result === 'player_win' ? 'win' : result === 'bot_win' ? 'lose' : 'draw';
        const delta = getPts('connect4', outcome);
        const pts = await addPoints(interaction.user.id, delta);
        await i.update({
          embeds: [buildEmbed(board, interaction.user, result, delta, pts.new)],
          components: buildComponents(board, true),
        });
        await notifyRewards(i, pts.old, pts.new);
      };

      if (checkWin(board, PLAYER)) { await finishGame('player_win'); return; }
      if (isDraw(board))            { await finishGame('draw');       return; }

      drop(board, botMove(board), BOT);

      if (checkWin(board, BOT)) { await finishGame('bot_win'); return; }
      if (isDraw(board))        { await finishGame('draw');    return; }

      await i.update({
        embeds: [buildEmbed(board, interaction.user, null)],
        components: buildComponents(board, false),
      });
    });

    collector.on('end', () => {
      if (!gameOver) {
        interaction.editReply({ components: buildComponents(board, true) }).catch(() => {});
      }
    });
  },
};
