
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Iowa Organ Studio Web Exercises
const firebaseConfig = {
  apiKey: "AIzaSyBxtpx-CqMK4XWuRtihy0rSNe6AdAS0Gzc",
  authDomain: "organ-practice-tracker.firebaseapp.com",
  projectId: "organ-practice-tracker",
  storageBucket: "organ-practice-tracker.firebasestorage.app",
  messagingSenderId: "68830167607",
  appId: "1:68830167607:web:849cf39d0199ac317c75b2",
  measurementId: "G-XFM4VKFHWB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STORAGE_KEY = "iowaOrganStudentUid";

const loginForm = document.getElementById("studentLoginForm");
const uidInput = document.getElementById("studentUidInput");
const loggedOut = document.getElementById("studentLoggedOut");
const loggedIn = document.getElementById("studentLoggedIn");
const loginName = document.getElementById("studentLoginName");
const logoutButton = document.getElementById("studentLogoutButton");
const message = document.getElementById("studentLoginMessage");

function showMessage(text) {
  message.textContent = text;
}

function showLoggedOut() {
  loggedOut.hidden = false;
  loggedIn.hidden = true;
  loginName.textContent = "";
  document.getElementById("loginToggle").textContent = "♙ Student login";
}

function showLoggedIn(name) {
  loggedOut.hidden = true;
  loggedIn.hidden = false;
  loginName.textContent = `Logged in as ${name}`;
  showMessage("");
  document.getElementById("loginToggle").textContent = `♙ ${name}`;
  window.dispatchEvent(new CustomEvent("js-bach-student-login", {detail: {name}}));
}

async function loginWithUid(uid) {
  uid = uid.trim();

  if (!/^\d{8}$/.test(uid)) {
    showMessage("Please enter your eight-digit student UID.");
    return;
  }

  showMessage("Checking student UID...");

  try {
    const studentRef = doc(db, "users", uid);
    const snapshot = await getDoc(studentRef);

    if (!snapshot.exists()) {
      showMessage("Student UID not found.");
      return;
    }

    const student = snapshot.data();
    const name = student.name || uid;

    localStorage.setItem(STORAGE_KEY, uid);

    showLoggedIn(name);

  } catch (error) {
    console.error("Student login error:", error);
    showMessage("Could not connect to Firebase.");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loginWithUid(uidInput.value);
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ATTEMPT_KEY);

  uidInput.value = "";
  showLoggedOut();
  showMessage("");
  window.dispatchEvent(new Event("js-bach-student-logout"));
});

// Establish Firebase Authentication before reading Firestore.
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Firebase authentication failed:", error);
      showMessage("Could not connect to Firebase.");
    }
    return;
  }

  const savedUid = localStorage.getItem(STORAGE_KEY);

  if (savedUid) {
    await loginWithUid(savedUid);
  } else {
    showLoggedOut();
  }
});


/* =========================================================
   J. S. Bach exercise activity
   ========================================================= */

const APP_ID = "js-bach";
const MAX_ATTEMPT_SECONDS = 300;

// Remember the most recent bass line in this browser.
const ATTEMPT_KEY = "iowaOrganJsBachCurrentAttempt";

let attemptQueue = Promise.resolve();

function finishAttempt(attempt, durationSeconds) {
  return updateDoc(
    doc(
      db,
      "users",
      attempt.uid,
      "webPractice",
      attempt.id
    ),
    {
      durationSeconds: Math.min(
        MAX_ATTEMPT_SECONDS,
        Math.max(0, durationSeconds)
      )
    }
  );
}

async function recordAttempt() {
  const uid = localStorage.getItem(STORAGE_KEY);

  // Visitors can use the exercises without logging in.
  if (!uid || !auth.currentUser) return;

  const title = document.getElementById("titlePill")?.textContent?.trim() || "Unknown exercise";

  const key = document
    .getElementById("keyPillValue")
    ?.textContent
    ?.trim() || "Unknown key";

  const now = Date.now();

  // Finish the previous attempt, if there is one.
  const previousJSON = localStorage.getItem(ATTEMPT_KEY);

  if (previousJSON) {
    try {
      const previous = JSON.parse(previousJSON);

      if (previous.uid === uid && previous.id) {
        const elapsedSeconds = Math.round(
          (now - previous.startedAt) / 1000
        );

        await finishAttempt(previous, elapsedSeconds);
      }
    } catch (error) {
      console.warn("Could not finish previous attempt:", error);
    }
  }

  // Create a new attempt.
  const attemptRef = await addDoc(
    collection(db, "users", uid, "webPractice"),
    {
      app: APP_ID,
      exercise: title,
      key: key,
      startedAt: serverTimestamp(),
      durationSeconds: MAX_ATTEMPT_SECONDS
    }
  );

  // The default duration is five minutes.
  // Generating another bass line replaces it with
  // the actual elapsed time, capped at five minutes.
  localStorage.setItem(
    ATTEMPT_KEY,
    JSON.stringify({
      uid: uid,
      id: attemptRef.id,
      startedAt: now
    })
  );
}

// Expose a safe function for js-bach.js.
window.recordBassLineAttempt = function () {
  attemptQueue = attemptQueue
    .then(() => recordAttempt())
    .catch((error) => {
      console.error("Could not record bass line:", error);
    });
};

