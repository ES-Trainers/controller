/* ES TRAINERS ConTroller — roles, permissions and the access check.
   Signing in grants NOTHING. Access exists only when Roles/{uid} exists, is active,
   and agrees with the signed-in account. Every failure path denies access (fail closed).
   Nothing about the role is stored in the browser; it is read from Firestore each session.
   NOTE: this is the user-interface layer. Real enforcement is Firestore Security Rules
   (and later the Apps Script backend). Hiding a menu item is not a security control. */
import { db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const PERMISSION_KEYS = [
  "viewTournament", "createTournament", "editTournament", "publishTournament", "deleteTournament",
  "viewRegistration", "viewSensitiveData", "manageRegistration",
  "viewPayments", "exportPayments", "initiateRefund",
  "viewMatches", "manageMatches", "manageRoomCredentials",
  "sendEmails", "runReconciliation", "manageAdmins", "viewActivityLogs", "manageSettings"
];

export const ROLE_LABELS = {
  owner: "Owner",
  super_admin: "Super Admin",
  tournament_admin: "Tournament Admin",
  finance_admin: "Finance Admin",
  support_admin: "Support Admin",
  viewer: "Viewer"
};

/* Result codes -> what the person sees. */
const MESSAGES = {
  no_role: { title: "This account is not authorised", text: "Signing in worked, but this account has no access record for the Controller. If you should have access, send the account details below to an Owner." },
  inactive: { title: "Access is switched off", text: "This account has an access record, but it is not active. Contact an Owner." },
  mismatch: { title: "Access record does not match this account", text: "The access record found for this account does not agree with the signed-in email or ID. Nothing is shown until an Owner corrects it in Firebase Console." },
  bad_role: { title: "Access record is not valid", text: "The access record has an unknown role or missing fields. Contact an Owner." },
  unverified: { title: "Verify your email address", text: "This account's email address is not verified yet. Verify it, then try again." },
  rules: { title: "Access check is unavailable", text: "The Controller could not read its access records. This is expected until the access rule has been published in Firestore, or if this account has no access." },
  network: { title: "Could not check your access", text: "A network or service problem stopped the check. Your access has not been denied. Check your connection and try again." }
};

export function messageFor(code) { return MESSAGES[code] || MESSAGES.no_role; }

function deny(code) { return { ok: false, code }; }

/** Turn a Roles/{uid} snapshot into an access result. Never throws. */
export function evaluateRole(user, snap) {
  try {
    if (!user) return deny("no_role");
    if (user.emailVerified !== true) return deny("unverified");
    if (!snap || !snap.exists()) return deny("no_role");
    const d = snap.data() || {};
    if (snap.id !== user.uid || d.uid !== user.uid) return deny("mismatch");
    if (typeof d.email !== "string" || !user.email || d.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return deny("mismatch");
    if (!Object.prototype.hasOwnProperty.call(ROLE_LABELS, d.role)) return deny("bad_role");
    if (d.status !== "active") return deny("inactive");
    const raw = d.permissions && typeof d.permissions === "object" ? d.permissions : {};
    const permissions = {};
    PERMISSION_KEYS.forEach((k) => { permissions[k] = raw[k] === true; });
    return {
      ok: true,
      access: {
        uid: user.uid,
        email: user.email,
        name: typeof d.name === "string" && d.name.trim() ? d.name.trim() : user.displayName || user.email,
        role: d.role,
        roleLabel: ROLE_LABELS[d.role],
        permissions
      }
    };
  } catch (e) {
    return deny("bad_role");
  }
}

function classifyError(err) {
  const code = err && err.code;
  if (code === "permission-denied") return "rules";
  return "network"; // unavailable, deadline-exceeded, offline, etc.
}

/** One-time access check (used by the login page). */
export async function readAccessOnce(user) {
  try {
    const snap = await getDoc(doc(db, "Roles", user.uid));
    return evaluateRole(user, snap);
  } catch (err) {
    return deny(classifyError(err));
  }
}

/** Live access check (used by the dashboard). Returns an unsubscribe function.
    If the record is removed or switched off, onResult is called with ok:false at once. */
export function watchAccess(user, onResult) {
  return onSnapshot(
    doc(db, "Roles", user.uid),
    (snap) => onResult(evaluateRole(user, snap)),
    (err) => onResult(deny(classifyError(err)))
  );
}

/** Owners hold every permission. Everyone else is limited to what their record grants. */
export function can(access, key) {
  if (!access) return false;
  if (access.role === "owner") return PERMISSION_KEYS.includes(key);
  return access.permissions[key] === true;
}
