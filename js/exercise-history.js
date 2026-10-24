
import {
  getApp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const STORAGE_KEY = "iowaOrganStudentUid";
const APP_ID = "js-bach";

// Key order for the shared practice history format.
// Uppercase = major; lowercase = minor.
const SCORE_COLS = [
  "C", "G", "D", "A",
  "E", "B", "F#", "C#",

  "F", "Bb", "Eb", "Ab",
  "Db", "Gb", "Cb",

  "a", "e", "b", "f#",
  "c#", "g#", "d#", "a#",

  "d", "g", "c",
  "f", "bb", "eb", "ab"
];

const historyButton =
  document.getElementById("exerciseHistoryButton");

const historyDialog =
  document.getElementById("exerciseHistoryDialog");

const closeButton =
  document.getElementById("closeExerciseHistory");

const historyContent =
  document.getElementById("exerciseHistoryContent");

function prettyKeyLabel(key) {
  return key
    .replace(/#/g, "♯")
    .replace(/b/g, "♭");
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

// Convert Firebase key-pill values into the same
// internal key representation used by js-bach.js.
//
// Examples:
// "B♭ major" -> "Bb"
// "Bb major" -> "Bb"
// "G major"  -> "G"
// "F♯ minor" -> "f#"
// "A minor"  -> "a"
function normalizeKey(value) {
  if (!value) return null;

  let text = String(value)
    .trim()
    .replace(/^Current key:\s*/i, "")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, " ");

  let isMinor = /\bminor\b/i.test(text);

  // Some stored keys may use an "m" suffix.
  if (!isMinor && /^[A-Ga-g][#b]?m$/.test(text)) {
    isMinor = true;
    text = text.slice(0, -1);
  }

  text = text
    .replace(/\b(major|minor)\b/gi, "")
    .trim();

  if (!/^[A-Ga-g][#b]?$/.test(text)) {
    return null;
  }

  const letter = isMinor
    ? text[0].toLowerCase()
    : text[0].toUpperCase();

  const key = letter + text.slice(1);

  return SCORE_COLS.includes(key) ? key : null;
}

async function loadHistory() {
  const uid = localStorage.getItem(STORAGE_KEY);

  if (!uid) {
    historyContent.textContent = "Please log in first.";
    return;
  }

  historyContent.textContent = "Loading history...";

  try {
    const app = getApp();
    const auth = getAuth(app);

    await auth.authStateReady();

    if (!auth.currentUser) {
      throw new Error("Firebase authentication is not ready.");
    }

    const db = getFirestore(app);

    const snapshot = await getDocs(
      collection(db, "users", uid, "webPractice")
    );

    // Avoid showing the wrong student's data
    // if the login changes while loading.
    if (localStorage.getItem(STORAGE_KEY) !== uid) {
      historyContent.textContent =
        "Student login changed. Please reopen history.";
      return;
    }

    const attempts = snapshot.docs
      .map(doc => doc.data())
      .filter(item => item.app === APP_ID);

    renderHistory(attempts);

  } catch (error) {
    console.error("History loading error:", error);
    historyContent.textContent =
      "Could not load exercise history.";
  }
}

function renderHistory(attempts) {
  historyContent.replaceChildren();

  if (!attempts.length) {
    historyContent.textContent =
      "No recorded bass lines yet.";
    return;
  }

  const rows = new Map();

  let unmatchedKeys = 0;

  for (const attempt of attempts) {
    const exercise =
      attempt.exercise || "Unknown exercise";

    const key = normalizeKey(attempt.key);

    if (!key) {
      unmatchedKeys++;
      console.warn(
        "Unrecognized exercise key:",
        attempt.key
      );
      continue;
    }

    if (!rows.has(exercise)) {
      rows.set(exercise, new Map());
    }

    const row = rows.get(exercise);

    row.set(key, (row.get(key) || 0) + 1);
  }

  const table = document.createElement("table");
  table.className = "exercise-history-table";

  // Header
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const headings = [
    "Exercise",
    "Totals",
    ...SCORE_COLS.map(prettyKeyLabel)
  ];

  for (const heading of headings) {
    const th = document.createElement("th");
    th.textContent = heading;
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  const columnTotals = Object.fromEntries(
    SCORE_COLS.map(key => [key, 0])
  );

  let grandTotal = 0;

  // Natural numerical sorting:
  // Cadences 2 comes before Cadences 13.
  const exercises = [...rows.keys()].sort(naturalSort);

  for (const exercise of exercises) {
    const tr = document.createElement("tr");

    const labelCell = document.createElement("td");
    labelCell.textContent = exercise;
    tr.appendChild(labelCell);

    const rowMap = rows.get(exercise);

    let rowTotal = 0;

    for (const key of SCORE_COLS) {
      const value = rowMap.get(key) || 0;

      rowTotal += value;
      columnTotals[key] += value;
      grandTotal += value;
    }

    const totalCell = document.createElement("td");
    totalCell.textContent = rowTotal || "";
    tr.appendChild(totalCell);

    for (const key of SCORE_COLS) {
      const td = document.createElement("td");

      const value = rowMap.get(key) || 0;
      td.textContent = value || "";

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  // Totals row at the top, matching the existing history format.
  const totalsRow = document.createElement("tr");
  totalsRow.className = "history-totals-row";

  const totalsLabel = document.createElement("td");
  totalsLabel.textContent = "Totals";
  totalsRow.appendChild(totalsLabel);

  const grandCell = document.createElement("td");
  grandCell.textContent = grandTotal || "";
  totalsRow.appendChild(grandCell);

  for (const key of SCORE_COLS) {
    const td = document.createElement("td");
    td.textContent = columnTotals[key] || "";
    totalsRow.appendChild(td);
  }

  tbody.insertBefore(totalsRow, tbody.firstChild);
  table.appendChild(tbody);

  const wrapper = document.createElement("div");
  wrapper.className = "exercise-history-scroll";
  wrapper.appendChild(table);

  historyContent.appendChild(wrapper);

  if (unmatchedKeys > 0) {
    const warning = document.createElement("p");
    warning.textContent =
      `${unmatchedKeys} recorded attempts had ` +
      `unrecognized keys and were not included.`;
    warning.style.color = "#a33";

    historyContent.appendChild(warning);
  }
}

historyButton.addEventListener("click", () => {
  historyDialog.showModal();
  loadHistory();
});

closeButton.addEventListener("click", () => {
  historyDialog.close();
});
