import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const grid = $("#portfolio-grid");
const toast = $("#toast");
let currentUser = null;
let currentEntryId = null;
let toastTimer;

$("#year").textContent = new Date().getFullYear();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function validConfig() {
  return firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY_HERE" &&
    firebaseConfig.projectId !== "PASTE_YOUR_PROJECT_ID";
}

let auth;
let db;
if (validConfig()) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  grid.innerHTML = '<div class="loading-state">Firebase is not configured yet. Follow the README setup steps, then refresh this page.</div>';
  $("#portfolio-count").textContent = "0";
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// Edit codes are used as passwords for Firebase Authentication accounts.
// The email is a deterministic, non-mailbox identifier derived from the code.
// No real email address is collected. Save the generated code: there is no email recovery.
async function codeToEmail(code) {
  const bytes = new TextEncoder().encode(code.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return `${hex}@portfoliolink.invalid`;
}

function generateEditCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, v => alphabet[v % alphabet.length]).join("");
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function makeCard(entry) {
  const article = document.createElement("article");
  article.className = "portfolio-card";
  const top = document.createElement("div");
  top.className = "card-top";
  const avatar = document.createElement("div");
  avatar.className = "card-avatar";
  avatar.textContent = initials(entry.name) || "P";
  const titleWrap = document.createElement("div");
  titleWrap.className = "card-title";
  const title = document.createElement("h3");
  title.textContent = entry.name;
  const subtitle = document.createElement("span");
  subtitle.textContent = "Community portfolio";
  titleWrap.append(title, subtitle);
  top.append(avatar, titleWrap);

  const link = document.createElement("a");
  link.className = "visit-link";
  link.href = entry.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.append(document.createTextNode("Visit portfolio"));
  const arrow = document.createElement("span");
  arrow.textContent = "↗";
  link.append(arrow);
  article.append(top, link);
  return article;
}

let allEntries = [];
async function loadPortfolios() {
  if (!db) return;
  grid.innerHTML = '<div class="loading-state">Loading portfolios...</div>';
  try {
    const snapshot = await getDocs(query(collection(db, "portfolios"), orderBy("createdAt", "desc")));
    allEntries = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderPortfolios();
    $("#portfolio-count").textContent = allEntries.length.toLocaleString();
  } catch (error) {
    console.error(error);
    grid.innerHTML = '<div class="loading-state">Could not load portfolios. Check your Firebase setup and Firestore rules.</div>';
  }
}

function renderPortfolios() {
  const term = $("#search-input").value.trim().toLowerCase();
  const filtered = allEntries.filter(entry => entry.name.toLowerCase().includes(term));
  grid.replaceChildren();
  $("#empty-state").hidden = filtered.length !== 0;
  if (!filtered.length) return;
  const fragment = document.createDocumentFragment();
  filtered.forEach(entry => fragment.append(makeCard(entry)));
  grid.append(fragment);
}

$("#search-input").addEventListener("input", renderPortfolios);

$("#submit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db) return showToast("Firebase setup is required before publishing.");
  const name = $("#portfolio-name").value.trim();
  const url = safeHttpUrl($("#portfolio-url").value.trim());
  if (!name || name.length > 50 || !url) return showToast("Enter a name and a valid http or https URL.");

  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Publishing...";
  let createdUser = null;
  try {
    const editCode = generateEditCode();
    const email = await codeToEmail(editCode);
    const credential = await createUserWithEmailAndPassword(auth, email, editCode);
    createdUser = credential.user;
    const entry = await addDoc(collection(db, "portfolios"), {
      name, url, ownerUid: createdUser.uid, createdAt: serverTimestamp()
    });
    currentEntryId = entry.id;
    $("#new-edit-code").textContent = editCode;
    $("#new-code-panel").hidden = false;
    $("#submit-form").reset();
    showToast("Your portfolio is now public!");
    await loadPortfolios();
  } catch (error) {
    console.error(error);
    if (createdUser) {
      try { await deleteUser(createdUser); } catch (cleanupError) { console.error(cleanupError); }
    }
    showToast(error.code === "auth/email-already-in-use"
      ? "Could not create a unique edit account. Please try again."
      : "Could not publish. Check your Firebase Authentication and Firestore setup.");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Publish portfolio <span aria-hidden="true">↗</span>';
  }
});

$("#copy-code").addEventListener("click", async () => {
  const code = $("#new-edit-code").textContent;
  try {
    await navigator.clipboard.writeText(code);
    showToast("Edit code copied.");
  } catch {
    showToast("Please select and copy your edit code.");
  }
});
$("#dismiss-code").addEventListener("click", () => { $("#new-code-panel").hidden = true; });
$("#open-manage").addEventListener("click", () => $("#manage-section").scrollIntoView({ behavior: "smooth" }));

$("#manage-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db) return showToast("Firebase setup is required.");
  const code = $("#edit-code").value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{16}$/.test(code)) return showToast("That edit code doesn't look valid.");
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Checking...";
  try {
    const email = await codeToEmail(code);
    const credential = await signInWithEmailAndPassword(auth, email, code);
    currentUser = credential.user;
    const owned = allEntries.filter(entry => entry.ownerUid === currentUser.uid);
    if (!owned.length) {
      await signOut(auth);
      currentUser = null;
      showToast("No portfolio listing was found for that code.");
      return;
    }
    // Each edit code belongs to one listing.
    currentEntryId = owned[0].id;
    const entry = owned[0];
    $("#edit-name").value = entry.name;
    $("#edit-url").value = entry.url;
    $("#editor-status").textContent = "Your listing is ready to edit.";
    $("#manage-editor").hidden = false;
    showToast("Portfolio found.");
  } catch (error) {
    console.error(error);
    showToast("Edit code not recognized. Check it and try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Find my portfolio";
  }
});

$("#save-edit").addEventListener("click", async () => {
  if (!currentUser || !currentEntryId) return showToast("Find your portfolio first.");
  const name = $("#edit-name").value.trim();
  const url = safeHttpUrl($("#edit-url").value.trim());
  if (!name || name.length > 50 || !url) return showToast("Enter a name and a valid http or https URL.");
  try {
    await updateDoc(doc(db, "portfolios", currentEntryId), { name, url });
    showToast("Your portfolio has been updated.");
    await loadPortfolios();
  } catch (error) {
    console.error(error);
    showToast("Could not save changes. Check Firestore rules.");
  }
});

$("#delete-entry").addEventListener("click", async () => {
  if (!currentUser || !currentEntryId) return;
  if (!confirm("Delete your portfolio listing? This cannot be undone.")) return;
  try {
    await deleteDoc(doc(db, "portfolios", currentEntryId));
    await deleteUser(currentUser);
    currentUser = null;
    currentEntryId = null;
    $("#manage-editor").hidden = true;
    $("#manage-form").reset();
    showToast("Your listing has been deleted.");
    await loadPortfolios();
  } catch (error) {
    console.error(error);
    showToast("Could not delete. Please try signing in again with your edit code.");
  }
});

$("#sign-out-edit").addEventListener("click", async () => {
  if (auth?.currentUser) await signOut(auth);
  currentUser = null;
  currentEntryId = null;
  $("#manage-editor").hidden = true;
  $("#manage-form").reset();
});

if (db) loadPortfolios();
