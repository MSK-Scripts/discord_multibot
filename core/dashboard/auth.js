/**
 * Discord OAuth2 login.
 *
 * A self-hoster already has a Discord application, so re-using it for the login
 * means no second account system. They only have to add the client secret and
 * register the redirect URI.
 *
 * THE SCOPE IS `identify` AND NOTHING ELSE. It answers exactly one question:
 * who is this person. Their roles and owner status are resolved server-side
 * through the bot (see discord.js → resolveMemberContext). Asking for
 * `guilds.members.read` would mean letting the client tell us what permissions
 * it ought to have.
 */

const { redirectUri } = require('./config');

const OAUTH_AUTHORIZE = 'https://discord.com/oauth2/authorize';
const OAUTH_TOKEN = 'https://discord.com/api/v10/oauth2/token';
const USER_ME = 'https://discord.com/api/v10/users/@me';

const SCOPE = 'identify';

/** Where the user is sent. `state` is a signed, short-lived token: CSRF for OAuth. */
function buildAuthorizeUrl(cfg, state) {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(cfg),
    response_type: 'code',
    scope: SCOPE,
    state,
    prompt: 'none',
  });
  return `${OAUTH_AUTHORIZE}?${params}`;
}

/**
 * Exchange the authorization code for an access token. `redirect_uri` has to
 * match the registered one EXACTLY, Discord does a string compare.
 */
async function exchangeCode(cfg, code) {
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(cfg),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OAuth token exchange failed (${res.status}): ${detail}`);
  }
  return res.json();
}

/** Who the user is, according to their own access token. */
async function fetchOAuthUser(accessToken) {
  const res = await fetch(USER_ME, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Failed to load the Discord user (${res.status}).`);

  const user = await res.json();
  return {
    id: user.id,
    username: user.username,
    displayName: user.global_name || user.username,
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : null,
  };
}

module.exports = { buildAuthorizeUrl, exchangeCode, fetchOAuthUser, SCOPE };
