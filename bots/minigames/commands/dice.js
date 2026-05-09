const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll one or more dice!')
    .addIntegerOption(o =>
      o.setName('sides').setDescription('Number of sides on the die').setRequired(true)
        .addChoices(
          { name: 'd4',   value: 4   },
          { name: 'd6',   value: 6   },
          { name: 'd8',   value: 8   },
          { name: 'd10',  value: 10  },
          { name: 'd12',  value: 12  },
          { name: 'd20',  value: 20  },
          { name: 'd100', value: 100 },
        )
    )
    .addIntegerOption(o => o.setName('count').setDescription('How many dice to roll (1–10, default 1)').setRequired(false)),

  async execute(interaction) {
    const sides = interaction.options.getInteger('sides');
    const count = Math.max(1, Math.min(interaction.options.getInteger('count') ?? 1, 10));
    const dName = `d${sides}`;
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);

    let desc;
    if (count === 1) {
      desc = `🎲 You rolled a **${dName}** and got: **${rolls[0]}**`;
    } else {
      desc = `🎲 You rolled **${count}x ${dName}**:\n${rolls.map(r => `\`${r}\``).join('  +  ')}\n\n**Total: ${total}**`;
      if (total === count * sides) desc += '\n\n🔥 **Perfect roll!** All dice at maximum!';
      else if (total === count)    desc += '\n\n💀 **Critical fail!** All dice at minimum!';
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎲 Dice Roll – ${count}x ${dName}`)
      .setDescription(desc)
      .setColor(0x5865F2)
      .setFooter({ text: `Rolled by ${interaction.user.displayName}` });

    await interaction.reply({ embeds: [embed] });
  },
};
