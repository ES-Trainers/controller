# Phase 1: Admin Management (Owner only)

Adds Owner-only Admin Management on top of the M0 Controller. Nothing else is added. `README.md` still describes M0; where it says
"The Controller has no screen that changes roles", this file supersedes it for the Owner.

## What the Owner can do (Admin Management in the sidebar)
- Invite an administrator by email: role preset + individual permission switches (19 keys, same names as before).
- See administrators and invitations, open one to see account details and status.
- Edit name, role and permissions (a role change never changes a switch; "Apply role preset" is a separate, visible step).
- Deactivate / reactivate. Remove (only after deactivating; the access record is deleted, the activity history is kept).

## Rules enforced on the server (Apps Script), not just in the screen
- Only the Owner (role `owner` AND `manageAdmins`) can call any admin-management action.
- `manageAdmins` can never be granted; `owner` can never be assigned; no Owner record can be edited, deactivated, demoted or removed.
- Inviting needs the person to sign in with Google using the invited, verified email, then press "Accept invitation".
  The server finds the invitation from the caller's verified email, so nothing typed in the browser can select or redirect it.
- No passwords are asked for or stored. No new OAuth scope. No Firestore Rules change.

## New backend actions
`admin.listAdmins`, `admin.getAdmin`, `admin.inviteAdmin`, `admin.cancelInvite`, `admin.updateAdmin`, `admin.removeAdmin` (all Owner-only)
and `admin.acceptInvite` (any verified Google account with a matching pending invitation, and no access record yet).

## New Firestore data (server-written only; browser access is already denied by the existing catch-all rule)
- `AdminInvites/{sha256 of "adm-invite:" + email}`: pending / accepted / cancelled invitations (expire after 7 days).
- `Roles/{uid}`: now also written by the backend (same fields as before + `updatedBy`).
- `ActivityLogs/{id}`: new entries with `module: "admins"`: admin_invited, admin_invite_cancelled, admin_invite_accepted, admin_updated, admin_deactivated, admin_reactivated, admin_removed.

## Deploy (do these only when you approve; nothing was deployed)
1. Apps Script: replace the project's code with the supplied `Code.gs`. Then Deploy > Manage deployments > pencil on the EXISTING deployment >
   Version: New version > Deploy. Do not create a new deployment (the /exec URL must stay the same). No new scopes, so no re-authorisation prompt is expected.
2. Controller: upload the contents of this folder to the `ES-Trainers/controller` repository (same method as README.md, "Uploading to GitHub").
3. Firestore Rules: no change.
4. Check: sign in as the Owner; the sidebar shows "Admin Management". `admin.ping` now reports version `phase1-admins-1`.

## Manual test plan (use a throwaway Google account you control as the invitee; two browsers or one normal and one private window)
Mark each item only when you have actually done it.

**Owner**
- [ ] Sidebar shows Admin Management; opening it lists the Owner record(s) as protected; the Owner row has no edit controls.
- [ ] Invite `<your test Gmail>` as Viewer, send notification ticked. Review dialog lists the permissions. The invitation appears as Pending. Firestore `AdminInvites` shows one document; `Roles` has no document for that email yet.
- [ ] Inviting the same email again is refused while pending. Cancel it, then invite again.
- [ ] Inviting the Owner's own email is refused.

**Invitee (second browser)**
- [ ] Sign in with Google as the test account: "This account is not authorised" screen with an **Accept invitation** button.
- [ ] Accept: you reach the dashboard. Sidebar shows only Dashboard, Tournaments (if viewTournament was granted) and Account. No Admin Management.
- [ ] Account page lists exactly the permissions the Owner set, and not manageAdmins.
- [ ] Open `#/admins` by typing it: "No access to this section".
- [ ] In the browser console: `const m = await import('./js/api.js'); await m.callAdmin('admin.listAdmins')` fails with "Only the Owner can manage administrators." (this is the direct-API test).
- [ ] A second, un-invited Google account sees no Accept button result other than "no pending invitation".

**Live revocation (keep the invitee signed in on the dashboard)**
- [ ] Owner turns off `viewTournament` and saves: within seconds the invitee's Tournaments menu item disappears and the page shows no access; no tournament data remains on screen.
- [ ] Owner changes only the role: the invitee's permissions do not change.
- [ ] Owner deactivates: the invitee is sent to the sign-in page within seconds, and signing in again shows "Access is switched off".
- [ ] Owner reactivates: the invitee can sign in again with the same saved permissions.
- [ ] Owner removes (after deactivating, typing the email): the `Roles` document is gone, earlier `ActivityLogs` entries remain, and the removal is logged.

**Safety**
- [ ] The Owner row can't be edited, deactivated or removed; trying `admin.updateAdmin` on an Owner uid from the console returns "protected".
- [ ] Unsaved changes: edit a switch, click a sidebar link: you are asked before leaving.
- [ ] Existing pages (Dashboard, Tournaments search/filter/detail, Account, sign-in with Google and with email) behave exactly as before.
- [ ] Public site and registration are unaffected; `registeredTeams` of every tournament is unchanged.

## Mock tests (no network, no Firebase)
`node tests/backend.test.js ../Code.gs` and `node tests/frontend.test.js` (Node 18+). These are not live tests.
