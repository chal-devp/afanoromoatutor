import os, re, io, asyncio, time, collections
import httpx
from addisai import AddisAI
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse

load_dotenv()
# CHAT_PROVIDER: "addis" (default) or "claude". Claude is optional and also used for English
# replies when ANTHROPIC_API_KEY is set (Addis AI chat accepts am/om/ti only).
CHAT_PROVIDER = os.getenv("CHAT_PROVIDER", "addis")
addis = AddisAI()  # reads ADDIS_API_KEY
claude = None
if os.getenv("ANTHROPIC_API_KEY"):
    from anthropic import Anthropic
    claude = Anthropic()
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")
VOICE_IDS = {"am": "am-hamen", "om": "om-bikila"}   # see addis.voices.list() for more voices

app = FastAPI()

# ---- Rate limiting (in memory: resets on restart; use Redis if you run several server copies)
# path: (calls per minute, calls per day) for ONE visitor (IP address)
RATE = {"/api/chat": (12, 150), "/api/tts": (20, 300), "/api/stt": (12, 100), "/api/report": (5, 30), "/api/delete-account": (3, 5)}
GLOBAL_DAILY = int(os.getenv("GLOBAL_DAILY_CALLS", "5000"))   # hard stop for all visitors together (protects your bill)
TRUST_PROXY = os.getenv("TRUST_PROXY") == "1"                 # set to 1 behind Render/Railway/nginx
_hits = collections.defaultdict(collections.deque)
_global = {"day": "", "n": 0}

def client_ip(request: Request):
    if TRUST_PROXY and request.headers.get("x-forwarded-for"):
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    return request.client.host if request.client else "unknown"

@app.middleware("http")
async def limiter(request: Request, call_next):
    path = request.url.path
    if request.method == "POST" and path in RATE:
        now = time.time(); per_min, per_day = RATE[path]
        q = _hits[(client_ip(request), path)]
        while q and now - q[0] > 86400: q.popleft()
        recent = sum(1 for t in q if now - t < 60)
        today = time.strftime("%Y-%m-%d")
        if _global["day"] != today: _global.update(day=today, n=0)
        if recent >= per_min or len(q) >= per_day or (path != "/api/report" and _global["n"] >= GLOBAL_DAILY):
            return JSONResponse({"detail": "Too many requests. Please try again later."}, status_code=429, headers={"Retry-After": "60"})
        q.append(now)
        if path != "/api/report": _global["n"] += 1
    return await call_next(request)

# Set ALLOWED_ORIGINS in production, e.g. https://yourapp.com,https://localhost,capacitor://localhost
ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

SYSTEM = """You are a friendly Afaan Oromoo (Oromo) tutor who is fluent in Amharic and Oromo.

Rules:
1. Detect the language of the user's message. Reply in that same language, unless the user asks for another language ("answer in Amharic", "Afaan Oromootiin deebisi"), or the app setting below forces one.
2. If the user asks the meaning of an Oromo word or phrase, give: the meaning, one example sentence in Oromo, and its translation, all in the user's reply language.
3. Write Oromo in Qubee (Latin script) and Amharic in Ge'ez script.
4. Keep answers short and speakable, because they will be read aloud. No markdown, no emojis.
5. After teaching, ask one small practice question.
6. If you are unsure about a word or dialect, say so instead of guessing."""
CLAUDE_TAG_RULE = "\n7. Start every reply with exactly one tag naming the language you reply in: [am], [om] or [en]. Nothing before it."
MODES = {
 "tutor": "",
 "explain": """
MODE: Sentence explainer. The user gives ANY Oromo or Amharic sentence (or a word). Reply in the user's reply language with:
1) natural translation, 2) word-by-word meaning, 3) a short grammar note (tense, plural, case endings, verb form), 4) how a native speaker would say it in casual speech versus formal speech, 5) any common dialect difference you are sure about. Keep each part to one or two lines.""",
 "correct": """
MODE: Sentence corrector. The user writes a sentence in Oromo or Amharic they are learning. Give: the corrected sentence the way a native speaker would naturally say it, then one short reason for each change. If it is already natural, say so. Never invent a correction you are unsure of.""",
 "talk": """
MODE: Conversation partner. Chat naturally like a native speaker in the language the user is practising, at a beginner level, using short everyday sentences. If the user makes a mistake, give the natural version in one short line, then continue the conversation with a question.""",
}
NAMES = {"am": "Amharic (Ge'ez script)", "om": "Afaan Oromoo (Qubee)", "en": "English"}
OROMO_WORDS = re.compile(r"\b(maal|akkam|galatoomi|nagaa|jechuu|jechi|afaan|deebisi|eenyu|yoom|eessa|fayyaa|barbaada|naaf|ani|ati|isin|kee|koo|dha|miti|fi|hin|jira)\b", re.I)

def detect(text):
    if re.search(r"[\u1200-\u137F]", text): return "am"
    if OROMO_WORDS.search(text): return "om"
    return "en"

class Msg(BaseModel):
    role: str
    content: str = Field(max_length=1500)

class ChatReq(BaseModel):
    messages: list[Msg] = Field(max_length=40)
    reply_lang: str = "auto"   # auto | am | om | en
    mode: str = "tutor"        # tutor | explain | correct | talk

def run_addis(system, msgs, lang):
    # Addis chat takes am/om/ti. For English without Claude, answer in English via the system prompt.
    code = lang if lang in ("am", "om") else "am"
    if lang == "en":
        system += "\nReply in English."
    res = addis.chat.completions.create(language=code, system=system, messages=msgs, max_tokens=700)
    return res["choices"][0]["message"]["content"].strip()

def run_claude(system, msgs):
    r = claude.messages.create(model=CLAUDE_MODEL, max_tokens=600, system=system + CLAUDE_TAG_RULE, messages=msgs)
    text = r.content[0].text.strip()
    m = re.match(r"^\[(am|om|en)\]\s*", text)
    return (text[m.end():], m.group(1)) if m else (text, None)

@app.post("/api/chat")
async def chat(req: ChatReq):
    msgs = [m.model_dump() for m in req.messages[-20:]]
    last = msgs[-1]["content"] if msgs else ""
    lang = req.reply_lang if req.reply_lang in NAMES else detect(last)
    system = SYSTEM + MODES.get(req.mode, "")
    if req.reply_lang in NAMES:
        system += f"\n\nApp setting: the user chose reply language = {NAMES[req.reply_lang]}. Always reply in it."
    try:
        use_claude = claude and (CHAT_PROVIDER == "claude" or lang == "en")
        if use_claude:
            text, tag = await asyncio.to_thread(run_claude, system, msgs)
            return {"text": text, "lang": tag or lang, "provider": "claude"}
        text = await asyncio.to_thread(run_addis, system, msgs, lang)
        # If the user gave no explicit setting, label the reply by its script/words for the right voice
        out_lang = lang if req.reply_lang in NAMES else (detect(text) if detect(text) != "en" else lang)
        return {"text": text, "lang": out_lang, "provider": "addis"}
    except Exception as e:
        raise HTTPException(502, f"Chat provider error: {e}")

@app.post("/api/delete-account")
async def delete_account(request: Request):
    """Deletes the signed-in user's Supabase account (their progress row is removed by 'on delete cascade').
    Needs SUPABASE_URL and SUPABASE_SERVICE_KEY on the SERVER only. Never put the service key in the app."""
    url, svc = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not svc:
        raise HTTPException(503, "Account deletion is not configured")
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Sign in first")
    async with httpx.AsyncClient(timeout=20) as h:
        u = await h.get(f"{url}/auth/v1/user", headers={"apikey": svc, "Authorization": auth})
        if u.status_code != 200:
            raise HTTPException(401, "Session expired")
        d = await h.delete(f"{url}/auth/v1/admin/users/{u.json()['id']}",
                           headers={"apikey": svc, "Authorization": f"Bearer {svc}"})
    if d.status_code not in (200, 204):
        raise HTTPException(502, "Could not delete the account")
    return {"ok": True}

class Report(BaseModel):
    question: str
    answer: str
    note: str = ""

@app.post("/api/report")
async def report(r: Report):
    """Native speakers flag wrong answers; review reports.jsonl and use it to fix prompts and lessons."""
    import json, time
    with open(os.path.join(os.path.dirname(__file__), "reports.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps({**r.model_dump(), "t": time.time()}, ensure_ascii=False) + "\n")
    return {"ok": True}

class TTSReq(BaseModel):
    text: str
    lang: str

@app.post("/api/tts")
async def tts(req: TTSReq):
    if req.lang not in VOICE_IDS:
        raise HTTPException(501, "No server voice for this language; the app uses the device voice")
    try:
        clip = await asyncio.to_thread(lambda: addis.voice.generate(
            voice_id=VOICE_IDS[req.lang], text=req.text[:1500], language=req.lang, output_format="mp3_44100"))
        data = await asyncio.to_thread(clip.content)
    except Exception as e:
        raise HTTPException(502, f"Voice error: {e}")
    return Response(data, media_type="audio/mpeg")

@app.post("/api/stt")
async def stt(audio: UploadFile, lang: str = Form("am")):
    if lang not in ("am", "om", "en"):
        raise HTTPException(400, "Unsupported language")
    buf = io.BytesIO(await audio.read()); buf.name = audio.filename or "speech.webm"
    try:
        t = await asyncio.to_thread(lambda: addis.speech.transcribe(audio=buf, language=lang))
    except Exception as e:
        raise HTTPException(502, f"Transcription error: {e}")
    return {"text": t.get("text", "")}

# Serve the web/PWA build from the same server (keep this last)
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "frontend"), html=True), name="web")
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)