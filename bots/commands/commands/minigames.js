const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { join } = require('path');
const { makeEmbed, readJson, writeJson } = require('../../../core/utils');
const { applyMeta, optionText, guard } = require('../../../core/commandKit');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');

const JOKES_FILE = join(config.DATA_DIR, 'flachwitze.json');

// Guess-the-number round state. In memory only, resets on bot restart.
//
// THE RATE LIMIT IS THE PROTECTION HERE, NOT THE RANDOMNESS. Once the search
// space is small enough to enumerate (1-100 by default), an unlimited /rg lets
// anyone walk the whole range and collect the prize. A stronger PRNG would not
// change that; a per-user budget does.
const settings = () => ({
  min:      Number(config.get('features.guessNumber.defaultMin', 1)) || 1,
  max:      Number(config.get('features.guessNumber.defaultMax', 100)) || 100,
  guesses:  Math.max(1, Number(config.get('features.guessNumber.maxGuessesPerRound', 5)) || 5),
  cooldown: Math.max(0, Number(config.get('features.guessNumber.cooldownSeconds', 30)) || 0) * 1000,
  note:     String(config.get('features.guessNumber.winNote', '') ?? '').trim(),
});

function newRound(min, max) {
  return {
    min,
    max,
    secret: Math.floor(Math.random() * (max - min + 1)) + min,
    // user ID -> { count, last }, dropped wholesale when a new round starts
    attempts: new Map(),
  };
}

let round = null;

module.exports = [
  {
    key: 'random',
    feature: 'guessNumber',
    data: applyMeta(new SlashCommandBuilder(), 'random')
      .addIntegerOption(o => o.setName('number1').setDescription(optionText('random', 'number1')).setRequired(true))
      .addIntegerOption(o => o.setName('number2').setDescription(optionText('random', 'number2')).setRequired(true)),

    async execute(interaction) {
      if (!await guard(interaction, 'random')) return;

      const n1 = interaction.options.getInteger('number1');
      const n2 = interaction.options.getInteger('number2');
      if (n1 >= n2) return interaction.reply({ content: t('guess.invalidRange'), flags: MessageFlags.Ephemeral });

      const s = settings();
      round = newRound(n1, n2);

      const embed = makeEmbed({
        title: t('guess.title'),
        description: t('guess.started', {
          min: n1, max: n2,
          command: config.command('rg').name,
          guesses: s.guesses,
          cooldown: Math.round(s.cooldown / 1000),
        }),
      });
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    key: 'rg',
    feature: 'guessNumber',
    data: applyMeta(new SlashCommandBuilder(), 'rg')
      .addIntegerOption(o => o.setName('number').setDescription(optionText('rg', 'number')).setRequired(true)),

    async execute(interaction) {
      if (!await guard(interaction, 'rg')) return;

      const s = settings();
      // The first round after a restart uses the configured range, so /rg works
      // before anybody has run /random.
      if (!round) round = newRound(s.min, s.max);

      const number = interaction.options.getInteger('number');
      const now = Date.now();
      const state = round.attempts.get(interaction.user.id) ?? { count: 0, last: 0 };

      if (state.count >= s.guesses) {
        return interaction.reply({
          content: t('guess.outOfGuesses', { guesses: s.guesses, command: config.command('random').name }),
          flags: MessageFlags.Ephemeral,
        });
      }

      const waitMs = s.cooldown - (now - state.last);
      if (waitMs > 0) {
        return interaction.reply({
          content: t('guess.cooldown', { seconds: Math.ceil(waitMs / 1000) }),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (number < round.min || number > round.max) {
        // Does not burn a guess: it could never have been the answer anyway.
        return interaction.reply({
          content: t('guess.outOfRange', { min: round.min, max: round.max }),
          flags: MessageFlags.Ephemeral,
        });
      }

      state.count += 1;
      state.last = now;
      round.attempts.set(interaction.user.id, state);

      if (number === round.secret) {
        const body = t('guess.correctBody', { user: String(interaction.user), number });
        const embed = makeEmbed({
          title: t('guess.correctTitle'),
          description: s.note ? `${body}\n\n${s.note}` : body,
        });
        // New round over the same range, everyone's budget starts fresh.
        round = newRound(round.min, round.max);
        await interaction.reply({ embeds: [embed] });
      } else {
        const embed = makeEmbed({
          title: t('guess.wrongTitle'),
          description: t('guess.wrongBody', {
            user: String(interaction.user),
            number,
            hint: number < round.secret ? t('guess.higher') : t('guess.lower'),
            left: s.guesses - state.count,
          }),
        });
        await interaction.reply({ embeds: [embed] });
      }
    },
  },

  {
    key: 'flachwitz',
    feature: 'jokes',
    data: applyMeta(new SlashCommandBuilder(), 'flachwitz'),

    async execute(interaction) {
      if (!await guard(interaction, 'flachwitz')) return;

      const data = readJson(JOKES_FILE, {});
      const keys = Object.keys(data);
      if (!keys.length) {
        return interaction.reply({
          content: t('jokes.empty', { command: config.command('add_flachwitz').name }),
          flags: MessageFlags.Ephemeral,
        });
      }
      const key = keys[Math.floor(Math.random() * keys.length)];
      await interaction.reply({ embeds: [makeEmbed({ title: t('jokes.title'), description: data[key] })] });
    },
  },

  {
    key: 'add_flachwitz',
    feature: 'jokes',
    data: applyMeta(new SlashCommandBuilder(), 'add_flachwitz')
      .addStringOption(o => o.setName('witz').setDescription(optionText('add_flachwitz', 'witz')).setRequired(true)),

    async execute(interaction) {
      if (!await guard(interaction, 'add_flachwitz')) return;

      const joke = interaction.options.getString('witz');
      const data = readJson(JOKES_FILE, {});
      // Keyed by the highest existing number plus one rather than by the count,
      // so a deleted entry cannot make a new one overwrite an old one.
      const highest = Object.keys(data).reduce((max, k) => Math.max(max, Number(k) || 0), 0);
      data[String(highest + 1)] = joke;
      writeJson(JOKES_FILE, data);

      await interaction.reply({ embeds: [makeEmbed({ title: t('jokes.added'), description: joke })] });
    },
  },
];
