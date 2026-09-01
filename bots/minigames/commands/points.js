const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { applyMeta } = require('../../../core/commandKit');
const { gameColor } = require('../../../core/gameKit');
const { getPoints, rewards, multiplierFor } = require('../../../core/pointsManager');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');

const BAR_WIDTH = 20;

module.exports = {
  key: 'points',
  game: 'points',
  data: applyMeta(new SlashCommandBuilder(), 'points'),

  async execute(interaction) {
    const locale = config.dateLocale();
    const current = await getPoints(interaction.user.id);
    const tiers = rewards();

    let nextReward = null;
    const lines = tiers.map(r => {
      const points = r.points.toLocaleString(locale);
      if (current >= r.points) return t('points.unlockedLine', { label: r.label, points });
      if (!nextReward) nextReward = r;
      return t('points.lockedLine', {
        label: r.label,
        points,
        remaining: (r.points - current).toLocaleString(locale),
      });
    });

    const embed = new EmbedBuilder()
      .setTitle(t('points.title', { name: interaction.user.displayName }))
      .setColor(gameColor('draw'))
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: t('points.current'), value: `**${current.toLocaleString(locale)} 🪙**`, inline: false },
        { name: t('points.rewards'), value: lines.join('\n') || t('points.noRewards'), inline: false },
      );

    // The one place a bonus role is visible. The game footers show the already
    // multiplied number and no game says where it came from, so without this a
    // member has no way to tell a perk from a payout that was always that big.
    const factor = multiplierFor(interaction.member);
    if (factor !== 1) {
      embed.spliceFields(1, 0, {
        name:  t('points.bonusTitle'),
        value: t('points.bonusValue', { factor: factor.toLocaleString(locale) }),
        inline: false,
      });
    }

    if (nextReward) {
      const filled = Math.max(0, Math.min(Math.floor((current / nextReward.points) * BAR_WIDTH), BAR_WIDTH));
      const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
      embed.addFields({
        name:  t('points.progressTo', { label: nextReward.label }),
        value: `\`${bar}\` ${current.toLocaleString(locale)} / ${nextReward.points.toLocaleString(locale)}`,
        inline: false,
      });
    } else if (tiers.length) {
      // Only when there was something to unlock. With no rewards configured at
      // all, "you have unlocked everything" is a claim about nothing.
      embed.addFields({ name: t('points.allUnlockedTitle'), value: t('points.allUnlocked'), inline: false });
    }

    embed.setFooter({ text: t('points.footerHint') });
    await interaction.reply({ embeds: [embed] });
  },
};
