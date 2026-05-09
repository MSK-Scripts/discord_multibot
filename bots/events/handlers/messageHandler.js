const { makeEmbed } = require('../../../core/utils');
const { guild: gcfg } = require('../../../core/config');

const MUSIKER15_ID   = '283339135068930048';
const MUSIKER15_NAME = 'musiker15';

async function onMessage(message) {
  if (message.author.bot) return;

  // Musiker15 mention auto-reply
  const isTeam = message.member?.roles.cache.some(r => r.name === 'Team');
  if (!isTeam && message.content.toLowerCase().includes(MUSIKER15_NAME)) {
    await message.channel.send(
      `Hey <@${message.author.id}>, <@${MUSIKER15_ID}> wird sich zeitnah bei dir melden!`
    ).catch(console.error);
  }

  // Feedback channel → convert to embed
  if (message.channel.id === String(gcfg.FEEDBACK_CHANNEL_ID)) {
    await message.delete().catch(() => {});
    const embed = makeEmbed({
      title:       'Feedback',
      description: `**Feedback sent by** ${message.author} (${message.author.displayName})\n\n${message.content}`,
    });
    await message.channel.send({ embeds: [embed] }).catch(console.error);
  }
}

module.exports = { onMessage };
