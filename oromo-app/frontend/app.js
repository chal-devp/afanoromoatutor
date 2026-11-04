const API = window.API_BASE || "";
const $ = id => document.getElementById(id);
let mode = "tutor", lang = "auto", history = [], busy = false, voiceMode = false;
const note = t => $("note").textContent = t || "";

function pressed(sel, el){ document.querySelectorAll(sel + " button").forEach(b => b.setAttribute("aria-pressed", b === el)); }
$("langSeg").onclick = e => { if (e.target.dataset.l) { lang = e.target.dataset.l; pressed("#langSeg", e.target); } };
$("modeSeg").onclick = e => { if (e.target.dataset.m) { mode = e.target.dataset.m; pressed("#modeSeg", e.target);
  const ph = {tutor:"Ask anything about Oromo or Amharic…", explain:"Paste any Oromo or Amharic sentence…", correct:"Write your sentence and I will correct it…", talk:"Say or type something to start talking…"};
  $("inp").placeholder = ph[mode]; } };
$("tabs").onclick = e => { const t = e.target.dataset.t; if (!t) return; pressed("#tabs", e.target);
  const id = t === "chat" ? "log" : t;
  ["log","lessons","practice","account"].forEach(x => $(x).style.display = x === id ? "flex" : "none");
  $("foot").style.display = t === "chat" ? "flex" : "none"; if (t === "practice") nextQ(); if (t === "account") renderAccount(); };

function add(text, cls){ const d = document.createElement("div"); d.className = "msg " + cls; d.textContent = text; $("log").append(d); $("log").scrollTop = 1e9; return d; }

let audio;
async function speak(text, l){
  try {
    const r = await fetch(API + "/api/tts", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({text, lang:l})});
    if (!r.ok) throw 0;
    if (audio) audio.pause();
    audio = new Audio(URL.createObjectURL(await r.blob())); audio.play();
  } catch {
    const u = new SpeechSynthesisUtterance(text); u.lang = {am:"am-ET", om:"om", en:"en-US"}[l] || "en-US";
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    note("Server voice unavailable, using device voice.");
  }
}

async function ask(text){
  text = text.trim(); if (!text || busy) return; busy = true; $("inp").value = "";
  add(text, "me"); history.push({role:"user", content: voiceMode ? text + "\n(Spoken: reply in at most 3 short sentences.)" : text});
  const out = add("…", "bot");
  try {
    const r = await fetch(API + "/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({messages:history, reply_lang:lang, mode})});
    if (!r.ok) throw new Error("Server error " + r.status);
    const d = await r.json(); out.textContent = d.text; history.push({role:"assistant", content:d.text});
    const b = document.createElement("button"); b.className = "ghost"; b.textContent = "🔊 Listen"; b.onclick = () => speak(d.text, d.lang);
    const bad = document.createElement("button"); bad.className = "ghost"; bad.style.marginLeft = "6px"; bad.textContent = "⚠ Report mistake";
    bad.onclick = async () => { const n = prompt("What is wrong? (optional)") ; if (n === null) return;
      await fetch(API + "/api/report", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({question:text, answer:d.text, note:n})}).catch(()=>{}); bad.textContent = "Thanks"; bad.disabled = true; };
    out.append(document.createElement("br"), b, bad);
    if (voiceMode) speak(d.text, d.lang);
  } catch(e){
    history.pop(); out.textContent = navigator.onLine ? "Sorry, something went wrong. Try again." : "You’re offline. The Lessons tab still works.";
  }
  busy = false;
}
$("send").onclick = () => { voiceMode = false; ask($("inp").value); };
$("inp").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); voiceMode = false; ask($("inp").value); } };

// Voice input: record on the phone, transcribe on the server (Addis AI: Amharic, Oromo, English)
let rec, recording = false, chunks = [];
$("mic").onclick = async () => {
  const spoken = lang === "auto" ? "am" : lang;   // pick the language you will speak with the toggle
  if (!navigator.mediaDevices || !window.MediaRecorder) return note("This device can’t record audio. Please type.");
  if (recording) { rec.stop(); return; }
  try {
    const s = await navigator.mediaDevices.getUserMedia({audio:true}); chunks = [];
    rec = new MediaRecorder(s); rec.ondataavailable = e => chunks.push(e.data);
    rec.onstart = () => { recording = true; $("mic").classList.add("rec"); note("Listening… tap again to stop."); };
    rec.onstop = async () => { recording = false; $("mic").classList.remove("rec"); s.getTracks().forEach(t => t.stop());
      note("Transcribing…");
      const f = new FormData(); f.append("audio", new Blob(chunks, {type:rec.mimeType}), "speech.webm"); f.append("lang", spoken);
      try { const r = await fetch(API + "/api/stt", {method:"POST", body:f}); if (!r.ok) throw 0; const d = await r.json();
        note(""); if (d.text) { voiceMode = true; ask(d.text); } else note("I didn’t catch that. Try again."); }
      catch { note("Couldn’t transcribe. Try again or type."); } };
    rec.start();
  } catch { note("Microphone permission needed."); }
};

// Offline lessons
fetch("lessons.json").then(r => r.json()).then(ls => {
  $("lessons").innerHTML = ls.map(l => `<div class="card"><h3>${l.title}</h3>` + l.words.map(w =>
    `<div class="w"><div><b>${w.om}</b> <small>${w.am}</small><br><small>${w.en}</small></div><button class="ghost" data-t="${w.om}">🔊</button></div>`).join("") + `</div>`).join("");
  $("lessons").onclick = e => { const t = e.target.dataset.t; if (t) speak(t, "om"); };
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

// ---- Practice: sentence bank + spaced repetition (progress saved on this device)
let bank = [], prog = {box:{}, correct:0, total:0, streak:0, last:""}, cur = null;
try { prog = Object.assign(prog, JSON.parse(localStorage.getItem("prog") || "{}")); } catch {}
const save = () => { try { localStorage.setItem("prog", JSON.stringify(prog)); } catch {} schedule(); };
fetch("sentences.json").then(r => r.json()).then(j => bank = j);

function nextQ(){
  if (bank.length < 4) return $("practice").innerHTML = "<div class='card'>Loading sentences…</div>";
  const meaning = lang === "am" ? "am" : "en";
  const lowest = Math.min(...bank.map(s => prog.box[s.id] || 0));
  const pool = bank.filter(s => (prog.box[s.id] || 0) <= lowest + 1);
  const item = pool[Math.floor(Math.random() * pool.length)];
  const wrong = bank.filter(s => s.id !== item.id).sort(() => Math.random() - .5).slice(0, 3);
  const opts = [item, ...wrong].sort(() => Math.random() - .5);
  const listen = Math.random() < .4;
  cur = {item, meaning};
  const mastered = bank.filter(s => (prog.box[s.id] || 0) >= 4).length;
  $("practice").innerHTML = `<div class="stat">Streak ${prog.streak} day(s) · Accuracy ${prog.total ? Math.round(100*prog.correct/prog.total) : 0}% · Mastered ${mastered}/${bank.length}</div>
   <div class="card"><h3>${listen ? "Listen and choose the meaning" : "What does this mean?"}</h3>
   ${listen ? `<button class="ghost" id="play">🔊 Play</button>` : `<div style="font-size:1.2rem;margin-bottom:6px"><b>${item.om}</b></div>`}
   <div id="opts">${opts.map(o => `<button class="opt" data-id="${o.id}">${o[meaning]}</button>`).join("")}</div><div id="fb"></div></div>`;
  if (listen) { $("play").onclick = () => speak(item.om, "om"); speak(item.om, "om"); }
  $("opts").onclick = e => { const id = e.target.dataset.id; if (!id || cur.done) return; cur.done = true;
    const ok = id === item.id; prog.total++; if (ok) prog.correct++;
    prog.box[item.id] = ok ? Math.min((prog.box[item.id] || 0) + 1, 5) : 0;
    const today = new Date().toDateString(); if (prog.last !== today) { const y = new Date(Date.now() - 864e5).toDateString(); prog.streak = prog.last === y ? prog.streak + 1 : 1; prog.last = today; }
    save();
    document.querySelectorAll(".opt").forEach(b => { if (b.dataset.id === item.id) b.classList.add("ok"); else if (b.dataset.id === id) b.classList.add("no"); });
    $("fb").innerHTML = `<p>${ok ? "Correct!" : "Not quite."} <b>${item.om}</b> = ${item.en}<br><small>${item.am}</small></p><button class="ghost" id="nx">Next</button> <button class="ghost" id="hear">🔊</button>`;
    $("nx").onclick = nextQ; $("hear").onclick = () => speak(item.om, "om"); };
}

// ---- Accounts + cloud sync (Supabase REST; no SDK needed)
const SB = window.SUPABASE_URL, KEY = window.SUPABASE_ANON_KEY, sbOn = () => !!(SB && KEY);
let sess = null; try { sess = JSON.parse(localStorage.getItem("sb") || "null"); } catch {}
const setStat = t => { const e = $("acstat"); if (e) e.textContent = t; };

async function sbAuth(path, body){
  const r = await fetch(SB + "/auth/v1/" + path, {method:"POST", headers:{apikey:KEY, "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json(); if (!r.ok) throw new Error(d.msg || d.error_description || d.message || "Sign-in failed"); return d;
}
function setSess(d){
  if (!d.access_token) return false;
  sess = {access_token:d.access_token, refresh_token:d.refresh_token, user:{id:d.user.id, email:d.user.email}};
  try { localStorage.setItem("sb", JSON.stringify(sess)); } catch {} return true;
}
async function sbRest(path, opts = {}){
  const go = () => fetch(SB + "/rest/v1/" + path, {...opts, headers:{apikey:KEY, Authorization:"Bearer " + sess.access_token, "Content-Type":"application/json", ...(opts.headers || {})}});
  let r = await go();
  if (r.status === 401) { setSess(await sbAuth("token?grant_type=refresh_token", {refresh_token:sess.refresh_token})); r = await go(); }
  return r;
}
function merge(a, b){   // keep the best of both devices
  const box = {...a.box}; for (const k in b.box) box[k] = Math.max(box[k] || 0, b.box[k]);
  const big = (b.total || 0) > (a.total || 0) ? b : a;
  const later = new Date(b.last || 0) > new Date(a.last || 0) ? b : a;
  return {box, correct:big.correct, total:big.total, streak:later.streak, last:later.last};
}
async function syncNow(){
  if (!sess || !sbOn()) return;
  try {
    const r = await sbRest("progress?select=data&user_id=eq." + sess.user.id); if (!r.ok) throw 0;
    const rows = await r.json(); if (rows[0] && rows[0].data && rows[0].data.box) prog = merge(prog, rows[0].data);
    try { localStorage.setItem("prog", JSON.stringify(prog)); } catch {}
    const w = await sbRest("progress", {method:"POST", headers:{Prefer:"resolution=merge-duplicates"}, body:JSON.stringify({user_id:sess.user.id, data:prog, updated_at:new Date().toISOString()})});
    if (!w.ok) throw 0; setStat("Synced ✓");
  } catch { setStat("Offline or error. Will retry on your next answer."); }
}
let timer; function schedule(){ if (!sess) return; clearTimeout(timer); timer = setTimeout(syncNow, 1500); }

const LEGAL = `<p class="stat"><a href="privacy.html">Privacy policy</a> · <a href="delete-account.html">Delete my data</a></p>`;
let recovery = null;   // set when the user arrives from a password-reset email
function renderAccount(){
  const el = $("account");
  if (recovery) { el.innerHTML = `<div class="card"><h3>Choose a new password</h3><input id="pw" type="password" placeholder="New password (6+ characters)" autocomplete="new-password"><button class="btn2" data-a="newpw">Save password</button><p class="stat" id="acstat"></p></div>`; return; }
  if (!sbOn()) { el.innerHTML = "<div class='card'>Cloud sync is not set up yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in config.js.</div>"; return; }
  el.innerHTML = sess
    ? `<div class="card"><h3>Signed in</h3><p>${sess.user.email}</p><button class="btn2" data-a="sync">Sync now</button><button class="btn2 alt" data-a="out">Sign out</button><button class="btn2 alt" data-a="del" style="color:#c0392b">Delete account</button><p class="stat" id="acstat"></p></div>${LEGAL}`
    : `<div class="card"><h3>Save your progress</h3><input id="em" type="email" placeholder="Email" autocomplete="email"><input id="pw" type="password" placeholder="Password (6+ characters)" autocomplete="current-password">
       <button class="btn2" data-a="in">Sign in</button><button class="btn2 alt" data-a="up">Create account</button><button class="btn2 alt" data-a="forgot">Forgot password?</button><p class="stat" id="acstat"></p></div>${LEGAL}`;
}
$("account").onclick = async e => {
  const a = e.target.dataset.a; if (!a) return;
  if (a === "out") { sess = null; try { localStorage.removeItem("sb"); } catch {} return renderAccount(); }
  if (a === "sync") { setStat("Syncing…"); return syncNow(); }
  if (a === "del") {
    if (prompt("This permanently deletes your account and saved progress. Type DELETE to confirm.") !== "DELETE") return;
    try {
      const call = () => fetch(API + "/api/delete-account", {method:"POST", headers:{Authorization:"Bearer " + sess.access_token}});
      let r = await call();
      if (r.status === 401) { setSess(await sbAuth("token?grant_type=refresh_token", {refresh_token:sess.refresh_token})); r = await call(); }
      if (!r.ok) throw 0;
      sess = null; try { localStorage.removeItem("sb"); localStorage.removeItem("prog"); } catch {}
      prog = {box:{}, correct:0, total:0, streak:0, last:""}; renderAccount(); setStat("Your account and saved progress were deleted.");
    } catch { setStat("Couldn’t delete the account. Try again later or email us."); }
    return; }
  if (a === "newpw") {
    const np = $("pw").value; if (np.length < 6) return setStat("Use 6+ characters.");
    try { const r = await fetch(SB + "/auth/v1/user", {method:"PUT", headers:{apikey:KEY, Authorization:"Bearer " + recovery, "Content-Type":"application/json"}, body:JSON.stringify({password:np})});
      if (!r.ok) throw new Error("This link has expired. Request a new one."); recovery = null; renderAccount(); setStat("Password changed. You can sign in now."); }
    catch (err) { setStat(err.message); } return; }
  if (a === "forgot") {
    const fe = $("em").value.trim(); if (!fe) return setStat("Enter your email first.");
    try { await sbAuth("recover?redirect_to=" + encodeURIComponent(location.origin + location.pathname), {email:fe}); setStat("If that email has an account, a reset link is on its way."); }
    catch (err) { setStat(err.message); } return; }
  const email = $("em").value.trim(), password = $("pw").value;
  if (!email || password.length < 6) return setStat("Enter an email and a password of 6+ characters.");
  try {
    setStat("Please wait…");
    const d = await sbAuth(a === "in" ? "token?grant_type=password" : "signup", {email, password});
    if (!setSess(d)) return setStat("Account created. Check your email to confirm, then sign in.");
    renderAccount(); setStat("Syncing…"); syncNow();
  } catch (err) { setStat(err.message); }
};
if (sess) syncNow();

// Arrived from a password-reset email? The link carries a temporary token in the URL.
{ const h = new URLSearchParams(location.hash.slice(1));
  if (sbOn() && h.get("type") === "recovery" && h.get("access_token")) {
    recovery = h.get("access_token"); history.replaceState(null, "", location.pathname);
    document.querySelector('#tabs [data-t="account"]').click(); } }
