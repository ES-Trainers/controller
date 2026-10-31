# ES Trainers ConTroller — M0 foundation

One Platform. Complete Tournament Control.

This folder is the **M0** build of the Controller: sign-in, the access check, a responsive
layout, and a **read-only** dashboard and tournaments view. It is plain HTML, CSS and
JavaScript. There is no build step, no npm and no server software.

**M0 does not write anything to Firestore.** It cannot create, edit or delete a tournament,
registration or payment.

## What is in the folder

| Path | What it is |
|---|---|
| `index.html` | Sends the visitor to the dashboard (which sends signed-out people to sign in) |
| `login.html`, `js/login.js` | Sign in with Google or email and password, reset password, access-denied screen |
| `dashboard.html`, `js/app.js` | The app shell. Stays hidden until the access check passes |
| `js/auth.js` | Firebase sign-in, password reset, verification email, linking Google and password to one account |
| `js/permissions.js` | The 19 permission keys and the access check against `Roles/{uid}` |
| `js/navigation.js` | Page routing, sidebar, mobile menu |
| `js/dashboard.js`, `js/tournaments.js`, `js/account.js` | The three pages |
| `js/lifecycle.js` | Copy of the public site's `tournament-lifecycle.js`, unchanged. If you ever change that file on the public site, copy it here again so both follow the same 48-hour rule |
| `js/firebase-config.js` | The public Firebase web config (same values as the public site) |
| `js/ui.js`, `js/icons.js` | Small helpers and icons |
| `css/` | `global.css` (ES Trainers colours and fonts), `components.css`, `login.css`, `dashboard.css`, `responsive.css` |
| `assets/logo/` | Logo files copied from the public site |
| `CNAME` | `controller.estrainers.in`, needed by GitHub Pages |
| `404.html`, `robots.txt`, `.nojekyll` | Not-found page, keeps search engines out, switches off Jekyll (optional) |

## How access works

Signing in does not give access. After sign-in the Controller reads one document,
`Roles/<your Firebase UID>`, and lets you in only if **all** of these are true:

- the document exists and its ID equals your UID
- the `uid` field inside equals your UID
- the `email` field equals the email you signed in with
- `status` is `active` and `role` is one of the known roles
- your email address is verified

Any other result shows an explanation and nothing else. The screen also shows your UID so an
Owner can copy it. If the document is switched off or deleted while you are using the
dashboard, you are sent back to sign in straight away.

Owner documents are created and edited **only in Firebase Console**. The Controller has no
screen that changes roles.

### Owner document to create in Firestore (after you approve it)

Collection `Roles`, document ID = the person's verified UID (never the email):

| Field | Type | Value |
|---|---|---|
| `uid` | string | same as the document ID |
| `email` | string | the Owner's email in lowercase |
| `name` | string | display name |
| `role` | string | `owner` |
| `status` | string | `active` |
| `permissions` | map | 19 boolean fields, all `true` (see below) |
| `createdAt`, `updatedAt` | timestamp | now |
| `createdBy` | string | `manual-bootstrap` |

Permission fields: `viewTournament`, `createTournament`, `editTournament`, `publishTournament`,
`deleteTournament`, `viewRegistration`, `viewSensitiveData`, `manageRegistration`,
`viewPayments`, `exportPayments`, `initiateRefund`, `viewMatches`, `manageMatches`,
`manageRoomCredentials`, `sendEmails`, `runReconciliation`, `manageAdmins`,
`viewActivityLogs`, `manageSettings`.

Both Owners get identical documents, each with their own UID, name and email.

### Rule that the access check needs (not published yet)

The check cannot read `Roles/<uid>` until this block is added to the Firestore rules, inside
`match /databases/{database}/documents`, after the `leaderEmails` block. Your 22 existing
lines stay exactly as they are. **Do not publish it until you have approved it.**

```
match /Roles/{uid} {
  allow get: if request.auth != null && request.auth.uid == uid;
  allow list, create, update, delete: if false;
}
```

Until it is published, every sign-in ends on the "Access check is unavailable" screen. That is
the safe, expected result, and that screen is how each Owner can read their own UID.

## Uploading to GitHub (only after you approve gate G1)

GitHub's web page cannot open a ZIP file, so unzip it on your computer first.

1. Sign in to GitHub as the ES-Trainers account.
2. Click **+** at the top right, then **New repository**.
3. Owner: `ES-Trainers`. Repository name: `controller`. Choose **Public**.
   Leave "Add a README", ".gitignore" and "license" **unticked**. Click **Create repository**.
4. On the empty repository page click **uploading an existing file**.
5. Open the unzipped `es-trainers-controller-m0` folder. Select **everything inside it**
   (`css`, `js`, `assets`, and the files) and drag it into the GitHub page.
   Drag the contents, not the folder itself, so `index.html` ends up at the top level.
6. Wait for every file to finish uploading, then click **Commit changes** (branch `main`).
7. Check the repository shows `index.html`, `login.html`, `dashboard.html`, `CNAME`, and the
   `css`, `js` and `assets` folders. If `.nojekyll` is missing, that is fine, or add it with
   **Add file, Create new file**, name `.nojekyll`.

Do **not** turn on GitHub Pages or touch DNS yet. Those are separate gates (G2 and G3).

## Later gates, for reference (each needs your approval first)

- **G2** GitHub: Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`,
  Custom domain `controller.estrainers.in`. BigRock: add one CNAME record, host `controller`,
  value `es-trainers.github.io`. Send a screenshot of your existing DNS records first.
- **G3** Firebase Console, Authentication, Settings, Authorized domains: add
  `controller.estrainers.in`. If the Firebase web API key is restricted by website, add
  `https://controller.estrainers.in/*` to its allowed referrers as well.
- **G4** Publish the `Roles` rule above.
- **G5** Create the two Owner documents.

## Limits of M0

- Read-only. There is no create, edit, delete, registration, payment, room or email screen yet.
- The dashboard shows only what the `tournaments` collection holds. Payments and pending
  registrations arrive in later milestones.
- Team counts are the `registeredTeams` counter. It has not been reconciled against real
  registrations yet.
- No Content-Security-Policy is set yet. The code has no inline scripts, so one can be added
  during the hardening milestone.
