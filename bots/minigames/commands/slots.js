const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

const SYMBOLS_WEIGHTED = [
  ...Array(30).fill('🍒'),
  ...Array(25).fill('🍋'),
  ...Array(20).fill('🍊'),
  ...Array(15).fill('🍇'),
  ...Array(6).fill('⭐'),
  ...Array(3).fill('💎'),
  ...Array(1).fill('7️⃣'),
];

function spin() {
  return Array.from({ length: 3 }, () => SYMBOLS_WEIGHTED[Math.floor(Math.random() * SYMBOLS_WEIGHTED.length)]);
}

function evaluate(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === '7️⃣') return { mult: 50, key: 'jackpot',  text: '🎰 **JACKPOT!** 7️⃣7️⃣7️⃣ — **×50**!' };
    if (a === '💎') return { mult: 20, key: 'mega_win', text: '💎 **MEGA WIN!** 💎💎💎 — **×20**!' };
    if (a === '⭐') return { mult: 10, key: 'big_win',  text: '⭐ **BIG WIN!** ⭐⭐⭐ — **×10**!' };
    return { mult: 5, key: 'win', text: `🎉 **WIN!** ${a}${b}${c} — **×5**!` };
  }
  if (a === b || b === c || a === c) return { mult: 2, key: 'small_win', text: '🙂 **Small win!** Two matching symbols — **×2**!' };
  return { mult: 0, key: 'no_match', text: '😔 **No match.** Better luck next time!' };
}

function buildEmbed(reels, resultText, color, ptsDelta = 0, total = 0) {
  const display = reels.join('  |  ');
  let footer = 'Slots  •  /slots to play';
  if (ptsDelta !== 0) footer += `  •  ${pointsFooter(ptsDelta, total)}`;
  return new EmbedBuilder()
    .setTitle('🎰 Slot Machine')
    .setDescription(`## ${display}\n\n${resultText}`)
    .setColor(color)
    .setFooter({ text: footer });
}

module.exports = {
  data: new SlashCommandBuilder().setName('slots').setDescription('Try your luck on the slot machine!'),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slots_spin').setLabel('🎰 Spin!').setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [buildEmbed(['🎰', '🎰', '🎰'], 'Press **Spin** to start!', 0x5865F2)], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
    });

    let spinning = false;

    collector.on('collect', async i => {
      if (spinning) { await i.deferUpdate(); return; }
      spinning = true;
      row.components[0].setDisabled(true).setLabel('⏳ Spinning...');
      await i.update({ embeds: [buildEmbed(['❓', '❓', '❓'], 'Spinning...', 0xFEE75C)], components: [row] });

      // Animation frames
      for (let f = 0; f < 4; f++) {
        await new Promise(r => setTimeout(r, 550));
        const frame = spin();
        await interaction.editReply({ embeds: [buildEmbed(frame, 'Spinning...', 0xFEE75C)] }).catch(() => {});
      }

      await new Promise(r => setTimeout(r, 550));
      const finalReels       = spin();
      const { key, text }    = evaluate(finalReels);
      const ptsDelta         = getPts('slots', key);
      const { old: oldPts, new: newPts } = addPoints(interaction.user.id, ptsDelta);
      const mult             = evaluate(finalReels).mult;
      const color            = mult >= 20 ? 0xFEE75C : mult > 0 ? 0x57F287 : 0xED4245;

      row.components[0].setDisabled(false).setLabel('🎰 Spin again!');
      spinning = false;

      await interaction.editReply({ embeds: [buildEmbed(finalReels, text, color, ptsDelta, newPts)], components: [row] }).catch(() => {});
      await notifyRewards(i, oldPts, newPts);
    });

    collector.on('end', () => {
      row.components[0].setDisabled(true);
      interaction.editReply({ components: [row] }).catch(() => {});
    });
  },
};
