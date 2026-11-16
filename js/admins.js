/* ES TRAINERS ConTroller — Admin Management (Phase 1). OWNER ONLY.
   Every change goes through the Apps Script backend, which re-checks that the caller is the Owner. Hiding this page from
   anyone else is convenience; the server is the gate. Private data lives only inside one mount() call and is dropped by the
   unmount function the router calls on navigation, on a permission change and on sign-out. */
import { callAdmin, ApiError } from "./api.js";
import { icon } from "./icons.js";
import { esc, qs, qsa, toast, copyText, withBusy, skeletonRows, emptyState, errorState } from "./ui.js";
import {
  PERMISSION_GROUPS, ALL_KEYS, LOCKED_KEYS, ASSIGNABLE_ROLES, ROLE_NAMES,
  presetPerms, sanitizePerms, permsEqual, diffPerms, countGranted, labelOf, validEmail, emptyPerms
} from "./admin-model.js";

const TOTAL = ALL_KEYS.length;
const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
function fmt(iso) { const ms = Date.parse(iso || ""); return Number.isFinite(ms) ? dateFmt.format(new Date(ms)) : "\u2014"; }

function roleBadge(role) { return '<span class="badge badge--role badge--plain role-chip">' + esc(ROLE_NAMES[role] || role || "Unknown") + "</span>"; }
function statusBadge(st) {
  if (st === "active") return '<span class="badge badge--open">Active</span>';
  if (st === "inactive") return '<span class="badge badge--done">Inactive</span>';
  return '<span class="badge badge--warn">' + esc(st || "No status") + "</span>";
}
function inviteBadge(i) {
  if (i.status === "pending") return i.expired ? '<span class="badge badge--warn">Expired</span>' : '<span class="badge badge--upcoming">Pending</span>';
  if (i.status === "accepted") return '<span class="badge badge--open">Accepted</span>';
  if (i.status === "cancelled") return '<span class="badge badge--done">Cancelled</span>';
  return '<span class="badge badge--warn">' + esc(i.status || "Unknown") + "</span>";
}
function notice(title, text, ic) { return '<div class="state">' + icon(ic) + '<h1 id="page-h1" tabindex="-1" style="font-size:1.2rem">' + esc(title) + "</h1><p>" + esc(text) + "</p></div>"; }
function errText(err) { return err instanceof ApiError ? err.message : "Something went wrong. Please try again."; }

/* ---------- Confirmation dialog ---------- */
function dialog(S, o) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "dlg";
    wrap.innerHTML = '<div class="dlg__box" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<h2 id="dlg-title">' + esc(o.title) + '</h2><div class="dlg__body">' + o.bodyHtml + "</div>" +
      (o.requireText ? '<div class="field" style="margin-top:var(--space-3)"><label class="label" for="dlg-type">' + esc(o.requireLabel) + '</label><input class="input" id="dlg-type" autocomplete="off" spellcheck="false"></div>' : "") +
      '<div class="dlg__actions"><button class="btn btn--outline" type="button" data-x="no">Cancel</button><button class="btn ' + (o.danger ? "btn--danger" : "btn--primary") + '" type="button" data-x="yes"' + (o.requireText ? " disabled" : "") + ">" + esc(o.confirmLabel) + "</button></div></div>";
    document.body.appendChild(wrap);
    const yes = qs('[data-x="yes"]', wrap), typed = qs("#dlg-type", wrap);
    function close(v) { document.removeEventListener("keydown", onKey, true); wrap.remove(); S.closeDialog = null; if (prev && prev.focus) prev.focus(); resolve(v); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(false); } }
    document.addEventListener("keydown", onKey, true);
    S.closeDialog = () => close(false);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(false); });
    qs('[data-x="no"]', wrap).addEventListener("click", () => close(false));
    yes.addEventListener("click", () => close(true));
    if (typed) { typed.addEventListener("input", () => { yes.disabled = typed.value.trim().toLowerCase() !== String(o.requireText).toLowerCase(); }); typed.focus(); }
    else yes.focus();
  });
}

/* ---------- Permission checklist ---------- */
function editorHtml() {
  return PERMISSION_GROUPS.map((g) =>
    '<section class="perm-group"><div class="perm-group__head"><h3>' + esc(g.label) + "</h3>" +
    '<span class="perm-group__tools"><button type="button" class="link-btn" data-all="' + g.key + '">Select all</button><button type="button" class="link-btn" data-none="' + g.key + '">Clear</button></span></div>' +
    '<ul class="perm-list">' + g.items.map((i) =>
      '<li><label class="perm"><span class="perm__text"><span class="perm__name">' + esc(i.label) + (i.locked ? ' <span class="badge badge--warn badge--plain">Owner only</span>' : "") +
      "</span><code>" + esc(i.key) + '</code><span class="perm__desc">' + esc(i.desc) + "</span></span>" +
      '<span class="switch"><input type="checkbox" data-perm="' + i.key + '"' + (i.locked ? " disabled" : "") + '><span class="switch__track" aria-hidden="true"></span><span class="switch__state">Off</span></span></label></li>').join("") +
    "</ul></section>").join("");
}
function permEditor(root, initial, onChange) {
  let perms = sanitizePerms(initial);
  root.innerHTML = editorHtml();
  const counter = qs("[data-count]", root.parentElement || root);
  function sync() {
    qsa("[data-perm]", root).forEach((cb) => { cb.checked = perms[cb.dataset.perm] === true; qs(".switch__state", cb.parentElement).textContent = cb.checked ? "On" : "Off"; });
    if (counter) counter.textContent = countGranted(perms) + " of " + TOTAL + " permissions on";
  }
  root.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-perm]"); if (!cb) return;
    const k = cb.dataset.perm;
    if (LOCKED_KEYS.includes(k)) { cb.checked = false; return; }
    perms[k] = cb.checked; sync(); if (onChange) onChange();
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-all],[data-none]"); if (!b) return;
    const g = PERMISSION_GROUPS.find((x) => x.key === (b.dataset.all || b.dataset.none)); if (!g) return;
    g.items.forEach((i) => { if (!i.locked) perms[i.key] = b.hasAttribute("data-all"); });
    sync(); if (onChange) onChange();
  });
  sync();
  return { get: () => sanitizePerms(perms), set: (p) => { perms = sanitizePerms(p); sync(); } };
}
function roleOptions(selected, includeCurrent) {
  let o = ASSIGNABLE_ROLES.map((r) => '<option value="' + r + '"' + (r === selected ? " selected" : "") + ">" + esc(ROLE_NAMES[r]) + "</option>").join("");
  if (includeCurrent && !ASSIGNABLE_ROLES.includes(includeCurrent)) o = '<option value="' + esc(includeCurrent) + '" selected>Unrecognised role: choose a valid one</option>' + o;
  return o;
}
function setFieldErrors(root, fields) {
  qsa("[data-err]", root).forEach((el) => { el.textContent = ""; el.hidden = true; });
  qsa("[aria-invalid]", root).forEach((el) => el.removeAttribute("aria-invalid"));
  if (!fields) return;
  Object.keys(fields).forEach((k) => {
    const el = qs('[data-err="' + k + '"]', root); if (el) { el.textContent = String(fields[k]); el.hidden = false; }
    const inp = qs('[data-field="' + k + '"]', root); if (inp) inp.setAttribute("aria-invalid", "true");
  });
}

/* ---------- Entry point ---------- */
export function mount(container, ctx) {
  const S = { alive: true, dirty: false, closeDialog: null };
  const badge = qs(".topbar .badge"); // "Read-only" does not describe this page
  if (badge) badge.style.display = "none";
  const guard = (e) => {
    if (!S.dirty) return;
    const a = e.target.closest && e.target.closest('a[href^="#/"]'); if (!a) return;
    if (window.confirm("You have unsaved changes. Leave without saving?")) S.dirty = false; else { e.preventDefault(); e.stopPropagation(); }
  };
  const beforeUnload = (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } };
  document.addEventListener("click", guard, true);
  window.addEventListener("beforeunload", beforeUnload);

  /* Everything private is dropped here: on navigation, when access changes, and on sign-out. */
  const cleanup = () => {
    S.alive = false; S.dirty = false;
    document.removeEventListener("click", guard, true);
    window.removeEventListener("beforeunload", beforeUnload);
    if (S.closeDialog) S.closeDialog();
    if (badge) badge.style.display = "";
    container.innerHTML = "";
  };

  if (!ctx.access || ctx.access.role !== "owner") {
    container.innerHTML = notice("No access to this section", "Only the Owner can manage administrators.", "lock");
    return cleanup;
  }
  const id = ctx.params && ctx.params.id ? ctx.params.id : null;
  if (!id) mountList(container, S);
  else if (id === "new") mountInvite(container, S);
  else mountDetail(container, S, id);
  return cleanup;
}

/* ---------- List ---------- */
function mountList(container, S) {
  container.innerHTML = '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">Admin Management</h1><p>Only the Owner can invite administrators and choose exactly what each one may do.</p></div>' +
    '<div class="btn-row"><button class="btn btn--outline" id="a-refresh" type="button">' + icon("refresh", "icon--sm") + 'Refresh</button><a class="btn btn--primary" href="#/admins/new">' + icon("mail", "icon--sm") + 'Invite administrator</a></div></div><div id="a-body">' + skeletonRows(4) + "</div>";
  const body = qs("#a-body", container);

  async function load() {
    body.innerHTML = skeletonRows(4);
    let data;
    try { data = await callAdmin("admin.listAdmins", {}); }
    catch (err) {
      if (!S.alive) return;
      body.innerHTML = errorState("Could not load administrators", errText(err), "a-retry");
      const b = qs("#a-retry", body); if (b) b.addEventListener("click", load);
      return;
    }
    if (!S.alive) return;
    render(data);
  }

  function render(data) {
    const admins = data.admins || [], invites = data.invites || [];
    let html = "";
    if (data.ownerCount > 1) html += '<div class="alert alert--warn" style="margin-bottom:var(--space-3)">' + icon("info", "icon--sm") + "<span>More than one Owner record exists. This screen never creates, edits, deactivates or removes an Owner; Owners are shown here read-only.</span></div>";
    if (data.ownerCount < 1) html += '<div class="alert alert--error" style="margin-bottom:var(--space-3)">' + icon("alert", "icon--sm") + "<span>No Owner record was found. Fix this in Firebase Console.</span></div>";
    html += '<section class="card card--flat" style="margin-bottom:var(--space-4)"><div class="card__head"><h2 class="card__title">' + icon("users") + "Administrators (" + admins.length + ")</h2></div>";
    html += admins.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>Access</th><th>Updated</th><th></th></tr></thead><tbody>' +
      admins.map((a) => {
        const owner = a.role === "owner";
        return "<tr>" +
          '<td class="cell-main" data-label="Administrator"><a class="cell-title" href="#/admins/' + encodeURIComponent(a.uid) + '">' + esc(a.name || a.email || a.uid) + '</a><div class="cell-sub break">' + esc(a.email) + "</div>" +
          (a.problems && a.problems.length ? '<div class="cell-sub" style="color:var(--warning)">Record needs attention</div>' : "") + "</td>" +
          '<td data-label="Role">' + roleBadge(a.role) + "</td>" +
          '<td data-label="Status">' + statusBadge(a.status) + "</td>" +
          '<td data-label="Access">' + (owner ? "All " + TOTAL : countGranted(a.permissions) + " of " + TOTAL) + "</td>" +
          '<td data-label="Updated">' + esc(fmt(a.updatedAt)) + "</td>" +
          '<td data-label=""><a class="btn btn--outline btn--sm" href="#/admins/' + encodeURIComponent(a.uid) + '">' + (owner ? "View" : "Manage") + "</a></td></tr>";
      }).join("") + "</tbody></table></div>" : emptyState("No administrators", "No access records were found.", "users");
    html += "</section>";
    html += '<section class="card card--flat"><div class="card__head"><h2 class="card__title">' + icon("mail") + "Invitations (" + invites.length + ")</h2></div>";
    html += invites.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Email</th><th>Role</th><th>Access</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>' +
      invites.map((i) => "<tr>" +
        '<td class="cell-main break" data-label="Email">' + esc(i.email) + '<div class="cell-sub">Invited by ' + esc(i.invitedByEmail || "\u2014") + "</div></td>" +
        '<td data-label="Role">' + roleBadge(i.role) + "</td>" +
        '<td data-label="Access">' + countGranted(i.permissions) + " of " + TOTAL + "</td>" +
        '<td data-label="Status">' + inviteBadge(i) + "</td>" +
        '<td data-label="Expires">' + esc(fmt(i.expiresAt)) + "</td>" +
        '<td data-label="">' + (i.status === "pending" && !i.expired ? '<button class="btn btn--outline btn--sm" type="button" data-cancel="' + esc(i.email) + '">Cancel</button>' : "") + "</td></tr>").join("") + "</tbody></table></div>"
      : emptyState("No invitations", "Invite someone with the button above. They sign in with Google using the invited email, then accept.", "mail");
    html += "</section>";
    body.innerHTML = html;
    qsa("[data-cancel]", body).forEach((btn) => btn.addEventListener("click", async () => {
      const email = btn.dataset.cancel;
      const ok = await dialog(S, { title: "Cancel this invitation?", bodyHtml: "<p>The invitation for <strong>" + esc(email) + "</strong> will stop working. You can invite them again later.</p>", confirmLabel: "Cancel invitation", danger: true });
      if (!ok || !S.alive) return;
      try { await withBusy(btn, () => callAdmin("admin.cancelInvite", { email })); if (!S.alive) return; toast("Invitation cancelled.", "ok"); load(); }
      catch (err) { if (S.alive) toast(errText(err), "error"); }
    }));
  }
  qs("#a-refresh", container).addEventListener("click", load);
  load();
}

/* ---------- Invite ---------- */
function mountInvite(container, S) {
  container.innerHTML = '<a class="crumb" href="#/admins">' + icon("back", "icon--sm") + 'All administrators</a>' +
    '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">Invite administrator</h1><p>They sign in with Google using this exact email, then choose Accept invitation. You never handle a password.</p></div></div><div id="i-body"></div>';
  const body = qs("#i-body", container);
  let editor = null;

  function form() {
    S.dirty = false;
    body.innerHTML = '<div class="detail-grid"><section class="card"><div class="card__head"><h2 class="card__title">' + icon("mail") + "Who</h2></div>" +
      '<div class="field"><label class="label" for="i-email">Email address</label><input class="input" id="i-email" data-field="email" type="email" autocomplete="off" placeholder="name@example.com"><p class="hint form-err" data-err="email" hidden></p></div>' +
      '<div class="field"><label class="label" for="i-name">Name (optional)</label><input class="input" id="i-name" data-field="name" maxlength="80" autocomplete="off"><p class="hint form-err" data-err="name" hidden></p></div>' +
      '<div class="field"><label class="check"><input type="checkbox" id="i-mail" checked><span>Also send them a notification email (it contains no secret)</span></label></div></section>' +
      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("shield") + "Role</h2></div>" +
      '<div class="field"><label class="label" for="i-role">Role preset</label><select class="select" id="i-role" data-field="role">' + roleOptions("viewer") + '</select><p class="hint form-err" data-err="role" hidden></p></div>' +
      '<p class="hint" style="margin-top:var(--space-2)">A role is only a starting point. Choosing one fills in the switches below so you can see exactly what it grants. Change any switch before sending. What you save is the permission list, not the role name.</p></section>' +
      '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("key") + 'Permissions</h2><span class="muted" data-count></span></div><p class="form-err hint" data-err="permissions" hidden></p><div id="i-perms"></div></section></div>' +
      '<div class="savebar"><span class="muted">Nothing is sent until you confirm.</span><span class="savebar__btns"><button class="btn btn--primary" id="i-send" type="button">Review and send invitation</button></span></div>';
    editor = permEditor(qs("#i-perms", body), presetPerms("viewer"), () => { S.dirty = true; });
    qs("#i-role", body).addEventListener("change", (e) => { editor.set(presetPerms(e.target.value)); S.dirty = true; });
    qsa("#i-email,#i-name,#i-mail", body).forEach((el) => el.addEventListener("input", () => { S.dirty = true; }));
    qs("#i-send", body).addEventListener("click", submit);
  }

  async function submit(e) {
    const btn = e.currentTarget;
    const email = qs("#i-email", body).value.trim().toLowerCase(), name = qs("#i-name", body).value.trim(), role = qs("#i-role", body).value, perms = editor.get();
    setFieldErrors(body, null);
    if (!validEmail(email)) { setFieldErrors(body, { email: "Enter a valid email address." }); qs("#i-email", body).focus(); return; }
    if (!countGranted(perms)) { setFieldErrors(body, { permissions: "Turn on at least one permission." }); return; }
    const sendEmail = qs("#i-mail", body).checked;
    const on = ALL_KEYS.filter((k) => perms[k]).map((k) => "<li>" + esc(labelOf(k)) + "</li>").join("");
    const ok = await dialog(S, { title: "Send this invitation?", confirmLabel: "Send invitation",
      bodyHtml: "<p><strong>" + esc(email) + "</strong> will be invited as <strong>" + esc(ROLE_NAMES[role]) + "</strong> with " + countGranted(perms) + " of " + TOTAL + " permissions:</p><ul class=\"dlg__list\">" + on + "</ul><p class=\"hint\">The invitation expires in 7 days and only works for someone signed in with this verified email.</p>" });
    if (!ok || !S.alive) return;
    try {
      const r = await withBusy(btn, () => callAdmin("admin.inviteAdmin", { email, name, role, permissions: perms, sendEmail }));
      if (!S.alive) return;
      S.dirty = false;
      body.innerHTML = '<div class="alert alert--ok">' + icon("check", "icon--sm") + "<span>Invitation created for <strong>" + esc(r.email) + "</strong>. " + (r.emailSent ? "A notification email was sent." : "No email was sent, so tell them yourself.") +
        " They must open the Controller, continue with Google using exactly this email, then choose Accept invitation within " + esc(r.expiresInDays) + ' days.</span></div><div class="btn-row" style="margin-top:var(--space-4)"><a class="btn btn--primary" href="#/admins">Back to administrators</a><button class="btn btn--outline" id="i-again" type="button">Invite another</button></div>';
      qs("#i-again", body).addEventListener("click", form);
    } catch (err) {
      if (!S.alive) return;
      if (err instanceof ApiError && err.fields) setFieldErrors(body, err.fields);
      toast(errText(err), "error");
    }
  }
  form();
}

/* ---------- Detail / edit ---------- */
function mountDetail(container, S, uid) {
  container.innerHTML = '<a class="crumb" href="#/admins">' + icon("back", "icon--sm") + 'All administrators</a><div id="d-body">' + skeletonRows(3) + "</div>";
  const body = qs("#d-body", container);
  let base = null, editor = null;

  async function load() {
    body.innerHTML = skeletonRows(3); S.dirty = false;
    try { const r = await callAdmin("admin.getAdmin", { uid }); if (!S.alive) return; base = r.admin; render(); }
    catch (err) {
      if (!S.alive) return;
      if (err instanceof ApiError && err.code === "NOT_FOUND") { body.innerHTML = emptyState("Administrator not found", "They may have been removed.", "search"); return; }
      body.innerHTML = errorState("Could not load this administrator", errText(err), "d-retry");
      const b = qs("#d-retry", body); if (b) b.addEventListener("click", load);
    }
  }

  function accountCard() {
    return '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("user") + "Account</h2></div><dl class=\"kv\">" +
      "<div><dt>Email</dt><dd>" + esc(base.email) + "</dd></div>" +
      '<div><dt>Account ID (UID)</dt><dd class="copy-line"><code>' + esc(base.uid) + '</code><button class="btn btn--outline btn--sm btn--icon" id="d-copy" type="button" aria-label="Copy account ID">' + icon("copy", "icon--sm") + "</button></dd></div>" +
      "<div><dt>Role</dt><dd>" + roleBadge(base.role) + "</dd></div><div><dt>Status</dt><dd>" + statusBadge(base.status) + "</dd></div>" +
      "<div><dt>Created</dt><dd>" + esc(fmt(base.createdAt)) + "</dd></div><div><dt>Last updated</dt><dd>" + esc(fmt(base.updatedAt)) + "</dd></div>" +
      "<div><dt>Created by</dt><dd class=\"break\">" + esc(base.createdBy || "\u2014") + "</dd></div><div><dt>Updated by</dt><dd class=\"break\">" + esc(base.updatedBy || "\u2014") + "</dd></div></dl>" +
      (base.problems.length ? '<div class="alert alert--warn" style="margin-top:var(--space-3)">' + icon("alert", "icon--sm") + "<span>" + esc(base.problems.join(" ")) + " Correct it in Firebase Console.</span></div>" : "") + "</section>";
  }

  function render() {
    S.dirty = false; editor = null;
    const owner = base.role === "owner";
    const title = esc(base.name || base.email);
    if (owner) {
      body.innerHTML = '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">' + title + "</h1><p>" + esc(base.email) + "</p></div><div>" + roleBadge("owner") + " " + statusBadge(base.status) + "</div></div>" +
        '<div class="alert" style="margin-bottom:var(--space-4)">' + icon("shield", "icon--sm") + "<span>The Owner always holds every permission and is protected. It cannot be changed, deactivated, demoted or removed from this screen.</span></div>" +
        '<div class="detail-grid">' + accountCard() + '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("key") + "Permissions</h2></div><div class=\"chips\">" +
        ALL_KEYS.map((k) => '<span class="chip">' + esc(k) + "</span>").join("") + "</div></section></div>";
      const c = qs("#d-copy", body); if (c) c.addEventListener("click", () => copyText(base.uid, "Account ID copied"));
      return;
    }
    const active = base.status === "active";
    body.innerHTML = '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">' + title + "</h1><p>" + esc(base.email) + "</p></div><div>" + roleBadge(base.role) + " " + statusBadge(base.status) + "</div></div>" +
      '<div id="d-msg"></div><div class="detail-grid">' + accountCard() +
      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("shield") + "Role and name</h2></div>" +
      '<div class="field"><label class="label" for="d-name">Name</label><input class="input" id="d-name" data-field="name" maxlength="80" autocomplete="off" value="' + esc(base.name) + '"><p class="hint form-err" data-err="name" hidden></p></div>' +
      '<div class="field"><label class="label" for="d-role">Role</label><div class="inline"><select class="select" id="d-role" data-field="role">' + roleOptions(base.role, base.role) + '</select><button class="btn btn--outline" id="d-preset" type="button">Apply role preset</button></div><p class="hint form-err" data-err="role" hidden></p></div>' +
      '<p class="hint" style="margin-top:var(--space-2)">Changing the role does not change any switch. Use <strong>Apply role preset</strong> to load a role\'s suggested switches, review them, then save.</p></section>' +
      '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("key") + 'Permissions</h2><span class="muted" data-count></span></div><p class="form-err hint" data-err="permissions" hidden></p><div id="d-perms"></div></section>' +
      '<section class="card span-2 card--danger"><div class="card__head"><h2 class="card__title">' + icon("lock") + "Access status</h2></div>" +
      (active ? '<p class="muted">Deactivating switches access off at once, including for a signed-in session. Their history is kept and you can reactivate them later.</p><div class="btn-row"><button class="btn btn--danger" id="d-deact" type="button">Deactivate administrator</button></div>'
        : '<p class="muted">This administrator cannot sign in to the Controller. Reactivate to restore their saved permissions, or remove the access record. Removal keeps the activity history.</p><div class="btn-row"><button class="btn btn--primary" id="d-react" type="button">Reactivate</button><button class="btn btn--danger" id="d-remove" type="button">Remove administrator</button></div>') +
      '<p class="hint" id="d-lockhint" hidden>Save or discard your edits before changing access status.</p></section></div>' +
      '<div class="savebar" id="d-savebar"><span class="muted" id="d-state">No unsaved changes</span><span class="savebar__btns"><button class="btn btn--outline" id="d-discard" type="button" disabled>Discard</button><button class="btn btn--primary" id="d-save" type="button" disabled>Review and save</button></span></div>';

    editor = permEditor(qs("#d-perms", body), base.permissions, refreshDirty);
    qs("#d-copy", body).addEventListener("click", () => copyText(base.uid, "Account ID copied"));
    qs("#d-name", body).addEventListener("input", refreshDirty);
    qs("#d-role", body).addEventListener("change", refreshDirty); // a role change never touches the switches
    qs("#d-preset", body).addEventListener("click", () => { const r = qs("#d-role", body).value; if (ASSIGNABLE_ROLES.includes(r)) { editor.set(presetPerms(r)); refreshDirty(); toast("Preset loaded. Review the switches, then save.", "info"); } });
    qs("#d-discard", body).addEventListener("click", render);
    qs("#d-save", body).addEventListener("click", save);
    ["d-deact", "d-react", "d-remove"].forEach((i) => { const b = qs("#" + i, body); if (b) b.addEventListener("click", () => statusAction(i)); });
  }

  function changes() {
    const c = {};
    const name = qs("#d-name", body).value.trim(), role = qs("#d-role", body).value, perms = editor.get();
    if (name !== (base.name || "")) c.name = name;
    if (role !== base.role) c.role = role;
    if (!permsEqual(perms, sanitizePerms(base.permissions))) c.permissions = perms;
    return c;
  }
  function refreshDirty() {
    const dirty = Object.keys(changes()).length > 0;
    S.dirty = dirty;
    qs("#d-save", body).disabled = !dirty; qs("#d-discard", body).disabled = !dirty;
    qs("#d-state", body).textContent = dirty ? "You have unsaved changes" : "No unsaved changes";
    qs("#d-savebar", body).classList.toggle("savebar--dirty", dirty);
    ["d-deact", "d-react", "d-remove"].forEach((i) => { const b = qs("#" + i, body); if (b) b.disabled = dirty; });
    qs("#d-lockhint", body).hidden = !dirty;
  }
  function showMsg(kind, text, withReload) {
    const m = qs("#d-msg", body);
    m.innerHTML = '<div class="alert alert--' + kind + '" style="margin-bottom:var(--space-3)">' + icon(kind === "ok" ? "check" : "alert", "icon--sm") + "<span>" + esc(text) + "</span>" + (withReload ? ' <button class="btn btn--outline btn--sm" id="d-reload" type="button">Reload</button>' : "") + "</div>";
    const r = qs("#d-reload", m); if (r) r.addEventListener("click", load);
    m.scrollIntoView({ block: "nearest" });
  }

  async function save(e) {
    const btn = e.currentTarget, c = changes();
    if (!Object.keys(c).length) return;
    setFieldErrors(body, null);
    let list = "";
    if (c.role) list += "<li>Role: " + esc(ROLE_NAMES[base.role] || base.role) + " \u2192 <strong>" + esc(ROLE_NAMES[c.role] || c.role) + "</strong></li>";
    if (c.name !== undefined) list += "<li>Name will change.</li>";
    if (c.permissions) {
      const d = diffPerms(sanitizePerms(base.permissions), c.permissions);
      if (d.added.length) list += "<li>Gains: " + d.added.map((k) => esc(labelOf(k))).join(", ") + "</li>";
      if (d.removed.length) list += "<li>Loses: " + d.removed.map((k) => esc(labelOf(k))).join(", ") + "</li>";
    }
    const ok = await dialog(S, { title: "Save these changes?", confirmLabel: "Save changes",
      bodyHtml: "<p>For <strong>" + esc(base.email) + "</strong>:</p><ul class=\"dlg__list\">" + list + "</ul><p class=\"hint\">Takes effect immediately. If they are signed in, their screen updates within seconds.</p>" });
    if (!ok || !S.alive) return;
    try {
      const r = await withBusy(btn, () => callAdmin("admin.updateAdmin", Object.assign({ uid: base.uid, revision: base.revision }, c)));
      if (!S.alive) return;
      base = r.admin; render(); showMsg("ok", "Saved.");
    } catch (err) {
      if (!S.alive) return;
      if (err instanceof ApiError && err.fields) setFieldErrors(body, err.fields);
      showMsg("error", errText(err), err instanceof ApiError && (err.code === "CONFLICT" || err.code === "NOT_FOUND"));
    }
  }

  async function statusAction(which) {
    const email = base.email;
    let cfg;
    if (which === "d-deact") cfg = { title: "Deactivate this administrator?", confirmLabel: "Deactivate", danger: true, bodyHtml: "<p><strong>" + esc(email) + "</strong> loses all Controller access immediately. Their saved permissions and history are kept.</p>" };
    else if (which === "d-react") cfg = { title: "Reactivate this administrator?", confirmLabel: "Reactivate", bodyHtml: "<p><strong>" + esc(email) + "</strong> regains access with their saved permissions (" + countGranted(base.permissions) + " of " + TOTAL + "). Check them first.</p>" };
    else cfg = { title: "Remove this administrator?", confirmLabel: "Remove", danger: true, requireText: email, requireLabel: "Type their email to confirm",
      bodyHtml: "<p>This deletes the access record for <strong>" + esc(email) + "</strong>. Their activity history is kept. To give them access again you must send a new invitation.</p>" };
    const ok = await dialog(S, cfg);
    if (!ok || !S.alive) return;
    const btn = qs("#" + which, body);
    try {
      if (which === "d-remove") {
        await withBusy(btn, () => callAdmin("admin.removeAdmin", { uid: base.uid, revision: base.revision, confirmEmail: email }));
        if (!S.alive) return; S.dirty = false; toast("Administrator removed.", "ok"); window.location.hash = "#/admins"; return;
      }
      const r = await withBusy(btn, () => callAdmin("admin.updateAdmin", { uid: base.uid, revision: base.revision, status: which === "d-deact" ? "inactive" : "active" }));
      if (!S.alive) return;
      base = r.admin; render(); showMsg("ok", which === "d-deact" ? "Administrator deactivated." : "Administrator reactivated.");
    } catch (err) {
      if (!S.alive) return;
      showMsg("error", errText(err), err instanceof ApiError && (err.code === "CONFLICT" || err.code === "NOT_FOUND"));
    }
  }
  load();
}
