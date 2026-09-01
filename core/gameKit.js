/**
 * The bits every minigame repeats: the footer line and the two colours that
 * mean "you won" and "you lost".
 *
 * The footer used to be assembled by hand in each of the twelve games, which is
 * why half of them said "/slots to play" and the other half "/slots to play
 * again", and why renaming a command left every footer pointing at a command
 * that no longer exists.
 */

const { t } = require('./i18n');
const config = require('./config');
const { pointsFooter } = require('./pointsManager');

/**
 * "Slots  •  /slots to play again  •  +5 🪙 (Total: 120 🪙)"
 *
 * The command name comes from the config, so a renamed command is named
 * correctly in its own footer. The points part is left off when nothing was
 * won or lost, and when the operator switched the points footer off.
 */
function gameFooter(gameKey, { delta = 0, total = 0, commandKey = null } = {}) {
  const parts = [t(`games.${gameKey}.label`)];
  parts.push(t('common.playAgain', { command: config.command(commandKey ?? gameKey).name }));

  if (delta !== 0) {
    const points = pointsFooter(delta, total);
    if (points) parts.push(points);
  }
  return parts.join('  •  ');
}

/** The colours the games share. Configurable alongside the logging colours. */
const FALLBACK = { win: 0x57F287, lose: 0xED4245, draw: 0xFEE75C, neutral: 0x5865F2 };

function gameColor(kind) {
  return config.parseColor(config.get(`features.minigames.colors.${kind}`, ''), FALLBACK[kind] ?? FALLBACK.neutral);
}

module.exports = { gameFooter, gameColor };
