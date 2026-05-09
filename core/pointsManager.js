const { join } = require('path');
const { MessageFlags } = require('discord.js');
const { DATA_DIR, BASE_DIR } = require('./config');
const { readJson, writeJson } = require('./utils');

const POINTS_FILE = join(DATA_DIR, 'points.json');
const CONFIG_FILE = join(BASE_DIR, 'bots', 'minigames', 'points_config.json');

let _configCache = null;

function getConfig() {
  if (!_configCache) _configCache = readJson(CONFIG_FILE, {});
  return _configCache;
}

function getPts(game, ...keys) {
  let cfg = (getConfig().games ?? {})[game] ?? {};
  for (const key of keys) {
    cfg = typeof cfg === 'object' ? (cfg[key] ?? 0) : 0;
  }
  return typeof cfg === 'number' ? cfg : 0;
}

function getPoints(userId) {
  const data = readJson(POINTS_FILE, {});
  return data[String(userId)] ?? 0;
}

function addPoints(userId, amount) {
  const data = readJson(POINTS_FILE, {});
  const key  = String(userId);
  const old  = data[key] ?? 0;
  const next = Math.max(0, old + amount);
  data[key]  = next;
  writeJson(POINTS_FILE, data);
  return { old, new: next };
}

function getNewlyUnlockedRewards(old, next) {
  const rewards = getConfig().rewards ?? [];
  return rewards.filter(r => old < r.points && r.points <= next);
}

async function notifyRewards(interaction, old, next) {
  const unlocked = getNewlyUnlockedRewards(old, next);
  for (const reward of unlocked) {
    if (reward.role_id && interaction.guild) {
      const role = interaction.guild.roles.cache.get(String(reward.role_id));
      if (role) {
        try { await interaction.member.roles.add(role); } catch {}
      }
    }
    try {
      await interaction.followUp({
        content: `🎉 **Reward unlocked!** You reached **${reward.points.toLocaleString()} points** and earned: **${reward.description}**!`,
        flags: MessageFlags.Ephemeral,
      });
    } catch {}
  }
}

function pointsFooter(amount, newTotal) {
  const delta = amount > 0 ? `+${amount}` : amount < 0 ? String(amount) : '±0';
  return `${delta} 🪙  (Total: ${newTotal.toLocaleString()} 🪙)`;
}

module.exports = { getConfig, getPts, getPoints, addPoints, notifyRewards, pointsFooter };
