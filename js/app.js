/* ES TRAINERS ConTroller — dashboard page bootstrap.
   Order of events: auth state -> live access check -> only then show the shell.
   If the person is signed out, or the access record disappears or is switched off,
   the page is emptied and they are sent back to the sign-in page. */
import { onUser, logout } from "./auth.js";
import { watchAccess } from "./permissions.js";
import { buildShell, startRouter, stopRouter, updateAccess } from "./navigation.js";
import { stopTournaments } from "./tournaments.js";
import { qs } from "./ui.js";

let unsubAccess = null, started = false, redirecting = false;

function leave() {
  if (redirecting) return;
  redirecting = true;
  if (unsubAccess) { unsubAccess(); unsubAccess = null; }
  stopRouter();
  stopTournaments(); // close the live listener at once
  qs("#shell").hidden = true; // nothing stays on screen
  qs("#view").innerHTML = "";
  window.location.replace("login.html");
}

onUser((user) => {
  if (!user) { leave(); return; }
  if (unsubAccess) { unsubAccess(); unsubAccess = null; }
  unsubAccess = watchAccess(user, (result) => {
    if (!result.ok) { leave(); return; }
    if (!started) {
      started = true;
      buildShell(result.access, user);
      qs("#boot").hidden = true;
      qs("#shell").hidden = false;
      startRouter(result.access, user);
    } else {
      updateAccess(result.access); // role or permissions changed while open
    }
  });
});

qs("#btn-signout").addEventListener("click", async () => { await logout(); });
