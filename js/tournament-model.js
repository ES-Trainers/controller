/* ES TRAINERS ConTroller — Tournament management (Phase 2): pure logic. No Firebase, no DOM, no network.
   It shapes what the screens send. The Apps Script backend validates everything again and is the only authority.
   HARD RULES kept here and covered by tests:
   - registeredTeams, entryFee, date and id are NEVER part of an update payload.
   - A new tournament is ALWAYS created Upcoming, registration OFF. Opening registration is a separate, explicit action.
   - Only fields that actually changed are sent. */

export const NEW_ID = "__new"; // cannot collide with a real tournament id: ids start with a letter or digit
export const OPEN_WINDOW_MS = 48 * 60 * 60 * 1000;
export const OPEN_WINDOW_TEXT = "Registration closes 48 hours before the start, so an open tournament must start more than 48 hours from now. Choose a later start first.";
export const STATUS_LABELS = { upcoming: "Upcoming", registration_open: "Registration open", live: "Live", completed: "Completed" };
export const STATUS_CLASS = { upcoming: "badge--upcoming", registration_open: "badge--open", live: "badge--live", completed: "badge--done" };

/** Fields the edit form may ever send. status / registrationEnabled only travel through the status actions below. */
export const EDIT_KEYS = ["title", "match", "startIso", "entryFeeInr", "prizePool", "maxTeams", "rules"];
const SENDABLE = EDIT_KEYS.concat(["status", "registrationEnabled"]);
export const NEVER_SEND = ["registeredTeams", "entryFee", "date", "id", "startMs"];

export const LIMITS = { title: [3, 100], match: [2, 40], prizePool: [1, 40], fee: [1, 100000], maxTeams: [2, 100], rules: [20, 20000] };

/* ---------- ids ---------- */
/** Same rule as the backend's admId_. Older ids (capitals, underscores) can be viewed but not managed here. */
export function isAdminId(id) { return typeof id === "string" && id.length >= 3 && id.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id); }
export function slugify(title) {
  let s = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/g, "");
  return s;
}

/* ---------- IST date handling (no browser time zone involved: the typed text is the IST time) ---------- */
const INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
export function isoToInput(iso) { const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\+05:30$/.exec(String(iso || "")); return m ? m[1] : ""; }
export function inputToIso(v) { return INPUT_RE.test(String(v || "")) ? v + "+05:30" : ""; }
export function isoToMs(iso) { const ms = Date.parse(iso || ""); return Number.isFinite(ms) ? ms : null; }
function realDate(v) {
  const m = INPUT_RE.exec(String(v || "")); if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (y < 2024 || y > 2100 || h > 23 || mi > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/* ---------- validation (mirror of the server, for friendly messages only) ---------- */
const CTRL_LINE = /[\u0000-\u001F\u007F]/;
const CTRL_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export function normalizeRules(s) { return String(s === undefined || s === null ? "" : s).replace(/\r\n?/g, "\n").trim(); }
export function feeText(n) { return "\u20B9" + n + " / team"; }

/** form: { id, title, match, start, fee, prize, maxTeams, rules } as typed.  o: { mode, status, registered, nowMs, feeLocked, rulesLocked, startChanged } */
export function validateForm(f, o) {
  o = o || {}; const e = {}; const now = o.nowMs === undefined ? Date.now() : o.nowMs;
  const line = (key, val, lim, label) => {
    const t = String(val === undefined || val === null ? "" : val).trim();
    if (t.length < lim[0] || t.length > lim[1]) e[key] = label + " must be " + lim[0] + " to " + lim[1] + " characters.";
    else if (CTRL_LINE.test(t) || /[<>]/.test(t)) e[key] = label + " cannot contain line breaks, < or >.";
  };
  if (o.mode === "create" && !isAdminId(f.id)) e.id = "Use 3 to 60 characters: lowercase letters, numbers and single hyphens, for example bgmi-cup-02.";
  line("title", f.title, LIMITS.title, "Title");
  line("match", f.match, LIMITS.match, "Map");
  line("prizePool", f.prize, LIMITS.prizePool, "Prize pool");
  if (!realDate(f.start)) e.startIso = "Enter a real date and time (IST).";
  else {
    const ms = isoToMs(inputToIso(f.start)); const status = o.mode === "create" ? "upcoming" : o.status;
    if (o.mode === "create" || o.startChanged) {
      if ((status === "upcoming" || status === "registration_open") && ms <= now) e.startIso = "The start must be in the future.";
      else if (status === "registration_open" && ms <= now + OPEN_WINDOW_MS) e.startIso = OPEN_WINDOW_TEXT;
    }
  }
  if (!o.feeLocked) { const t = String(f.fee === undefined || f.fee === null ? "" : f.fee).trim(); const n = Number(t);
    if (!/^\d+$/.test(t) || n < LIMITS.fee[0] || n > LIMITS.fee[1]) e.entryFeeInr = "Entry fee must be a whole number of rupees from 1 to 100000."; }
  { const t = String(f.maxTeams === undefined || f.maxTeams === null ? "" : f.maxTeams).trim(); const n = Number(t);
    if (!/^\d+$/.test(t) || n < LIMITS.maxTeams[0] || n > LIMITS.maxTeams[1]) e.maxTeams = "Maximum teams must be a whole number from 2 to 100.";
    else if (o.mode === "edit" && n < (o.registered || 0)) e.maxTeams = "Cannot be lower than the " + o.registered + " teams already registered."; }
  if (!o.rulesLocked) { const r = normalizeRules(f.rules);
    if (r.length < LIMITS.rules[0] || r.length > LIMITS.rules[1]) e.rules = "Rules must be 20 to 20000 characters.";
    else if (CTRL_TEXT.test(r)) e.rules = "Rules contain a character that is not allowed."; }
  return e;
}

/* ---------- payload builders ---------- */
/** Always Upcoming, registration OFF. There is deliberately no way to choose otherwise here. */
export function buildCreatePayload(f) {
  const p = { id: String(f.id).trim(), tournament: {
    title: String(f.title).trim(), match: String(f.match).trim(), startIso: inputToIso(f.start), entryFeeInr: Number(f.fee), prizePool: String(f.prize).trim(),
    maxTeams: Number(f.maxTeams), rules: normalizeRules(f.rules), status: "upcoming", registrationEnabled: false } };
  assertSafeChanges(p.tournament, true);
  return p;
}
/** Only what changed. base = the server's tournament view; f = the form as typed. */
export function buildEditChanges(base, f, o) {
  o = o || {}; const c = {};
  const title = String(f.title).trim(), match = String(f.match).trim(), prize = String(f.prize).trim();
  const startIso = inputToIso(f.start);
  if (title !== base.title) c.title = title;
  if (match !== base.match) c.match = match;
  if (startIso && startIso !== base.startIso) c.startIso = startIso;
  if (!o.feeLocked && Number(f.fee) !== base.entryFeeInr) c.entryFeeInr = Number(f.fee);
  if (prize !== base.prizePool) c.prizePool = prize;
  if (Number(f.maxTeams) !== base.maxTeams) c.maxTeams = Number(f.maxTeams);
  if (!o.rulesLocked && base.rulesType !== "array" && normalizeRules(f.rules) !== normalizeRules(base.rules)) c.rules = normalizeRules(f.rules);
  assertSafeChanges(c, false);
  return c;
}
/** Last line of defence on the client: nothing outside the allowed keys, never registeredTeams. */
export function assertSafeChanges(changes, isCreate) {
  Object.keys(changes).forEach((k) => {
    if (NEVER_SEND.includes(k)) throw new Error("Refusing to send " + k + ".");
    if (!SENDABLE.includes(k)) throw new Error("Unexpected field " + k + ".");
  });
  if (isCreate && (changes.status !== "upcoming" || changes.registrationEnabled !== false)) throw new Error("A new tournament must be Upcoming with registration off.");
  return changes;
}

/* ---------- status actions ---------- */
export const ACTIONS = {
  open: { label: "Open registration", perm: "publishTournament", kind: "primary" },
  close: { label: "Close registration", perm: "publishTournament", kind: "outline" },
  live: { label: "Mark live", perm: "publishTournament", kind: "outline" },
  complete: { label: "Mark completed", perm: "publishTournament", kind: "outline" },
  switchOff: { label: "Turn registration switch off", perm: "publishTournament", kind: "outline" }
};
/** Which actions make sense for a tournament in this state. (The server accepts any status; the screen offers only these.) */
export function availableActions(status, flag) {
  const out = [];
  if (status === "upcoming") out.push("open", "live");
  else if (status === "registration_open") out.push("close", "live");
  else if (status === "live") out.push("complete");
  if (flag === true && status !== "registration_open" && STATUS_LABELS[status]) out.push("switchOff");
  return out;
}
/** Ordered update calls for an action, or null if it is no longer valid for the current state.
 *  Close is TWO calls on purpose: the backend refuses to switch registration off in the same save that leaves "registration open".
 *  Step 1 (status to Upcoming) already stops registration; step 2 turns the switch off. */
export function planStatusChange(key, cur) {
  const flag = cur.registrationEnabled === true;
  if (key === "open") return cur.status === "upcoming" ? [{ changes: assertSafeChanges(flag ? { status: "registration_open" } : { status: "registration_open", registrationEnabled: true }) }] : null;
  if (key === "close") return cur.status === "registration_open" ? [{ changes: { status: "upcoming" } }].concat(flag ? [{ changes: { registrationEnabled: false } }] : []) : null;
  if (key === "live") return cur.status === "upcoming" || cur.status === "registration_open" ? [{ changes: { status: "live" } }] : null;
  if (key === "complete") return cur.status === "live" ? [{ changes: { status: "completed" } }] : null;
  if (key === "switchOff") return flag && cur.status !== "registration_open" && STATUS_LABELS[cur.status] ? [{ changes: { registrationEnabled: false } }] : null;
  return null;
}
/** Plain-language consequences shown in the confirmation dialog. */
export function describeAction(key) {
  const keep = "Existing registrations, payments, phone reservations and team counts are not changed.";
  return {
    open: { title: "Open registration?", confirm: "Open registration", lines: ["Teams can register and pay as soon as you confirm. Registration closes automatically 48 hours before the start.", "This also turns the registration switch on.", keep] },
    close: { title: "Close registration?", confirm: "Close registration", danger: true, lines: ["Registration stops now: the status goes back to Upcoming and the registration switch is turned off.", "Someone who is in the middle of paying at this moment may be told registration has closed; the existing payment safeguards handle that case.", keep] },
    live: { title: "Mark this tournament live?", confirm: "Mark live", lines: ["The status becomes Live, which also ends registration (only an open tournament accepts registrations).", keep] },
    complete: { title: "Mark this tournament completed?", confirm: "Mark completed", lines: ["The status becomes Completed.", keep] },
    switchOff: { title: "Turn the registration switch off?", confirm: "Turn off", lines: ["The tournament is not open, so this changes nothing for players; it switches the registration safeguard off.", keep] }
  }[key];
}
/** Client-side preview of why a delete would be refused. The server decides; it also needs the 1-hour quiet period and empty stored data. */
export function deleteHints(t) {
  const h = [];
  if (t.status !== "upcoming" && t.status !== "completed") h.push("Only an Upcoming or Completed tournament can be deleted.");
  if (t.registrationEnabled === true) h.push("The registration switch is on. Turn it off first.");
  if (typeof t.registeredTeams === "number" && t.registeredTeams > 0) h.push(t.registeredTeams + " team(s) are registered. Tournaments with registrations are kept.");
  return h;
}
