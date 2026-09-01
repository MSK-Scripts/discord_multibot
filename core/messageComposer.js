/**
 * The one place a "the bot says this" message is assembled.
 *
 * TWO CALLERS, ONE SHAPE. `/send_message` and `/send_embed` in
 * bots/commands/commands/admin.js build it from a modal; the dashboard's
 * announcement screen builds it from a form. They used to be two
 * implementations of the same message, which is how an embed posted from the
 * panel ends up looking subtly unlike one posted from Discord: a different
 * footer, a missing thumbnail, another colour.
 *
 * The output is PLAIN JSON, not an EmbedBuilder. discord.js accepts a raw embed
 * object in `channel.send({ embeds: [...] })`, and the dashboard needs plain
 * JSON for its REST call anyway. Returning a builder would force the dashboard
 * to load discord.js in the parent process for nothing.
 *
 * PURE. No HTTP, no Discord, no Express, so every rule below is testable
 * without a network and without a guild.
 *
 * The one thing worth knowing before reading further: A MENTION INSIDE AN EMBED
 * DOES NOT PING ANYONE. Discord renders it, and nobody is notified. An
 * announcement that reaches no one while looking exactly right is the failure
 * this module exists to prevent, so the ping is built as its own line of
 * `content` and never taken from the body.
 */

const config = require('./config');

/** Discord's own limits. Exceeding one is a 400 from the API with no detail. */
const LIMITS = Object.freeze({ content: 2000, title: 256, description: 4096, footer: 2048 });

const SNOWFLAKE = /^\d{17,20}$/;

/** `text` is what /send_message posts, `embed` is what /send_embed posts. */
const MODES = Object.freeze(['text', 'embed']);

/** What the composer may ask for. Anything else is refused, not guessed at. */
const PINGS = Object.freeze(['none', 'everyone', 'here', 'role']);

/** The timestamp /send_embed prefills its footer with. Same format, same locale. */
function nowStr() {
  return new Date().toLocaleString(config.dateLocale(), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** The default footer text, e.g. "© My Server • 02.09.2026, 14:03:11". */
const defaultFooter = (guildName) => (guildName ? `© ${guildName} • ${nowStr()}` : '');

/**
 * The mention line, and the `allowed_mentions` that actually permits it.
 *
 * `allowed_mentions` IS ALWAYS SET, and its floor is "nothing". Left off,
 * Discord pings whatever the text happens to contain, so an `@everyone`
 * somebody pasted into the body of a plain-text post would notify the server.
 * The only thing that can ping is the thing that was chosen.
 *
 * `@here` needs the `everyone` parse type; there is no separate one for it.
 */
function mentionFor(ping, roleId) {
  switch (ping) {
    case 'everyone': return { text: '@everyone', allowed: { parse: ['everyone'] } };
    case 'here':     return { text: '@here',     allowed: { parse: ['everyone'] } };
    case 'role':     return { text: `<@&${roleId}>`, allowed: { parse: [], roles: [roleId] } };
    default:         return { text: '', allowed: { parse: [] } };
  }
}

/**
 * Build one message payload.
 *
 * Returns `{ ok: false, error }` rather than throwing: every failure here is
 * something the person typing can fix, and it belongs on their screen as a
 * sentence, not in a log as a stack trace.
 *
 * `thumbnail`, `image` and `footer` are the fields /send_embed offers. Passing
 * `undefined` takes that command's default; passing an empty string leaves the
 * piece out, which is how somebody removes a footer they do not want.
 *
 * @returns {{ok: true, payload: object} | {ok: false, error: string}}
 */
function buildMessage({
  mode = 'embed', body = '', title = '',
  thumbnail, image, footer,
  color = '', ping = 'none', roleId = '', guildName = '',
} = {}) {
  const text = String(body ?? '').trim();
  const heading = String(title ?? '').trim();

  if (!MODES.includes(mode)) return { ok: false, error: `Unknown mode: ${mode}` };
  if (!text) return { ok: false, error: 'A message needs some text.' };
  if (!PINGS.includes(ping)) return { ok: false, error: `Unknown ping: ${ping}` };
  if (ping === 'role' && !SNOWFLAKE.test(String(roleId ?? '').trim())) {
    return { ok: false, error: 'Pinging a role needs the role.' };
  }

  const mention = mentionFor(ping, String(roleId ?? '').trim());
  const payload = { allowed_mentions: mention.allowed };

  if (mode === 'text') {
    // The ping goes on its own line ABOVE the message, so it reads as an
    // announcement rather than as a sentence starting with a mention.
    const content = [mention.text, text].filter(Boolean).join('\n\n');
    if (content.length > LIMITS.content) {
      return { ok: false, error: `A plain message can be at most ${LIMITS.content} characters, this one is ${content.length}.` };
    }
    payload.content = content;
    return { ok: true, payload };
  }

  if (heading.length > LIMITS.title) {
    return { ok: false, error: `The title can be at most ${LIMITS.title} characters, this one is ${heading.length}.` };
  }
  if (text.length > LIMITS.description) {
    return { ok: false, error: `The message can be at most ${LIMITS.description} characters, this one is ${text.length}.` };
  }

  const brandThumb = config.thumbnailUrl();
  const thumbUrl = thumbnail === undefined ? brandThumb : String(thumbnail ?? '').trim();
  const imageUrl = String(image ?? '').trim();
  const footerText = (footer === undefined ? defaultFooter(guildName) : String(footer ?? '')).trim();

  const embed = {
    description: text,
    color: config.parseColor(color || '', config.embedColor()),
  };
  if (heading) embed.title = heading;

  // An EMPTY url is an invalid-URL error from Discord, not a quiet no-op, so
  // every branded piece is left off on its own. Without this an installation
  // with no logo would fail to post at all.
  if (thumbUrl) embed.thumbnail = { url: thumbUrl };
  if (imageUrl) embed.image = { url: imageUrl };
  if (footerText) {
    embed.footer = brandThumb
      ? { text: footerText.slice(0, LIMITS.footer), icon_url: brandThumb }
      : { text: footerText.slice(0, LIMITS.footer) };
  }

  payload.embeds = [embed];
  if (mention.text) payload.content = mention.text;

  return { ok: true, payload };
}

module.exports = { buildMessage, mentionFor, defaultFooter, nowStr, LIMITS, MODES, PINGS };
