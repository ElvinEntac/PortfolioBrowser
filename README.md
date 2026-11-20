# PortfolioLink

A static portfolio directory built with HTML, CSS, JavaScript, Firebase Authentication, and Cloud Firestore. It can be hosted on GitHub Pages.

## Features

- Public portfolio directory
- Add a portfolio using a display name and website URL
- Search listings
- Edit or delete a listing using a generated 16-character edit code
- Responsive layout for desktop and mobile

## 1. Create and configure Firebase

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In **Project settings → General → Your apps**, add a Web App.
3. Copy the Firebase web configuration into `firebase-config.js`.
4. In **Authentication → Sign-in method**, enable **Email/Password**.
5. Create a **Cloud Firestore** database.
6. In Firestore **Rules**, paste the contents of `firestore.rules` and publish the rules.

The site uses Firebase Authentication accounts with generated, non-mailbox identifiers. Visitors do not enter a real email address. The edit code acts as the account password.

**Important:** The edit code is the only way to manage a listing. It is shown once after publishing. Save it somewhere safe. There is no email-based recovery. Do not share your code.

## 2. Test locally

Because this project uses JavaScript modules, open it through a local web server rather than opening `index.html` directly. For example, in VS Code install/use the Live Server extension and choose **Open with Live Server**.

## 3. Publish on GitHub Pages

1. Create a new GitHub repository, for example `PortfolioLink`.
2. Upload `index.html`, `style.css`, `script.js`, `firebase-config.js`, and `firestore.rules` (and this README).
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.
6. Wait for GitHub Pages to publish your site.

Your website will usually be available at `https://YOUR-USERNAME.github.io/PortfolioLink/`.

## 4. Before sharing publicly

- Check your Firestore rules are published.
- Test adding a portfolio, refreshing the page, signing in with its edit code, editing it, and deleting it.
- Keep an eye on Firebase usage and configure budget/usage alerts in Google Cloud.
- The directory is public. Anyone can view submitted names and links.
- Only share links to websites you own or have permission to share.

## Notes

- The Firebase web config is intended to be present in frontend code. It is not a password. Firestore security rules and Firebase Authentication protect the data.
- This project currently creates one listing per edit code.
- A Firebase project may require enabling the Authentication provider and creating Firestore before the site can work.
