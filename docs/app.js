import { STUDIES, CATEGORIES, VIDEOS as PINNED, FETCHED } from "./data.js";

// Hand-picked videos from data.js first, then the daily list from tools/fetch_videos.py (docs/videos.json).
const more = await fetch("videos.json").then(r => r.ok ? r.json() : { videos: [] }).catch(() => ({ videos: [] }));
const VIDEOS = [...PINNED, ...more.videos.filter(v => !PINNED.some(p => p.id === v.id) && CATEGORIES.some(c => c.id === v.cat))];

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const byId = Object.fromEntries(VIDEOS.map(v => [v.id, v]));
const catOf = v => CATEGORIES.find(c => c.id === v.cat);
const img = (id, f = "mqdefault") => `https://i.ytimg.com/vi/${id}/${f}.jpg`;
function clock(s) { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; }
function views(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n); }

// ---------- No Nut November clock ----------
const NOV1 = new Date(2026, 10, 1), DAY = 864e5;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function streak() {
  const now = new Date(), slips = store("nnh-slips", []);
  const today = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - NOV1) / DAY) + 1;   // 1..30 in November
  if (today < 1) return { before: true, ms: NOV1 - now, slips };
  const last = Math.min(today, 30); let clean = 0, cur = 0;
  for (let d = 1; d <= last; d++) if (!slips.includes(iso(new Date(2026, 10, d)))) clean++;
  for (let d = last; d >= 1 && !slips.includes(iso(new Date(2026, 10, d))); d--) cur++;
  return { today, last, clean, cur, slips, after: today > 30 };
}
const until = ms => `${Math.floor(ms / 36e5)}h ${Math.floor(ms % 36e5 / 6e4)}m`;
function pill() {
  const s = streak(), p = $("#streak-pill");
  p.innerHTML = s.before ? `<b>Starts in ${until(s.ms)}</b>` : s.after ? `<b>${s.clean}/30</b> clean days` : `<b>Day ${s.cur}</b> of 30`;
  $("#nov-bar i").style.width = (s.before ? 0 : Math.min(100, s.last / 30 * 100)) + "%";
  $("#nov-label").textContent = s.before ? "No Nut November 2026 starts tomorrow" : s.after ? "No Nut November 2026 is over" : `No Nut November 2026, day ${s.today} of 30`;
}

// ---------- cards ----------
function card(v) {
  const votes = store("nnh-votes", {})[v.id];
  const a = document.createElement("a"); a.className = "card"; a.href = `#/watch/${v.id}`;
  a.innerHTML = `<div class="thumb"><img src="${img(v.id)}" alt="" loading="lazy" width="320" height="180">
      ${v.sec >= 600 ? '<span class="badge">HD</span>' : ""}<span class="dur">${clock(v.sec)}</span></div>
    <div class="meta"><span class="title">${esc(v.title)}</span>
      <span class="chan">${esc(v.ch)} <svg class="ok" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><path d="m4.5 8.2 2.2 2.2 4.8-4.8" fill="none" stroke="#000" stroke-width="1.8"/></svg></span>
      <span class="stats"><span>${views(v.views)} views</span>${votes ? `<span class="rate">${Math.round(100 * votes.up / (votes.up + votes.down))}% helped you</span>` : `<span>${esc(catOf(v).name)}</span>`}</span></div>`;
  const im = a.querySelector("img"); let timer = 0;                     // hover preview: YouTube's three storyboard frames
  a.onmouseenter = () => { let i = 0; timer = setInterval(() => { im.src = img(v.id, `mq${(i++ % 3) + 1}`); }, 650); };
  a.onmouseleave = () => { clearInterval(timer); im.src = img(v.id); };
  return a;
}
function grid(list) { const g = document.createElement("div"); g.className = "grid"; list.forEach(v => g.append(card(v))); return g; }
function feed(list, step = 25) {                                        // grid that loads the next batch when you scroll near its end
  const wrap = document.createElement("div"), g = grid([]), end = document.createElement("div"); let n = 0;
  end.className = "loadmore"; wrap.append(g, end);
  const next = () => { list.slice(n, n + step).forEach(v => g.append(card(v))); n += step; end.textContent = n < list.length ? "Loading more videos" : `That's all ${list.length}. New videos are added every day.`; return n < list.length; };
  next();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !next()) io.disconnect(); }, { rootMargin: "800px" });
  io.observe(end); return wrap;
}
function helped(v) { const x = store("nnh-votes", {})[v.id]; return x ? x.up - x.down : null; }
const SORTS = { recommended: ["Recommended", l => l], views: ["Most viewed", l => [...l].sort((a, b) => b.views - a.views)],
  short: ["Under 10 min", l => l.filter(v => v.sec < 600).sort((a, b) => a.sec - b.sec)], long: ["Longest", l => [...l].sort((a, b) => b.sec - a.sec)],
  helpful: ["Helped me most", l => l.filter(v => helped(v) !== null).sort((a, b) => helped(b) - helped(a))] };
// "Recommended" interleaves the categories so the first row already shows the range
const MIX = (() => { const by = CATEGORIES.map(c => VIDEOS.filter(v => v.cat === c.id)), out = []; for (let i = 0; out.length < VIDEOS.length; i++) by.forEach(l => l[i] && out.push(l[i])); return out; })();

// ---------- views ----------
const main = () => $("#main");
function section(title, right = "") { const h = document.createElement("div"); h.className = "sec-head"; h.innerHTML = `<h2>${title}</h2>${right}`; return h; }
function sortBar(q, cur) {
  return `<nav class="sorts">${Object.entries(SORTS).map(([k, [l]]) => `<a href="#/videos?${new URLSearchParams({ ...q, s: k })}" class="${k === cur ? "on" : ""}">${l}</a>`).join("")}</nav>`;
}
const studyLinks = keys => keys.map(k => `<a href="https://doi.org/${STUDIES[k].doi}" target="_blank" rel="noopener">${STUDIES[k].cite}</a>`).join(", ");

function home() {
  const m = main(); m.innerHTML = "";
  const hero = document.createElement("div"); hero.className = "promo";
  hero.innerHTML = `<div><b>Open this tab instead of the other one.</b> ${VIDEOS.length} real videos that help against an urge: guided urge surfing,
    breathing, workouts, cold water and long, absorbing videos your brain can sink into. Every category is backed by a study.</div>
    <a class="btn btn-or" href="#/watch/pXWQXDxXg5U">Start with a 3 minute urge surf</a>`;
  m.append(hero);
  m.append(section("Recommended for an urge right now", sortBar({}, "recommended")));
  m.append(grid(MIX.slice(0, 15)));
  for (const c of CATEGORIES) {
    const list = VIDEOS.filter(v => v.cat === c.id);
    m.append(section(`${c.name} <small>${c.desc}</small>`, `<a class="more" href="#/videos?c=${c.id}">See all ${list.length}</a>`));
    m.append(grid(list.slice(0, 5)));
  }
  const shown = new Set([...MIX.slice(0, 15), ...CATEGORIES.flatMap(c => VIDEOS.filter(v => v.cat === c.id).slice(0, 5))]);
  m.append(section("Keep scrolling"));
  m.append(feed(MIX.filter(v => !shown.has(v))));
}

function videos(q) {
  const m = main(); m.innerHTML = "";
  const cat = CATEGORIES.find(c => c.id === q.c), sort = SORTS[q.s] ? q.s : "recommended";
  const list = SORTS[sort][1](cat ? VIDEOS.filter(v => v.cat === cat.id) : MIX);
  m.append(section(cat ? `${cat.name} <small>${list.length} videos</small>` : `All videos <small>${list.length}</small>`, sortBar(cat ? { c: cat.id } : {}, sort)));
  if (cat) { const p = document.createElement("p"); p.className = "catwhy"; p.innerHTML = `${esc(cat.why)} <span>${studyLinks(cat.studies)}</span>`; m.append(p); }
  m.append(list.length ? feed(list) : Object.assign(document.createElement("p"), { className: "empty", textContent: "Nothing here yet. Rate a few videos with Helped or Didn't help and they show up here." }));
}

function categories() {
  const m = main(); m.innerHTML = ""; m.append(section("Categories"));
  const g = document.createElement("div"); g.className = "grid cats";
  CATEGORIES.forEach(c => {
    const list = VIDEOS.filter(v => v.cat === c.id), a = document.createElement("a"); a.className = "cat"; a.href = `#/videos?c=${c.id}`;
    a.innerHTML = `<div class="thumb"><img src="${img(list[0].id)}" alt="" loading="lazy"></div><span class="title">${c.name} <em>(${list.length})</em></span><span class="sub">${c.desc}</span>`;
    g.append(a);
  });
  m.append(g);
}

function search(q) {
  const m = main(); m.innerHTML = ""; const term = (q.q || "").trim(); $("#q").value = term;
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? VIDEOS.filter(v => words.every(w => `${v.title} ${v.ch} ${catOf(v).name}`.toLowerCase().includes(w))) : [];
  if (hits.length) { m.append(section(`Results for "${esc(term)}" <small>${hits.length}</small>`)); m.append(feed(hits)); return; }
  const box = document.createElement("div"); box.className = "noresults";
  box.innerHTML = `<h2>0 results for "${esc(term)}"</h2><p>Not here. The urge you searched with is real though, and it peaks and passes within minutes.
    Pick one of these and give it ten.</p>`;
  m.append(box); m.append(grid(MIX.slice(0, 5)));
}

function research() {
  const m = main(); m.innerHTML = ""; m.append(section("The research behind every category"));
  const used = id => CATEGORIES.filter(c => c.studies.includes(id));
  const box = document.createElement("div"); box.className = "research";
  box.innerHTML = `<p class="lead">No Nut November is a challenge, not medicine. Masturbation is not harmful, and the most quoted reason to stop
    (a testosterone peak on day 7) comes from a retracted paper. What the studies below do support: urges pass, moving helps fast, situations
    beat willpower, plans beat intentions, and shame makes it worse. The categories are built on that.</p>
    <table><thead><tr><th>Study</th><th>Type</th><th>Finding</th><th>Used for</th></tr></thead><tbody>
    ${Object.entries(STUDIES).map(([id, s]) => `<tr${s.type === "Retracted" ? ' class="retracted"' : ""}>
      <td><a href="https://doi.org/${s.doi}" target="_blank" rel="noopener"><b>${s.cite}</b></a><span>${esc(s.title)}. <i>${s.venue}</i></span></td>
      <td><span class="tag">${s.type}</span></td><td>${esc(s.finding)}</td>
      <td>${used(id).map(c => `<a href="#/videos?c=${c.id}">${c.name}</a>`).join("") || (s.type === "Retracted" ? "Why the day 7 claim is out" : id === "gollwitzer" ? '<a href="#/streak">If-then plan</a>' : "Background")}</td></tr>`).join("")}
    </tbody></table>
    <p class="fine">Video titles, channels, lengths and view counts are from YouTube (hand-picked list ${FETCHED}, daily list ${more.fetched || "not loaded"}). The videos belong to their channels and play in YouTube's own player.</p>`;
  m.append(box);
}

function streakPage() {
  const m = main(); m.innerHTML = ""; const s = streak(), plan = store("nnh-plan", { cue: "", act: "" });
  m.append(section("Your November"));
  const box = document.createElement("div"); box.className = "streak";
  const head = s.before ? `<div class="big">Starts in ${until(s.ms)}</div><p>The tracker counts November 1 to 30. It lives only in this browser.</p>`
    : `<div class="big">${s.after ? `${s.clean} of 30` : `Day ${s.cur}`}</div><p>${s.clean} clean days so far${s.slips.length ? `, ${s.slips.length} slip${s.slips.length > 1 ? "s" : ""}` : ""}. Click a day to mark or unmark a slip.</p>`;
  let cal = '<div class="cal">';
  for (let d = 1; d <= 30; d++) {
    const k = iso(new Date(2026, 10, d)), past = !s.before && d <= s.last;
    cal += `<button data-day="${k}" class="${past ? (s.slips.includes(k) ? "slip" : "clean") : "future"}${!s.before && d === s.today ? " today" : ""}" ${past ? "" : "disabled"}>${d}</button>`;
  }
  box.innerHTML = `${head}${cal}</div>
    <form class="plan-card"><h3>Your if-then plan</h3>
      <p>Specific beats strong: a time, a place, one action. If-then plans had a medium-to-large effect on reaching goals across 94 tests
        (${studyLinks(["gollwitzer"])}).</p>
      <label>If <input name="cue" maxlength="90" placeholder="it is after 23:00 and I am in bed with my phone"></label>
      <label>then <input name="act" maxlength="90" placeholder="I put it on the charger in the kitchen"></label>
      <button class="btn btn-or">Save plan</button> <span class="saved"></span></form>
    <p class="fine">A slip resets the streak, never the clean days; shame makes it worse, not better (${studyLinks(["grubbs"])}).
      If porn or masturbation feels out of your control or hurts your life, talk to a doctor or a counsellor.</p>`;
  const f = box.querySelector("form"); f.cue.value = plan.cue; f.act.value = plan.act;
  f.onsubmit = e => { e.preventDefault(); save("nnh-plan", { cue: f.cue.value.trim(), act: f.act.value.trim() }); f.querySelector(".saved").textContent = "Saved in this browser."; };
  box.querySelectorAll(".cal button:not([disabled])").forEach(b => b.onclick = () => {
    const sl = store("nnh-slips", []), k = b.dataset.day; save("nnh-slips", sl.includes(k) ? sl.filter(x => x !== k) : [...sl, k]); streakPage(); pill();
  });
  m.append(box);
}

// ---------- watch ----------
function watch(id) {
  const v = byId[id]; if (!v) return home();
  const m = main(); m.innerHTML = ""; const c = catOf(v);
  const wrap = document.createElement("div"); wrap.className = "watch";
  wrap.innerHTML = `<div class="col">
      <div class="player"><img src="${img(v.id, "hqdefault")}" alt="">
        <button class="bigplay" aria-label="Play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
        <span class="dur">${clock(v.sec)}</span></div>
      <p class="ythint" hidden>YouTube asks you to sign in or to confirm you're not a bot? That check comes from YouTube and mostly hits VPN
        connections. Sign in to YouTube in this browser, pause the VPN, or <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">watch it on YouTube</a>.</p>
      <h1>${esc(v.title)}</h1>
      <div class="vbar"><span class="views">${v.views.toLocaleString("en")} views on YouTube${v.age ? `, uploaded ${esc(v.age)}` : ""}</span>
        <div class="acts"><button class="vote up">Helped</button><button class="vote down">Didn't help</button>
          <button class="share">Share</button><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">Open on YouTube</a></div></div>
      <div class="ratebar"><i></i></div>
      <div class="chanrow"><span class="avatar">${esc(v.ch[0])}</span><div><b>${esc(v.ch)}</b><small>YouTube channel</small></div>
        <a class="btn btn-or" href="#/streak">Track your November</a></div>
      <div class="tabs"><b>Why this helps</b></div>
      <div class="about"><p>${esc(c.why)}</p>
        <div class="src"><h3>Sources</h3>${c.studies.map(k => `<p><a href="https://doi.org/${STUDIES[k].doi}" target="_blank" rel="noopener">${STUDIES[k].cite}</a>: ${esc(STUDIES[k].finding)}</p>`).join("")}</div>
        <p class="cats">Category: <a href="#/videos?c=${c.id}">${c.name}</a></p></div>
    </div>
    <aside class="related"><h3>Up next</h3></aside>`;
  m.append(wrap);
  const rel = wrap.querySelector(".related");
  [...VIDEOS.filter(x => x.id !== id && x.cat === v.cat), ...MIX.filter(x => x.cat !== v.cat)].slice(0, 10).forEach(x => rel.append(card(x)));
  wrap.querySelector(".bigplay").onclick = () => {                     // YouTube's player loads only on click
    const p = store("nnh-plays", {}); p[id] = (p[id] || 0) + 1; save("nnh-plays", p);
    wrap.querySelector(".player").innerHTML = `<iframe src="https://www.youtube.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}"
      title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    wrap.querySelector(".ythint").hidden = false;
  };
  const rb = wrap.querySelector(".ratebar i");
  const showVotes = () => { const x = store("nnh-votes", {})[id]; rb.style.width = x ? (100 * x.up / (x.up + x.down)) + "%" : "0";
    wrap.querySelector(".vote.up").textContent = `Helped${x ? ` ${x.up}` : ""}`; wrap.querySelector(".vote.down").textContent = `Didn't help${x ? ` ${x.down}` : ""}`; };
  wrap.querySelectorAll(".vote").forEach(b => b.onclick = () => { const all = store("nnh-votes", {}), x = all[id] || { up: 0, down: 0 }; x[b.classList.contains("up") ? "up" : "down"]++; all[id] = x; save("nnh-votes", all); showVotes(); });
  wrap.querySelector(".share").onclick = async e => { try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; } catch { e.target.textContent = location.href; } };
  showVotes();
}

// ---------- router ----------
function route() {
  const [path, qs] = (location.hash.slice(1) || "/").split("?"), q = Object.fromEntries(new URLSearchParams(qs || ""));
  const parts = path.split("/").filter(Boolean), r = parts[0] === "videos" && q.c ? "categories" : parts[0] || "home";
  document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("on", a.dataset.r === r));
  document.title = "NoNutHub"; if (parts[0] !== "search") $("#q").value = "";
  if (parts[0] === "watch") { watch(parts[1]); if (byId[parts[1]]) document.title = `${byId[parts[1]].title} - NoNutHub`; }
  else if (parts[0] === "videos") videos(q);
  else if (parts[0] === "categories") categories();
  else if (parts[0] === "search") search(q);
  else if (parts[0] === "research") research();
  else if (parts[0] === "streak") streakPage();
  else home();
  window.scrollTo(0, 0);
}

$("#q").placeholder = `Search ${VIDEOS.length} videos you won't regret`;
$("#search").onsubmit = e => { e.preventDefault(); location.hash = `#/search?q=${encodeURIComponent($("#q").value)}`; };
$("#menu").onclick = () => document.body.classList.toggle("navopen");
document.querySelectorAll(".nav a").forEach(a => a.addEventListener("click", () => document.body.classList.remove("navopen")));
const gate = $("#gate");
if (store("nnh-gate", false)) gate.remove();
else { $("#enter").onclick = () => { save("nnh-gate", true); gate.remove(); }; $("#enter").focus(); }
addEventListener("hashchange", route);
route(); pill(); setInterval(pill, 30000);
