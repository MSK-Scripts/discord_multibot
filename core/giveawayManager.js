const { join } = require('path');
const {
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
} = require('discord.js');
const { DATA_DIR, guild: gcfg } = require('./config');
const { readJson, writeJson, makeEmbed } = require('./utils');

const GIVEAWAYS_FILE = join(DATA_DIR, 'giveaways.json');

// Custom button id carries the giveaway id so the persistent button handler
// can resolve the giveaway without a reverse messageId lookup.
const JOIN_PREFIX = 'giveaway_join:';

// Unambiguous alphabet (no 0/O/1/I/L) for short, easy-to-type giveaway ids.
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ID_LENGTH   = 6;

// Persistence is keyed by the short giveaway id. Snowflakes (messageId,
// channelId, guildId, userIds) are always stored/compared as strings.
function _readAll() {
  return readJson(GIVEAWAYS_FILE, {}) || {};
}

function _writeAll(data) {
  writeJson(GIVEAWAYS_FILE, data);
}

function _normId(id) {
  return String(id ?? '').trim().toUpperCase();
}

// --- IDs ---------------------------------------------------------------------

function generateId() {
  const data = _readAll();
  let id;
  do {
    id = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
  } while (data[id]);
  return id;
}

// --- CRUD --------------------------------------------------------------------

function create({ id, messageId, channelId, guildId, title, description, winnerCount, endsAt, hostId }) {
  const data = _readAll();
  const key  = _normId(id);
  data[key] = {
    id:          key,
    messageId:   String(messageId),
    channelId:   String(channelId),
    guildId:     String(guildId),
    title:       String(title),
    description: String(description ?? ''),
    winnerCount: Math.max(1, Number(winnerCount) || 1),
    endsAt:      Number(endsAt),
    hostId:      String(hostId),
    participants: [],
    ended:       false,
    winners:     [],
  };
  _writeAll(data);
  return data[key];
}

function getById(id) {
  return _readAll()[_normId(id)] ?? null;
}

function listActive() {
  return Object.values(_readAll()).filter(gw => !gw.ended);
}

// Synchronous read->mutate->write (no await in between) to avoid lost updates
// when several members click the join button at the same time.
function toggleParticipant(id, userId) {
  const data = _readAll();
  const gw   = data[_normId(id)];
  if (!gw || gw.ended) return null;

  const uid = String(userId);
  const idx = gw.participants.indexOf(uid);
  let joined;
  if (idx === -1) {
    gw.participants.push(uid);
    joined = true;
  } else {
    gw.participants.splice(idx, 1);
    joined = false;
  }
  _writeAll(data);
  return { joined, count: gw.participants.length, giveaway: gw };
}

// Fisher-Yates shuffle on a copy, then take the first `count` unique entries.
function pickWinners(participants, count) {
  const pool = [...participants];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(Math.max(1, count), pool.length));
}

// --- Embed / components (shared by create, join-toggle, end, reroll) ---------

function buildEmbed(gw, guildName = '') {
  const endTs = Math.floor(gw.endsAt / 1000);
  const lines = [];

  if (gw.description) lines.push(gw.description, '');

  lines.push(`**Winners:** ${gw.winnerCount}`);
  lines.push(gw.ended ? `**Ended:** <t:${endTs}:R>` : `**Ends:** <t:${endTs}:R> (<t:${endTs}:f>)`);
  lines.push(`**Hosted by:** <@${gw.hostId}>`);

  if (gw.ended) {
    lines.push(
      gw.winners.length
        ? `**Winner${gw.winners.length > 1 ? 's' : ''}:** ${gw.winners.map(uid => `<@${uid}>`).join(', ')}`
        : '**Winners:** No one entered.',
    );
  } else {
    lines.push(`**Entries:** ${gw.participants.length}`);
    lines.push('\nClick the button below to enter!');
  }

  const prefix = gw.ended ? '🎉 Giveaway ended' : '🎉 Giveaway';
  return makeEmbed({
    title:       `${prefix} — ${gw.title}`,
    description: lines.join('\n'),
    footerText:  `Giveaway ID: ${gw.id}`,
  });
}

function buildComponents(id, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${JOIN_PREFIX}${_normId(id)}`)
        .setLabel('Enter Giveaway')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎉')
        .setDisabled(disabled),
    ),
  ];
}

// --- Ending / rerolling / cancelling -----------------------------------------

// Resolves the participants who are still eligible to win at draw time:
// excludes Team members and anyone who has since left the guild. If the
// guild/members can't be fetched, no one is dropped (fail-open).
async function _eligibleParticipants(client, gw) {
  if (!gw.participants.length) return [];
  const guild = await client.guilds.fetch(gw.guildId).catch(() => null);
  if (!guild) return gw.participants;

  let members;
  try {
    members = await guild.members.fetch({ user: gw.participants });
  } catch {
    return gw.participants;
  }

  return gw.participants.filter(uid => {
    const m = members.get(uid);
    if (!m) return false; // left the guild -> can't be awarded
    return !m.roles.cache.has(String(gcfg.TEAM_ROLE_ID));
  });
}

async function _fetchMessage(client, gw) {
  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return { channel: null, message: null };
  const message = await channel.messages.fetch(gw.messageId).catch(() => null);
  return { channel, message };
}

async function _announceWinners(channel, gw, isReroll = false) {
  if (!channel) return;
  if (!gw.winners.length) {
    await channel.send({ content: `😔 No one entered — no winner for **${gw.title}**.` }).catch(() => {});
    return;
  }

  const mentions = gw.winners.map(uid => `<@${uid}>`).join(', ');
  await channel.send({
    content: `🎉 Congratulations ${mentions}! You ${isReroll ? 'are the new winner' : 'won'} of **${gw.title}**!`,
    reply: { messageReference: gw.messageId, failIfNotExists: false },
    allowedMentions: { users: gw.winners },
  }).catch(() => {});

  // Best-effort DM to each winner.
  for (const uid of gw.winners) {
    const user = await channel.client.users.fetch(uid).catch(() => null);
    if (user) {
      user.send(`🎉 You won **${gw.title}** in ${channel.guild ? channel.guild.name : 'the server'}! Congratulations!`).catch(() => {});
    }
  }
}

async function endGiveaway(client, id) {
  const data = _readAll();
  const gw   = data[_normId(id)];
  if (!gw || gw.ended) return null; // idempotent

  // Claim the giveaway synchronously (ended=true) BEFORE any await so an
  // overlapping scheduler tick or a crash-restart can never draw it twice.
  gw.ended = true;
  _writeAll(data);

  // Draw from the currently-eligible entrants (excludes Team members and
  // anyone who left the guild), then persist the winners.
  const eligible = await _eligibleParticipants(client, gw);
  gw.winners = pickWinners(eligible, gw.winnerCount);
  const fresh = _readAll();
  if (fresh[gw.id]) { fresh[gw.id].winners = gw.winners; _writeAll(fresh); }

  const { channel, message } = await _fetchMessage(client, gw);
  const guildName = channel?.guild?.name ?? '';
  if (message) {
    await message.edit({
      embeds: [buildEmbed(gw, guildName)],
      components: buildComponents(gw.id, true),
    }).catch(() => {});
  } else {
    console.error(`[Giveaway] ended ${gw.id} but original message/channel was gone.`);
  }
  await _announceWinners(channel, gw, false);
  return gw;
}

async function reroll(client, id, count = null) {
  const data = _readAll();
  const gw   = data[_normId(id)];
  if (!gw) return { error: 'not_found' };
  if (!gw.ended) return { error: 'not_ended' };
  if (!gw.participants.length) return { error: 'no_entries' };

  const eligible = await _eligibleParticipants(client, gw);
  gw.winners = pickWinners(eligible, count ?? gw.winnerCount);
  _writeAll(data);

  const { channel, message } = await _fetchMessage(client, gw);
  const guildName = channel?.guild?.name ?? '';
  if (message) {
    await message.edit({ embeds: [buildEmbed(gw, guildName)], components: buildComponents(gw.id, true) }).catch(() => {});
  }
  await _announceWinners(channel, gw, true);
  return { giveaway: gw };
}

async function cancel(client, id) {
  const data = _readAll();
  const gw   = data[_normId(id)];
  if (!gw) return { error: 'not_found' };
  if (gw.ended) return { error: 'not_active' };

  delete data[gw.id];
  _writeAll(data);

  const { message } = await _fetchMessage(client, gw);
  if (message) {
    const embed = makeEmbed({
      title:       `🎉 Giveaway cancelled — ${gw.title}`,
      description: 'This giveaway was cancelled.',
      footerText:  `Giveaway ID: ${gw.id}`,
    });
    await message.edit({ embeds: [embed], components: buildComponents(gw.id, true) }).catch(() => {});
  }
  return { giveaway: gw };
}

// --- Scheduler ---------------------------------------------------------------
// A single polling tick (not setTimeout per giveaway) so that:
//  - it re-arms itself after a crash/restart (giveaways.json is the source of truth)
//  - it is immune to setTimeout's ~24.8 day 32-bit overflow
let _intervalRef = null;

async function _tick(client) {
  const now = Date.now();
  for (const gw of listActive()) {
    if (gw.endsAt <= now) {
      try {
        await endGiveaway(client, gw.id);
      } catch (e) {
        console.error(`[Giveaway] end failed ${gw.id}: ${e.message}`);
      }
    }
  }
}

function init(client) {
  if (_intervalRef) return; // guard: token-coalescing may call attach() several times
  _intervalRef = setInterval(() => _tick(client), 15_000);
  _tick(client); // immediately catch up on giveaways that expired while offline
  console.log('[Giveaway] Scheduler armed (15s tick).');
}

module.exports = {
  JOIN_PREFIX,
  generateId, create, getById, listActive, toggleParticipant, pickWinners,
  buildEmbed, buildComponents, endGiveaway, reroll, cancel, init,
};
