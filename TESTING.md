# M0 testing checklist

Tick each item. Do these only after the gates in README.md have been approved and done.
Use two browsers, or one normal and one private window, so you can test a non-Owner.

## A. Before the Roles rule is published (G4)

- [ ] Open https://controller.estrainers.in. The sign-in page loads with the ES Trainers logo and dark panel.
- [ ] Click **Continue with Google**, choose `esportstraning@gmail.com`.
- [ ] You land on **Access check is unavailable** and nothing else. No dashboard, no data.
- [ ] The screen shows your email, "Google", email verified "Yes", and an Account ID (UID).
- [ ] Copy the UID. In Firebase Console, Authentication, Users, search the email and confirm the **User UID** column is identical.
- [ ] Sign out. Repeat for `salikshaikh278@gmail.com`. The two UIDs are different.
- [ ] Authentication, Users shows **one** row per email.

## B. After G4 (rule) and G5 (both Owner documents)

- [ ] Sign in with Google as each Owner. Both reach the dashboard.
- [ ] The sidebar shows the right name, email and the role **Owner**.
- [ ] Account page: role is Owner, all 19 permissions are listed.
- [ ] Account page, **Add password**: set a password (10+ characters, letters and numbers) for each Owner.
- [ ] Sign out, then sign in with **email and password**. You reach the dashboard with the same UID as before.
- [ ] Authentication, Users still shows one row per email, now with Google and Email providers.
- [ ] Wrong password shows a clear message and does not reveal whether the email exists.
- [ ] **Forgot password** says a link is on its way, and the email arrives.
- [ ] Untick "Keep me signed in", sign in, close the browser, reopen: you are signed out.

## C. Access is refused correctly

- [ ] Sign in with any Gmail that has no Owner document (a private window, a different account). You see "This account is not authorised" and no data.
- [ ] In Firebase Console set one Owner document's `status` to `inactive` while that person is on the dashboard: within seconds they are sent to the sign-in page. Set it back to `active`.
- [ ] Temporarily change the `email` field in one Owner document to a different address: that Owner is refused with "does not match". Change it back.
- [ ] Open https://controller.estrainers.in/dashboard.html while signed out: you go to the sign-in page and no dashboard content flashes.

## D. Data is correct

- [ ] Dashboard "Tournaments" equals the number of documents in the `tournaments` collection.
- [ ] For `bgmi-test-001`: teams show `11 / 25`, status Registration open, fee and prize match the console.
- [ ] Start date and registration deadline are in IST, and the deadline is exactly 48 hours before the start.
- [ ] The countdown ticks every second.
- [ ] Change `registeredTeams` in the console: the dashboard number changes without refreshing.
- [ ] Tournaments page: search, status filter and sort behave. A tournament page opens and **Public page** opens the real registration page in a new tab.
- [ ] Nothing on any page lets you change data.

## E. Screens and devices

Check Dashboard, Tournaments, a tournament, Account and Sign in at each size
(browser developer tools, device toolbar, or a real phone):

- [ ] Large desktop (1440 wide) and laptop (1280)
- [ ] Tablet (768 and 1024): menu button appears, the sidebar slides in, Esc and tapping outside close it
- [ ] Phone (390) and small phone (360): tables become cards, buttons are easy to tap
- [ ] No sideways scrolling at any size
- [ ] Tab through the sign-in page with the keyboard: every control is reachable and shows a focus ring

## F. Safety

- [ ] Browser address `https://controller.estrainers.in/robots.txt` shows `Disallow: /`.
- [ ] Browser console (F12) shows no red errors on any page.
- [ ] The public site https://estrainers.in is unchanged and registration still works.
- [ ] Firebase Console, Firestore, Rules: the original 22 lines are still there, plus only the `Roles` block.

Anything that fails: note the page, the device size, and what you saw, and send it back.
