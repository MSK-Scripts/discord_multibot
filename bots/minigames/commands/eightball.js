const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const POSITIVE = ['It is certain.','It is decidedly so.','Without a doubt.','Yes, definitely.','You may rely on it.','As I see it, yes.','Most likely.','Outlook good.','Yes.','Signs point to yes.'];
const NEUTRAL  = ['Reply hazy, try again.','Ask again later.','Better not tell you now.','Cannot predict now.','Concentrate and ask again.'];
const NEGATIVE = ['Don\'t count on it.','My reply is no.','My sources say no.','Outlook not so good.','Very doubtful.'];
const ALL      = [...POSITIVE, ...NEUTRAL, ...NEGATIVE];

const COLORS = { positive: 0x57F287, neutral: 0xFEE75C, negative: 0xED4245 };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the Magic 8-Ball a yes/no question!')
    .addStringOption(o => o.setName('question').setDescription('Your yes/no question').setRequired(true)),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const response = ALL[Math.floor(Math.random() * ALL.length)];
    const category = POSITIVE.includes(response) ? 'positive' : NEUTRAL.includes(response) ? 'neutral' : 'negative';

    const embed = new EmbedBuilder()
      .setColor(COLORS[category])
      .setAuthor({ name: '🎱 Magic 8-Ball' })
      .addFields(
        { name: '❓ Question', value: question, inline: false },
        { name: '🔮 Answer',   value: `*${response}*`, inline: false },
      )
      .setFooter({ text: `Asked by ${interaction.user.displayName}` });

    await interaction.reply({ embeds: [embed] });
  },
};
