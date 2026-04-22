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
const authListeners = [];

function onAuthChange(fn) {
  authListeners.push(fn);
  fn(currentUser);
}

auth.onAuthStateChanged((user) => {
  currentUser = user;
  updateAuthUI();
  authListeners.forEach(fn => fn(user));
});

function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
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
