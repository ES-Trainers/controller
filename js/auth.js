/* ES TRAINERS ConTroller — authentication (Firebase Auth).
   Methods: Google, Email/Password, password reset, email verification, and linking a second
   sign-in method to the SAME account (same UID). There is deliberately no public sign-up:
   access is by invitation only, and an invitation is not available until a later milestone. */
import { auth } from "./firebase-config.js";
import {
  GoogleAuthProvider, EmailAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  linkWithCredential, linkWithPopup, reauthenticateWithPopup, unlink, reload
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

export function onUser(cb) { return onAuthStateChanged(auth, cb); }
export function currentUser() { return auth.currentUser; }

function googleProvider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" }); // lets a person with two Google accounts choose
  return p;
}

async function applyPersistence(remember) {
  await setPersistence(auth, remember === false ? browserSessionPersistence : browserLocalPersistence);
}

export async function loginWithGoogle(remember = true) {
  await applyPersistence(remember);
  return (await signInWithPopup(auth, googleProvider())).user;
}

export async function loginWithEmail(email, password, remember = true) {
  await applyPersistence(remember);
  return (await signInWithEmailAndPassword(auth, String(email).trim(), password)).user;
}

export function sendReset(email) { return sendPasswordResetEmail(auth, String(email).trim()); }
export function sendVerification() {
  if (!auth.currentUser) throw new Error("Not signed in.");
  return sendEmailVerification(auth.currentUser);
}
export function logout() { return signOut(auth); }

/** "google.com" / "password" / "phone" ... for display. */
export function providersOf(user) {
  return (user && user.providerData ? user.providerData : []).map((p) => p.providerId);
}
export function providerLabel(id) {
  return ({ "google.com": "Google", password: "Email and password", phone: "Phone" })[id] || id;
}

/** Add a password to the signed-in account so both methods share one UID. */
export async function linkPassword(newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw Object.assign(new Error("No email on this account."), { code: "app/no-email" });
  const cred = EmailAuthProvider.credential(user.email, newPassword);
  try {
    await linkWithCredential(user, cred);
  } catch (err) {
    if (err && err.code === "auth/requires-recent-login" && providersOf(user).includes("google.com")) {
      await reauthenticateWithPopup(user, googleProvider());
      await linkWithCredential(user, cred);
    } else { throw err; }
  }
  await reload(user);
}

/** Add Google to an account that signed in with a password. Must be the SAME email. */
export async function linkGoogle() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  await linkWithPopup(user, googleProvider());
  await reload(user);
  const g = user.providerData.find((p) => p.providerId === "google.com");
  if (g && g.email && user.email && g.email.toLowerCase() !== user.email.toLowerCase()) {
    await unlink(user, "google.com"); // never keep a Google identity with a different email
    await reload(user);
    throw Object.assign(new Error("Different Google email"), { code: "app/google-email-mismatch" });
  }
}

/** Plain-language messages. Never exposes raw Firebase codes to the person. */
export function friendlyError(err) {
  const c = (err && err.code) || "";
  const map = {
    "auth/invalid-credential": "Email or password is incorrect. If you normally sign in with Google, use the Google button, then add a password from the Account page.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/missing-password": "Enter your password.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes, or reset your password.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
    "auth/cancelled-popup-request": "",
    "auth/popup-closed-by-user": "",
    "auth/unauthorized-domain": "This website address is not yet authorised for sign-in in Firebase (Authentication, Settings, Authorized domains).",
    "auth/account-exists-with-different-credential": "An account with this email already exists. Sign in with the method you used first, then add the other method from the Account page.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/weak-password": "Choose a stronger password.",
    "auth/password-does-not-meet-requirements": "The password does not meet the project's password policy.",
    "auth/requires-recent-login": "For security, sign in again and retry.",
    "auth/credential-already-in-use": "That sign-in method already belongs to a different account.",
    "auth/provider-already-linked": "That sign-in method is already added to this account.",
    "auth/email-already-in-use": "That email already has a password sign-in.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase.",
    "app/google-email-mismatch": "That Google account uses a different email, so it was not added. Choose the Google account with the same email.",
    "app/no-email": "This account has no email address."
  };
  if (Object.prototype.hasOwnProperty.call(map, c)) return map[c];
  return "Something went wrong. Please try again.";
}
