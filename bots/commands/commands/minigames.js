const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { join }    = require('path');
const { makeEmbed, hasAnyRole, readJson, writeJson } = require('../../../core/utils');
const { DATA_DIR, guild: gcfg } = require('../../../core/config');

const FLACHWITZE_FILE = join(DATA_DIR, 'flachwitze.json');

// Guess-the-number round state. In memory only, resets on bot restart.
//
// The rate limit is the actual protection here, not the randomness source.
// Once the search space is small enough to enumerate (1-100 by default), an
// unlimited /rg lets anyone walk the whole range and collect the giveaway
// reward. A stronger PRNG would not change that, a per-user budget does.
const DEFAULT_MIN = 1;
const DEFAULT_MAX = 100;

const GUESS_COOLDOWN_MS     = 30_000;  // per user, between two guesses
const MAX_GUESSES_PER_ROUND = 5;       // per user, until the next /random

function newRound(min, max) {
  return {
    min,
    max,
    secret:   Math.floor(Math.random() * (max - min + 1)) + min,
    // user ID -> { count, last }, dropped wholesale when a new round starts
    attempts: new Map(),
  };
}

let round = newRound(DEFAULT_MIN, DEFAULT_MAX);

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('random')
      .setDescription('Generiere eine Zufallszahl für das Ratespiel')
      .addIntegerOption(o => o.setName('number1').setDescription('Untere Grenze').setRequired(true))
      .addIntegerOption(o => o.setName('number2').setDescription('Obere Grenze').setRequired(true)),

    async execute(interaction) {
      if (!hasAnyRole(interaction, gcfg.TEAM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have the required role for this command.', flags: MessageFlags.Ephemeral });
      }

      const n1 = interaction.options.getInteger('number1');
      const n2 = interaction.options.getInteger('number2');

      if (n1 >= n2) return interaction.reply({ content: '❌ number1 must be less than number2.', flags: MessageFlags.Ephemeral });

      round = newRound(n1, n2);

      const embed = makeEmbed({
        title:       '🔢 Guess the Number',
        description: `I'm thinking of a number between **${n1}** and **${n2}**\nUse \`/rg <number>\` to guess the number!\n\n`
                   + `Everyone gets **${MAX_GUESSES_PER_ROUND} guesses** this round, one every **${GUESS_COOLDOWN_MS / 1000} seconds**.`,
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
      const now    = Date.now();
      const state  = round.attempts.get(interaction.user.id) ?? { count: 0, last: 0 };

      if (state.count >= MAX_GUESSES_PER_ROUND) {
        return interaction.reply({
          content: `❌ You have used all **${MAX_GUESSES_PER_ROUND}** guesses for this round. Wait until a team member starts a new one with \`/random\`.`,
          flags:   MessageFlags.Ephemeral,
        });
      }

      const waitMs = GUESS_COOLDOWN_MS - (now - state.last);
      if (waitMs > 0) {
        return interaction.reply({
          content: `⏳ Slow down. You can guess again in **${Math.ceil(waitMs / 1000)}s**.`,
          flags:   MessageFlags.Ephemeral,
        });
      }

      if (number < round.min || number > round.max) {
        // Does not burn a guess, it could never have been the answer anyway.
        return interaction.reply({
          content: `❌ Guess between **${round.min}** and **${round.max}**.`,
          flags:   MessageFlags.Ephemeral,
        });
      }

      state.count += 1;
      state.last   = now;
      round.attempts.set(interaction.user.id, state);

      if (number === round.secret) {
        const embed = makeEmbed({
          title:       '✅ Correct Number!',
          description: `${interaction.user} Number **${number}** is **correct**! 🎉\n\nOpen a giveaway ticket and request your desired script. **ONLY with screenshot!**`,
        });
        // New round over the same range, everyone's budget starts fresh.
        round = newRound(round.min, round.max);
        await interaction.reply({ embeds: [embed] });
      } else {
        const left  = MAX_GUESSES_PER_ROUND - state.count;
        const hint  = number < round.secret ? 'higher' : 'lower';
        const embed = makeEmbed({
          title:       '❌ Wrong Number!',
          description: `${interaction.user} Number **${number}** is **not** correct. Try **${hint}**.\n\n`
                     + `Guesses left this round: **${left}**`,
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
      if (!hasAnyRole(interaction, gcfg.TEAM_ROLE_ID)) {
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
