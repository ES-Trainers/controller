/* ES TRAINERS ConTroller — dashboard (READ-ONLY in M0).
   Every figure is computed from the live `tournaments` collection. Nothing is hardcoded and
   nothing is invented: payments, pending registrations and activity are NOT shown because
   their data needs later milestones (Rules Stage C and the Apps Script backend). */
import { watchTournaments, retryTournaments, dataChecks, rowHtml, TABLE_HEAD } from "./tournaments.js";
import { evaluate, formatDateTimeIST, formatCountdown } from "./lifecycle.js";
import { icon } from "./icons.js";
import { esc, qs, skeletonCards, skeletonRows, emptyState, errorState } from "./ui.js";

function greeting(now) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date(now)));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function mount(container, ctx) {
  const first = String(ctx.access.name || "").split(" ")[0] || "there";
  container.innerHTML =
    '<div class="page-head"><div><h1 id="page-h1" tabindex="-1">' + esc(greeting(Date.now())) + ", " + esc(first) + "</h1>" +
    "<p>Live overview of ES Trainers tournaments. Read-only for now.</p></div></div>" +
    '<div id="dash-body">' + skeletonCards(6) + skeletonRows(3) + "</div>";

  const body = qs("#dash-body", container);
  let timer = null, state = { items: null, error: null, capped: false };

  function render() {
    if (timer) { clearInterval(timer); timer = null; }
    if (state.error) {
      body.innerHTML = errorState("Could not load tournaments", "The overview needs the tournaments collection and it could not be read. Check your connection and try again.", "dash-retry");
      const b = qs("#dash-retry", body); if (b) b.addEventListener("click", () => { body.innerHTML = skeletonCards(6); retryTournaments(); });
      return;
    }
    if (!state.items) { body.innerHTML = skeletonCards(6) + skeletonRows(3); return; }
    const items = state.items, now = Date.now();
    if (!items.length) { body.innerHTML = emptyState("No tournaments yet", "When a tournament exists in Firestore, this overview fills in automatically.", "trophy"); return; }

    const by = (s) => items.filter((t) => t.status === s).length;
    const known = ["registration_open", "upcoming", "live", "completed"];
    const other = items.filter((t) => !known.includes(t.status)).length;
    const teams = items.reduce((n, t) => n + (t.registeredTeams || 0), 0);
    const stat = (iconName, label, value, note) =>
      '<div class="card stat"><div class="stat__label">' + icon(iconName) + esc(label) + '</div><div class="stat__value num">' + value + "</div>" + (note ? '<div class="stat__note">' + esc(note) + "</div>" : "") + "</div>";

    /* Next registration deadline: soonest future deadline among tournaments still accepting or waiting. */
    let next = null;
    items.forEach((t) => {
      const ev = evaluate({ date: t.date, status: t.status, registeredTeams: t.registeredTeams, maxTeams: t.maxTeams }, now);
      const listed = t.status === "registration_open" || t.status === "upcoming"; // the only statuses the public site lists as ahead
      if (listed && (ev.phase === "open" || ev.phase === "full" || ev.phase === "waiting") && ev.deadlineMs && (!next || ev.deadlineMs < next.ev.deadlineMs)) next = { t, ev };
    });

    /* Data checks across all tournaments. */
    const issues = [];
    items.forEach((t) => dataChecks(t, now).forEach((c) => issues.push({ t, c })));

    const shown = items.slice().sort((a, b) => {
      const ae = a.status === "completed" ? 1 : 0, be = b.status === "completed" ? 1 : 0;
      if (ae !== be) return ae - be;
      return (a.startMs === null ? Infinity : a.startMs) - (b.startMs === null ? Infinity : b.startMs);
    }).slice(0, 6);

    body.innerHTML =
      '<div class="stats">' +
      stat("trophy", "Tournaments", items.length, other ? other + " with an unrecognised or missing status" : "") +
      stat("check", "Registration open", by("registration_open"), "") +
      stat("calendar", "Upcoming", by("upcoming"), "") +
      stat("clock", "Live", by("live"), "") +
      stat("list", "Completed", by("completed"), "") +
      stat("users", "Registered teams", teams, "Sum of each registeredTeams counter") + "</div>" +

      '<div class="split">' +
      '<section class="deadline" aria-live="off"><h2>Next registration deadline</h2>' +
      (next
        ? '<span class="deadline__label">' + esc(next.t.title || next.t.id) + '</span><div class="deadline__count" id="dl-count">' + esc(formatCountdown(next.ev.msToDeadline)) + "</div>" +
          '<p class="deadline__meta">Closes ' + esc(formatDateTimeIST(next.ev.deadlineMs)) + ", 48 hours before the start.</p>" +
          '<a href="#/tournaments/' + encodeURIComponent(next.t.id) + '">Open tournament</a>'
        : '<p class="deadline__meta" style="margin-top:var(--space-2)">No tournament has a registration deadline ahead.</p>') + "</section>" +

      '<section class="card"><div class="card__head"><h2 class="card__title">' + icon("shield") + "Data checks</h2></div>" +
      (issues.length
        ? '<ul class="checks">' + issues.slice(0, 6).map((i) => "<li>" + icon(i.c.level === "warn" ? "alert" : "info", i.c.level) + "<span><strong>" + esc(i.t.title || i.t.id) + ":</strong> " + esc(i.c.msg) + "</span></li>").join("") + "</ul>" +
          (issues.length > 6 ? '<p class="hint" style="margin-top:var(--space-2)">And ' + (issues.length - 6) + " more. Open a tournament to see its checks.</p>" : "")
        : '<ul class="checks"><li>' + icon("check", "ok") + "<span>Every tournament has the fields the public site and backend expect.</span></li></ul>") + "</section></div>" +

      '<section><div class="card__head"><h2>Tournaments</h2><a class="link-btn" href="#/tournaments">View all (' + items.length + ")</a></div>" +
      '<div class="table-wrap"><table class="table">' + TABLE_HEAD + "<tbody>" + shown.map((t) => rowHtml(t, now)).join("") + "</tbody></table></div></section>" +
      '<p class="footnote">Team counts come from the registeredTeams counter on each tournament. Payments, pending registrations and activity will appear when their milestones are built.' + (state.capped ? " Only the first 200 tournaments are loaded." : "") + "</p>";

    if (next) {
      const el = qs("#dl-count", body), end = next.ev.deadlineMs;
      timer = setInterval(() => {
        const left = end - Date.now();
        if (left <= 0) { clearInterval(timer); timer = null; render(); return; }
        el.textContent = formatCountdown(left);
      }, 1000);
    }
  }

  const unsub = watchTournaments((s) => { state = s; render(); });
  return () => { unsub(); if (timer) clearInterval(timer); };
}
