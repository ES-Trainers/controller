/* ES TRAINERS ConTroller — Admin Management: pure data helpers (no Firebase, no DOM, no network).
   Kept separate so the logic can be tested on its own. The server re-validates everything; this file only shapes the screen.
   Role presets are CONVENIENCE ONLY: a role name never grants anything. The saved permission map is the authority. */

export const PERMISSION_GROUPS = [
  { key: "tournament", label: "Tournaments", items: [
    { key: "viewTournament", label: "View tournaments", desc: "See tournaments and their details." },
    { key: "createTournament", label: "Create tournaments", desc: "Add a new tournament." },
    { key: "editTournament", label: "Edit tournaments", desc: "Change tournament details, schedule, fee and rules." },
    { key: "publishTournament", label: "Publish and change status", desc: "Open or close registration and change a tournament's status." },
    { key: "deleteTournament", label: "Delete tournaments", desc: "Delete an empty tournament." }
  ] },
  { key: "registration", label: "Registrations", items: [
    { key: "viewRegistration", label: "View registrations", desc: "See teams and registration status." },
    { key: "viewSensitiveData", label: "View sensitive player data", desc: "See phone numbers, emails and player IDs unmasked." },
    { key: "manageRegistration", label: "Manage registrations", desc: "Add notes and make allowed status changes." }
  ] },
  { key: "payments", label: "Payments", items: [
    { key: "viewPayments", label: "View payments", desc: "See payment records and status." },
    { key: "exportPayments", label: "Export payments", desc: "Download payment data." },
    { key: "initiateRefund", label: "Start refunds", desc: "Request a refund through the payment provider." }
  ] },
  { key: "matches", label: "Matches", items: [
    { key: "viewMatches", label: "View matches", desc: "See match schedules and results." },
    { key: "manageMatches", label: "Manage matches", desc: "Create and edit matches and results." },
    { key: "manageRoomCredentials", label: "Manage room credentials", desc: "See and set private room IDs and passwords." }
  ] },
  { key: "comms", label: "Communication and reconciliation", items: [
    { key: "sendEmails", label: "Send emails", desc: "Send emails to registered teams." },
    { key: "runReconciliation", label: "Run reconciliation", desc: "Check payments against registrations." }
  ] },
  { key: "admin", label: "Administration and settings", items: [
    { key: "manageAdmins", label: "Manage administrators", desc: "Reserved for the Owner. It cannot be granted to anyone else.", locked: true },
    { key: "viewActivityLogs", label: "View activity logs", desc: "See the audit trail of administrator actions." },
    { key: "manageSettings", label: "Manage settings", desc: "Change supported Controller settings." }
  ] }
];

export const ALL_KEYS = PERMISSION_GROUPS.reduce((a, g) => a.concat(g.items.map((i) => i.key)), []);
export const LOCKED_KEYS = ["manageAdmins"];
export const ASSIGNABLE_ROLES = ["super_admin", "tournament_admin", "finance_admin", "support_admin", "viewer"];
export const ROLE_NAMES = { owner: "Owner", super_admin: "Super Admin", tournament_admin: "Tournament Admin", finance_admin: "Finance Admin", support_admin: "Support Admin", viewer: "Viewer" };

const ALL_BUT_OWNER = ALL_KEYS.filter((k) => !LOCKED_KEYS.includes(k));
export const ROLE_PRESETS = {
  super_admin: ALL_BUT_OWNER,
  tournament_admin: ["viewTournament", "createTournament", "editTournament", "publishTournament", "viewRegistration", "viewMatches", "manageMatches", "manageRoomCredentials"],
  finance_admin: ["viewTournament", "viewRegistration", "viewPayments", "exportPayments", "initiateRefund", "runReconciliation"],
  support_admin: ["viewTournament", "viewRegistration", "viewSensitiveData", "manageRegistration", "viewMatches", "sendEmails"],
  viewer: ["viewTournament", "viewRegistration", "viewMatches"]
};

export function emptyPerms() { const o = {}; ALL_KEYS.forEach((k) => { o[k] = false; }); return o; }
export function presetPerms(role) {
  const o = emptyPerms();
  (ROLE_PRESETS[role] || []).forEach((k) => { if (!LOCKED_KEYS.includes(k)) o[k] = true; });
  return o;
}
/** Only known keys, strictly true stays true, locked keys are always false. Never trusts the input. */
export function sanitizePerms(raw) {
  const o = emptyPerms();
  if (raw && typeof raw === "object") ALL_KEYS.forEach((k) => { if (raw[k] === true && !LOCKED_KEYS.includes(k)) o[k] = true; });
  return o;
}
export function permsEqual(a, b) { return ALL_KEYS.every((k) => (a && a[k] === true) === (b && b[k] === true)); }
export function diffPerms(before, after) {
  return {
    added: ALL_KEYS.filter((k) => after[k] === true && before[k] !== true),
    removed: ALL_KEYS.filter((k) => before[k] === true && after[k] !== true)
  };
}
export function countGranted(p) { return ALL_KEYS.filter((k) => p && p[k] === true).length; }
export function labelOf(key) {
  for (const g of PERMISSION_GROUPS) { const i = g.items.find((x) => x.key === key); if (i) return i.label; }
  return key;
}
export function validEmail(v) {
  const e = String(v || "").trim().toLowerCase();
  return e.length <= 254 && /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,}$/.test(e);
}
