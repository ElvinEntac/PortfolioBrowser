import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    deleteUser
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);

const grid = $("#portfolio-grid");
const toast = $("#toast");

// Admin account details
// Never put your password in this file.
const ADMIN_EMAIL = "elvinentac@gmail.com";
const ADMIN_UID = "r2oUnvDeUnvFfSYQAI6sXjGm1YBab52";

let currentUser = null;
let currentEntryId = null;
let toastTimer;
let adminMode = false;

$("#year").textContent = new Date().getFullYear();

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3200);
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
    grid.innerHTML = `
        <div class="loading-state">
            Firebase is not configured yet. Follow the README setup steps, then refresh this page.
        </div>
    `;

    $("#portfolio-count").textContent = "0";
}

function safeHttpUrl(value) {
    try {
        const url = new URL(value);

        return url.protocol === "https:" || url.protocol === "http:"
            ? url.href
            : null;
    } catch {
        return null;
    }
}

// Convert regular edit codes into Firebase email identifiers.
async function codeToEmail(code) {
    const bytes = new TextEncoder().encode(code.trim().toUpperCase());

    const digest = await crypto.subtle.digest("SHA-256", bytes);

    const hex = Array.from(new Uint8Array(digest), b =>
        b.toString(16).padStart(2, "0")
    ).join("");

    return `${hex}@portfoliolink.invalid`;
}

function generateEditCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    const values = new Uint8Array(16);

    crypto.getRandomValues(values);

    return Array.from(values, v =>
        alphabet[v % alphabet.length]
    ).join("");
}

function initials(name) {
    return name.trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase();
}

// Create a public portfolio card.
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

// Load portfolios from Firestore.
async function loadPortfolios() {
    if (!db) return;

    grid.innerHTML = `
        <div class="loading-state">Loading portfolios...</div>
    `;

    try {
        const snapshot = await getDocs(
            query(
                collection(db, "portfolios"),
                orderBy("createdAt", "desc")
            )
        );

        allEntries = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        renderPortfolios();

        $("#portfolio-count").textContent =
            allEntries.length.toLocaleString();

        if (adminMode) {
            renderAdminList();
        }

    } catch (error) {
        console.error(error);

        grid.innerHTML = `
            <div class="loading-state">
                Could not load portfolios. Check your Firebase setup and Firestore rules.
            </div>
        `;
    }
}

// Display public portfolios.
function renderPortfolios() {
    const term = $("#search-input").value.trim().toLowerCase();

    const filtered = allEntries.filter(entry =>
        (entry.name || "").toLowerCase().includes(term)
    );

    grid.replaceChildren();

    $("#empty-state").hidden = filtered.length !== 0;

    if (!filtered.length) return;

    const fragment = document.createDocumentFragment();

    filtered.forEach(entry => {
        fragment.append(makeCard(entry));
    });

    grid.append(fragment);
}

$("#search-input").addEventListener("input", renderPortfolios);

// Submit a new portfolio.
$("#submit-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!db) {
        return showToast("Firebase setup is required before publishing.");
    }

    const name = $("#portfolio-name").value.trim();

    const url = safeHttpUrl(
        $("#portfolio-url").value.trim()
    );

    if (!name || name.length > 50 || !url) {
        return showToast("Enter a name and a valid http or https URL.");
    }

    const button = event.submitter;

    button.disabled = true;
    button.textContent = "Publishing...";

    let createdUser = null;

    try {
        const editCode = generateEditCode();

        const email = await codeToEmail(editCode);

        const credential = await createUserWithEmailAndPassword(
            auth,
            email,
            editCode
        );

        createdUser = credential.user;

        await addDoc(collection(db, "portfolios"), {
            name,
            url,
            ownerUid: createdUser.uid,
            createdAt: serverTimestamp()
        });

        $("#new-edit-code").textContent = editCode;

        $("#new-code-panel").hidden = false;

        $("#submit-form").reset();

        showToast("Your portfolio is now public!");

        await loadPortfolios();

    } catch (error) {
        console.error(error);

        if (createdUser) {
            try {
                await deleteUser(createdUser);
            } catch (cleanupError) {
                console.error(cleanupError);
            }
        }

        showToast(
            error.code === "auth/email-already-in-use"
                ? "Could not create a unique edit account. Please try again."
                : "Could not publish. Check your Firebase Authentication and Firestore setup."
        );

    } finally {
        button.disabled = false;

        button.innerHTML =
            'Publish portfolio <span aria-hidden="true">↗</span>';
    }
});

// Copy generated edit code.
$("#copy-code").addEventListener("click", async () => {
    const code = $("#new-edit-code").textContent;

    try {
        await navigator.clipboard.writeText(code);

        showToast("Edit code copied.");

    } catch {
        showToast("Please select and copy your edit code.");
    }
});

$("#dismiss-code").addEventListener("click", () => {
    $("#new-code-panel").hidden = true;
});

$("#open-manage").addEventListener("click", () => {
    $("#manage-section").scrollIntoView({
        behavior: "smooth"
    });
});

// Close Admin dashboard.
function closeAdminPanel() {
    adminMode = false;

    $("#admin-dashboard").hidden = true;

    $("#manage-form").hidden = false;

    $("#edit-code").value = "";
}

// Open Admin dashboard.
async function openAdminPanel() {
    adminMode = true;

    currentUser = auth.currentUser;

    currentEntryId = null;

    $("#manage-editor").hidden = true;

    $("#manage-form").hidden = true;

    $("#admin-dashboard").hidden = false;

    $("#admin-list").innerHTML = `
        <p class="loading-state">Loading listings...</p>
    `;

    await loadPortfolios();

    renderAdminList();

    showToast("Welcome, Admin.");
}

// Display all listings in the Admin dashboard.
function renderAdminList() {
    const list = $("#admin-list");

    list.replaceChildren();

    if (!allEntries.length) {
        const empty = document.createElement("p");

        empty.className = "loading-state";

        empty.textContent = "There are no portfolio listings yet.";

        list.append(empty);

        return;
    }

    allEntries.forEach(entry => {
        const card = document.createElement("div");

        card.className = "admin-entry";

        const heading = document.createElement("div");

        heading.className = "admin-entry-title";

        const name = document.createElement("strong");

        name.textContent = entry.name || "Untitled portfolio";

        const id = document.createElement("small");

        id.textContent = `Listing ID: ${entry.id}`;

        heading.append(name, id);

        const nameLabel = document.createElement("label");

        nameLabel.textContent = "Portfolio name";

        const nameInput = document.createElement("input");

        nameInput.type = "text";

        nameInput.maxLength = 50;

        nameInput.value = entry.name || "";

        const urlLabel = document.createElement("label");

        urlLabel.textContent = "Portfolio URL";

        const urlInput = document.createElement("input");

        urlInput.type = "url";

        urlInput.value = entry.url || "";

        const actions = document.createElement("div");

        actions.className = "editor-actions";

        const save = document.createElement("button");

        save.type = "button";

        save.className = "primary-button";

        save.textContent = "Save";

        const remove = document.createElement("button");

        remove.type = "button";

        remove.className = "danger-button";

        remove.textContent = "Delete";

        // Admin can edit any listing.
        save.addEventListener("click", async () => {
            if (!adminMode || auth.currentUser?.uid !== ADMIN_UID) {
                return showToast("Admin authentication is required.");
            }

            const newName = nameInput.value.trim();

            const newUrl = safeHttpUrl(urlInput.value.trim());

            if (!newName || newName.length > 50 || !newUrl) {
                return showToast("Enter a name and a valid http or https URL.");
            }

            save.disabled = true;

            try {
                await updateDoc(
                    doc(db, "portfolios", entry.id),
                    {
                        name: newName,
                        url: newUrl
                    }
                );

                showToast("Portfolio updated.");

                await loadPortfolios();

            } catch (error) {
                console.error(error);

                showToast("Could not update this listing. Check the published Firestore rules.");

            } finally {
                save.disabled = false;
            }
        });

        // Admin deletes only the listing, not the owner's Firebase account.
        remove.addEventListener("click", async () => {
            if (!adminMode || auth.currentUser?.uid !== ADMIN_UID) {
                return showToast("Admin authentication is required.");
            }

            if (!confirm(
                `Delete "${entry.name}" from the public directory? The owner's Firebase account will remain untouched.`
            )) {
                return;
            }

            remove.disabled = true;

            try {
                await deleteDoc(
                    doc(db, "portfolios", entry.id)
                );

                showToast("Portfolio listing deleted.");

                await loadPortfolios();

            } catch (error) {
                console.error(error);

                showToast("Could not delete this listing. Check the published Firestore rules.");

            } finally {
                remove.disabled = false;
            }
        });

        actions.append(save, remove);

        card.append(
            heading,
            nameLabel,
            nameInput,
            urlLabel,
            urlInput,
            actions
        );

        list.append(card);
    });
}

// Manage form: Admin password OR regular user's edit code.
$("#manage-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!db) {
        return showToast("Firebase setup is required.");
    }

    const enteredValue = $("#edit-code").value.trim();

    if (!enteredValue) {
        return showToast("Enter your edit code or Admin password.");
    }

    const button = event.submitter;

    button.disabled = true;

    button.textContent = "Checking...";

    try {
        // First, try the Admin account.
        try {
            const adminCredential = await signInWithEmailAndPassword(
                auth,
                ADMIN_EMAIL,
                enteredValue
            );

            if (adminCredential.user.uid === ADMIN_UID) {
                await openAdminPanel();

                return;
            }

            await signOut(auth);

        } catch (adminError) {
            // If Admin sign-in fails, try the regular edit-code system.
        }

        // Regular user edit-code login.
        const code = enteredValue.toUpperCase();

        if (!/^[A-HJ-NP-Z2-9]{16}$/.test(code)) {
            return showToast("That password or edit code was not recognized.");
        }

        const email = await codeToEmail(code);

        const credential = await signInWithEmailAndPassword(
            auth,
            email,
            code
        );

        currentUser = credential.user;

        adminMode = false;

        const owned = allEntries.filter(entry =>
            entry.ownerUid === currentUser.uid
        );

        if (!owned.length) {
            await signOut(auth);

            currentUser = null;

            showToast("No portfolio listing was found for that code.");

            return;
        }

        currentEntryId = owned[0].id;

        const entry = owned[0];

        $("#edit-name").value = entry.name;

        $("#edit-url").value = entry.url;

        $("#editor-status").textContent =
            "Your listing is ready to edit.";

        $("#manage-editor").hidden = false;

        $("#admin-dashboard").hidden = true;

        showToast("Portfolio found.");

    } catch (error) {
        console.error(error);

        showToast("Edit code not recognized. Check it and try again.");

    } finally {
        button.disabled = false;

        button.textContent = "Continue";
    }
});

// Regular user saves their own listing.
$("#save-edit").addEventListener("click", async () => {
    if (!currentUser || !currentEntryId || adminMode) {
        return showToast("Find your portfolio first.");
    }

    const name = $("#edit-name").value.trim();

    const url = safeHttpUrl(
        $("#edit-url").value.trim()
    );

    if (!name || name.length > 50 || !url) {
        return showToast("Enter a name and a valid http or https URL.");
    }

    try {
        await updateDoc(
            doc(db, "portfolios", currentEntryId),
            {
                name,
                url
            }
        );

        showToast("Your portfolio has been updated.");

        await loadPortfolios();

    } catch (error) {
        console.error(error);

        showToast("Could not save changes. Check Firestore rules.");
    }
});

// Regular user deletes their own listing and edit account.
$("#delete-entry").addEventListener("click", async () => {
    if (!currentUser || !currentEntryId || adminMode) {
        return;
    }

    if (!confirm("Delete your portfolio listing? This cannot be undone.")) {
        return;
    }

    try {
        await deleteDoc(
            doc(db, "portfolios", currentEntryId)
        );

        // This is the account of the person who signed in with this edit code.
        await deleteUser(currentUser);

        currentUser = null;

        currentEntryId = null;

        $("#manage-editor").hidden = true;

        $("#manage-form").hidden = false;

        $("#manage-form").reset();

        showToast("Your listing has been deleted.");

        await loadPortfolios();

    } catch (error) {
        console.error(error);

        showToast("Could not delete. Please sign in again with your edit code.");
    }
});

// Regular user closes their editor.
$("#sign-out-edit").addEventListener("click", async () => {
    if (auth?.currentUser) {
        await signOut(auth);
    }

    currentUser = null;

    currentEntryId = null;

    $("#manage-editor").hidden = true;

    $("#manage-form").hidden = false;

    $("#manage-form").reset();
});

// Admin signs out.
$("#admin-sign-out").addEventListener("click", async () => {
    if (auth?.currentUser) {
        await signOut(auth);
    }

    currentUser = null;

    currentEntryId = null;

    closeAdminPanel();

    showToast("Admin signed out.");
});

// Load public listings when the page opens.
if (db) {
    loadPortfolios();
}
