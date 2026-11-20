# Quick Quiz — Payment Verification, Permanent Codes & Std 10 Quiz Portal

## 📥 Download Latest Android APK (Single Permanent Link)

Open this **single permanent link** anytime — it automatically downloads the **last generated APK** built by GitHub Actions:

👉 **[Download Quick-Quiz-Latest.apk](https://github.com/omsai3248-rgb/Quick-book/releases/latest/download/Quick-Quiz-Latest.apk)**

```text
https://github.com/omsai3248-rgb/Quick-book/releases/latest/download/Quick-Quiz-Latest.apk
```

A mobile-first **React + TypeScript + Vite + Tailwind CSS + Firebase** web & Android application (`omsai3248-rgb/Quick-book`) with live Firestore `onSnapshot` listeners, Firebase Storage screenshot uploads, Admin Panel, and a **Gujarati / English (`ગુજરાતી / EN`)** language toggle.

## Features

- **Public Payment Page**: Submit Name, 10-digit Mobile, Amount (`₹`), Subject, Transaction/UTR ID (duplicate UTRs blocked via `/utr_locks`), and Payment Screenshot uploaded to Firebase Storage. Live `onSnapshot` updates display the generated 8-character code as soon as approved.
- **Admin Panel (`+919099592283` Only)**:
  - Protected via **Firebase Phone OTP** (`RecaptchaVerifier` + `signInWithPhoneNumber`); all other numbers are rejected in both UI and `firestore.rules`.
  - Realtime `onSnapshot` alerts with Web Audio chime + notification bell badge when new payment requests arrive or when codes are redeemed.
  - Tap-to-zoom payment screenshots, **Approve** (atomic `runTransaction` generating a unique 8-character code), **Reject** (with optional reason), **Copy Code**, and **Send on WhatsApp** (`https://wa.me/91<mobile>?text=...`).
  - **All Codes** (permanent, deletion disabled): search, filter (`All / Unused / Used`), **CSV Export**, and **A4 PDF Export**.
  - **Used Codes**: live audit view of `usedBy` (name, mobile, device/browser) and `usedAt`.
- **Public Use Code & Protected Content**: Atomically redeems an unused 8-character code once, unlocks the **Std 10 Board Quiz** (Maths, Science, Social Science), and alerts the Admin live.

## Development & Deployment

```bash
npm install
npm run dev      # Starts Vite dev server on port 3000
npm run build    # Type-checks and builds production bundle into dist/
npm run lint     # Runs ESLint and @firebase/eslint-plugin-security-rules
```

### Firebase Console Setup
1. **Authentication → Sign-in method**: Enable **Anonymous** (for public users) and **Phone** (for admin `+919099592283`).
2. **Authorized domains**: Add your hosting / AI Studio preview domain under **Authentication → Settings → Authorized domains**.
3. **Deploy Firebase rules & hosting**:
   ```bash
   npm run build
   firebase deploy
   ```
