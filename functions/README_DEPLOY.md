# Firebase Cloud Functions Deployment Guide

This folder contains the Firebase Cloud Functions (2nd Gen) backend for **Quick Quiz**:
- **Real-Time Public Push Broadcasts (`onPushBroadcastCreated`)**: Dispatches WhatsApp-style high-priority FCM banners (sound, vibration, Quick Quiz branding, deep-link route, strict tag deduplication) to all opted-in user devices across Foreground, Background, and Completely Closed states for Admin messages, Exam Notices, and App Update alerts.
- **Verified Admin HTTPS Push API (`sendAdminPushNotification`)**: Authenticated HTTPS endpoint (`Authorization: Bearer <Firebase ID Token>`) allowing Admins or backend tooling to queue real-time push notifications.
- **App Update Push Broadcaster (`onAppReleaseCreated` & `onGitHubReleasePush`)**: Automatically notifies all opted-in Android & Web devices whenever an Admin publishes a release or GitHub Actions pushes a new APK build.
- **Admin Activity & 1-to-1 Admin Messaging (`onStudentCreated`, `onPaymentRequestCreated`, `onPaymentRequestUpdated`, `onAccessCodeRedeemed`, `onQuizAttemptCreated`, `onAppConfigWritten`, `onAdminNotificationCreated`, `onAdminChatMessageCreated`)**.

## Prerequisites
- Firebase project: `gen-lang-client-0958586856` (Blaze plan required by Firebase Cloud Functions v2 & Artifact Registry)
- Firestore database ID configured in `app/src/main/res/values/firebase_applet_config.xml`:
  `ai-studio-android-10-d59bf62d-e241-4e4c-b4b1-c61279a58cd9`

## Deploy Steps
1. Log in with Firebase CLI on a machine with project owner/editor credentials:
   ```bash
   firebase login
   firebase use gen-lang-client-0958586856
   ```
2. Install function dependencies:
   ```bash
   cd functions && npm install && cd ..
   ```
3. Deploy Firestore Security Rules + Cloud Functions:
   ```bash
   firebase deploy --only firestore:rules,functions
   ```
4. Verify logs in Firebase Console or via CLI:
   ```bash
   firebase functions:log
   ```
5. (Optional for Web Push on browsers) Copy your Web Push VAPID key from **Firebase Console → Project Settings → Cloud Messaging → Web Push certificates** into AI Studio Secrets as `VITE_FIREBASE_VAPID_KEY`.
