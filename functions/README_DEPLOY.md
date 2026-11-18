# Firebase Cloud Functions Deployment Guide

This folder contains the Firebase Cloud Functions (2nd Gen) backend for:
- Automatic Admin Notification generation (`onStudentCreated`, `onPaymentRequestCreated`, `onPaymentRequestUpdated`, `onAccessCodeRedeemed`, `onQuizAttemptCreated`, `onAppConfigWritten`)
- High-priority FCM push delivery with stale-token cleanup (`onAdminNotificationCreated`)
- 1-to-1 Admin Personal Messaging push notifications + automatic `delivered` receipt progression (`onAdminChatMessageCreated`)

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
