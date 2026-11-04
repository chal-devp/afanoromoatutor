# Android build and Google Play

## Before you start
- Install Node 18+, JDK 17 and Android Studio.
- Deploy the backend on an https address (Render, Railway, Fly.io or a VPS). Set TRUST_PROXY=1, GLOBAL_DAILY_CALLS and ALLOWED_ORIGINS in its environment.
- In frontend/config.js set window.API_BASE to that address. Add your Supabase values.

## Build
1. In this folder: `npm install`
2. Change appId in capacitor.config.json to your own, e.g. com.yourname.oromotutor (cannot change after publishing).
3. `npx cap add android`
4. Icon: put a 1024x1024 icon.png in an `assets` folder, then `npx @capacitor/assets generate --android`.
5. Open android/app/src/main/AndroidManifest.xml and add inside <manifest>:
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.RECORD_AUDIO" />
6. `npx cap sync` then `npx cap open android`
7. Test on a real phone (Run button). Check: chat, Amharic and Oromo voice, microphone recording, Practice, sign-in, airplane-mode Lessons.
8. Build > Generate Signed App Bundle > Android App Bundle. Create a keystore and BACK IT UP in two places with its password. Before each new release raise versionCode in android/app/build.gradle.

## Google Play Console
- One-time $25 developer fee. Identity verification can take days.
- New personal developer accounts must usually run a closed test with about 12 testers for 14 days before production. Check Google's current rules.
- Needed: privacy policy web page, Data safety form, content rating questionnaire, screenshots, short and full description.
- Data safety form must say you collect: email address (accounts), voice recordings and typed text (sent to Addis AI, and Claude if enabled, to answer and transcribe), and learning progress.
- Apps with accounts must offer account deletion inside the app (built: Account tab) and a web page for it. Use https://yourdomain/delete-account.html as that URL, and https://yourdomain/privacy.html as the privacy policy.
- Check Google's current target Android API level requirement; new apps must meet it.
- Tell users that answers come from AI and can be wrong; keep the Report mistake button.
