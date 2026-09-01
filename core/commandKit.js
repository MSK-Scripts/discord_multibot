/**
 * The three things every command has to do the same way: take its name from the
 * config, take its wording from the catalogue, and check who may run it.
 *
 * A COMMAND HAS A KEY AND A NAME, AND THEY ARE NOT THE SAME THING. The key is
 * what the code says (`'clear'`), fixed for ever. The name is what members type
 * and is the operator's to change. Registration and routing both go through
 * `data.name`, so the two cannot drift apart: rename a command in the config
 * and it is registered and answered under the new name in the same breath.
 *
 * A BAD NAME IS CORRECTED, NOT FATAL. discord.js throws on an invalid command
 * name, and that throw happens while the command FILE is being required — so
 * one typo in the config would take out every command in the same directory,
 * with a stack trace that names discord.js rather than the setting. An invalid
 * name falls back to the key and says so.
 */

const { MessageFlags } = require('discord.js');
const config = require('./config');
const { t } = require('./i18n');
const { allowedByRoles } = require('./utils');

// Discord's own rule for slash command and option names: lowercase letters,
// digits, dash and underscore, 1-32 characters. Unicode letters are allowed,
// but only in lowercase where the language has a case.
const NAME_RULE = /^[-_\p{Ll}\p{Lo}\p{N}]{1,32}$/u;

/** Discord refuses a description longer than 100 characters. */
const MAX_DESCRIPTION = 100;

function validName(candidate, key) {
  const name = String(candidate ?? '').trim();
  if (NAME_RULE.test(name)) return name;
  if (name && name !== key) {
    console.warn(`[commands] "${name}" is not a valid command name (lowercase, no spaces, max 32). Using "${key}" instead.`);
  }
  return key;
}

/**
 * The description shown next to a command: the operator's own wording when they
 * wrote one, otherwise the shipped translation for that key.
 */
function description(key, configured) {
  const own = String(configured ?? '').trim();
  const text = own || t(`commands.${key}.description`);
  if (text.length <= MAX_DESCRIPTION) return text;
  console.warn(`[commands] description for "${key}" is longer than ${MAX_DESCRIPTION} characters and was cut.`);
  return text.slice(0, MAX_DESCRIPTION);
}

/**
 * Set name and description on a SlashCommandBuilder from the config.
 *
 * @param {import('discord.js').SlashCommandBuilder} builder
 * @param {string} key the command's stable key
 */
function applyMeta(builder, key) {
  const meta = config.command(key);
  return builder
    .setName(validName(meta.name, key))
    .setDescription(description(key, meta.description));
}

/** The description for one of a command's options, from the catalogue. */
const optionText = (key, option, vars) => {
  const text = t(`commands.${key}.options.${option}`, vars);
  return text.length <= MAX_DESCRIPTION ? text : text.slice(0, MAX_DESCRIPTION);
};

/**
 * May this member run the command? Replies with the refusal itself when not, so
 * a call site is one line:
 *
 *     if (!await guard(interaction, 'clear')) return;
 *
 * Returns a promise resolving to true when the command should go ahead.
 */
async function guard(interaction, key) {
  if (allowedByRoles(interaction, config.command(key).roles)) return true;
  await interaction.reply({ content: t('common.noPermission'), flags: MessageFlags.Ephemeral }).catch(() => {});
  return false;
}

/** The same gate for a context menu, which is configured under `features.contextMenus`. */
async function guardMenu(interaction, key) {
  if (allowedByRoles(interaction, config.contextMenu(key).roles)) return true;
  await interaction.reply({ content: t('contextMenus.noPermission'), flags: MessageFlags.Ephemeral }).catch(() => {});
  return false;
}

/**
 * Is this command switched on?
 *
 * A command may also be off because the feature behind it is: `/slots` is gone
 * when minigames are off, whatever the command table says. The feature is the
 * stronger statement, so it wins.
 */
function enabled(key, feature = null) {
  if (!config.command(key).enabled) return false;
  if (feature && config.get(`features.${feature}.enabled`, true) === false) return false;
  return true;
}

module.exports = { applyMeta, optionText, guard, guardMenu, enabled, validName, description, NAME_RULE, MAX_DESCRIPTION };
