/* ES TRAINERS ConTroller — hash router, sidebar and mobile drawer.
   Pages are loaded on demand (dynamic import) and each one returns an "unmount" function
   that removes its listeners and timers. Menu items are filtered by permission, but that is
   convenience only: Firestore Rules are the real gate. */
import { can } from "./permissions.js";
import { icon } from "./icons.js";
import { esc, qs, qsa, initials } from "./ui.js";

const ROUTES = [
  { key: "dashboard", path: "dashboard", title: "Dashboard", icon: "dashboard", perm: null, load: () => import("./dashboard.js") },
  { key: "tournaments", path: "tournaments", title: "Tournaments", icon: "trophy", perm: "viewTournament", load: () => import("./tournaments.js") },
  { key: "account", path: "account", title: "Account", icon: "user", perm: null, load: () => import("./account.js") }
];

let ctx = null, unmount = null, seq = 0, drawerOpener = null;
const DRAWER_MAX = 1023;

function parseHash() {
  const parts = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/").filter(Boolean);
  let id = null;
  if (parts[1]) { try { id = decodeURIComponent(parts[1]); } catch (e) { id = null; } }
  return { path: parts[0] || "dashboard", id };
}

export function buildShell(access, user) {
  const nav = qs("#nav");
  nav.innerHTML = ROUTES.filter((r) => !r.perm || can(access, r.perm))
    .map((r) => '<a href="#/' + r.path + '" data-route="' + r.key + '">' + icon(r.icon) + "<span>" + esc(r.title) + "</span></a>").join("");
  qs("#user-avatar").textContent = initials(access.name, access.email);
  qs("#user-name").textContent = access.name;
  qs("#user-mail").textContent = access.email;
  qs("#user-role").textContent = access.roleLabel;
  qs("#signout-icon").innerHTML = icon("logout");
  qs("#menu-icon").innerHTML = icon("menu");
  qs("#close-icon").innerHTML = icon("x");
}

export function startRouter(access, user) {
  ctx = { access, user };
  window.addEventListener("hashchange", render);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  qs("#menu-btn").addEventListener("click", () => setDrawer(true));
  qs("#close-btn").addEventListener("click", () => setDrawer(false));
  qs("#scrim").addEventListener("click", () => setDrawer(false));
  qs("#nav").addEventListener("click", (e) => { if (e.target.closest("a")) setDrawer(false); });
  render();
}

/** Refresh permissions after the access record changes while the page is open. */
export function updateAccess(access) { if (!ctx) return; ctx.access = access; buildShell(access, ctx.user); render(); }

export function stopRouter() {
  window.removeEventListener("hashchange", render);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onResize);
  seq++;
  if (unmount) { try { unmount(); } catch (e) { /* ignore */ } unmount = null; }
}

function setDrawer(open) {
  const sb = qs("#sidebar"), scrim = qs("#scrim"), btn = qs("#menu-btn");
  const isOpen = sb.classList.contains("is-open");
  if (open === isOpen) return;
  sb.classList.toggle("is-open", open);
  scrim.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) { drawerOpener = document.activeElement; const first = qs("#nav a", sb); if (first) first.focus(); }
  else if (drawerOpener && drawerOpener.focus) { drawerOpener.focus(); drawerOpener = null; }
}
function onKey(e) { if (e.key === "Escape") setDrawer(false); }
function onResize() { if (window.innerWidth > DRAWER_MAX) setDrawer(false); }

async function render() {
  const mine = ++seq;
  const view = qs("#view");
  const { path, id } = parseHash();
  const route = ROUTES.find((r) => r.path === path);
  if (unmount) { try { unmount(); } catch (e) { /* ignore */ } unmount = null; }

  qsa("#nav a").forEach((a) => { if (route && a.dataset.route === route.key) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });

  if (!route) { view.innerHTML = notice("Page not found", "That page does not exist. Use the menu to go to the dashboard.", "search"); setTitle("Not found"); return; }
  if (route.perm && !can(ctx.access, route.perm)) { view.innerHTML = notice("No access to this section", "Your account does not have permission to open " + route.title + ".", "lock"); setTitle(route.title); return; }

  setTitle(route.title);
  view.innerHTML = '<div class="skeleton sk-title" style="margin-bottom:24px"></div><div class="skeleton sk-card"></div>';
  try {
    const mod = await route.load();
    if (mine !== seq) return; // a newer navigation won
    unmount = mod.mount(view, { access: ctx.access, user: ctx.user, params: { id } }) || null;
    const h = qs("#page-h1", view); if (h) h.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    if (mine !== seq) return;
    console.error("Could not open page", err);
    view.innerHTML = notice("This page could not load", "Refresh the page. If it keeps happening, tell the developer.", "alert");
  }
}

function setTitle(t) {
  document.title = t + " \u00B7 ES Trainers ConTroller";
  const el = qs("#topbar-title"); if (el) el.textContent = t;
}
function notice(title, text, ic) {
  return '<div class="state">' + icon(ic) + '<h1 id="page-h1" tabindex="-1" style="font-size:1.2rem">' + esc(title) + "</h1><p>" + esc(text) + "</p></div>";
}
