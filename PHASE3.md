# Phase 3: permission fix, deletion fix, registered teams and team management

Needs BOTH parts: the updated `Code.gs` (a new VERSION of the existing Apps Script deployment, same URL) and these Controller files on GitHub.
Firestore Rules: NO change. `api.js` (and your corrected API URL) is byte-identical to the previous version.

## What changed
1. **"Read-only" badge** is now one rule for every page (`navigation.js` + `permissions.js canWriteAnything`): hidden only for an account that can actually change something. The role name never decides it. The Dashboard subtitle follows the same rule.
2. **Account > Access check** compares the browser's view of your role and all 19 permissions with the server's own verdict (`admin.ping`). Read-only.
3. **Tournament deletion**: `admin.checkTournamentDeletion` (read-only) returns every blocker and the exact eligibility time; the screen shows it BEFORE asking for the typed ID. Live and Completed now also switch registration OFF, so a finished tournament no longer stalls on the registration switch. The one-hour quiet period, switch check, team count and stored-data checks are unchanged.
4. **Registered teams** section on the tournament page (Active / Removed / All, search by team name or registration ID) and a **team page** `#/tournaments/<id>/team/<registrationId>`.
5. **Team management**: edit player name / in-game name / BGMI ID and the admin note; soft remove; restore; Owner-only permanent removal.

## Who can do what (enforced by the server on every request)
| Action | Rule |
|---|---|
| List / view teams | `viewRegistration` |
| See leader email, phone, BGMI IDs, gender | + `viewSensitiveData` (otherwise masked / omitted) |
| See Razorpay order/payment IDs and amount | + `viewPayments` (otherwise hidden; payment STATUS stays visible) |
| Edit players / note, soft remove, restore | role Owner or Super Admin AND `manageRegistration` (Owner implicit) |
| Change a BGMI ID | also needs `viewSensitiveData` (you cannot edit what you cannot see) |
| Permanent removal | role Owner only, and only after soft removal |
| Delete eligibility check | `deleteTournament` |
| Manage administrators | Owner only (`manageAdmins` is never grantable) |

A Tournament Admin or Support Admin who holds `manageRegistration` still cannot edit or remove teams: the role gate fails. New Support Admin / Tournament Admin presets no longer include `manageRegistration`. Existing administrators' saved permission maps are NOT changed.

## Data (additive only, on `tournaments/{id}/registrations/{regId}`)
`status`, `paymentStatus`, every Razorpay field, `registeredTeams`, the reservations (`teamNames` / `leaderEmails` / `leaderPhones`) and `pendingOrders` are NEVER written by these actions.
- Soft remove: `removed:true, removedAt, removedBy, removedByEmail, removalReason`. Restore: `removed:false, restoredAt, restoredBy, restoredByEmail`.
- Edits: `players` / `adminNote`, plus `adminUpdatedBy`, `adminUpdatedAt`.
- Permanent removal (tombstone): `teamName` -> "[permanently removed]", `normalizedTeamName`, `leaderEmail`, `leaderPhone`, `adminNote` -> "", `players` -> []; adds `purged, purgedAt, purgedBy, purgedByEmail, purgeReason`. Payment references, amount, IDs and timestamps are kept.
- Every mutation writes one `ActivityLogs` entry (module "registrations") in the same atomic commit. Logs hold field names and reasons, never player values, contact details or team names.

## Known limitations (please read)
- **Permanent removal does not scrub two other copies of personal data**: `pendingOrders/{orderId}` (a full copy of the registration; the existing payment code re-reads it on retries, so changing it could break payment retries) and the plaintext team name / email inside the three reservation documents (kept as the uniqueness reservations). Scrubbing them needs a change to payment code or reservation handling: a separate approval.
- Removed teams still count toward capacity and keep their name, email and phone reserved. Nothing is refunded.
- Any tournament that ever started a payment keeps a `pendingOrders` record and can never be deleted; Completed is its archive.
- Team name, leader email and phone cannot be edited (identity keys tied to the reservations).
- Admin notes are visible to every account with `viewRegistration`.
- Closing / Live / Completed switch registration off in a SECOND call (the backend refuses to do it in one). If that second call fails the tournament is already stopped; use "Turn registration switch off".
- Not tested in a real browser or against production (see the test report).

## Deploy (only when you approve)
1. Apps Script: replace the code with `Code-phase3.gs`, then Deploy > Manage deployments > pencil on the EXISTING deployment > Version: New version > Deploy. Never "New deployment". No new scopes.
2. Upload this folder to the `ES-Trainers/controller` GitHub repository.
3. Check: Account > Access check shows backend version `phase3-regs-1` and "Team registrations on the server: Available".

## Safe manual checks (no writes)
- Munazza (Super Admin): Account > Access check: "Browser and server agree". The "Read-only" badge is gone on Dashboard and Account.
- Open a tournament: Manage panel visible; Registered teams section lists teams; click one; BGMI IDs/phone/email are shown or masked according to her permissions.
- A Viewer account: badge still shown, no Manage panel, teams visible but no edit/remove buttons.
- Press Delete on an Upcoming/Completed tournament: you get the eligibility report (nothing is deleted unless every check passes AND you type the ID).
- Do NOT edit, remove or permanently remove a real team. Write tests need a registration you designate as a test registration, after separate approval.
