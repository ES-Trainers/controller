/* ES TRAINERS ConTroller — Registered teams (Phase 3): pure logic. No Firebase, no DOM, no network.
   It shapes what the screens show and send. The Apps Script backend re-validates everything and is the only authority.
   Rules mirrored from the public registration form: name 2-40, in-game name 2-30, BGMI ID 8-12 digits and unique within the team.
   Only name, in-game name, BGMI ID and the admin note can ever be edited. Team name, leader email and phone are locked. */

export const TEAM_ROLES = ["owner", "super_admin"];     // same two roles as the server's gate (and permissions.js)
export const LIMITS = { name: [2, 40], ign: [2, 30], note: 1000, removeReason: 5, purgeReason: 10 };
export const UID_RE = /^\d{8,12}$/;
const CTRL = /[\u0000-\u001F\u007F]/;
const CTRL_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function clean(s) { return String(s === undefined || s === null ? "" : s).replace(/\s+/g, " ").trim(); }
export function shortId(id) { return String(id || "").slice(0, 8); }
export function maskTail(v) { const s = String(v || ""); return s.length > 3 ? "\u2022\u2022\u2022" + s.slice(-3) : s ? "\u2022\u2022\u2022" : ""; }

/** What an account may do to a team. The server applies the same rule; the screen only decides what to show. */
export function teamCaps(role, hasManageRegistration) {
  const mgr = TEAM_ROLES.includes(role) && (role === "owner" || hasManageRegistration === true);
  return { canEdit: mgr, canRemove: mgr, canRestore: mgr, canPurge: role === "owner" };
}

/* ---------- list ---------- */
export function isGone(row) { return !!(row && (row.removed || row.purged)); }
export function countRows(rows) { const gone = rows.filter(isGone).length; return { active: rows.length - gone, removed: gone, all: rows.length }; }
export function matchesQuery(row, q) { const s = clean(q).toLowerCase(); return !s || String(row.teamName || "").toLowerCase().includes(s) || String(row.registrationId || "").toLowerCase().includes(s); }
export function filterRows(rows, view, q) { return rows.filter((r) => (view === "all" ? true : view === "removed" ? isGone(r) : !isGone(r)) && matchesQuery(r, q)); }

/* ---------- editing ---------- */
const same = (a, b) => clean(a) === clean(b);
/** form: { players: [{number, name, ign, uid?}], note }.  base: the server's registration view.  o: { masked } (BGMI IDs hidden => never edited). */
export function validateTeamForm(base, form, o) {
  o = o || {}; const e = {}; const uids = [];
  (form.players || []).forEach((p) => {
    const b = (base.players || []).find((x) => x.number === p.number) || {};
    if (!same(p.name, b.name)) { const n = clean(p.name).length; if (n < LIMITS.name[0] || n > LIMITS.name[1]) e["p" + p.number + ".name"] = "Name must be " + LIMITS.name[0] + " to " + LIMITS.name[1] + " characters."; else if (CTRL.test(clean(p.name))) e["p" + p.number + ".name"] = "Contains a character that is not allowed."; }
    if (!same(p.ign, b.ign)) { const n = clean(p.ign).length; if (n < LIMITS.ign[0] || n > LIMITS.ign[1]) e["p" + p.number + ".ign"] = "In-game name must be " + LIMITS.ign[0] + " to " + LIMITS.ign[1] + " characters."; else if (CTRL.test(clean(p.ign))) e["p" + p.number + ".ign"] = "Contains a character that is not allowed."; }
    if (!o.masked) { const u = clean(p.uid); if (!same(p.uid, b.uid) && !UID_RE.test(u)) e["p" + p.number + ".uid"] = "BGMI ID must be 8 to 12 digits."; uids.push({ n: p.number, u }); }
  });
  const seen = {}; uids.forEach((x) => { if (x.u && seen[x.u]) e["p" + x.n + ".uid"] = e["p" + x.n + ".uid"] || "This BGMI ID is already used by another player in the team."; seen[x.u] = true; });
  const note = String(form.note === undefined || form.note === null ? "" : form.note).replace(/\r\n?/g, "\n").trim();
  if (note.length > LIMITS.note || CTRL_TEXT.test(note)) e.note = "Up to " + LIMITS.note + " characters, no special characters.";
  return e;
}
/** Only what changed. Never includes team name, leader email/phone, status, payment or anything else. */
export function buildTeamChanges(base, form, o) {
  o = o || {}; const players = [];
  (form.players || []).forEach((p) => {
    const b = (base.players || []).find((x) => x.number === p.number); if (!b) return;
    const ch = { number: p.number };
    if (!same(p.name, b.name)) ch.name = clean(p.name);
    if (!same(p.ign, b.ign)) ch.ign = clean(p.ign);
    if (!o.masked && !same(p.uid, b.uid)) ch.uid = clean(p.uid);
    if (Object.keys(ch).length > 1) players.push(ch);
  });
  const changes = {};
  if (players.length) changes.players = players;
  const note = String(form.note === undefined || form.note === null ? "" : form.note).replace(/\r\n?/g, "\n").trim();
  if (note !== String(base.adminNote || "")) changes.adminNote = note;
  assertSafeTeamChanges(changes);
  return changes;
}
export function assertSafeTeamChanges(changes) {
  Object.keys(changes).forEach((k) => { if (k !== "players" && k !== "adminNote") throw new Error("Refusing to send " + k + "."); });
  (changes.players || []).forEach((p) => Object.keys(p).forEach((k) => { if (!["number", "name", "ign", "uid"].includes(k)) throw new Error("Refusing to send player field " + k + "."); }));
  return changes;
}
