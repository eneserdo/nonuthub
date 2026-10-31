import { STUDIES, CATEGORIES, CHANNELS, VIDEOS } from "./data.js";
import { SCENES, FLAGS, W, H, clock } from "./scenes.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const byId = Object.fromEntries(VIDEOS.map(v => [v.id, v]));
const year = s => s.cite.match(/\((\d{4})/)[1];
const REPO = "https://github.com/eneserdo/nonuthub";

// ---------- No Nut November clock ----------
const NOV1 = new Date(2026, 10, 1), DAY = 864e5;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function streak() {
  const now = new Date(), slips = store("nnh-slips", []);
  const today = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - NOV1) / DAY) + 1;   // 1..30 in November
  if (today < 1) return { before: true, ms: NOV1 - now, slips };
  const last = Math.min(today, 30), clean = [];
  for (let d = 1; d <= last; d++) if (!slips.includes(iso(new Date(2026, 10, d)))) clean.push(d);
  let cur = 0; for (let d = last; d >= 1 && !slips.includes(iso(new Date(2026, 10, d))); d--) cur++;
  return { today, last, clean: clean.length, cur, slips, after: today > 30 };
}
function pill() {
  const s = streak(), p = $("#streak-pill");
  if (s.before) { const h = Math.floor(s.ms / 36e5), m = Math.floor(s.ms % 36e5 / 6e4); p.innerHTML = `<b>Starts in ${h}h ${m}m</b>`; }
  else if (s.after) p.innerHTML = `<b>${s.clean}/30</b> clean days`;
  else p.innerHTML = `<b>Day ${s.cur}</b> of 30`;
  const pct = s.before ? 0 : Math.min(100, (s.last / 30) * 100);
  $("#nov-bar i").style.width = pct + "%";
  $("#nov-label").textContent = s.before ? "No Nut November 2026 starts tomorrow" : s.after ? "No Nut November 2026 is over" : `No Nut November 2026, day ${s.today} of 30`;
}

// ---------- thumbnails ----------
function drawThumb(cv, v, t, st) {
  const c = cv.getContext("2d"); c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  FLAGS.thumb = true; SCENES[v.id].draw(c, t, st); FLAGS.thumb = false;
}
function card(v) {
  const s = STUDIES[v.study], votes = store("nnh-votes", {})[v.id];
  const a = document.createElement("a"); a.className = "card"; a.href = `#/watch/${v.id}`;
  a.innerHTML = `<div class="thumb"><canvas width="480" height="270"></canvas>
      <span class="badge ${v.badge === "PLAYABLE" ? "play" : ""}">${v.badge}</span><span class="dur">${clock(v.dur)}</span></div>
    <div class="meta"><span class="title">${esc(v.title)}</span>
      <span class="chan">${CHANNELS[v.ch]} <svg class="ok" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><path d="m4.5 8.2 2.2 2.2 4.8-4.8" fill="none" stroke="#000" stroke-width="1.8"/></svg></span>
      <span class="stats"><span>${s.type} ${year(s)}</span>${votes ? `<span class="rate">${Math.round(100 * votes.up / (votes.up + votes.down))}% helped you</span>` : ""}</span></div>`;
  const cv = a.querySelector("canvas"), st = { thumb: true }, v0 = SCENES[v.id].thumbT;
  drawThumb(cv, v, v0, st);
  let raf = 0, t0 = 0;
  const loop = ts => { t0 ||= ts; drawThumb(cv, v, v0 + (ts - t0) / 1000 * 4, st); raf = requestAnimationFrame(loop); };
  a.onmouseenter = () => { if (!matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(loop); };
  a.onmouseleave = () => { cancelAnimationFrame(raf); t0 = 0; drawThumb(cv, v, v0, st); };
  return a;
}
function grid(list, cls = "") { const g = document.createElement("div"); g.className = "grid " + cls; list.forEach(v => g.append(card(v))); return g; }
function helped(v) { const x = store("nnh-votes", {})[v.id]; return x ? x.up - x.down : 0; }

const SORTS = { recommended: ["Recommended", l => l], helpful: ["Helped me most", l => [...l].sort((a, b) => helped(b) - helped(a))],
  short: ["Shortest", l => [...l].sort((a, b) => a.dur - b.dur)], playable: ["Playable", l => l.filter(v => v.badge === "PLAYABLE")],
  evidence: ["Strongest evidence", l => [...l].sort((a, b) => rank(STUDIES[a.study].type) - rank(STUDIES[b.study].type))] };
function rank(t) { return ["Meta-analysis", "Systematic review", "RCT", "Review", "Field study", "Theory", "Retracted"].indexOf(t); }

// ---------- views ----------
const main = () => $("#main");
function section(title, right = "") { const h = document.createElement("div"); h.className = "sec-head"; h.innerHTML = `<h2>${title}</h2>${right}`; return h; }
function sortBar(q, cur) {
  return `<nav class="sorts">${Object.entries(SORTS).map(([k, [l]]) => `<a href="#/videos?${new URLSearchParams({ ...q, s: k })}" class="${k === cur ? "on" : ""}">${l}</a>`).join("")}</nav>`;
}

function home() {
  const m = main(); m.innerHTML = "";
  const s = streak();
  const hero = document.createElement("div"); hero.className = "promo";
  hero.innerHTML = `<div><b>Open this tab instead of the other one.</b> Every video here is a 1 to 10 minute exercise against an urge, built on a published study.</div>
    <a class="btn btn-or" href="#/watch/urge-wave">Watch: ride the urge</a>`;
  m.append(hero);
  m.append(section("Recommended for an urge right now", sortBar({}, "recommended")));
  m.append(grid(VIDEOS.slice(0, 10)));
  m.append(section("Playable", `<a class="more" href="#/videos?s=playable">See all</a>`));
  m.append(grid(VIDEOS.filter(v => v.badge === "PLAYABLE")));
  m.append(section("What the science says", `<a class="more" href="#/research">All studies</a>`));
  m.append(grid(VIDEOS.filter(v => v.cat === "science")));
  if (s.before) document.title = "NoNutHub: No Nut November, the tab you open instead";
}

function videos(q) {
  const m = main(); m.innerHTML = "";
  const cat = CATEGORIES.find(c => c.id === q.c), sort = SORTS[q.s] ? q.s : "recommended";
  let list = cat ? VIDEOS.filter(v => v.cat === cat.id) : VIDEOS;
  list = SORTS[sort][1](list);
  m.append(section(cat ? `${cat.name} <small>${list.length} videos</small>` : `All videos <small>${list.length}</small>`, sortBar(cat ? { c: cat.id } : {}, sort)));
  m.append(list.length ? grid(list) : Object.assign(document.createElement("p"), { className: "empty", textContent: "Nothing here yet. Vote on a video to fill this list." }));
}

function categories() {
  const m = main(); m.innerHTML = "";
  m.append(section("Categories"));
  const g = document.createElement("div"); g.className = "grid cats";
  CATEGORIES.forEach(c => {
    const list = VIDEOS.filter(v => v.cat === c.id), a = document.createElement("a");
    a.className = "cat"; a.href = `#/videos?c=${c.id}`;
    a.innerHTML = `<div class="thumb"><canvas width="480" height="270"></canvas></div><span class="title">${c.name} <em>(${list.length})</em></span><span class="sub">${c.desc}</span>`;
    drawThumb(a.querySelector("canvas"), list[0], SCENES[list[0].id].thumbT, { thumb: true }); g.append(a);
  });
  m.append(g);
}

function search(q) {
  const m = main(); m.innerHTML = ""; const term = (q.q || "").trim();
  $("#q").value = term;
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? VIDEOS.filter(v => words.every(w => (v.title + " " + v.about + " " + CATEGORIES.find(c => c.id === v.cat).name).toLowerCase().includes(w))) : [];
  if (hits.length) { m.append(section(`Results for "${esc(term)}" <small>${hits.length}</small>`)); m.append(grid(hits)); return; }
  const box = document.createElement("div"); box.className = "noresults";
  box.innerHTML = `<h2>0 results for "${esc(term)}"</h2><p>NoNutHub has ${VIDEOS.length} videos and none of them are that. The urge you searched with is real though,
    and it peaks and passes within minutes. Pick one of these and give it ten.</p>`;
  m.append(box); m.append(grid(VIDEOS.slice(0, 4)));
}

function research() {
  const m = main(); m.innerHTML = "";
  m.append(section("The research behind every video"));
  const used = id => VIDEOS.filter(v => v.study === id || (v.also || []).includes(id));
  const box = document.createElement("div"); box.className = "research";
  box.innerHTML = `<p class="lead">No Nut November is a challenge, not medicine. Masturbation is not harmful, and the most quoted reason to stop
    (a testosterone peak on day 7) comes from a retracted paper. What the studies below do support: urges pass, situations beat willpower,
    plans beat intentions, and shame makes it worse. That is what the videos are built on.</p>
    <table><thead><tr><th>Study</th><th>Type</th><th>Finding</th><th>Videos</th></tr></thead><tbody>
    ${Object.entries(STUDIES).map(([id, s]) => `<tr${s.type === "Retracted" ? ' class="retracted"' : ""}>
      <td><a href="https://doi.org/${s.doi}" target="_blank" rel="noopener"><b>${s.cite}</b></a><span>${esc(s.title)}. <i>${s.venue}</i></span></td>
      <td><span class="tag">${s.type}</span></td><td>${esc(s.finding)}</td>
      <td>${used(id).map(v => `<a href="#/watch/${v.id}">${esc(v.title)}</a>`).join("")}</td></tr>`).join("")}
    </tbody></table>`;
  m.append(box);
}

function streakPage() {
  const m = main(); m.innerHTML = ""; const s = streak(), plan = store("nnh-plan", null);
  m.append(section("Your November"));
  const box = document.createElement("div"); box.className = "streak";
  const head = s.before ? `<div class="big">Starts in ${Math.floor(s.ms / 36e5)}h ${Math.floor(s.ms % 36e5 / 6e4)}m</div><p>The tracker counts November 1 to 30. It lives only in this browser.</p>`
    : `<div class="big">${s.after ? `${s.clean} of 30` : `Day ${s.cur}`}</div><p>${s.clean} clean days so far${s.slips.length ? `, ${s.slips.length} slip${s.slips.length > 1 ? "s" : ""}` : ""}. Click a day to mark or unmark a slip.</p>`;
  let cal = '<div class="cal">';
  for (let d = 1; d <= 30; d++) {
    const k = iso(new Date(2026, 10, d)), past = !s.before && d <= s.last, slipped = s.slips.includes(k);
    cal += `<button data-day="${k}" class="${past ? (slipped ? "slip" : "clean") : "future"}${!s.before && d === s.today ? " today" : ""}" ${past ? "" : "disabled"}>${d}</button>`;
  }
  cal += "</div>";
  box.innerHTML = `${head}${cal}
    <div class="plan-card"><h3>Your if-then plan</h3>${plan && plan.cue ? `<p><b>If</b> ${esc(plan.cue)}, <b>then</b> ${esc(plan.act)}.</p>` : `<p>No plan yet.</p>`}
      <a class="btn" href="#/watch/ifthen">${plan && plan.cue ? "Edit plan" : "Write one, 2 minutes"}</a></div>
    <p class="fine">A slip resets the streak, never the clean days. If porn or masturbation feels out of your control or hurts your life,
      talk to a doctor or a counsellor; that is what they are for.</p>`;
  box.querySelectorAll(".cal button:not([disabled])").forEach(b => b.onclick = () => {
    const sl = store("nnh-slips", []), k = b.dataset.day;
    save("nnh-slips", sl.includes(k) ? sl.filter(x => x !== k) : [...sl, k]); streakPage(); pill();
  });
  m.append(box);
}

// ---------- player ----------
let player = null;
function watch(id) {
  const v = byId[id]; if (!v) return home();
  const m = main(); m.innerHTML = ""; const s = STUDIES[v.study], sc = SCENES[v.id];
  const wrap = document.createElement("div"); wrap.className = "watch";
  wrap.innerHTML = `<div class="col">
      <div class="player" tabindex="0"><canvas width="${W}" height="${H}"></canvas>
        <button class="bigplay" aria-label="Play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
        <div class="ctrl"><button class="pp" aria-label="Play"></button><span class="time">0:00 / ${clock(v.dur)}</span>
          <div class="bar"><i></i></div><button class="fs" aria-label="Fullscreen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="#fff" stroke-width="2"/></svg></button></div></div>
      <div class="ui"></div>
      <h1>${esc(v.title)}</h1>
      <div class="vbar"><span class="views">${s.type}, ${year(s)}</span>
        <div class="acts"><button class="vote up">Helped</button><button class="vote down">Didn't help</button>
          <button class="share">Share</button><a href="https://doi.org/${s.doi}" target="_blank" rel="noopener">Read the study</a></div></div>
      <div class="ratebar"><i></i></div>
      <div class="chanrow"><span class="avatar">${CHANNELS[v.ch][0]}</span><div><b>${CHANNELS[v.ch]}</b><small>NoNutHub original</small></div>
        <a class="btn btn-or" href="#/streak">Track your November</a></div>
      <div class="tabs"><b>About</b></div>
      <div class="about"><p>${esc(v.about)}</p>
        <div class="src"><h3>Sources</h3>${[v.study, ...(v.also || [])].map(k => `<p><a href="https://doi.org/${STUDIES[k].doi}" target="_blank" rel="noopener">${STUDIES[k].cite}</a>: ${esc(STUDIES[k].finding)}</p>`).join("")}</div>
        <p class="cats">Category: <a href="#/videos?c=${v.cat}">${CATEGORIES.find(c => c.id === v.cat).name}</a></p></div>
    </div>
    <aside class="related"><h3>Up next</h3></aside>`;
  m.append(wrap);
  const rel = wrap.querySelector(".related");
  [...VIDEOS.filter(x => x.id !== id && x.cat === v.cat), ...VIDEOS.filter(x => x.cat !== v.cat)].slice(0, 8).forEach(x => rel.append(card(x)));

  const cv = wrap.querySelector("canvas"), ctx = cv.getContext("2d"), pl = wrap.querySelector(".player"), bar = wrap.querySelector(".bar i");
  const st = { playing: false }, pp = wrap.querySelector(".pp"), tm = wrap.querySelector(".time");
  let t = 0, last = 0, raf = 0;
  if (sc.setup) sc.setup(st, wrap.querySelector(".ui"));
  const paint = () => { sc.draw(ctx, t, st); bar.style.width = (t / v.dur * 100) + "%"; tm.textContent = `${clock(t)} / ${clock(v.dur)}`; pp.className = "pp" + (st.playing ? " on" : ""); pl.classList.toggle("paused", !st.playing); };
  const tick = ts => {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts; st.dt = dt;
    if (st.playing) { t = Math.min(v.dur, t + dt); if (t >= v.dur) { st.playing = false; ended(); } }
    paint(); raf = requestAnimationFrame(tick);
  };
  const toggle = () => { st.playing = !st.playing; last = 0; pl.focus({ preventScroll: true }); const p = store("nnh-plays", {}); if (st.playing && t === 0) { p[id] = (p[id] || 0) + 1; save("nnh-plays", p); } };
  wrap.querySelector(".bigplay").onclick = toggle; pp.onclick = toggle;
  cv.onclick = () => { if (!sc.key || !st.playing) toggle(); };
  wrap.querySelector(".bar").onclick = e => { const r = e.currentTarget.getBoundingClientRect(); t = v.dur * (e.clientX - r.left) / r.width; };
  wrap.querySelector(".fs").onclick = () => document.fullscreenElement ? document.exitFullscreen() : pl.requestFullscreen?.();
  const onKey = e => {
    if (e.target.matches("input, textarea")) return;
    if (st.playing && sc.key && sc.key(st, e)) { e.preventDefault(); return; }
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
  };
  document.addEventListener("keydown", onKey);
  function ended() { wrap.querySelector(".vote.up").classList.add("pulse"); }

  const rb = wrap.querySelector(".ratebar i");
  const showVotes = () => { const x = store("nnh-votes", {})[id]; rb.style.width = x ? (100 * x.up / (x.up + x.down)) + "%" : "0"; wrap.querySelector(".vote.up").textContent = `Helped${x ? ` ${x.up}` : ""}`; wrap.querySelector(".vote.down").textContent = `Didn't help${x ? ` ${x.down}` : ""}`; };
  wrap.querySelectorAll(".vote").forEach(b => b.onclick = () => { const all = store("nnh-votes", {}), x = all[id] || { up: 0, down: 0 }; x[b.classList.contains("up") ? "up" : "down"]++; all[id] = x; save("nnh-votes", all); showVotes(); });
  wrap.querySelector(".share").onclick = async e => { try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; } catch { e.target.textContent = location.href; } };
  showVotes(); raf = requestAnimationFrame(tick);
  player = () => { cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); };
}

// ---------- router ----------
function route() {
  if (player) { player(); player = null; }
  const [path, qs] = (location.hash.slice(1) || "/").split("?"), q = Object.fromEntries(new URLSearchParams(qs || ""));
  const parts = path.split("/").filter(Boolean);
  document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("on", a.dataset.r === (parts[0] || "home")));
  document.title = "NoNutHub"; if (parts[0] !== "search") $("#q").value = "";
  if (parts[0] === "watch") { watch(parts[1]); document.title = `${byId[parts[1]]?.title || "Video"} - NoNutHub`; }
  else if (parts[0] === "videos") videos(q);
  else if (parts[0] === "categories") categories();
  else if (parts[0] === "search") search(q);
  else if (parts[0] === "research") research();
  else if (parts[0] === "streak") streakPage();
  else home();
  window.scrollTo(0, 0);
}

$("#search").onsubmit = e => { e.preventDefault(); location.hash = `#/search?q=${encodeURIComponent($("#q").value)}`; };
$("#menu").onclick = () => document.body.classList.toggle("navopen");
document.querySelectorAll(".nav a").forEach(a => a.addEventListener("click", () => document.body.classList.remove("navopen")));
const gate = $("#gate");
if (store("nnh-gate", false)) gate.remove();
else { $("#enter").onclick = () => { save("nnh-gate", true); gate.remove(); }; $("#enter").focus(); }
addEventListener("hashchange", route);
route(); pill(); setInterval(pill, 30000);
