// auth.js — Firebase initialization + Google sign-in.
//
// Firebase "client config" values are safe to commit: they identify the
// project, not a secret. Real access control lives in Firestore security
// rules + the list of authorized domains in the Firebase console.
//
// Globals exposed to other files:
//   currentUser     — the signed-in user or null. Read-only elsewhere.
//   db              — Firestore handle, used by favorites.js
//   onAuthChange(fn) — subscribe to sign-in/out events
//   signIn(), signOutUser() — wired up by the header button in app.js

const firebaseConfig = {
  apiKey: "AIzaSyAhdXUqK8QF9RTY6kU__9jy6OfZ64IbIfg",
  authDomain: "bird-sightings-app.firebaseapp.com",
  projectId: "bird-sightings-app",
  storageBucket: "bird-sightings-app.firebasestorage.app",
  messagingSenderId: "69598960816",
  appId: "1:69598960816:web:ec534effce6735c23a6f75",
  measurementId: "G-NX7Z8S3Y1X"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
const authListeners = []; // functions to call whenever the user signs in/out

// Simple observer pattern. Other files (favorites.js) register a callback
// once, and get notified every time the auth state changes. We also invoke
// the callback immediately so it runs with the current state.
function onAuthChange(fn) {
  authListeners.push(fn);
  fn(currentUser);
}

// Firebase emits auth changes: on page load (restoring a prior session),
// after sign-in, after sign-out, after token expiry, etc. We funnel them
// into `currentUser` and fan out to any listeners.
auth.onAuthStateChanged((user) => {
  currentUser = user;
  updateAuthUI();
  authListeners.forEach(fn => fn(user));
});

function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  // signInWithPopup opens a Google account picker. On success the popup
  // closes and onAuthStateChanged fires above.
  return auth.signInWithPopup(provider).catch(err => {
    console.error('Sign-in failed:', err);
    alert('Sign-in failed: ' + (err.message || err.code));
  });
}

function signOutUser() {
  return auth.signOut();
}

function updateAuthUI() {
  const btn = document.getElementById('btnAuth');
  if (!btn) return;
  if (currentUser) {
    const name = currentUser.displayName || currentUser.email || 'Account';
    btn.textContent = name.split(' ')[0] + ' · Sign out';
    btn.title = `Signed in as ${name}`;
    btn.classList.add('signed-in');
  } else {
    btn.textContent = 'Sign in';
    btn.title = 'Sign in with Google to sync favorites across devices';
    btn.classList.remove('signed-in');
  }
}
