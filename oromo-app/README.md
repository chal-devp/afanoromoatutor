# Oromo Tutor (standalone app)

## 1. Run the backend + web app (PWA)
    cd backend
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env      # add your keys
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
Open http://localhost:8000. On a phone, use "Add to Home Screen".
Production needs HTTPS: deploy on Render, Railway, Fly.io or a VPS.

## 2. Keys you need
- ADDIS_API_KEY (addisassistant.com): chat, Amharic and Oromo voice, speech-to-text. Required.
- ANTHROPIC_API_KEY (optional): Claude answers English questions, or everything if CHAT_PROVIDER=claude.
Set CHAT_PROVIDER=claude and ask the same Oromo questions on both to compare which teaches better.

## 2b. Test these first (not verified yet)
- Oromo speech-to-text with real Oromo audio. Browsers record webm; if Addis AI rejects it, convert to wav on the server with ffmpeg.
- Voice sound quality with native speakers (voice ids: am-hamen, om-bikila; addis.voices.list() shows others).
- Prices and rate limits for your expected users.

## 3. Android app: see ANDROID.md

## Account deletion and legal pages
- Set SUPABASE_URL and SUPABASE_SERVICE_KEY in the backend .env (server only; the service key can delete any user, never put it in the app).
- frontend/privacy.html and frontend/delete-account.html are DRAFTS with [brackets] to fill in. Use their web addresses (https://yourdomain/privacy.html) in Google Play Console.

## Sentence bank and Practice
frontend/sentences.json holds the sentences used by the Practice tab (multiple choice and listening, with spaced repetition and a daily streak saved on the device). The 14 starter sentences were written by an AI and are marked reviewed:false. Have native speakers check them.
To grow it: run `python tools/import_sentences.py` on your computer (FLORES-200, CC-BY-SA 4.0; credit Meta AI), review the output, then merge it into sentences.json.

## Accounts and cloud sync (Supabase)
1. Create a free project at supabase.com.
2. SQL Editor: paste and run supabase.sql (creates the progress table with row-level security).
3. Project Settings > API: copy the Project URL and the anon key into frontend/config.js.
4. Authentication > Providers > Email: for testing, turn off "Confirm email" so sign-up logs in at once. Turn it on again before launch.
Password reset: in Supabase go to Authentication > URL Configuration and set Site URL to your deployed https address (reset emails link back to it). Reset works in the web app; Android users can reset in the browser.
Progress (box levels, streak, accuracy) merges across devices, keeping the best values. Users can still practise offline and it syncs later.

## Not done yet
- Google sign-in
- Native-speaker review of lessons and AI answers
