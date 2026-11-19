/* ES TRAINERS ConTroller — Registered teams and team details (Phase 3).
   Everything private comes from the protected Apps Script actions (listRegistrations / getRegistration / updateRegistration /
   removeRegistration / restoreRegistration / purgeRegistration). The browser never reads registrations from Firestore. The server masks
   contact details and BGMI IDs unless the account has viewSensitiveData, and payment references unless it has viewPayments.
   Buttons are shown only to accounts that may use them; the server re-checks role and permission on every request.
   Private data lives inside the closures below and is dropped on unmount (navigation, access change, sign-out). */
import { callAdmin, ApiError } from "./api.js";
import { can, canManageTeams, isOwner } from "./permissions.js";
import { icon } from "./icons.js";
import { esc, qs, qsa, toast, copyText, withBusy, skeletonRows, emptyState, errorState } from "./ui.js";
import { formatDateTimeIST } from "./lifecycle.js";
import { dialog } from "./dialog.js";
import { installGuard } from "./tournament-admin.js";
import * as R from "./registration-model.js";

const errText = (err) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
const fmtTs = (iso) => { const ms = Date.parse(iso || ""); return Number.isFinite(ms) ? formatDateTimeIST(ms) : "\u2014"; };
const teamHref = (tid, rid) => "#/tournaments/" + encodeURIComponent(tid) + "/team/" + encodeURIComponent(rid);
function notice(title, text, ic) { return '<div class="state">' + icon(ic) + '<h1 id="page-h1" tabindex="-1" style="font-size:1.2rem">' + esc(title) + "</h1><p>" + esc(text) + "</p></div>"; }
const statusBadge = (s) => (s === "confirmed" ? '<span class="badge badge--open">Confirmed</span>' : '<span class="badge badge--warn">' + esc(s || "No status") + "</span>");
const payBadge = (s) => (s === "paid" ? '<span class="badge badge--open">Paid</span>' : '<span class="badge badge--warn">' + esc(s || "Unknown") + "</span>");
const goneBadge = (x) => (x.purged ? '<span class="badge badge--done">Permanently removed</span>' : x.removed ? '<span class="badge badge--warn">Removed</span>' : "");

/* =====================================================================================================
   Registered teams section on the tournament page
   ===================================================================================================== */
export function createTeams(ctx) {
  const S = { alive: true, tid: null, view: "active", q: "", rows: null, loading: false, error: "", loadedFor: undefined, root: null, t: null };

  function attach(body, t) {
    S.root = body; S.t = t;
    const old = qs("#d-teams", body); if (old) old.remove();
    if (!S.alive || !can(ctx.access, "viewRegistration")) return;
    if (S.tid !== t.id) { S.tid = t.id; S.rows = null; S.error = ""; S.loadedFor = undefined; S.view = "active"; S.q = ""; }
    const sec = document.createElement("section");
    sec.id = "d-teams"; sec.className = "card"; sec.style.marginTop = "var(--space-4)";
    sec.innerHTML = '<div class="card__head"><h2 class="card__title">' + icon("users") + 'Registered teams</h2><span class="muted" id="tm-sum"></span></div>' +
      '<div id="tm-note"></div><div style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center;margin-bottom:var(--space-3)"><div id="tm-tabs" style="display:flex;gap:var(--space-2)"></div>' +
      '<input class="input" id="tm-q" type="search" placeholder="Search team name or registration ID" aria-label="Search teams" autocomplete="off" style="flex:1 1 220px;min-width:0" value="' + esc(S.q) + '">' +
      '<button class="btn btn--outline btn--sm" id="tm-refresh" type="button">' + icon("refresh", "icon--sm") + "Refresh</button></div><div id=\"tm-rows\"></div>";
    body.appendChild(sec);
    qs("#tm-q", sec).addEventListener("input", (e) => { S.q = e.target.value; paintRows(); });
    qs("#tm-refresh", sec).addEventListener("click", () => load());
    paintRows();
    if (S.loadedFor !== t.registeredTeams && !S.loading) load(); // first time, and whenever the tournament's counter changes
  }

  async function load() {
    if (!S.alive || !S.t) return;
    S.loading = true; S.error = ""; paintRows();
    const t = S.t;
    try { const r = await callAdmin("admin.listRegistrations", { tournamentId: t.id, view: "all" }); if (!S.alive || S.tid !== t.id) return; S.rows = r.registrations || []; S.loadedFor = t.registeredTeams; }
    catch (err) { if (!S.alive) return; S.error = errText(err); }
    S.loading = false; paintRows();
  }

  function paintRows() {
    const sec = S.root && qs("#d-teams", S.root); if (!sec) return;
    const rowsEl = qs("#tm-rows", sec), tabs = qs("#tm-tabs", sec), sum = qs("#tm-sum", sec), note = qs("#tm-note", sec);
    if (S.error) { rowsEl.innerHTML = errorState("Could not load the teams", S.error, "tm-retry"); const b = qs("#tm-retry", rowsEl); if (b) b.addEventListener("click", load); tabs.innerHTML = ""; sum.textContent = ""; note.innerHTML = ""; return; }
    if (!S.rows) { rowsEl.innerHTML = skeletonRows(3); tabs.innerHTML = ""; sum.textContent = S.loading ? "Loading\u2026" : ""; note.innerHTML = ""; return; }
    const c = R.countRows(S.rows);
    sum.textContent = c.active + " active" + (c.removed ? " \u00B7 " + c.removed + " removed" : "");
    tabs.innerHTML = [["active", "Active (" + c.active + ")"], ["removed", "Removed (" + c.removed + ")"], ["all", "All (" + c.all + ")"]]
      .map(([k, l]) => '<button class="btn btn--sm ' + (S.view === k ? "btn--primary" : "btn--outline") + '" type="button" data-view="' + k + '" aria-pressed="' + (S.view === k) + '">' + esc(l) + "</button>").join("");
    qsa("[data-view]", tabs).forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.view; paintRows(); }));
    const counter = S.t && typeof S.t.registeredTeams === "number" ? S.t.registeredTeams : null;
    note.innerHTML = '<p class="hint" style="margin-bottom:var(--space-3)">Removed teams still count toward capacity and keep their team name, email and phone reserved. Removing a team never frees its slot.</p>' +
      (counter !== null && counter !== c.all ? '<div class="alert alert--warn" style="margin-bottom:var(--space-3)">' + icon("alert", "icon--sm") + "<span>The tournament counter shows " + counter + " team(s) but " + c.all + " registration record(s) were found.</span></div>" : "");
    const list = R.filterRows(S.rows, S.view, S.q);
    if (!list.length) { rowsEl.innerHTML = emptyState(S.q ? "No matching teams" : S.view === "removed" ? "No removed teams" : "No registered teams yet", S.q ? "Try a different search." : S.view === "removed" ? "Teams that an Owner or Super Admin removes appear here." : "Teams appear here as soon as their payment is confirmed.", "users"); return; }
    rowsEl.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>Team</th><th>Registration ID</th><th>Registration</th><th>Payment</th><th>Registered</th><th></th></tr></thead><tbody>' +
      list.map((x) => "<tr>" +
        '<td class="cell-main" data-label="Team"><a class="cell-title" href="' + teamHref(S.tid, x.registrationId) + '">' + esc(x.teamName || "(no name)") + "</a>" + (goneBadge(x) ? '<div class="cell-sub">' + goneBadge(x) + "</div>" : "") + "</td>" +
        '<td data-label="Registration ID"><code title="' + esc(x.registrationId) + '">' + esc(R.shortId(x.registrationId)) + "\u2026</code></td>" +
        '<td data-label="Registration">' + statusBadge(x.status) + "</td>" + '<td data-label="Payment">' + payBadge(x.paymentStatus) + "</td>" +
        '<td data-label="Registered">' + esc(fmtTs(x.confirmedAt || x.submittedAt)) + "</td>" +
        '<td data-label=""><a class="btn btn--outline btn--sm" href="' + teamHref(S.tid, x.registrationId) + '">View</a></td></tr>').join("") + "</tbody></table></div>";
  }

  function dispose() { S.alive = false; S.rows = null; S.root = null; S.t = null; }
  return { attach, dispose };
}

/* =====================================================================================================
   One team
   ===================================================================================================== */
export function mountTeam(container, ctx, tid, rid) {
  const S = { alive: true, dirty: false, closeDialog: null };
  const removeGuard = installGuard(S);
  const cleanup = () => { S.alive = false; S.dirty = false; if (S.closeDialog) S.closeDialog(); removeGuard(); container.innerHTML = ""; };
  const back = '<a class="crumb" href="#/tournaments/' + encodeURIComponent(tid) + '">' + icon("back", "icon--sm") + "Back to the tournament</a>";
  if (!can(ctx.access, "viewRegistration")) { container.innerHTML = notice("No access to this section", "Your account does not have permission to view registrations.", "lock"); return cleanup; }
  container.innerHTML = back + '<div id="t-body">' + skeletonRows(3) + "</div>";
  const root = qs("#t-body", container);
  const mgr = canManageTeams(ctx.access), owner = isOwner(ctx.access);
  let base = null, editing = false;

  async function load() {
    root.innerHTML = skeletonRows(3); S.dirty = false; editing = false;
    try { const r = await callAdmin("admin.getRegistration", { tournamentId: tid, registrationId: rid }); if (!S.alive) return; base = r.registration; render(); }
    catch (err) {
      if (!S.alive) return;
      if (err instanceof ApiError && err.code === "NOT_FOUND") { root.innerHTML = emptyState("Team not found", "This registration does not exist for this tournament.", "search"); return; }
      root.innerHTML = errorState("Could not load this team", errText(err), "t-retry"); const b = qs("#t-retry", root); if (b) b.addEventListener("click", load);
    }
  }
  function msg(kind, text, reload) {
    const el = qs("#t-msg", root); if (!el) return;
    el.innerHTML = '<div class="alert alert--' + kind + '" role="status" style="margin-bottom:var(--space-3)">' + icon(kind === "ok" ? "check" : "alert", "icon--sm") + "<span>" + esc(text) + "</span>" + (reload ? ' <button class="btn btn--outline btn--sm" id="t-reload" type="button">Reload</button>' : "") + "</div>";
    const r = qs("#t-reload", el); if (r) r.addEventListener("click", load);
  }
  const showErr = (err) => {
    let t = errText(err);
    if (err instanceof ApiError && err.fields) { const n = Object.keys(err.fields).map((k) => String(err.fields[k])).filter((x, i, a) => !t.includes(x) && a.indexOf(x) === i); if (n.length) t += " " + n.join(" "); }
    msg("error", t, err instanceof ApiError && (err.code === "CONFLICT" || err.code === "NOT_FOUND" || err.code === "RESTORE_BLOCKED"));
  };
  const kv = (k, v) => "<div><dt>" + esc(k) + "</dt><dd>" + v + "</dd></div>";

  function render() {
    const r = base, gone = r.removal.removed || r.purged, masked = r.sensitiveMasked;
    const leader = r.players[0], others = r.players.filter((p) => p.number !== 1);
    let h = '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">' + esc(r.teamName || "(no name)") + '</h1><p class="copy-line"><code>' + esc(r.registrationId) + '</code> <button class="btn btn--outline btn--sm btn--icon" id="t-copy" type="button" aria-label="Copy registration ID">' + icon("copy", "icon--sm") + "</button></p></div>" +
      "<div>" + statusBadge(r.status) + " " + payBadge(r.paymentStatus) + " " + goneBadge({ removed: r.removal.removed, purged: r.purged }) + "</div></div><div id=\"t-msg\" aria-live=\"polite\"></div>";
    if (r.purged) h += '<div class="alert alert--warn" style="margin-bottom:var(--space-4)">' + icon("alert", "icon--sm") + "<span>Permanently removed on " + esc(fmtTs(r.purgedAt)) + (r.purgedByEmail ? " by " + esc(r.purgedByEmail) : "") + ". Personal details were erased. The registration ID, payment references and audit history are kept. It still counts toward capacity.</span></div>";
    else if (r.removal.removed) h += '<div class="alert alert--warn" style="margin-bottom:var(--space-4)">' + icon("alert", "icon--sm") + "<span>Removed on " + esc(fmtTs(r.removal.removedAt)) + (r.removal.removedByEmail ? " by " + esc(r.removal.removedByEmail) : "") + ". Reason: " + esc(r.removal.reason || "\u2014") + ". The team still counts toward capacity and keeps its name, email and phone reserved. Payment is untouched and nothing was refunded.</span></div>";
    h += '<div class="detail-grid">';
    h += '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("trophy") + "Team information</h2></div><dl class=\"kv\">" +
      kv("Team name", esc(r.teamName)) + kv("Tournament", '<a href="#/tournaments/' + encodeURIComponent(r.tournamentId) + '"><code>' + esc(r.tournamentId) + "</code></a>") +
      kv("Registration status", statusBadge(r.status)) + kv("Payment status", payBadge(r.paymentStatus)) + kv("Registered", esc(fmtTs(r.confirmedAt))) + kv("Submitted", esc(fmtTs(r.submittedAt))) +
      kv("Source", esc(r.source || "\u2014")) + kv("Confirmation email", esc(r.emailStatus || "\u2014")) + "</dl></section>";
    h += '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("user") + "Team leader (Player 1)</h2></div>" + (r.purged ? '<p class="muted">Personal details were permanently erased.</p>' :
      (masked ? '<div class="alert" style="margin-bottom:var(--space-3)">' + icon("lock", "icon--sm") + "<span>Contact details and BGMI IDs are masked. Viewing them needs the view sensitive data permission.</span></div>" : "") +
      '<dl class="kv">' + kv("Full name", esc(r.leader.name || "\u2014")) + kv("In-game name", esc(r.leader.ign || "\u2014")) + kv("Email", esc(r.leader.email || "\u2014")) + kv("Phone", esc(r.leader.phone || "\u2014")) + kv("BGMI ID", leader ? esc(leader.uid || "\u2014") : "\u2014") + (leader && leader.gender ? kv("Gender", esc(leader.gender)) : "") + "</dl>") + "</section>";
    h += '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("users") + "Players</h2></div>" + (others.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Player</th><th>Name</th><th>In-game name</th><th>BGMI ID</th>' + (others.some((p) => p.gender) ? "<th>Gender</th>" : "") + "</tr></thead><tbody>" +
      others.map((p) => '<tr><td data-label="Player">Player ' + esc(p.number) + '</td><td data-label="Name">' + esc(p.name) + '</td><td data-label="In-game name">' + esc(p.ign) + '</td><td data-label="BGMI ID"><code>' + esc(p.uid) + "</code></td>" + (others.some((x) => x.gender) ? '<td data-label="Gender">' + esc(p.gender || "\u2014") + "</td>" : "") + "</tr>").join("") + "</tbody></table></div>" : '<p class="muted">' + (r.purged ? "Erased." : "No other players are stored.") + "</p>") + "</section>";
    h += '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("rupee") + "Payment</h2></div>" + (r.payment ? "<dl class=\"kv\">" + kv("Amount", r.payment.amountInr === null ? "\u2014" : "\u20B9" + esc(r.payment.amountInr)) + kv("Order ID", "<code>" + esc(r.payment.orderId) + "</code>") + kv("Payment ID", "<code>" + esc(r.payment.paymentId) + "</code>") + kv("Paid", esc(fmtTs(r.payment.paidAt))) + kv("Verified", esc(fmtTs(r.payment.verifiedAt))) + "</dl>" :
      '<p class="muted">Payment status: <strong>' + esc(r.paymentStatus || "\u2014") + "</strong>. References and amounts need the view payments permission.</p>") + "</section>";
    h += '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("list") + "Admin note</h2></div><p style=\"white-space:pre-wrap\">" + (r.adminNote ? esc(r.adminNote) : '<span class="muted">No note.</span>') + "</p></section>";
    h += '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("shield") + "Manage this team</h2></div>" + actionsHtml(r, gone) + "</section></div>";
    root.innerHTML = h;
    qs("#t-copy", root).addEventListener("click", () => copyText(r.registrationId, "Registration ID copied"));
    bindActions(r, gone);
  }

  function actionsHtml(r, gone) {
    if (!mgr) return '<p class="muted">' + icon("lock", "icon--sm") + " Editing, removing and restoring teams is limited to the Owner and Super Admin accounts" + (ctx.access.role === "super_admin" ? ", and needs the manage registrations permission, which this account does not have." : ". Your role does not allow it.") + "</p>" + (owner ? "" : '<p class="hint">Permanent removal is Owner-only.</p>');
    if (r.purged) return '<p class="muted">This team was permanently removed. It cannot be edited, removed or restored.</p>';
    return '<div class="btn-row">' + (!gone ? '<button class="btn btn--outline" id="t-edit" type="button">Edit player details and note</button><button class="btn btn--danger" id="t-remove" type="button">Remove team</button>' : '<button class="btn btn--primary" id="t-restore" type="button">Restore team</button><button class="btn btn--outline" id="t-note" type="button">Edit note</button>') +
      (owner && gone ? '<button class="btn btn--danger" id="t-purge" type="button" style="margin-left:auto">Permanently remove (erase personal data)</button>' : "") + "</div>" +
      '<p class="hint" style="margin-top:var(--space-2)">Team name, leader email and phone are locked because they are tied to the uniqueness reservations. ' + (owner ? "" : "Permanent removal is Owner-only. ") + "Removing a team keeps all its data and payment; it can be restored.</p>";
  }
  function bindActions(r, gone) {
    const on = (id, fn) => { const b = qs("#" + id, root); if (b) b.addEventListener("click", () => fn(b)); };
    on("t-edit", () => startEdit(false)); on("t-note", () => startEdit(true));
    on("t-remove", (b) => doRemove(b)); on("t-restore", (b) => doRestore(b)); on("t-purge", (b) => doPurge(b));
  }

  async function act(btn, fn) { try { await withBusy(btn, fn); } catch (err) { if (S.alive) showErr(err); } }
  function doRemove(btn) { act(btn, async () => {
    const ok = await dialog(S, { title: "Remove this team?", confirmLabel: "Remove team", danger: true, reason: { label: "Reason for removing " + base.teamName, min: R.LIMITS.removeReason },
      bodyHtml: "<p>The team is hidden from the active list and marked Removed. <strong>Nothing is deleted or refunded:</strong> all details, the payment record, the team name, email and phone reservations and the registered-teams count stay exactly as they are.</p><p>You can restore it later.</p>" });
    if (!ok || !S.alive) return;
    await callAdmin("admin.removeRegistration", { tournamentId: tid, registrationId: rid, revision: base.revision, reason: ok.reason });
    if (!S.alive) return; toast("Team removed.", "ok"); await load();
  }); }
  function doRestore(btn) { act(btn, async () => {
    const ok = await dialog(S, { title: "Restore this team?", confirmLabel: "Restore team", bodyHtml: "<p><strong>" + esc(base.teamName) + "</strong> returns to the active list. The server first checks that its team name, email and phone are still reserved for this registration, so a duplicate can never be created.</p>" });
    if (!ok || !S.alive) return;
    await callAdmin("admin.restoreRegistration", { tournamentId: tid, registrationId: rid, revision: base.revision });
    if (!S.alive) return; toast("Team restored.", "ok"); await load();
  }); }
  function doPurge(btn) { act(btn, async () => {
    const ok = await dialog(S, { title: "Permanently remove this team?", confirmLabel: "Erase personal data", danger: true, requireText: rid, requireLabel: "Type the registration ID to confirm", reason: { label: "Reason (required, saved in the activity log)", min: R.LIMITS.purgeReason },
      bodyHtml: "<p><strong>This cannot be undone.</strong> The team name, leader email and phone, player names, in-game names, BGMI IDs and the note are erased.</p><p>Kept: the registration ID, the payment references and amount, timestamps, the audit history, the reserved team name / email / phone and the tournament's team count. A registration is never deleted outright, because it exists only because a payment was received.</p>" });
    if (!ok || !S.alive) return;
    await callAdmin("admin.purgeRegistration", { tournamentId: tid, registrationId: rid, revision: base.revision, reason: ok.reason, confirmText: rid });
    if (!S.alive) return; toast("Personal data erased.", "ok"); await load();
  }); }

  /* ---------- edit ---------- */
  function startEdit(noteOnly) {
    editing = true; S.dirty = false;
    const masked = base.sensitiveMasked, lockPlayers = noteOnly || base.removal.removed;
    const pl = (p) => '<div class="field"><label class="label">Player ' + esc(p.number) + (p.number === 1 ? " (team leader)" : "") + '</label><div class="inline">' +
      '<div style="flex:1 1 150px"><input class="input" id="te-' + p.number + '-name" aria-label="Player ' + p.number + ' name" maxlength="40" autocomplete="off" value="' + esc(p.name) + '"><p class="hint form-err" data-err="p' + p.number + '.name" hidden></p></div>' +
      '<div style="flex:1 1 130px"><input class="input" id="te-' + p.number + '-ign" aria-label="Player ' + p.number + ' in-game name" maxlength="30" autocomplete="off" value="' + esc(p.ign) + '"><p class="hint form-err" data-err="p' + p.number + '.ign" hidden></p></div>' +
      '<div style="flex:1 1 130px"><input class="input" id="te-' + p.number + '-uid" aria-label="Player ' + p.number + ' BGMI ID" inputmode="numeric" maxlength="12" autocomplete="off" value="' + esc(masked ? "" : p.uid) + '"' + (masked ? ' disabled placeholder="' + esc(p.uid) + '"' : "") + '><p class="hint form-err" data-err="p' + p.number + '.uid" hidden></p></div></div></div>';
    root.innerHTML = '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">Edit ' + esc(base.teamName) + "</h1><p>" + (noteOnly ? "Admin note only." : "Player name, in-game name and BGMI ID, and the admin note.") + " Team name, leader email and phone are locked.</p></div></div><div id=\"t-msg\" aria-live=\"polite\"></div>" +
      (masked && !noteOnly ? '<div class="alert" style="margin-bottom:var(--space-3)">' + icon("lock", "icon--sm") + "<span>BGMI IDs are hidden for your account, so they cannot be edited. Names and the note can.</span></div>" : "") +
      '<div class="detail-grid">' + (lockPlayers ? "" : '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("users") + "Players</h2></div><p class=\"hint\" style=\"margin-bottom:var(--space-2)\">Name \u00B7 in-game name \u00B7 BGMI ID</p>" + base.players.map(pl).join("") + "</section>") +
      '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("list") + 'Admin note</h2></div><div class="field"><textarea class="input" id="te-note" rows="4" maxlength="1000" style="resize:vertical" aria-label="Admin note">' + esc(base.adminNote) + '</textarea><p class="hint form-err" data-err="note" hidden></p></div></section></div>' +
      '<div class="savebar" id="te-bar"><span class="muted" id="te-state">No unsaved changes</span><span class="savebar__btns"><button class="btn btn--outline" id="te-cancel" type="button">Cancel</button><button class="btn btn--primary" id="te-save" type="button" disabled>Review and save</button></span></div>';
    qsa("input,textarea", root).forEach((el) => el.addEventListener("input", refresh));
    qs("#te-cancel", root).addEventListener("click", () => { S.dirty = false; render(); });
    qs("#te-save", root).addEventListener("click", save);
    function refresh() { let n = 0; try { n = Object.keys(R.buildTeamChanges(base, readForm(), { masked })).length; } catch (e) { n = 1; } S.dirty = n > 0; qs("#te-save", root).disabled = !S.dirty; qs("#te-state", root).textContent = S.dirty ? "You have unsaved changes" : "No unsaved changes"; qs("#te-bar", root).classList.toggle("savebar--dirty", S.dirty); }
    function readForm() { const v = (id) => { const el = qs("#" + id, root); return el ? el.value : ""; }; return { players: lockPlayers ? [] : base.players.map((p) => ({ number: p.number, name: v("te-" + p.number + "-name"), ign: v("te-" + p.number + "-ign"), uid: v("te-" + p.number + "-uid") })), note: v("te-note") }; }
    function showFieldErrors(errors) { qsa("[data-err]", root).forEach((el) => { el.textContent = ""; el.hidden = true; }); let first = null; Object.keys(errors).forEach((k) => { const el = qs('[data-err="' + k + '"]', root); if (el) { el.textContent = errors[k]; el.hidden = false; if (!first) first = el.previousElementSibling || el; } }); if (first && first.focus) first.focus(); return Object.keys(errors).length > 0; }
    async function save(e) {
      const btn = e.currentTarget, f = readForm(); qs("#t-msg", root).innerHTML = "";
      if (showFieldErrors(R.validateTeamForm(base, f, { masked }))) return;
      const changes = R.buildTeamChanges(base, f, { masked }); if (!Object.keys(changes).length) return;
      const lines = [];
      (changes.players || []).forEach((c) => { const b = base.players.find((x) => x.number === c.number) || {}; const parts = [];
        if (c.name !== undefined) parts.push("name " + esc(b.name) + " \u2192 " + esc(c.name)); if (c.ign !== undefined) parts.push("in-game name " + esc(b.ign) + " \u2192 " + esc(c.ign)); if (c.uid !== undefined) parts.push("BGMI ID " + esc(R.maskTail(b.uid)) + " \u2192 " + esc(R.maskTail(c.uid)));
        lines.push("<li><strong>Player " + esc(c.number) + ":</strong> " + parts.join("; ") + "</li>"); });
      if (changes.adminNote !== undefined) lines.push("<li><strong>Admin note</strong> will be " + (changes.adminNote ? "updated" : "cleared") + ".</li>");
      const ok = await dialog(S, { title: "Save these changes?", confirmLabel: "Save changes", bodyHtml: '<ul class="dlg__list">' + lines.join("") + '</ul><p class="hint">The server validates every value again. Payment, team name, leader email and phone, and the team count are not touched.</p>' });
      if (!ok || !S.alive) return;
      try { await withBusy(btn, () => callAdmin("admin.updateRegistration", { tournamentId: tid, registrationId: rid, revision: base.revision, changes })); if (!S.alive) return; S.dirty = false; toast("Saved.", "ok"); await load(); }
      catch (err) { if (!S.alive) return; showErr(err); }
    }
  }
  load();
  return cleanup;
}
