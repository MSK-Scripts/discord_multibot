const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { join }    = require('path');
const { makeEmbed, hasAnyRole, readJson, writeJson } = require('../../../core/utils');
const { DATA_DIR } = require('../../../core/config');

const FLACHWITZE_FILE = join(DATA_DIR, 'flachwitze.json');

// In-memory secret number (resets on bot restart)
let secretNumber = Math.floor(Math.random() * 100) + 1;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('random')
      .setDescription('Generiere eine Zufallszahl für das Ratespiel')
      .addIntegerOption(o => o.setName('number1').setDescription('Untere Grenze').setRequired(true))
      .addIntegerOption(o => o.setName('number2').setDescription('Obere Grenze').setRequired(true)),

    async execute(interaction) {
      if (!hasAnyRole(interaction, 'Team')) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const n1 = interaction.options.getInteger('number1');
      const n2 = interaction.options.getInteger('number2');

      if (n1 >= n2) return interaction.reply({ content: '❌ number1 must be less than number2.', flags: MessageFlags.Ephemeral });

      secretNumber = Math.floor(Math.random() * (n2 - n1 + 1)) + n1;

      const embed = makeEmbed({
        title:       '🔢 Guess the Number',
        description: `I'm thinking of a number between **${n1}** and **${n2}**\nUse \`/rg <number>\` to guess the number!`,
      });
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('rg')
      .setDescription('Guess the Number')
      .addIntegerOption(o => o.setName('number').setDescription('Your guess').setRequired(true)),

    async execute(interaction) {
      const number = interaction.options.getInteger('number');

      if (number === secretNumber) {
        const embed = makeEmbed({
          title:       '✅ Correct Number!',
          description: `${interaction.user} Number **${number}** is **correct**! 🎉\n\nOpen a giveaway ticket and request your desired script. **ONLY with screenshot!**`,
        });
        secretNumber = Math.floor(Math.random() * 100) + 1;
        await interaction.reply({ embeds: [embed] });
      } else {
        const embed = makeEmbed({
          title:       '❌ Wrong Number!',
          description: `${interaction.user} Number **${number}** is **not** correct.`,
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('flachwitz')
      .setDescription('Füße hoch, der Witz kommt flach!'),

    async execute(interaction) {
      const data = readJson(FLACHWITZE_FILE, {});
      const keys = Object.keys(data);
      if (!keys.length) {
        return interaction.reply({ content: 'Noch keine Flachwitze vorhanden. Nutze `/add_flachwitz` um einen hinzuzufügen!', flags: MessageFlags.Ephemeral });
      }
      const key   = keys[Math.floor(Math.random() * keys.length)];
      const embed = makeEmbed({ title: '🎤 Füße hoch, der Witz kommt flach!', description: data[key] });
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('add_flachwitz')
      .setDescription('Einen Flachwitz hinzufügen')
      .addStringOption(o => o.setName('witz').setDescription('Wie lautet dein Flachwitz?').setRequired(true)),

    async execute(interaction) {
      if (!hasAnyRole(interaction, 'Team')) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const witz = interaction.options.getString('witz');
      const data = readJson(FLACHWITZE_FILE, {});
      const key  = String(Object.keys(data).length + 1);
      data[key]  = witz;
      writeJson(FLACHWITZE_FILE, data);

      const embed = makeEmbed({ title: '✅ Flachwitz hinzugefügt', description: witz });
      await interaction.reply({ embeds: [embed] });
    },
  },
];
