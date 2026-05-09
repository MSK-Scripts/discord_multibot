const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

const CHOICES = {
  rock:     { emoji: '🪨', beats: 'scissors' },
  paper:    { emoji: '📄', beats: 'rock' },
  scissors: { emoji: '✂️',  beats: 'paper' },
};

function result(player, bot) {
  if (player === bot) return 'draw';
  return CHOICES[player].beats === bot ? 'win' : 'lose';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Play Rock Paper Scissors against the bot!'),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      ...Object.entries(CHOICES).map(([key, { emoji }]) =>
        new ButtonBuilder().setCustomId(`rps_${key}`).setLabel(`${emoji} ${key.charAt(0).toUpperCase() + key.slice(1)}`).setStyle(ButtonStyle.Primary)
      )
    );

    const embed = new EmbedBuilder()
      .setTitle('✂️ Rock Paper Scissors')
      .setDescription(`${interaction.user}, make your choice!`)
      .setColor(0x5865F2);

    await interaction.reply({ embeds: [embed], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000, max: 1,
    });

    collector.on('collect', async i => {
      const choice    = i.customId.replace('rps_', '');
      const botChoice = Object.keys(CHOICES)[Math.floor(Math.random() * 3)];
      const outcome   = result(choice, botChoice);
      const pEmoji    = CHOICES[choice].emoji;
      const bEmoji    = CHOICES[botChoice].emoji;

      let title, color, desc;
      if (outcome === 'win') {
        [title, color, desc] = ['🏆 You win!', 0x57F287, `Your **${pEmoji} ${choice}** beats the bot's **${bEmoji} ${botChoice}**!`];
      } else if (outcome === 'lose') {
        [title, color, desc] = ['💀 You lose!', 0xED4245, `The bot's **${bEmoji} ${botChoice}** beats your **${pEmoji} ${choice}**!`];
      } else {
        [title, color, desc] = ['🤝 Draw!', 0xFEE75C, `Both chose **${pEmoji} ${choice}**. No winner!`];
      }

      const pts_delta = getPts('rps', outcome);
      const { old: oldPts, new: newPts } = addPoints(interaction.user.id, pts_delta);

      for (const btn of row.components) btn.setDisabled(true);

      const resultEmbed = new EmbedBuilder()
        .setTitle(title).setDescription(desc).setColor(color)
        .setFooter({ text: `Rock Paper Scissors  •  /rps to play again  •  ${pointsFooter(pts_delta, newPts)}` });

      await i.update({ embeds: [resultEmbed], components: [row] });
      await notifyRewards(i, oldPts, newPts);
    });

    collector.on('end', (collected) => {
      if (!collected.size) {
        for (const btn of row.components) btn.setDisabled(true);
        interaction.editReply({ components: [row] }).catch(() => {});
      }
    });
  },
};
