/* ES TRAINERS ConTroller — Account page.
   Shows who is signed in and lets the person add the OTHER sign-in method to the SAME account,
   so Google and email/password share one UID. Nothing here changes roles or permissions. */
import { currentUser, providersOf, providerLabel, linkPassword, linkGoogle, sendVerification, sendReset, friendlyError } from "./auth.js";
import { PERMISSION_KEYS, can } from "./permissions.js";
import { icon } from "./icons.js";
import { esc, qs, copyText, toast, withBusy } from "./ui.js";
import { canWriteAnything, canManageTeams } from "./permissions.js";

const MIN_PW = 10;

export function mount(container, ctx) {
  function render() {
    const user = currentUser();
    if (!user) return;
    const methods = providersOf(user);
    const hasPw = methods.includes("password"), hasGoogle = methods.includes("google.com");
    const granted = PERMISSION_KEYS.filter((k) => can(ctx.access, k));

    container.innerHTML =
      '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">Account</h1><p>Your sign-in details and access level.</p></div></div>' +
      '<div class="detail-grid">' +
      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("user") + "Signed in as</h2></div><dl class=\"kv\">" +
      "<div><dt>Name</dt><dd>" + esc(ctx.access.name) + "</dd></div>" +
      "<div><dt>Email</dt><dd>" + esc(user.email) + "</dd></div>" +
      "<div><dt>Role</dt><dd>" + esc(ctx.access.roleLabel) + "</dd></div>" +
      "<div><dt>Email verified</dt><dd>" + (user.emailVerified ? "Yes" : "No") + "</dd></div>" +
      '<div><dt>Account ID (UID)</dt><dd class="copy-line"><code>' + esc(user.uid) + '</code><button class="btn btn--outline btn--sm btn--icon" id="a-copy" type="button" aria-label="Copy account ID">' + icon("copy", "icon--sm") + "</button></dd></div>" +
      "</dl></section>" +

      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("key") + "Sign-in methods</h2></div>" +
      '<p class="muted" style="margin-bottom:var(--space-3)">Both methods open the same account. Currently: ' + esc(methods.map(providerLabel).join(", ") || "none") + ".</p>" +
      (hasPw ? '<div class="alert alert--ok">' + icon("check", "icon--sm") + "<span>Password sign-in is set up.</span></div>"
        : '<form id="a-pw" novalidate><div class="field"><label class="label" for="a-pw1">Add a password</label><input class="input" id="a-pw1" type="password" autocomplete="new-password" minlength="' + MIN_PW + '"><span class="hint">At least ' + MIN_PW + " characters, with letters and numbers. Use one you use nowhere else.</span></div>" +
          '<div class="field"><label class="label" for="a-pw2">Repeat the password</label><input class="input" id="a-pw2" type="password" autocomplete="new-password"></div>' +
          '<div class="alert alert--error" id="a-pw-err" role="alert" hidden style="margin-top:var(--space-3)"></div>' +
          '<button class="btn btn--primary" id="a-pw-btn" type="submit" style="margin-top:var(--space-3)">Add password</button></form>') +
      (hasPw ? '<div style="margin-top:var(--space-3)"><button class="btn btn--outline btn--sm" id="a-reset" type="button">' + icon("mail", "icon--sm") + "Email me a password reset link</button></div>" : "") +
      (!hasGoogle ? '<div style="margin-top:var(--space-4)"><button class="btn btn--outline" id="a-google" type="button"><span id="a-g"></span>Add Google sign-in</button><p class="hint" style="margin-top:6px">Choose the Google account with the same email address.</p></div>' : "") +
      (!user.emailVerified ? '<div style="margin-top:var(--space-4)"><button class="btn btn--soft btn--sm" id="a-verify" type="button">Send verification email</button></div>' : "") +
      "</section>" +

      '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("shield") + "Permissions on this account</h2></div>" +
      '<p class="muted" style="margin-bottom:var(--space-3)">Read from your access record. Only the Owner can change it, in Admin Management.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">' +
      (granted.length ? granted.map((k) => '<span class="chip">' + esc(k) + "</span>").join("") : '<span class="muted">No permissions granted.</span>') + "</div>" +
      '<p class="hint" style="margin-top:var(--space-3)">Can change things in the Controller: <strong>' + (canWriteAnything(ctx.access) ? "Yes" : "No (read-only)") + "</strong>. Can edit or remove registered teams: <strong>" + (canManageTeams(ctx.access) ? "Yes" : "No") + "</strong>. Team editing needs the Owner or Super Admin role and the manage registrations permission.</p></section>" +

      '<section class="card span-2"><div class="card__head"><h2 class="card__title">' + icon("shield") + "Access check</h2></div>" +
      '<p class="muted" style="margin-bottom:var(--space-3)">Compares what this browser believes with what the server verifies for your account. Read-only; nothing is changed.</p>' +
      '<button class="btn btn--outline" id="a-check" type="button">Check with the server</button><div id="a-check-out" aria-live="polite" style="margin-top:var(--space-3)"></div></section></div>';

    qs("#a-copy", container).addEventListener("click", () => copyText(user.uid, "Account ID copied"));
    const g = qs("#a-g", container); if (g) g.innerHTML = icon("google");

    const form = qs("#a-pw", container);
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      const p1 = qs("#a-pw1", container).value, p2 = qs("#a-pw2", container).value, err = qs("#a-pw-err", container);
      const bad = p1.length < MIN_PW ? "Use at least " + MIN_PW + " characters." : !/[A-Za-z]/.test(p1) || !/\d/.test(p1) ? "Include both letters and numbers." : p1 !== p2 ? "The two passwords do not match." : "";
      err.hidden = !bad; err.textContent = bad;
      if (bad) return;
      withBusy(qs("#a-pw-btn", container), async () => {
        try { await linkPassword(p1); toast("Password added. Both sign-in methods now open this account.", "ok"); render(); }
        catch (ex) { err.hidden = false; err.textContent = friendlyError(ex); }
      });
    });
    const rst = qs("#a-reset", container);
    if (rst) rst.addEventListener("click", () => withBusy(rst, async () => { try { await sendReset(user.email); toast("Reset link sent to " + user.email, "ok"); } catch (ex) { toast(friendlyError(ex), "error"); } }));
    const gb = qs("#a-google", container);
    if (gb) gb.addEventListener("click", () => withBusy(gb, async () => { try { await linkGoogle(); toast("Google sign-in added.", "ok"); render(); } catch (ex) { const m = friendlyError(ex); if (m) toast(m, "error"); } }));
    const chk = qs("#a-check", container);
    if (chk) chk.addEventListener("click", () => withBusy(chk, () => runAccessCheck(container, ctx)));
    const vb = qs("#a-verify", container);
    if (vb) vb.addEventListener("click", () => withBusy(vb, async () => { try { await sendVerification(); toast("Verification email sent.", "ok"); } catch (ex) { toast(friendlyError(ex), "error"); } }));
  }
  render();
  return () => {};
}

/* Access check: the browser's evaluation of the access record vs the server's own verdict (admin.ping). Read-only. */
async function runAccessCheck(container, ctx) {
  const out = qs("#a-check-out", container);
  try {
    const { callAdmin } = await import("./api.js");
    const r = await callAdmin("admin.ping");
    const rows = PERMISSION_KEYS.map((k) => {
      const browser = can(ctx.access, k), server = r.permissions && r.permissions[k] === true;
      const same = browser === server || (k === "manageAdmins" && ctx.access.role !== "owner" && !browser); // the browser never shows manageAdmins to a non-owner
      return { k, browser, server, same };
    });
    const bad = rows.filter((x) => !x.same), roleOk = r.account && r.account.role === ctx.access.role, emailOk = r.account && String(r.account.email).toLowerCase() === String(ctx.user.email || "").toLowerCase();
    const hasP3 = Array.isArray(r.actions) && r.actions.includes("admin.listRegistrations");
    out.innerHTML = '<div class="alert alert--' + (!bad.length && roleOk && emailOk ? "ok" : "warn") + '">' + icon(!bad.length && roleOk && emailOk ? "check" : "alert", "icon--sm") + "<span>" +
      (!bad.length && roleOk && emailOk ? "Browser and server agree on your role and all 19 permissions." : "Mismatch found: " + (bad.length ? bad.length + " permission(s) differ. " : "") + (roleOk ? "" : "Role differs. ") + (emailOk ? "" : "Email differs. ") + "Sign out and in, or ask the Owner to check your access record.") + "</span></div>" +
      '<dl class="kv" style="margin-top:var(--space-3)"><div><dt>Server role</dt><dd>' + esc(r.account && r.account.role) + "</dd></div><div><dt>Backend version</dt><dd>" + esc(r.version) + "</dd></div>" +
      "<div><dt>Team registrations on the server</dt><dd>" + (hasP3 ? "Available" : "Not deployed yet") + "</dd></div></dl>" +
      '<div class="table-wrap" style="margin-top:var(--space-3)"><table class="table"><thead><tr><th>Permission</th><th>Browser</th><th>Server</th><th></th></tr></thead><tbody>' +
      rows.map((x) => "<tr><td><code>" + esc(x.k) + '</code></td><td data-label="Browser">' + (x.browser ? "On" : "Off") + '</td><td data-label="Server">' + (x.server ? "On" : "Off") + '</td><td data-label="">' + (x.same ? "" : '<span class="badge badge--warn">Differs</span>') + "</td></tr>").join("") + "</tbody></table></div>";
  } catch (ex) {
    out.innerHTML = '<div class="alert alert--error">' + icon("alert", "icon--sm") + "<span>" + esc(ex && ex.message ? ex.message : "The check could not run.") + "</span></div>";
  }
}
