# Student Directory

A barebones Expo React Native app for managing student records in Cloud Firestore and profile pictures in Cloud Storage.

## Android APK builds

Android APK builds run in GitHub Actions on pushes to `main` or from the Actions tab with **Build Android APK**.

Before the first run, create an Expo access token with `eas token:create`, then add it to the repository as an Actions secret named `EXPO_TOKEN`.

The workflow uses the EAS `preview` profile and produces an installable APK. The build link is available in the workflow logs after EAS submits the build.