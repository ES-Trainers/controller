# Phase 2: Tournament management

Connects the EXISTING backend actions (`admin.getTournament`, `admin.createTournament`, `admin.updateTournament`, `admin.deleteTournament`)
to the Controller. **`Code.gs`, the Apps Script deployment/URL, Firestore Rules and Admin Management are unchanged.**
Deploying Phase 2 = uploading this folder to GitHub. Nothing to redeploy in Apps Script.

## What it adds
- Tournaments list: **Create tournament** button (needs `createTournament`).
- Tournament page: a **Manage** panel with only the actions the signed-in account may use.
- `#/tournaments/__new` create form, `#/tournaments/<id>/edit` edit form.
- The topbar "Read-only" badge and the list's "Read-only for now" text are hidden for accounts that can change tournaments.

## Rules the screens follow
- A new tournament is ALWAYS created Upcoming, registration OFF, 0 teams. There is no option to change that on the create form.
- Opening registration is a separate action (`publishTournament`). It also turns the registration switch on. The 48-hour rule is enforced by the server.
- `registeredTeams` is read-only everywhere and is never sent. Only fields that changed are sent.
- Status transitions offered: Upcoming -> Open registration; Open -> Close registration (back to Upcoming, switch OFF); Upcoming/Open -> Live; Live -> Completed.
- **Close registration is two server calls, in this order:** (1) status -> Upcoming (registration stops immediately), (2) switch -> OFF.
  The backend refuses to switch registration off in the same save that leaves "registration open", so one atomic call is impossible without changing Code.gs.
  If step 2 fails, the tournament is already closed; the Manage panel then offers "Turn registration switch off" to finish.
- Fee is locked while registration is open; maxTeams cannot go below registered teams; editing start/capacity of an open tournament asks for a second confirmation. All enforced by the server too.
- Tournaments whose ID has capitals or underscores (valid on the public site) can be viewed but not managed here; the backend only accepts lowercase slugs.
- Rules stored as a list in Firestore are shown read-only (the backend refuses to edit them).
- Delete needs the typed ID and is refused by the server unless the tournament is Upcoming/Completed, switch off, untouched ~1 hour, 0 teams and no stored data.

## Permission matrix (enforced by the server; the screen only hides buttons)
| Action | Permission |
|---|---|
| See Tournaments pages | `viewTournament` |
| Create | `createTournament` |
| Edit details (title, map, start, fee, prize, capacity, rules) | `editTournament` |
| Open / Close registration, Mark live, Mark completed, switch off | `publishTournament` |
| Delete | `deleteTournament` |

## Mock tests (no network, no Firebase, no browser): `node tests/<name>.test.js` from the tests folder
`model` (pure logic), `tournaments` (REAL unchanged Code.gs vs emulated Firestore), `backend` (Phase 1 admin regression), `frontend` (Phase 1/2 logic regression).
These are NOT live tests. The screens' rendering has not been exercised in a browser by the automated tests.

## Safe manual checks (no writes)
- Owner: Tournaments list shows "Create tournament"; open an existing tournament: the Manage panel shows Edit / status action / Delete; the original cards are unchanged.
- Limited account (e.g. only `viewTournament`): no Manage panel, no Create button, "Read-only" badge still shown.
- Type `#/tournaments/__new` as the limited account: "No access". In the console `await (await import('./js/api.js')).callAdmin('admin.createTournament', {id:'zz-x-1', tournament:{}})` returns a permission error.
- Remove `editTournament` from a signed-in test admin while they have the edit page open: the page switches to "No access" within seconds.
Do NOT press any status or delete button on a real tournament. Write checks need a separate approved throwaway tournament.
