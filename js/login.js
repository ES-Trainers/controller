/* Login page controller: one path decides everything.
   auth state -> (signed in?) -> access check -> dashboard, or an explanatory screen. */
import { onUser, loginWithGoogle, loginWithEmail, sendReset, sendVerification, logout, providersOf, providerLabel, friendlyError } from "./auth.js";
import { readAccessOnce, messageFor } from "./permissions.js";
import { icon } from "./icons.js";
import { esc, qs, copyText, withBusy } from "./ui.js";

const states = ["loading", "signin", "reset", "denied"];
function show(name) { states.forEach((s) => { qs("#state-" + s).hidden = s !== name; }); }
function loading(title, text) { qs("#loading-title").textContent = title; qs("#loading-text").textContent = text; show("loading"); }
function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

qs("#google-icon").innerHTML = icon("google");
const pw = qs("#password"), toggle = qs("#toggle-pw");
toggle.innerHTML = icon("eye");
toggle.addEventListener("click", () => {
  const showing = pw.type === "text";
  pw.type = showing ? "password" : "text";
  toggle.innerHTML = icon(showing ? "eye" : "eyeoff");
  toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  toggle.setAttribute("aria-pressed", String(!showing));
});

let checking = false;

async function handleUser(user) {
  if (!user) { checking = false; show("signin"); return; }
  if (checking) return;
  checking = true;
  loading("Checking your access", "Confirming this account with the access list.");
  const result = await readAccessOnce(user);
  checking = false;
  if (result.ok) { loading("Signed in", "Opening the dashboard."); window.location.replace("dashboard.html"); return; }
  renderDenied(user, result.code);
}

function renderDenied(user, code) {
  const m = messageFor(code);
  const soft = code === "network" || code === "unverified";
  qs("#denied-icon").className = "denied-icon" + (soft ? " denied-icon--info" : "");
  qs("#denied-icon").innerHTML = icon(code === "unverified" ? "mail" : code === "network" ? "refresh" : "lock");
  qs("#denied-title").textContent = m.title;
  qs("#denied-text").textContent = m.text;
  const methods = providersOf(user).map(providerLabel).join(", ") || "Unknown";
  qs("#acct").innerHTML =
    "<div><dt>Email</dt><dd>" + esc(user.email || "No email") + "</dd></div>" +
    "<div><dt>Sign-in methods</dt><dd>" + esc(methods) + "</dd></div>" +
    "<div><dt>Email verified</dt><dd>" + (user.emailVerified ? "Yes" : "No") + "</dd></div>" +
    '<div><dt>Account ID (UID)</dt><dd class="copy-line"><code id="uid-code">' + esc(user.uid) + '</code>' +
    '<button class="btn btn--outline btn--sm btn--icon" id="btn-copy-uid" type="button" aria-label="Copy account ID">' + icon("copy", "icon--sm") + "</button></dd></div>";
  qs("#btn-copy-uid").addEventListener("click", () => copyText(user.uid, "Account ID copied"));
  qs("#btn-verify").hidden = code !== "unverified";
  qs("#denied-msg").hidden = true;
  show("denied");
}

onUser(handleUser);
loading("Loading", "Checking whether you are already signed in.");

/* ---- Google ---- */
qs("#btn-google").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  showError(qs("#signin-error"), "");
  try { await loginWithGoogle(qs("#remember").checked); }
  catch (err) { showError(qs("#signin-error"), friendlyError(err)); }
}));

/* ---- Email + password ---- */
qs("#form-email").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = qs("#email").value.trim(), pass = pw.value, err = qs("#signin-error");
  qs("#email").removeAttribute("aria-invalid"); pw.removeAttribute("aria-invalid");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { qs("#email").setAttribute("aria-invalid", "true"); showError(err, "Enter a valid email address."); qs("#email").focus(); return; }
  if (!pass) { pw.setAttribute("aria-invalid", "true"); showError(err, "Enter your password."); pw.focus(); return; }
  showError(err, "");
  withBusy(qs("#btn-email"), async () => {
    try { await loginWithEmail(email, pass, qs("#remember").checked); }
    catch (ex) { showError(err, friendlyError(ex)); }
  });
});

/* ---- Reset password ---- */
qs("#link-forgot").addEventListener("click", () => { qs("#reset-email").value = qs("#email").value.trim(); showError(qs("#reset-msg"), ""); show("reset"); qs("#reset-email").focus(); });
qs("#btn-reset-back").addEventListener("click", () => show("signin"));
qs("#form-reset").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = qs("#reset-email").value.trim(), box = qs("#reset-msg");
  box.className = "alert form-error";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { box.className = "alert alert--error form-error"; showError(box, "Enter a valid email address."); return; }
  withBusy(qs("#btn-reset"), async () => {
    try { await sendReset(email); } catch (ex) {
      if (ex && (ex.code === "auth/network-request-failed" || ex.code === "auth/too-many-requests")) { box.className = "alert alert--error form-error"; showError(box, friendlyError(ex)); return; }
      /* Any other result is answered the same way, so the page never reveals which emails have accounts. */
    }
    box.className = "alert alert--ok form-error";
    showError(box, "If that email has a password sign-in, a reset link is on its way. Check spam too.");
  });
});

/* ---- Denied screen actions ---- */
qs("#btn-signout").addEventListener("click", async () => { await logout(); });
qs("#btn-retry").addEventListener("click", async (e) => withBusy(e.currentTarget, async () => {
  const { currentUser } = await import("./auth.js");
  const u = currentUser();
  if (!u) { show("signin"); return; }
  try { await u.reload(); } catch (x) { /* token refresh problems are handled by the check */ }
  checking = false; await handleUser(u);
}));
qs("#btn-verify").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const box = qs("#denied-msg");
  try { await sendVerification(); box.className = "alert alert--ok"; box.textContent = "Verification email sent. Open the link in it, then choose Check again."; }
  catch (ex) { box.className = "alert alert--error"; box.textContent = friendlyError(ex); }
  box.hidden = false;
}));
