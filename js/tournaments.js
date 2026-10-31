/* ES TRAINERS ConTroller — tournaments (READ-ONLY in M0).
   One shared live listener on the public `tournaments` collection feeds both the dashboard and
   this view, so opening several pages never opens several listeners. The listener is removed
   as soon as no page is using it. Nothing here writes to Firestore. */
import { db, PUBLIC_SITE } from "./firebase-config.js";
import { collection, query, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { parseStartMillis, evaluate, formatDateTimeIST, formatCountdown, REGISTRATION_OPEN_STATUS } from "./lifecycle.js";
import { icon } from "./icons.js";
import { esc, qs, qsa, debounce, money, copyText, skeletonRows, emptyState, errorState } from "./ui.js";

const LIMIT = 200; // same ceiling the public site uses

/* ---------- Shared store ---------- */
/* One listener serves every page. When the last page leaves, the listener is kept for a short
   grace period so moving between Dashboard and Tournaments reuses it instead of re-reading the
   whole collection. It is closed for good after the grace period, and immediately on sign-out. */
const GRACE_MS = 30000;
const store = { unsub: null, subs: new Set(), items: null, error: null, timer: null };

function snapshotState() { return { items: store.items, error: store.error, capped: !!(store.items && store.items.length >= LIMIT) }; }
function emit() { const s = snapshotState(); store.subs.forEach((cb) => cb(s)); }

function startListener() {
  if (store.unsub) return;
  store.unsub = onSnapshot(
    query(collection(db, "tournaments"), limit(LIMIT)),
    (snap) => { store.items = snap.docs.map((d) => normalize(d.id, d.data())); store.error = null; emit(); },
    (err) => { store.error = err; store.unsub = null; emit(); }
  );
}

/** Subscribe to the tournaments list. Returns an unsubscribe function. */
export function watchTournaments(cb) {
  clearTimeout(store.timer); store.timer = null;
  store.subs.add(cb);
  if (!store.unsub) { store.error = null; startListener(); }
  if (store.items || store.error) cb(snapshotState());
  return () => {
    store.subs.delete(cb);
    if (!store.subs.size) { clearTimeout(store.timer); store.timer = setTimeout(stopTournaments, GRACE_MS); }
  };
}
export function retryTournaments() { store.error = null; startListener(); }

/** Close the listener now and forget cached data (used on sign-out). */
export function stopTournaments() {
  clearTimeout(store.timer); store.timer = null;
  if (store.unsub) { store.unsub(); store.unsub = null; }
  store.items = null; store.error = null;
}

/* ---------- Normalising ---------- */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v) => (typeof v === "string" ? v : "");

export function normalize(id, d) {
  const raw = d || {};
  return {
    id,
    title: text(raw.title).trim(),
    status: text(raw.status),
    match: text(raw.match),
    date: raw.date,
    startMs: parseStartMillis(raw.date),
    entryFee: raw.entryFee,
    entryFeeInr: num(raw.entryFeeInr),
    prizePool: raw.prizePool,
    maxTeams: num(raw.maxTeams),
    registeredTeams: num(raw.registeredTeams),
    rules: text(raw.rules),
    fieldNames: Object.keys(raw)
  };
}
const KNOWN_FIELDS = ["title", "status", "match", "date", "entryFee", "entryFeeInr", "prizePool", "maxTeams", "registeredTeams", "rules"];

export const STATUS_VIEW = {
  registration_open: { label: "Registration open", cls: "badge--open", order: 0 },
  upcoming: { label: "Upcoming", cls: "badge--upcoming", order: 1 },
  live: { label: "Live", cls: "badge--live", order: 2 },
  completed: { label: "Completed", cls: "badge--done", order: 3 }
};
export function statusBadge(status) {
  const v = STATUS_VIEW[status];
  return '<span class="badge ' + (v ? v.cls : "badge--warn") + '">' + esc(v ? v.label : status || "No status") + "</span>";
}

/** Same rule the backend uses to price an order: the first number inside entryFee. */
function backendFee(t) {
  const m = String(t.entryFee === undefined || t.entryFee === null ? "" : t.entryFee).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Read-only compatibility checks against what the public site and Apps Script expect. */
export function dataChecks(t, nowMs) {
  const out = [];
  const warn = (msg) => out.push({ level: "warn", msg });
  const info = (msg) => out.push({ level: "info", msg });
  const ev = evaluate({ date: t.date, status: t.status, registeredTeams: t.registeredTeams, maxTeams: t.maxTeams }, nowMs);
  if (!t.title) warn("No title. Cards on the public site will look empty.");
  if (t.startMs === null) warn("The date field is missing, or is not a Firestore timestamp with a time of day. The public site pauses registration for it.");
  if (!(t.maxTeams > 0)) warn("maxTeams is missing or not a positive number.");
  if (t.registeredTeams === null) warn("registeredTeams is missing or not a number.");
  else if (t.maxTeams > 0 && t.registeredTeams > t.maxTeams) warn("registeredTeams (" + t.registeredTeams + ") is higher than maxTeams (" + t.maxTeams + ").");
  const fee = backendFee(t);
  if (!(fee > 0)) warn("entryFee has no usable amount, so the backend cannot create a payment order.");
  else if (t.entryFeeInr !== null && t.entryFeeInr !== fee) warn("entryFee shows " + fee + " but entryFeeInr is " + t.entryFeeInr + ". The backend charges the amount in entryFee.");
  if (!t.rules.trim()) warn("rules is empty. The backend refuses registrations until rules are published.");
  if (t.status && !STATUS_VIEW[t.status]) warn("Status \u201C" + t.status + "\u201D is not one the public site lists (upcoming, registration_open, live).");
  if (!t.status) warn("No status. The public site will not list this tournament.");
  if (t.status === REGISTRATION_OPEN_STATUS && (ev.phase === "closed" || ev.phase === "expired")) info("Status is registration_open but the 48-hour deadline has passed, so the public site already treats it as closed.");
  return out;
}

/* ---------- Shared bits ---------- */
export function fillBar(t) {
  if (t.registeredTeams === null || !(t.maxTeams > 0)) return '<span class="faint">No data</span>';
  const pct = Math.min(100, Math.round((t.registeredTeams / t.maxTeams) * 100));
  return '<div class="num"><strong>' + t.registeredTeams + "</strong> / " + t.maxTeams + '</div><div class="progress' + (pct >= 100 ? " progress--full" : "") +
    '" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(t.title || t.id) + ' slots filled"><span style="width:' + pct + '%"></span></div>';
}
const PHASE_TEXT = {
  invalid: "Date problem", expired: "Started or finished", closed: "Registration closed",
  open: "Registration open", full: "Full", waiting: "Not open yet"
};

/** Table rows used by the dashboard and the list. */
export function rowHtml(t, nowMs) {
  const ev = evaluate({ date: t.date, status: t.status, registeredTeams: t.registeredTeams, maxTeams: t.maxTeams }, nowMs);
  return "<tr>" +
    '<td class="cell-main" data-label="Tournament"><a class="cell-title" href="#/tournaments/' + encodeURIComponent(t.id) + '">' + esc(t.title || "Untitled tournament") + '</a><div class="cell-sub break">' + esc(t.id) + "</div></td>" +
    '<td data-label="Status">' + statusBadge(t.status) + "</td>" +
    '<td data-label="Starts">' + esc(t.startMs === null ? "Not set" : formatDateTimeIST(t.startMs)) + "</td>" +
    '<td data-label="Registration"><div class="cell-val">' + esc(PHASE_TEXT[ev.phase] || ev.phase) + (ev.deadlineMs ? '<div class="cell-sub">Closes ' + esc(formatDateTimeIST(ev.deadlineMs)) + "</div>" : "") + "</div></td>" +
    '<td data-label="Entry fee">' + esc(money(t.entryFee)) + "</td>" +
    '<td data-label="Teams"><div class="cell-val">' + fillBar(t) + "</div></td></tr>";
}
export const TABLE_HEAD = "<thead><tr><th>Tournament</th><th>Status</th><th>Starts</th><th>Registration</th><th>Entry fee</th><th>Teams</th></tr></thead>";

/* ---------- Views ---------- */
export function mount(container, ctx) {
  const id = ctx.params && ctx.params.id ? ctx.params.id : null;
  return id ? mountDetail(container, id) : mountList(container);
}

function mountList(container) {
  container.innerHTML =
    '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">Tournaments</h1><p>Live from the same data the public website uses. Read-only for now.</p></div></div>' +
    '<div class="toolbar">' +
    '<div class="search"><label class="sr-only" for="t-search">Search tournaments</label>' + icon("search") + '<input class="input" id="t-search" type="search" placeholder="Search by name, ID or map" autocomplete="off"></div>' +
    '<div><label class="sr-only" for="t-status">Filter by status</label><select class="select" id="t-status"><option value="">All statuses</option><option value="registration_open">Registration open</option><option value="upcoming">Upcoming</option><option value="live">Live</option><option value="completed">Completed</option><option value="__other">Other or missing</option></select></div>' +
    '<div><label class="sr-only" for="t-sort">Sort by</label><select class="select" id="t-sort"><option value="date_desc">Start date, latest first</option><option value="date_asc">Start date, soonest first</option><option value="title">Name, A to Z</option><option value="fill">Most filled</option></select></div></div>' +
    '<div id="t-body">' + skeletonRows(4) + "</div>";

  let state = { items: null, error: null, capped: false };
  const search = qs("#t-search", container), statusSel = qs("#t-status", container), sortSel = qs("#t-sort", container), body = qs("#t-body", container);

  function render() {
    if (state.error) { body.innerHTML = errorState("Could not load tournaments", "The list could not be read from Firestore. Check your connection and try again.", "t-retry"); const b = qs("#t-retry", body); if (b) b.addEventListener("click", () => { body.innerHTML = skeletonRows(4); retryTournaments(); }); return; }
    if (!state.items) { body.innerHTML = skeletonRows(4); return; }
    const now = Date.now(), q = search.value.trim().toLowerCase(), f = statusSel.value;
    let list = state.items.filter((t) => {
      if (f === "__other" ? STATUS_VIEW[t.status] : f && t.status !== f) return false;
      return !q || (t.title + " " + t.id + " " + t.match).toLowerCase().includes(q);
    });
    const by = sortSel.value;
    list.sort((a, b) => {
      if (by === "title") return (a.title || a.id).localeCompare(b.title || b.id);
      if (by === "fill") return ((b.registeredTeams || 0) / (b.maxTeams || Infinity)) - ((a.registeredTeams || 0) / (a.maxTeams || Infinity));
      const av = a.startMs === null ? (by === "date_asc" ? Infinity : -Infinity) : a.startMs;
      const bv = b.startMs === null ? (by === "date_asc" ? Infinity : -Infinity) : b.startMs;
      return by === "date_asc" ? av - bv : bv - av;
    });
    if (!state.items.length) { body.innerHTML = emptyState("No tournaments yet", "When a tournament exists in Firestore it appears here automatically.", "trophy"); return; }
    if (!list.length) { body.innerHTML = emptyState("No matches", "No tournament fits that search and filter. Clear the filter to see all " + state.items.length + ".", "search"); return; }
    body.innerHTML = '<p class="result-count" aria-live="polite">Showing ' + list.length + " of " + state.items.length + (state.capped ? " (the first " + LIMIT + " are loaded)" : "") + "</p>" +
      '<div class="table-wrap"><table class="table">' + TABLE_HEAD + "<tbody>" + list.map((t) => rowHtml(t, now)).join("") + "</tbody></table></div>";
  }

  const unsub = watchTournaments((s) => { state = s; render(); });
  const onInput = debounce(render, 150);
  search.addEventListener("input", onInput);
  statusSel.addEventListener("change", render);
  sortSel.addEventListener("change", render);
  return () => unsub();
}

function mountDetail(container, id) {
  container.innerHTML = '<a class="crumb" href="#/tournaments">' + icon("back", "icon--sm") + 'All tournaments</a><div id="d-body">' + skeletonRows(3) + "</div>";
  const body = qs("#d-body", container);
  let timer = null, state = { items: null, error: null };

  function render() {
    if (timer) { clearInterval(timer); timer = null; }
    if (state.error) { body.innerHTML = errorState("Could not load this tournament", "Check your connection and try again.", "d-retry"); const b = qs("#d-retry", body); if (b) b.addEventListener("click", () => { body.innerHTML = skeletonRows(3); retryTournaments(); }); return; }
    if (!state.items) { body.innerHTML = skeletonRows(3); return; }
    const t = state.items.find((x) => x.id === id);
    if (!t) { body.innerHTML = emptyState("Tournament not found", "No tournament has the ID \u201C" + id + "\u201D. It may have been removed.", "search"); return; }
    const now = Date.now();
    const ev = evaluate({ date: t.date, status: t.status, registeredTeams: t.registeredTeams, maxTeams: t.maxTeams }, now);
    const checks = dataChecks(t, now);
    const remaining = t.maxTeams > 0 && t.registeredTeams !== null ? Math.max(0, t.maxTeams - t.registeredTeams) : null;
    const other = t.fieldNames.filter((k) => !KNOWN_FIELDS.includes(k));
    document.title = (t.title || t.id) + " \u00B7 ES Trainers ConTroller";

    body.innerHTML =
      '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">' + esc(t.title || "Untitled tournament") + '</h1><p class="copy-line"><code>' + esc(t.id) + '</code><button class="btn btn--outline btn--sm btn--icon" id="d-copy" type="button" aria-label="Copy tournament ID">' + icon("copy", "icon--sm") + "</button></p></div>" +
      '<div class="btn-row" style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap">' + statusBadge(t.status) +
      '<a class="btn btn--outline btn--sm" href="' + PUBLIC_SITE + "/register-bgmi.html?id=" + encodeURIComponent(t.id) + '" target="_blank" rel="noopener noreferrer">Public page' + icon("external", "icon--sm") + "</a></div></div>" +
      '<div class="detail-grid">' +
      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("calendar") + "Schedule</h2></div><dl class=\"kv\">" +
      "<div><dt>Starts</dt><dd>" + esc(t.startMs === null ? "Not set" : formatDateTimeIST(t.startMs)) + "</dd></div>" +
      "<div><dt>Registration closes</dt><dd>" + esc(ev.deadlineMs ? formatDateTimeIST(ev.deadlineMs) : "Not set") + "</dd></div>" +
      "<div><dt>Registration state</dt><dd>" + esc(PHASE_TEXT[ev.phase] || ev.phase) + "</dd></div>" +
      '<div><dt>Time to deadline</dt><dd class="num" id="d-count">' + esc(ev.msToDeadline !== null && ev.msToDeadline > 0 ? formatCountdown(ev.msToDeadline) : "\u2014") + "</dd></div>" +
      "<div><dt>Map</dt><dd>" + esc(t.match || "Not set") + "</dd></div></dl></section>" +
      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("users") + "Teams</h2></div>" +
      '<div class="big-num num">' + (t.registeredTeams === null ? "\u2014" : t.registeredTeams) + '<span class="muted" style="font-size:1rem;font-weight:500"> of ' + (t.maxTeams === null ? "?" : t.maxTeams) + " slots</span></div>" +
      '<div style="margin:var(--space-2) 0 var(--space-3)">' + fillBar(t).replace(/<div class="num">.*?<\/div>/, "") + "</div>" +
      "<dl class=\"kv\"><div><dt>Slots remaining</dt><dd>" + (remaining === null ? "Unknown" : remaining) + "</dd></div></dl>" +
      '<p class="hint" style="margin-top:var(--space-2)">This is the registeredTeams counter kept by the backend. A later milestone adds a reconciliation check against actual registrations.</p></section>' +
      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("rupee") + "Money</h2></div><dl class=\"kv\">" +
      "<div><dt>Entry fee (as shown)</dt><dd>" + esc(money(t.entryFee)) + "</dd></div>" +
      "<div><dt>entryFeeInr</dt><dd>" + esc(t.entryFeeInr === null ? "Not set" : t.entryFeeInr) + "</dd></div>" +
      "<div><dt>Prize pool</dt><dd>" + esc(money(t.prizePool)) + "</dd></div></dl></section>" +
      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("shield") + "Data checks</h2></div>" +
      (checks.length ? '<ul class="checks">' + checks.map((c) => '<li>' + icon(c.level === "warn" ? "alert" : "info", c.level) + "<span>" + esc(c.msg) + "</span></li>").join("") + "</ul>"
        : '<ul class="checks"><li>' + icon("check", "ok") + "<span>Fields match what the public site and backend expect.</span></li></ul>") +
      (other.length ? '<p class="hint" style="margin-top:var(--space-3)">Other fields on this document: ' + esc(other.join(", ")) + ".</p>" : "") + "</section>" +
      '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("list") + "Rules</h2></div>" +
      (t.rules.trim() ? '<div class="rules-box" tabindex="0" role="region" aria-label="Tournament rules">' + esc(t.rules) + "</div>" : '<p class="muted">No rules are published for this tournament.</p>') + "</section></div>";

    qs("#d-copy", body).addEventListener("click", () => copyText(t.id, "Tournament ID copied"));
    if (ev.msToDeadline !== null && ev.msToDeadline > 0) {
      const el = qs("#d-count", body);
      timer = setInterval(() => {
        const left = ev.deadlineMs - Date.now();
        el.textContent = left > 0 ? formatCountdown(left) : "\u2014";
        if (left <= 0) { clearInterval(timer); timer = null; render(); }
      }, 1000);
    }
  }

  const unsub = watchTournaments((s) => { state = s; render(); });
  return () => { unsub(); if (timer) clearInterval(timer); };
}
