const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameFooter, gameColor } = require('../../../core/gameKit');
const { addPoints, pointsFor, notifyRewards } = require('../../../core/pointsManager');
const { t } = require('../../../core/i18n');

// Cards, not wording. Ranks and suits are the same symbols everywhere.
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const VALUES = { A: 11, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 10, Q: 10, K: 10 };

const DEALER_STANDS_AT = 17;

function makeDeck() {
  const cards = RANKS.flatMap(r => SUITS.map(s => [r, s]));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function handValue(hand) {
  let total = hand.reduce((sum, [rank]) => sum + VALUES[rank], 0);
  let aces = hand.filter(([rank]) => rank === 'A').length;
  while (total > 21 && aces--) total -= 10;
  return total;
}

function handStr(hand, hideSecond = false) {
  const cards = hand.map(([r, s]) => `\`${r}${s}\``);
  if (hideSecond && cards.length >= 2) cards[1] = '`?`';
  return cards.join('  ');
}

const isBlackjack = hand => hand.length === 2 && handValue(hand) === 21;

function resolve(playerHand, dealerHand) {
  const p = handValue(playerHand), d = handValue(dealerHand);
  const pBJ = isBlackjack(playerHand), dBJ = isBlackjack(dealerHand);
  if (pBJ && dBJ) return 'push_bj';
  if (pBJ) return 'blackjack';
  if (dBJ) return 'dealer_bj';
  if (p > 21) return 'bust';
  if (d > 21) return 'dealer_bust';
  if (p > d) return 'win';
  if (p < d) return 'lose';
  return 'push';
}

/** Which points entry an outcome pays out from. */
function ptsKey(outcome) {
  if (outcome === 'blackjack') return 'blackjack';
  if (outcome === 'dealer_bust' || outcome === 'win') return 'win';
  if (outcome === 'bust' || outcome === 'dealer_bj' || outcome === 'lose') return 'lose';
  return 'draw';
}

const OUTCOME_COLORS = {
  blackjack: 'draw', push_bj: 'draw', push: 'draw',
  dealer_bj: 'lose', bust: 'lose', lose: 'lose',
  dealer_bust: 'win', win: 'win',
};

function buildEmbed(playerHand, dealerHand, outcome = null, doubled = false, delta = 0, total = 0) {
  const revealed = outcome !== null;
  const title = revealed ? t(`games.blackjack.outcomes.${outcome}`) : t('games.blackjack.title');
  const color = gameColor(revealed ? (OUTCOME_COLORS[outcome] ?? 'neutral') : 'neutral');

  const footer = revealed
    ? gameFooter('blackjack', { delta, total })
    : `${t('games.blackjack.hintFooter')}  •  ${gameFooter('blackjack', {})}`;

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      {
        name:  t('games.blackjack.yourHand', {
          value: handValue(playerHand),
          doubled: doubled ? t('games.blackjack.doubled') : '',
        }),
        value: handStr(playerHand),
        inline: false,
      },
      {
        name:  t('games.blackjack.dealerHand', { value: revealed ? handValue(dealerHand) : '?' }),
        value: handStr(dealerHand, !revealed),
        inline: false,
      },
    )
    .setFooter({ text: footer });
}

function buildButtons(canDouble, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel(t('games.blackjack.hit')).setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_stand').setLabel(t('games.blackjack.stand')).setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_double').setLabel(t('games.blackjack.double')).setStyle(ButtonStyle.Danger).setDisabled(disabled || !canDouble),
  );
}

module.exports = {
  key: 'blackjack',
  game: 'blackjack',
  data: applyMeta(new SlashCommandBuilder(), 'blackjack'),

  async execute(interaction) {
    const deck = makeDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];
    let gameOver = false;
    let doubled = false;

    const dealerDraws = () => { while (handValue(dealerHand) < DEALER_STANDS_AT) dealerHand.push(deck.pop()); };

    const finish = async (responder, outcome, replyInstead = false) => {
      gameOver = true;
      const delta = pointsFor(interaction, 'blackjack', ptsKey(outcome));
      const pts = await addPoints(interaction.user.id, delta);
      const payload = {
        embeds: [buildEmbed(playerHand, dealerHand, outcome, doubled, delta, pts.new)],
        components: [buildButtons(false, true)],
      };
      if (replyInstead) await responder.reply(payload);
      else await responder.update(payload);
      await notifyRewards(responder, pts.old, pts.new);
    };

    // A natural blackjack on the deal ends the hand before anybody can act.
    if (isBlackjack(playerHand)) {
      dealerDraws();
      await finish(interaction, resolve(playerHand, dealerHand), true);
      return;
    }

    await interaction.reply({
      embeds: [buildEmbed(playerHand, dealerHand)],
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
        playerHand.push(deck.pop());
        if (handValue(playerHand) > 21) {
          await finish(i, 'bust');
          collector.stop();
          return;
        }
        // Doubling is only allowed on the first two cards.
        await i.update({
          embeds: [buildEmbed(playerHand, dealerHand, null, doubled)],
          components: [buildButtons(false, false)],
        });
        return;
      }

      if (i.customId === 'bj_stand') {
        dealerDraws();
        await finish(i, resolve(playerHand, dealerHand));
        collector.stop();
        return;
      }

      if (i.customId === 'bj_double') {
        doubled = true;
        playerHand.push(deck.pop());
        if (handValue(playerHand) > 21) {
          await finish(i, 'bust');
          collector.stop();
          return;
        }
        dealerDraws();
        await finish(i, resolve(playerHand, dealerHand));
        collector.stop();
      }
    });

    collector.on('end', () => {
      if (!gameOver) interaction.editReply({ components: [buildButtons(false, true)] }).catch(() => {});
    });
  },
};
