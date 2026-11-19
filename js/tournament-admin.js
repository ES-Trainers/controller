/* ES TRAINERS ConTroller — Tournament management screens (Phase 2).
   Connects the EXISTING backend actions (admin.getTournament / createTournament / updateTournament / deleteTournament) to the Controller.
   Every change goes through Apps Script, which re-checks identity, the live access record and the exact permission. Buttons are hidden
   without permission as a convenience only. Nothing here writes to Firestore, and registeredTeams is never sent. */
import { callAdmin, ApiError } from "./api.js";
import { can, canWriteAnything } from "./permissions.js";
import { icon } from "./icons.js";
import { esc, qs, qsa, toast, withBusy, skeletonRows, emptyState, errorState } from "./ui.js";
import { formatDateTimeIST } from "./lifecycle.js";
import { dialog } from "./dialog.js";
import * as M from "./tournament-model.js";

export function canManageAny(access) { return canWriteAnything(access); } // kept for compatibility; the topbar badge is now handled once, in navigation.js

const errText = (err) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
const fieldNotes = (err) => (err instanceof ApiError && err.fields ? Object.keys(err.fields).map((k) => String(err.fields[k])).filter((v, i, a) => a.indexOf(v) === i) : []);
const msgOf = (err) => { const b = errText(err), n = fieldNotes(err).filter((x) => !b.includes(x)); return err instanceof ApiError && err.code !== "SERVER_ERROR" && n.length ? b + " " + n.join(" ") : b; };
function notice(title, text, ic) { return '<div class="state">' + icon(ic) + '<h1 id="page-h1" tabindex="-1" style="font-size:1.2rem">' + esc(title) + "</h1><p>" + esc(text) + "</p></div>"; }
const badge = (s) => '<span class="badge ' + (M.STATUS_CLASS[s] || "badge--warn") + '">' + esc(M.STATUS_LABELS[s] || s || "No status") + "</span>";
const switchText = (f) => (f === true ? "On" : f === false ? "Off" : "Not set");

/* =====================================================================================================
   Detail page actions (Edit, status actions, Delete). Attached to the existing detail page.
   ===================================================================================================== */
export function createActions(ctx) {
  const S = { alive: true, busy: false, closeDialog: null, msg: null, root: null, t: null };

  function setMsg(kind, text) { S.msg = text ? { kind, text } : null; paintMsg(); }
  function paintMsg() {
    const el = S.root && qs("#d-msg", S.root); if (!el) return;
    el.innerHTML = S.msg ? '<div class="alert alert--' + S.msg.kind + '" role="status" style="margin-top:var(--space-3)">' + icon(S.msg.kind === "ok" ? "check" : "alert", "icon--sm") + "<span>" + esc(S.msg.text) + "</span></div>" : "";
  }

  function attach(body, t) {
    S.root = body; S.t = t;
    const old = qs("#d-actions", body); if (old) old.remove();
    const a = ctx.access, canEdit = can(a, "editTournament"), canPub = can(a, "publishTournament"), canDel = can(a, "deleteTournament");
    if (!(canEdit || canPub || canDel)) return;
    const head = qs(".page-head", body); if (!head) return;
    const wrap = document.createElement("div");
    wrap.id = "d-actions";
    if (!M.isAdminId(t.id)) {
      wrap.className = "alert alert--warn"; wrap.style.marginBottom = "var(--space-4)";
      wrap.innerHTML = icon("info", "icon--sm") + "<span>This tournament\u2019s ID uses a format the Controller cannot manage (lowercase letters, numbers and hyphens, 3 to 60 characters). You can view it here; change it in Firebase Console.</span>";
      head.insertAdjacentElement("afterend", wrap); return;
    }
    const acts = M.availableActions(t.status, t.registrationEnabled).filter((k) => can(a, M.ACTIONS[k].perm));
    wrap.className = "card"; wrap.style.marginBottom = "var(--space-4)";
    wrap.innerHTML = '<div class="card__head"><h2 class="card__title">' + icon("key") + 'Manage</h2><span class="muted">Registration switch: <strong>' + esc(switchText(t.registrationEnabled)) + "</strong></span></div>" +
      '<div style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center">' +
      (canEdit ? '<a class="btn btn--outline" href="#/tournaments/' + encodeURIComponent(t.id) + '/edit">' + icon("list", "icon--sm") + "Edit details</a>" : "") +
      acts.map((k) => '<button class="btn btn--' + (M.ACTIONS[k].kind === "primary" ? "primary" : "outline") + '" type="button" data-act="' + k + '">' + esc(M.ACTIONS[k].label) + "</button>").join("") +
      (canDel ? '<button class="btn btn--danger" type="button" data-act="delete" style="margin-left:auto">Delete empty tournament</button>' : "") + "</div>" +
      '<p class="hint" style="margin-top:var(--space-2)"><strong>Completed</strong> archives a tournament and keeps every registration and payment record. <strong>Delete</strong> only works for an empty test tournament with no registrations or payment sessions.</p>' +
      (canPub ? "" : '<p class="hint" style="margin-top:var(--space-2)">Opening, closing and changing status needs the publish permission.</p>') +
      '<div id="d-msg" aria-live="polite"></div>';
    head.insertAdjacentElement("afterend", wrap);
    qsa("[data-act]", wrap).forEach((b) => b.addEventListener("click", () => run(b.dataset.act, b)));
    paintMsg();
  }

  async function run(key, btn) {
    if (S.busy) return;
    S.busy = true; setMsg(null);
    try { await withBusy(btn, () => (key === "delete" ? doDelete() : doStatus(key))); }
    catch (err) { if (S.alive) setMsg("error", msgOf(err)); }
    finally { S.busy = false; }
  }

  /* A fresh read first: the revision and the registration switch come from the server, never from what the page happened to show. */
  async function doStatus(key) {
    const id = S.t.id;
    const fresh = await callAdmin("admin.getTournament", { id });
    if (!S.alive) return;
    const cur = fresh.tournament, plan = M.planStatusChange(key, { status: cur.status, registrationEnabled: cur.registrationEnabled });
    if (!plan) { setMsg("warn", "This tournament is now " + (M.STATUS_LABELS[cur.status] || cur.status) + ", so that action is no longer available. The page shows the current state."); return; }
    if (key === "open") { const ms = M.isoToMs(cur.startIso); if (ms === null || ms <= Date.now() + M.OPEN_WINDOW_MS) { setMsg("error", M.OPEN_WINDOW_TEXT); return; } }
    const d = M.describeAction(key);
    const ok = await dialog(S, { title: d.title, confirmLabel: d.confirm, danger: !!d.danger,
      bodyHtml: "<p><strong>" + esc(cur.title || id) + "</strong> is currently " + badge(cur.status) + "</p>" + d.lines.map((l) => "<p>" + esc(l) + "</p>").join("") });
    if (!ok || !S.alive) return;
    let revision = fresh.revision;
    for (let i = 0; i < plan.length; i++) {
      try { const r = await callAdmin("admin.updateTournament", { id, revision, changes: plan[i].changes }); revision = r.revision || revision; }
      catch (err) {
        if (!S.alive) return;
        if (i > 0) { setMsg("error", "The status was changed, so registration has already stopped, but the registration switch could not be turned off: " + msgOf(err) + " Use \u201CTurn registration switch off\u201D to finish."); return; }
        throw err;
      }
    }
    toast(d.title.replace("?", "") + " done.", "ok");
    setMsg("ok", "Done. " + (plan.length > 1 ? "The status was changed and the registration switch is off." : "The page now shows the new state."));
  }

  async function doDelete() {
    const t = S.t;
    const c = await callAdmin("admin.checkTournamentDeletion", { id: t.id });   // read-only: every blocker, with the exact time when it ends
    if (!S.alive) return;
    if (!c.eligible) {
      const when = c.eligibleAt ? formatDateTimeIST(Date.parse(c.eligibleAt)) : "";
      const kinds = c.blockers.map((b) => b.kind);
      const advice = c.permanent ? "This tournament holds registrations or payment history, so it is kept. Mark it Completed (the archive state) instead; nothing is lost."
        : kinds.every((k) => k === "time") ? "Nothing else is blocking it. It becomes deletable at the time shown, provided it is not changed again before then."
        : "Fix the items marked below first. Each change restarts the one-hour quiet period.";
      await dialog(S, { title: "This tournament cannot be deleted yet", infoOnly: true, cancelLabel: "Close",
        bodyHtml: "<p><strong>" + esc(c.title || t.id) + "</strong> is " + badge(c.status) + ", registration switch " + esc(switchText(c.registrationEnabled)) + ", " + esc(c.registeredTeams) + " registered team(s).</p>" +
          '<ul class="dlg__list">' + c.blockers.map((b) => "<li>" + esc(b.message) + "</li>").join("") + "</ul>" +
          (when ? '<div class="alert alert--warn">' + icon("alert", "icon--sm") + "<span>Earliest possible deletion: <strong>" + esc(when) + "</strong> (if nothing changes before then).</span></div>" : "") +
          "<p>" + esc(advice) + "</p>" });
      return;
    }
    const ok = await dialog(S, { title: "Delete this empty tournament?", confirmLabel: "Delete permanently", danger: true, requireText: t.id, requireLabel: "Type the tournament ID to confirm",
      bodyHtml: "<p><strong>" + esc(c.title || t.id) + "</strong> passed every check: it is " + badge(c.status) + ", registration is off, it has no registered teams, no stored data and has been quiet for over an hour.</p><p>It will be removed permanently. This cannot be undone.</p>" });
    if (!ok || !S.alive) return;
    await callAdmin("admin.deleteTournament", { id: t.id, confirmId: t.id });     // the server checks everything again before deleting
    if (!S.alive) return;
    toast("Tournament deleted.", "ok");
    window.location.hash = "#/tournaments";
  }

  function dispose() { S.alive = false; if (S.closeDialog) S.closeDialog(); S.root = null; S.t = null; S.msg = null; }
  return { attach, dispose };
}

/* =====================================================================================================
   Create / edit form
   ===================================================================================================== */
export function installGuard(S) {
  const guard = (e) => {
    if (!S.dirty) return;
    const a = e.target.closest && e.target.closest('a[href^="#/"]'); if (!a) return;
    if (window.confirm("You have unsaved changes. Leave without saving?")) S.dirty = false; else { e.preventDefault(); e.stopPropagation(); }
  };
  const beforeUnload = (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } };
  document.addEventListener("click", guard, true);
  window.addEventListener("beforeunload", beforeUnload);
  return () => { document.removeEventListener("click", guard, true); window.removeEventListener("beforeunload", beforeUnload); };
}
const inp = (id, label, extra, hint) => '<div class="field"><label class="label" for="f-' + id + '">' + label + "</label>" + extra + (hint ? '<p class="hint" id="h-' + id + '">' + hint + "</p>" : "") + '<p class="hint form-err" data-err="' + id + '" hidden></p></div>';
function formHtml(v, lock) {
  const text = (k, val, max, ph) => '<input class="input" id="f-' + k + '" data-field="' + k + '" maxlength="' + max + '" autocomplete="off" placeholder="' + esc(ph || "") + '" value="' + esc(val) + '">';
  const num = (k, val, ph, dis, min) => '<input class="input" id="f-' + k + '" data-field="' + k + '" type="number" inputmode="numeric" min="' + (min || 1) + '" step="1" placeholder="' + esc(ph || "") + '" value="' + esc(val) + '"' + (dis ? " disabled" : "") + ">";
  return '<div class="detail-grid"><section class="card"><div class="card__head"><h2 class="card__title">' + icon("trophy") + "Tournament</h2></div>" +
    (lock.idEditable ? inp("id", "Tournament ID", text("id", v.id, 60, "bgmi-cup-02"), "Lowercase letters, numbers and hyphens. It appears in the public link and cannot be changed later.") : "") +
    inp("title", "Title", text("title", v.title, 100, "BGMI Cup 02")) +
    inp("match", "Map", text("match", v.match, 40, "Erangel")) +
    inp("startIso", "Start date and time (IST)", '<input class="input" id="f-startIso" data-field="startIso" type="datetime-local" step="60" value="' + esc(v.start) + '">', "Indian Standard Time, whatever your device\u2019s time zone is. Registration closes 48 hours before this.") +
    "</section>" +
    '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("rupee") + "Money and capacity</h2></div>" +
    inp("entryFeeInr", "Entry fee (\u20B9 per team)", num("entryFeeInr", v.fee, "200", lock.feeLocked), lock.feeLocked ? "Locked while registration is open. Close registration first, let payments in progress finish, then change it." : "Whole rupees, 1 to 100000.") +
    inp("prizePool", "Prize pool", text("prizePool", v.prize, 40, "\u20B95,000"), "Shown as typed, for example \u20B95,000.") +
    inp("maxTeams", "Maximum teams", num("maxTeams", v.maxTeams, "25", false, 2), lock.minTeams ? "Cannot go below the " + lock.minTeams + " teams already registered." : "2 to 100.") +
    "</section>" +
    '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("list") + "Rules</h2></div>" +
    inp("rules", "Rules (shown to players, 20 to 20000 characters)", '<textarea class="input" id="f-rules" data-field="rules" rows="10" style="min-height:220px;resize:vertical"' + (lock.rulesLocked ? " disabled" : "") + ">" + esc(v.rules) + "</textarea>",
      lock.rulesLocked ? "These rules are stored as a list. Edit them in Firebase Console so their format is not changed." : "") + "</section></div>";
}
function readForm(root) {
  const g = (k) => { const el = qs("#f-" + k, root); return el ? el.value : ""; };
  return { id: g("id"), title: g("title"), match: g("match"), start: g("startIso"), fee: g("entryFeeInr"), prize: g("prizePool"), maxTeams: g("maxTeams"), rules: g("rules") };
}
function showErrors(root, errors) {
  qsa("[data-err]", root).forEach((el) => { el.textContent = ""; el.hidden = true; });
  qsa("[aria-invalid]", root).forEach((el) => el.removeAttribute("aria-invalid"));
  let first = null;
  Object.keys(errors || {}).forEach((k) => {
    const el = qs('[data-err="' + k + '"]', root);
    if (el) { el.textContent = String(errors[k]); el.hidden = false; const i = qs('[data-field="' + k + '"]', root); if (i) { i.setAttribute("aria-invalid", "true"); if (!first) first = i; } }
  });
  if (first) first.focus();
  return !!first;
}
const row = (k, v) => "<li><strong>" + esc(k) + ":</strong> " + esc(v) + "</li>";
const fmtStart = (iso) => { const ms = M.isoToMs(iso); return ms === null ? "Not set" : formatDateTimeIST(ms); };

/* ---------- Create ---------- */
export function mountCreate(container, ctx) {
  const S = { alive: true, dirty: false, closeDialog: null };
  const removeGuard = installGuard(S);
  const cleanup = () => { S.alive = false; S.dirty = false; if (S.closeDialog) S.closeDialog(); removeGuard(); container.innerHTML = ""; };
  if (!can(ctx.access, "createTournament")) { container.innerHTML = notice("No access to this section", "Your account does not have permission to create tournaments.", "lock"); return cleanup; }

  container.innerHTML = '<a class="crumb" href="#/tournaments">' + icon("back", "icon--sm") + 'All tournaments</a>' +
    '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">Create tournament</h1><p>It is created as Upcoming with registration off and no teams. You open registration separately, later.</p></div></div>' +
    '<div id="f-msg"></div><div id="f-body"></div>' +
    '<div class="savebar"><span class="muted">Nothing is saved until you confirm.</span><span class="savebar__btns"><button class="btn btn--primary" id="f-save" type="button">Review and create</button></span></div>';
  const body = qs("#f-body", container);
  body.innerHTML = formHtml({ id: "", title: "", match: "", start: "", fee: "", prize: "", maxTeams: "", rules: "" }, { idEditable: true });
  let idTouched = false;
  qs("#f-id", body).addEventListener("input", () => { idTouched = true; });
  qs("#f-title", body).addEventListener("input", (e) => { if (!idTouched) qs("#f-id", body).value = M.slugify(e.target.value); });
  qsa("input,textarea", body).forEach((el) => el.addEventListener("input", () => { S.dirty = true; }));

  qs("#f-save", container).addEventListener("click", async (e) => {
    const btn = e.currentTarget, f = readForm(body), msg = qs("#f-msg", container);
    msg.innerHTML = "";
    if (showErrors(body, M.validateForm(f, { mode: "create" }))) return;
    const p = M.buildCreatePayload(f), t = p.tournament;
    const ok = await dialog(S, { title: "Create this tournament?", confirmLabel: "Create tournament",
      bodyHtml: '<ul class="dlg__list">' + row("ID", p.id) + row("Title", t.title) + row("Map", t.match) + row("Starts", fmtStart(t.startIso)) + row("Entry fee", M.feeText(t.entryFeeInr)) + row("Prize pool", t.prizePool) + row("Maximum teams", t.maxTeams) + row("Rules", t.rules.length + " characters") + "</ul>" +
        "<p>It starts as <strong>Upcoming</strong> with registration <strong>off</strong> and <strong>0</strong> teams. Upcoming tournaments are listed on the public website; nobody can register until you open registration.</p>" });
    if (!ok || !S.alive) return;
    try {
      await withBusy(btn, () => callAdmin("admin.createTournament", p));
      if (!S.alive) return;
      S.dirty = false; toast("Tournament created.", "ok"); window.location.hash = "#/tournaments/" + encodeURIComponent(p.id);
    } catch (err) {
      if (!S.alive) return;
      if (err instanceof ApiError && err.fields) showErrors(body, err.fields);
      msg.innerHTML = '<div class="alert alert--error" role="alert" style="margin-bottom:var(--space-3)">' + icon("alert", "icon--sm") + "<span>" + esc(msgOf(err)) + "</span></div>";
    }
  });
  return cleanup;
}

/* ---------- Edit ---------- */
export function mountEdit(container, ctx, id) {
  const S = { alive: true, dirty: false, closeDialog: null };
  const removeGuard = installGuard(S);
  const cleanup = () => { S.alive = false; S.dirty = false; if (S.closeDialog) S.closeDialog(); removeGuard(); container.innerHTML = ""; };
  const back = '<a class="crumb" href="#/tournaments/' + encodeURIComponent(id) + '">' + icon("back", "icon--sm") + "Back to the tournament</a>";
  if (!can(ctx.access, "editTournament")) { container.innerHTML = notice("No access to this section", "Your account does not have permission to edit tournaments.", "lock"); return cleanup; }
  if (!M.isAdminId(id)) { container.innerHTML = notice("This tournament cannot be edited here", "Its ID uses a format the Controller cannot manage. Edit it in Firebase Console.", "info"); return cleanup; }
  container.innerHTML = back + '<div id="e-body">' + skeletonRows(3) + "</div>";
  const root = qs("#e-body", container);
  let base = null, revision = "", lock = null;

  async function load() {
    root.innerHTML = skeletonRows(3); S.dirty = false;
    try { const r = await callAdmin("admin.getTournament", { id }); if (!S.alive) return; base = r.tournament; revision = r.revision; render(); }
    catch (err) {
      if (!S.alive) return;
      if (err instanceof ApiError && err.code === "NOT_FOUND") { root.innerHTML = emptyState("Tournament not found", "It may have been removed.", "search"); return; }
      root.innerHTML = errorState("Could not load this tournament", errText(err), "e-retry"); const b = qs("#e-retry", root); if (b) b.addEventListener("click", load);
    }
  }
  const opts = () => ({ mode: "edit", status: base.status, registered: base.registeredTeams, feeLocked: lock.feeLocked, rulesLocked: lock.rulesLocked, startChanged: M.inputToIso(readForm(root).start) !== base.startIso });

  function render() {
    lock = { feeLocked: base.status === "registration_open", rulesLocked: base.rulesType === "array", minTeams: base.registeredTeams || 0 };
    const v = { title: base.title, match: base.match, start: M.isoToInput(base.startIso), fee: String(base.entryFeeInr || ""), prize: base.prizePool, maxTeams: String(base.maxTeams || ""), rules: base.rules };
    root.innerHTML = '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">Edit ' + esc(base.title || id) + '</h1><p class="copy-line"><code>' + esc(id) + "</code></p></div><div>" + badge(base.status) + "</div></div>" +
      '<div id="e-msg" aria-live="polite"></div>' +
      '<div class="alert" style="margin-bottom:var(--space-4)">' + icon("info", "icon--sm") + "<span>Status and the registration switch are changed with the buttons on the tournament page. Teams registered so far: <strong>" + (base.registeredTeams === null || base.registeredTeams === undefined ? "unknown" : base.registeredTeams) + "</strong> (read-only).</span></div>" +
      formHtml(v, lock) +
      '<div class="savebar" id="e-savebar"><span class="muted" id="e-state">No unsaved changes</span><span class="savebar__btns"><button class="btn btn--outline" id="e-discard" type="button" disabled>Discard</button><button class="btn btn--primary" id="e-save" type="button" disabled>Review and save</button></span></div>';
    qsa("input,textarea", root).forEach((el) => el.addEventListener("input", dirty));
    qs("#e-discard", root).addEventListener("click", render);
    qs("#e-save", root).addEventListener("click", save);
  }
  function dirty() {
    let n = 0; try { n = Object.keys(M.buildEditChanges(base, readForm(root), lock)).length; } catch (e) { n = 1; }
    S.dirty = n > 0; qs("#e-save", root).disabled = !S.dirty; qs("#e-discard", root).disabled = !S.dirty;
    qs("#e-state", root).textContent = S.dirty ? "You have unsaved changes" : "No unsaved changes";
    qs("#e-savebar", root).classList.toggle("savebar--dirty", S.dirty);
  }
  function msg(kind, text, reload) {
    qs("#e-msg", root).innerHTML = '<div class="alert alert--' + kind + '" role="status" style="margin-bottom:var(--space-3)">' + icon(kind === "ok" ? "check" : "alert", "icon--sm") + "<span>" + esc(text) + "</span>" + (reload ? ' <button class="btn btn--outline btn--sm" id="e-reload" type="button">Reload</button>' : "") + "</div>";
    const r = qs("#e-reload", root); if (r) r.addEventListener("click", load);
  }
  const label = { title: "Title", match: "Map", startIso: "Start", entryFeeInr: "Entry fee", prizePool: "Prize pool", maxTeams: "Maximum teams", rules: "Rules" };
  const show = (k, val) => (k === "startIso" ? fmtStart(val) : k === "entryFeeInr" ? M.feeText(val) : k === "rules" ? String(val).length + " characters" : String(val));

  async function save(e) {
    const btn = e.currentTarget, f = readForm(root);
    qs("#e-msg", root).innerHTML = "";
    if (showErrors(root, M.validateForm(f, opts()))) return;
    const changes = M.buildEditChanges(base, f, lock);
    if (!Object.keys(changes).length) return;
    const ok = await dialog(S, { title: "Save these changes?", confirmLabel: "Save changes",
      bodyHtml: '<ul class="dlg__list">' + Object.keys(changes).map((k) => "<li><strong>" + esc(label[k]) + ":</strong> " + esc(show(k, k === "startIso" ? base.startIso : k === "entryFeeInr" ? base.entryFeeInr : base[k])) + " \u2192 " + esc(show(k, changes[k])) + "</li>").join("") + "</ul>" +
        '<p class="hint">Takes effect immediately on the public website. Registrations, payments and team counts are not changed.</p>' });
    if (!ok || !S.alive) return;
    try {
      let r;
      try { r = await withBusy(btn, () => callAdmin("admin.updateTournament", { id, revision, changes })); }
      catch (err) {
        if (!(err instanceof ApiError && err.code === "CONFIRM_REQUIRED") || !S.alive) throw err;
        const again = await dialog(S, { title: "Registration is open", confirmLabel: "Save anyway", danger: true, bodyHtml: "<p>" + esc(err.message) + "</p>" });
        if (!again || !S.alive) return;
        r = await withBusy(btn, () => callAdmin("admin.updateTournament", { id, revision, changes, confirmRisk: true }));
      }
      if (!S.alive) return;
      S.dirty = false; toast("Tournament saved.", "ok"); window.location.hash = "#/tournaments/" + encodeURIComponent(id);
    } catch (err) {
      if (!S.alive) return;
      if (err instanceof ApiError && err.fields) showErrors(root, err.fields);
      msg("error", msgOf(err), err instanceof ApiError && (err.code === "CONFLICT" || err.code === "NOT_FOUND"));
    }
  }
  load();
  return cleanup;
}
