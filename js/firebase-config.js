/* ES TRAINERS ConTroller — Firebase setup.
   This is the PUBLIC web configuration of the existing bgmi-firebase project
   (the same values the public website already ships). It is an identifier, not a secret:
   access is protected by Firebase Authentication and Firestore Security Rules.
   No Razorpay, Apps Script or other private credentials belong in this file. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBug5r0hXPRCK8x6O6TasSlFFtx378_6iw",
  authDomain: "bgmi-firebase.firebaseapp.com",
  projectId: "bgmi-firebase",
  storageBucket: "bgmi-firebase.firebasestorage.app",
  messagingSenderId: "144306362464",
  appId: "1:144306362464:web:3a91a4e8381f2eb7af4b05"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* The public website, used only for "view public page" links. */
export const PUBLIC_SITE = "https://estrainers.in";
