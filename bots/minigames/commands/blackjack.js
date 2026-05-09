const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

const SUITS  = ['♠','♥','♦','♣'];
const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const VALUES = { A:11, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 8:8, 9:9, 10:10, J:10, Q:10, K:10 };

function makeDeck() {
  const cards = RANKS.flatMap(r => SUITS.map(s => [r, s]));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function handValue(hand) {
  let total = hand.reduce((s, [r]) => s + VALUES[r], 0);
  let aces  = hand.filter(([r]) => r === 'A').length;
  while (total > 21 && aces--) total -= 10;
  return total;
}

function handStr(hand, hideSecond = false) {
  const cards = hand.map(([r, s]) => `\`${r}${s}\``);
  if (hideSecond && cards.length >= 2) cards[1] = '`?`';
  return cards.join('  ');
}

function isBlackjack(hand) { return hand.length === 2 && handValue(hand) === 21; }

function resolve(pHand, dHand) {
  const pVal = handValue(pHand), dVal = handValue(dHand);
  const pBJ = isBlackjack(pHand), dBJ = isBlackjack(dHand);
  if (pBJ && dBJ) return 'push_bj';
  if (pBJ)        return 'blackjack';
  if (dBJ)        return 'dealer_bj';
  if (pVal > 21)  return 'bust';
  if (dVal > 21)  return 'dealer_bust';
  if (pVal > dVal) return 'win';
  if (pVal < dVal) return 'lose';
  return 'push';
}

function ptsKey(outcome) {
  if (outcome === 'blackjack')                                return 'blackjack';
  if (['dealer_bust','win'].includes(outcome))                return 'win';
  if (['bust','dealer_bj','lose'].includes(outcome))          return 'lose';
  return 'draw';
}

const OUTCOMES = {
  blackjack:   ['🃏 Blackjack! You win 1.5×!', 0xFEE75C],
  push_bj:     ['🤝 Both Blackjack – Push!',    0xFEE75C],
  dealer_bj:   ['🤖 Dealer Blackjack – You lose!', 0xED4245],
  bust:        ['💥 Bust! You lose!',            0xED4245],
  dealer_bust: ['💥 Dealer busts – You win!',    0x57F287],
  win:         ['🏆 You win!',                   0x57F287],
  lose:        ['💀 You lose!',                  0xED4245],
  push:        ['🤝 Push – It\'s a tie!',        0xFEE75C],
};

function buildEmbed(pHand, dHand, outcome = null, doubled = false, ptsDelta = 0, total = 0) {
  const reveal  = outcome !== null;
  const pVal    = handValue(pHand);
  const dVal    = handValue(dHand);
  const pCards  = handStr(pHand);
  const dCards  = handStr(dHand, !reveal);
  const dLabel  = reveal ? String(dVal) : '?';

  const [title, color] = outcome ? (OUTCOMES[outcome] ?? ['🃏 Blackjack', 0x5865F2]) : ['🃏 Blackjack', 0x5865F2];
  const doubledNote    = doubled ? '  *(doubled)*' : '';
  const footer         = reveal
    ? `Blackjack  •  /blackjack to play again${ptsDelta !== 0 ? `  •  ${pointsFooter(ptsDelta, total)}` : ''}`
    : 'Hit, Stand or Double Down  •  /blackjack to play again';

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: `Your Hand  (${pVal}${doubledNote})`, value: pCards, inline: false },
      { name: `Dealer's Hand  (${dLabel})`,          value: dCards, inline: false },
    )
    .setFooter({ text: footer });
}

function buildButtons(canDouble, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('🃏 Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_double').setLabel('✖️ Double Down').setStyle(ButtonStyle.Danger).setDisabled(disabled || !canDouble),
  );
}

module.exports = {
  data: new SlashCommandBuilder().setName('blackjack').setDescription('Play Blackjack against the dealer!'),

  async execute(interaction) {
    const deck   = makeDeck();
    const pHand  = [deck.pop(), deck.pop()];
    const dHand  = [deck.pop(), deck.pop()];
    let gameOver = false;
    let doubled  = false;

    const finishGame = async (responder, pH, dH, outcome, dbl) => {
      gameOver = true;
      const key     = ptsKey(outcome);
      const ptsDelta = getPts('blackjack', key);
      const pts      = addPoints(interaction.user.id, ptsDelta);
      const embed    = buildEmbed(pH, dH, outcome, dbl, ptsDelta, pts.new);
      await responder.update({ embeds: [embed], components: [buildButtons(false, true)] });
      await notifyRewards(responder, pts.old, pts.new);
    };

    // Natural blackjack on deal
    if (isBlackjack(pHand)) {
      while (handValue(dHand) < 17) dHand.push(deck.pop());
      const outcome  = resolve(pHand, dHand);
      const key      = ptsKey(outcome);
      const ptsDelta = getPts('blackjack', key);
      const pts      = addPoints(interaction.user.id, ptsDelta);
      await interaction.reply({
        embeds: [buildEmbed(pHand, dHand, outcome, false, ptsDelta, pts.new)],
        components: [buildButtons(false, true)],
      });
      await notifyRewards(interaction, pts.old, pts.new);
      return;
    }

    await interaction.reply({
      embeds: [buildEmbed(pHand, dHand)],
      components: [buildButtons(true, false)],
    });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on('collect', async i => {
      if (gameOver) { await i.deferUpdate(); return; }

      if (i.customId === 'bj_hit') {
        pHand.push(deck.pop());
        if (handValue(pHand) > 21) {
          await finishGame(i, pHand, dHand, 'bust', doubled);
          collector.stop();
          return;
        }
        await i.update({ embeds: [buildEmbed(pHand, dHand, null, doubled)], components: [buildButtons(false, false)] });

      } else if (i.customId === 'bj_stand') {
        while (handValue(dHand) < 17) dHand.push(deck.pop());
        await finishGame(i, pHand, dHand, resolve(pHand, dHand), doubled);
        collector.stop();

      } else if (i.customId === 'bj_double') {
        doubled = true;
        pHand.push(deck.pop());
        if (handValue(pHand) > 21) {
          await finishGame(i, pHand, dHand, 'bust', doubled);
          collector.stop();
          return;
        }
        while (handValue(dHand) < 17) dHand.push(deck.pop());
        await finishGame(i, pHand, dHand, resolve(pHand, dHand), doubled);
        collector.stop();
      }
    });

    collector.on('end', () => {
      if (!gameOver) {
        interaction.editReply({ components: [buildButtons(false, true)] }).catch(() => {});
      }
    });
  },
};
