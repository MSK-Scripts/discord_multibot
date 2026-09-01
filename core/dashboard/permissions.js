/**
 * The dashboard permission model.
 *
 * Pure logic. No database, no Discord, no Express, so it is trivially testable
 * and the frontend can import the same list.
 *
 * How one member's permissions are resolved (see `resolvePermissions`):
 *   1. The guild owner always has EVERY permission and can never be locked out.
 *   2. An explicit `user` row OVERRIDES all role rows. That is the whole point
 *      of the user/role split: it lets a single permission be revoked from one
 *      person that their role would otherwise grant.
 *   3. Otherwise the union of every matching `role` row.
 *   4. No matching row at all: no permissions, and no way in.
 */

/** The complete set. Frozen: the database is never allowed to widen it. */
const PERMISSIONS = Object.freeze([
  'config.view',     // read config.jsonc, the message catalogue and .env keys
  'config.edit',     // write them
  'settings.view',   // read the dashboard's own appearance
  'settings.edit',   // change it
  'bot.control',     // start / stop / restart the bot process, read its log
  'points.view',     // the minigame leaderboard
  'points.manage',   // adjust a balance
  'access.manage',   // manage these permissions
]);

/** UI labels. Next to the list, so a new permission without a label is obvious. */
const PERMISSION_LABELS = Object.freeze({
  'config.view':   { en: 'View configuration',        de: 'Konfiguration ansehen' },
  'config.edit':   { en: 'Edit configuration',        de: 'Konfiguration bearbeiten' },
  'settings.view': { en: 'View dashboard settings',   de: 'Dashboard-Einstellungen ansehen' },
  'settings.edit': { en: 'Edit dashboard settings',   de: 'Dashboard-Einstellungen bearbeiten' },
  'bot.control':   { en: 'Control the bot',           de: 'Bot steuern' },
  'points.view':   { en: 'View points',               de: 'Punkte ansehen' },
  'points.manage': { en: 'Adjust points',             de: 'Punkte anpassen' },
  'access.manage': { en: 'Manage permissions',        de: 'Rechte verwalten' },
});

const SUBJECT_TYPES = Object.freeze(['user', 'role']);

const isPermission = (value) => typeof value === 'string' && PERMISSIONS.includes(value);
const isSubjectType = (value) => typeof value === 'string' && SUBJECT_TYPES.includes(value);

/**
 * Parse a `permissions` column into a clean array.
 *
 * Accepts an array (some drivers hand back parsed JSON) or a JSON string.
 * UNKNOWN ENTRIES ARE DROPPED, so a permission removed from the code can never
 * come back to life through a stale row that still lists it.
 */
function parsePermissions(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPermission);
}

/** The rows relevant to one member, out of all access rows. */
function selectAccessRows(rows, userId, roleIds) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = Array.isArray(roleIds) ? roleIds : [];
  return {
    userRow: list.find(r => r.subject_type === 'user' && r.subject_id === userId) ?? null,
    roleRows: list.filter(r => r.subject_type === 'role' && ids.includes(r.subject_id)),
  };
}

/**
 * The effective permissions of a member. See the module header for the order.
 * An INACTIVE row grants nothing, which is what "switched off without deleting
 * it" has to mean.
 */
function resolvePermissions({ isOwner = false, userRow = null, roleRows = [] } = {}) {
  // 1. Owner: everything, always. Never derived from the database, so no row
  //    and no missing row can lock the owner out of their own server.
  if (isOwner) return [...PERMISSIONS];

  // 2. An explicit user row is the final word. It REPLACES role permissions
  //    rather than adding to them, which is what makes targeted revocation work.
  if (userRow) return userRow.active === false ? [] : parsePermissions(userRow.permissions);

  // 3. The union over every matching, active role row.
  const set = new Set();
  for (const row of roleRows) {
    if (row.active === false) continue;
    for (const p of parsePermissions(row.permissions)) set.add(p);
  }
  return [...set];
}

/** Does this permission list satisfy `required`? An array means any-of. */
function hasPermission(permissions, required) {
  const list = Array.isArray(permissions) ? permissions : [];
  if (Array.isArray(required)) return required.some(r => list.includes(r));
  return list.includes(required);
}

/**
 * May this member reach the dashboard at all?
 *
 * This panel is STAFF ONLY. There is nothing here a normal member would use, so
 * unlike the ticket bot there is no public portal to opt into: the owner, or
 * anybody with at least one permission, and nobody else.
 */
function canUseDashboard({ isOwner = false, permissions = [] } = {}) {
  if (isOwner) return true;
  return Array.isArray(permissions) && permissions.length > 0;
}

/**
 * Stop an actor from destroying or escalating their own access.
 *
 * Granting permissions to OTHER people stays allowed; only self-edits are
 * constrained. The owner is unconstrained, because their permissions never come
 * from the database in the first place.
 *
 * @returns {string|null} an error message, or null when the edit is allowed.
 */
function checkSelfEdit({ actorId, actorIsOwner, actorPermissions, targetType, targetId, nextPermissions, nextActive }) {
  if (actorIsOwner) return null;
  if (targetType !== 'user' || targetId !== actorId) return null;

  const next = Array.isArray(nextPermissions) ? nextPermissions : [];
  const own = Array.isArray(actorPermissions) ? actorPermissions : [];

  if (!next.includes('access.manage')) {
    return "You cannot remove your own 'Manage permissions' permission.";
  }
  if (!nextActive) {
    return 'You cannot deactivate your own access.';
  }
  const escalated = next.filter(p => !own.includes(p));
  if (escalated.length > 0) {
    return `You cannot grant yourself additional permissions: ${escalated.join(', ')}`;
  }
  return null;
}

module.exports = {
  PERMISSIONS, PERMISSION_LABELS, SUBJECT_TYPES,
  isPermission, isSubjectType, parsePermissions,
  selectAccessRows, resolvePermissions, hasPermission, canUseDashboard, checkSelfEdit,
};
