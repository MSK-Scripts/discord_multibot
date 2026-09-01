const { makeEmbed } = require('../../../core/utils');
const { t } = require('../../../core/i18n');
const config = require('../../../core/config');

/**
 * Two things that happen to plain messages: an auto-reply when somebody is
 * looking for a particular person, and turning the feedback channel into embeds.
 *
 * THE AUTO-REPLY IS INERT WITHOUT CONFIGURATION. Its trigger word and the
 * person it points at used to be constants in this file, carrying one
 * installation's own user id. A fresh clone answered every message containing
 * that word by pinging somebody who is not on that server. Both halves are
 * settings now, and with either missing nothing is sent at all.
 *
 * THE EXEMPTION GOES BY ROLE ID, NOT BY NAME. It used to compare
 * `r.name === 'Team'`, which meant renaming the role in Discord silently
 * switched the exception off, and the bot then started answering the team about
 * themselves, which is exactly the case the exception exists for. A rename is a
 * thing an admin does without thinking about the bot; an id is not.
 */

async function onMessage(message) {
  if (message.author.bot) return;

  await autoReply(message);
  await feedbackToEmbed(message);
}

async function autoReply(message) {
  if (!config.featureEnabled('autoReply')) return;

  const trigger = String(config.get('features.autoReply.trigger', '') ?? '').trim();
  const contactId = String(config.get('features.autoReply.contactId', '') ?? '').trim();
  if (!trigger || !contactId) return;

  // The people being asked for are skipped: they can answer themselves.
  const exemptIds = config.roleIds(config.get('features.autoReply.exemptRoles', []) || []);
  if (exemptIds.some(id => message.member?.roles.cache.has(String(id)))) return;

  const caseSensitive = config.get('features.autoReply.caseSensitive', false) === true;
  const haystack = caseSensitive ? message.content : message.content.toLowerCase();
  const needle = caseSensitive ? trigger : trigger.toLowerCase();
  if (!haystack.includes(needle)) return;

  await message.channel.send({
    content: t('autoReply.message', {
      user: `<@${message.author.id}>`,
      contact: `<@${contactId}>`,
    }),
    // Exactly the two people meant, and nothing a display name could smuggle
    // in: message.content is not repeated here, but being explicit costs
    // nothing and survives the next edit.
    allowedMentions: { users: [String(message.author.id), contactId] },
  }).catch(console.error);
}

async function feedbackToEmbed(message) {
  if (!config.featureEnabled('feedback')) return;

  const channelId = config.channelId(config.get('features.feedback.channelId', ''), 'feedback');
  if (!channelId || message.channel.id !== String(channelId)) return;

  if (config.get('features.feedback.deleteOriginal', true) !== false) {
    await message.delete().catch(() => {});
  }

  const embed = makeEmbed({
    title: t('feedback.title'),
    description: t('feedback.body', {
      user: String(message.author),
      name: message.author.displayName,
      content: message.content,
    }),
  });

  await message.channel.send({
    embeds: [embed],
    // The embed repeats what a member wrote. Mentions inside an embed do not
    // notify, but this is the one place hostile text arrives by design, so the
    // message itself permits nothing either.
    allowedMentions: { parse: [] },
  }).catch(console.error);
}

module.exports = { onMessage };
