// Canvas renderers for the videos. Every scene draws into a 1280x720 coordinate space.
// draw(ctx, t, st) paints the frame for second t; setup(st, ui) may add controls below the frame.
// Thumbnails are the same renderer at a fixed second, so the grid shows the real video.

export const W = 1280, H = 720;
export const FLAGS = { thumb: false };          // thumbnails skip the subtitle strip
const OR = "#ff9000", WHITE = "#fff", GREY = "#9b9b9b", DARK = "#141414";
const FONT = "Arial, Helvetica, sans-serif";

function bg(c, top, bottom) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function text(c, s, x, y, size, color = WHITE, align = "center", weight = "bold") {
  c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y);
}
function lines(c, s, x, y, size, maxW, color = WHITE, align = "center", weight = "bold", lh = 1.2) {
  c.font = `${weight} ${size}px ${FONT}`;
  const out = []; let cur = "";
  for (const w of s.split(" ")) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  out.forEach((l, i) => text(c, l, x, y + (i - (out.length - 1) / 2) * size * lh, size, color, align, weight));
}
function caption(c, s) {                       // subtitle strip at the bottom of the frame
  if (!s || FLAGS.thumb) return;
  c.font = `bold 34px ${FONT}`; const w = Math.min(W - 120, c.measureText(s).width + 48);
  c.fillStyle = "rgba(0,0,0,.72)"; c.fillRect((W - w) / 2, H - 120, w, 62);
  lines(c, s, W / 2, H - 89, 34, W - 160);
}
function clock(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function at(script, t) { let cur = ""; for (const [s, line] of script) if (t >= s) cur = line; return cur; }
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function store(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

// ---------- urge surfing ----------
const WAVE = [[0, "Notice the urge. You do not have to do anything with it."], [45, "Where do you feel it? Chest, stomach, hands?"],
  [110, "Rate it from 1 to 10. Just a number."], [170, "Breathe into it. Let it get bigger if it wants to."],
  [240, "This is the top of the wave. Stay on the board."], [320, "Rate it again. Is it the same number?"],
  [400, "It is getting smaller without you doing anything."], [490, "Notice what you want to do next instead."],
  [560, "That was one wave. The next one will pass the same way."]];
function waveLevel(t) { const u = t / 600, p = 0.4; return u < p ? ease(u / p) : 1 - ease((u - p) / (1 - p)) * 0.85; }
const wave = {
  thumbT: 240,
  draw(c, t) {
    bg(c, "#0b2a3d", "#04121c");
    const lvl = waveLevel(t);
    for (let k = 0; k < 4; k++) {
      const amp = 40 + lvl * 190 * (1 - k * 0.18), base = 470 + k * 50;
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) c.lineTo(x, base - amp * Math.sin(x / (220 + k * 40) + t * (0.6 + k * 0.15)) * (0.6 + 0.4 * Math.sin(x / 600 + k)));
      c.lineTo(W, H); c.closePath(); c.fillStyle = `rgba(${40 + k * 10},${140 - k * 20},${190 - k * 30},${0.35 + k * 0.15})`; c.fill();
    }
    text(c, "URGE LEVEL", 80, 70, 22, GREY, "left");
    c.fillStyle = "#ffffff22"; c.fillRect(80, 92, 300, 14); c.fillStyle = OR; c.fillRect(80, 92, 300 * lvl, 14);
    text(c, clock(600 - t), W - 80, 80, 44, WHITE, "right");
    caption(c, at(WAVE, t));
  },
};

// ---------- falling blocks (playable) ----------
const SHAPES = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]]];
const COLORS = ["#ff9000", "#ffc04d", "#e8e8e8", "#7c7c7c", "#ffb366", "#c96f00", "#bdbdbd"];
const COLS = 10, ROWS = 20, CELL = 32;
function newPiece(st) { const i = (st.seed = (st.seed * 9301 + 49297) % 233280) % 7; return { m: SHAPES[i], c: i, x: 3, y: 0 }; }
function fits(st, m, x, y) { return m.every((r, j) => r.every((v, i) => !v || (x + i >= 0 && x + i < COLS && y + j < ROWS && !(st.board[y + j]?.[x + i] >= 0)))); }
function rotate(m) { return m[0].map((_, i) => m.map(r => r[i]).reverse()); }
function blocksInit(st) { st.board = Array.from({ length: ROWS }, () => Array(COLS).fill(-1)); st.seed = st.seed || 7; st.p = newPiece(st); st.fall = 0; st.lines = st.lines || 0; }
function blocksMove(st, dx, dy, rot) {
  if (!st.board) blocksInit(st);
  const m = rot ? rotate(st.p.m) : st.p.m;
  if (fits(st, m, st.p.x + dx, st.p.y + dy)) { st.p.m = m; st.p.x += dx; st.p.y += dy; return true; }
  if (dy) {                                                   // landed: lock, clear lines, next piece
    st.p.m.forEach((r, j) => r.forEach((v, i) => { if (v && st.p.y + j >= 0) st.board[st.p.y + j][st.p.x + i] = st.p.c; }));
    st.board = st.board.filter(r => r.some(v => v < 0)); const n = ROWS - st.board.length; st.lines += n;
    while (st.board.length < ROWS) st.board.unshift(Array(COLS).fill(-1));
    st.p = newPiece(st); if (!fits(st, st.p.m, st.p.x, st.p.y)) { const l = st.lines; blocksInit(st); st.lines = l; }
  }
  return false;
}
const blocks = {
  thumbT: 70,
  draw(c, t, st) {
    bg(c, "#1c1c1c", "#0a0a0a");
    if (!st.board) { blocksInit(st); if (st.thumb) { for (let y = 14; y < 20; y++) for (let x = 0; x < 10; x++) if ((x * 7 + y * 3) % 5) st.board[y][x] = (x + y) % 7; st.p.y = 6; st.p.x = 4; } }
    if (!st.thumb && st.playing) { st.fall += st.dt || 0; const speed = Math.max(0.18, 0.7 - st.lines * 0.02); while (st.fall > speed) { st.fall -= speed; blocksMove(st, 0, 1); } }
    const ox = (W - COLS * CELL) / 2, oy = (H - ROWS * CELL) / 2;
    c.fillStyle = "#000"; c.fillRect(ox - 6, oy - 6, COLS * CELL + 12, ROWS * CELL + 12);
    c.strokeStyle = "#2a2a2a"; c.lineWidth = 1;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = st.board[y][x]; if (v >= 0) { c.fillStyle = COLORS[v]; c.fillRect(ox + x * CELL + 1, oy + y * CELL + 1, CELL - 2, CELL - 2); }
      else c.strokeRect(ox + x * CELL + .5, oy + y * CELL + .5, CELL - 1, CELL - 1);
    }
    st.p.m.forEach((r, j) => r.forEach((v, i) => { if (v) { c.fillStyle = COLORS[st.p.c]; c.fillRect(ox + (st.p.x + i) * CELL + 1, oy + (st.p.y + j) * CELL + 1, CELL - 2, CELL - 2); } }));
    text(c, clock(180 - t), 160, 120, 64, WHITE);
    text(c, "left", 160, 170, 22, GREY, "center", "normal");
    text(c, String(st.lines), W - 160, 120, 64, OR);
    text(c, "lines", W - 160, 170, 22, GREY, "center", "normal");
    if (!st.thumb) lines(c, "Arrow keys: move, up: rotate, down: drop", W - 160, 560, 20, 220, GREY, "center", "normal");
    if (t >= 179) { c.fillStyle = "rgba(0,0,0,.7)"; c.fillRect(0, 0, W, H); lines(c, "Three minutes. Rate the craving again: lower?", W / 2, H / 2, 54, 900); }
  },
  setup(st, ui) {
    const pad = el("div", "pad");
    [["Left", () => blocksMove(st, -1, 0)], ["Rotate", () => blocksMove(st, 0, 0, true)], ["Drop", () => { while (blocksMove(st, 0, 1)); }], ["Right", () => blocksMove(st, 1, 0)]]
      .forEach(([l, f]) => { const b = el("button", "btn", l); b.onclick = f; pad.append(b); });
    ui.append(pad);
  },
  key(st, e) {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], s: [0, 1] }[e.key];
    if (k) { blocksMove(st, k[0], k[1]); return true; }
    if (e.key === "ArrowUp" || e.key === "w") { blocksMove(st, 0, 0, true); return true; }
    return false;
  },
};

// ---------- push-ups (playable) ----------
const pushups = {
  thumbT: 31,
  draw(c, t, st) {
    bg(c, "#2b1500", "#0d0700");
    const ph = (Math.sin(t * Math.PI / 1.5) + 1) / 2;          // one rep every 3 s
    const gy = 560, hy = 460 + ph * 60;
    c.strokeStyle = WHITE; c.lineWidth = 14; c.lineCap = "round";
    c.beginPath(); c.moveTo(380, gy); c.lineTo(820, hy); c.stroke();               // body
    c.beginPath(); c.arc(860, hy - 22, 30, 0, Math.PI * 2); c.fillStyle = WHITE; c.fill();
    c.beginPath(); c.moveTo(780, hy + 4); c.lineTo(770 + ph * 20, gy - 40 + ph * 10); c.lineTo(790, gy); c.stroke();  // arm
    c.fillStyle = OR; c.fillRect(300, gy + 10, 680, 8);
    text(c, ph > 0.5 ? "DOWN" : "UP", 640, 300, 40, OR);
    const n = st.reps || 0;
    text(c, `${n} / 20`, 640, 160, 120, n >= 20 ? OR : WHITE);
    text(c, clock(120 - t), W - 80, 70, 40, WHITE, "right");
    if (n >= 20) caption(c, "Twenty. Drink some water and check the urge.");
    else caption(c, t < 6 ? "Hands under shoulders. Knees down counts." : "Press the button or space after every rep.");
  },
  setup(st, ui) {
    const b = el("button", "btn btn-or big", "Rep done"); b.onclick = () => { st.reps = (st.reps || 0) + 1; };
    ui.append(b);
  },
  key(st, e) { if (e.key === " ") { st.reps = (st.reps || 0) + 1; return true; } return false; },
};

// ---------- walk ----------
const WALK = [[0, "Shoes on. Phone in your pocket, screen off."], [40, "Out of the room. Out of the building if you can."],
  [120, "Look at three things that are far away."], [220, "Walk a little faster than comfortable."],
  [330, "Name five sounds you can hear."], [440, "Turn around when the timer hits zero, not before."], [560, "Back inside. The urge had ten minutes to leave."]];
const walk = {
  thumbT: 200,
  draw(c, t) {
    bg(c, "#12301a", "#07150b");
    c.strokeStyle = "#2d5a37"; c.lineWidth = 18; c.lineCap = "round"; c.beginPath();
    for (let x = 0; x <= W; x += 10) c.lineTo(x, 420 + 90 * Math.sin(x / 210));
    c.stroke();
    const steps = Math.floor(t * 1.8);
    for (let i = 0; i < 26; i++) {
      const x = ((i * 52 + t * 40) % (W + 60)) - 30, y = 420 + 90 * Math.sin(x / 210) + (i % 2 ? 14 : -14);
      c.fillStyle = i % 2 ? "#ffffffaa" : "#ffffff66"; c.beginPath(); c.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2); c.fill();
    }
    text(c, clock(600 - t), 640, 200, 150, WHITE);
    text(c, `about ${steps.toLocaleString("en")} steps`, 640, 290, 28, GREY, "center", "normal");
    caption(c, at(WALK, t));
  },
};

// ---------- slow breathing ----------
const breathe = {
  thumbT: 4,
  draw(c, t) {
    bg(c, "#1a1030", "#090512");
    const cyc = t % 10, inh = cyc < 5, k = inh ? ease(cyc / 5) : 1 - ease((cyc - 5) / 5);
    const r = 90 + k * 170;
    c.beginPath(); c.arc(640, 330, r + 30, 0, Math.PI * 2); c.fillStyle = "#ff900018"; c.fill();
    c.beginPath(); c.arc(640, 330, r, 0, Math.PI * 2); c.fillStyle = "#ff900055"; c.fill();
    c.lineWidth = 4; c.strokeStyle = OR; c.stroke();
    text(c, inh ? "Breathe in" : "Breathe out", 640, 330, 52);
    text(c, String(Math.ceil(5 - (cyc % 5))), 640, 392, 30, "#ffd59a");
    text(c, `${Math.min(30, Math.floor(t / 10) + 1)} / 30`, 80, 70, 36, WHITE, "left");
    text(c, clock(300 - t), W - 80, 70, 40, WHITE, "right");
    caption(c, t < 20 ? "In through the nose for five, out for five." : t > 280 ? "Six breaths a minute. Check how you feel." : "");
  },
};

// ---------- cold shower ----------
const cold = {
  thumbT: 24,
  draw(c, t, st) {
    bg(c, "#0a3550", "#031522");
    for (let i = 0; i < 90; i++) {
      const x = (i * 137) % W, y = ((i * 89 + t * 520) % (H + 80)) - 40;
      c.strokeStyle = "#bfe6ff55"; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 34); c.stroke();
    }
    const left = 90 - t, phase = t < 30 ? "30 seconds" : t < 60 ? "60 seconds" : "90 seconds";
    text(c, clock(left), 640, 300, 200, WHITE);
    text(c, `cold water, aiming for ${phase}`, 640, 420, 32, "#bfe6ff", "center", "normal");
    const th = Math.min(1, t / 90);
    c.fillStyle = "#ffffff22"; c.fillRect(1120, 160, 34, 400); c.fillStyle = "#66c7ff"; c.fillRect(1120, 160 + 400 * (1 - th), 34, 400 * th);
    caption(c, t < 3 ? "Turn the tap to cold now." : t >= 89 ? "Done. Towel, clothes, out of the bathroom." : t > 28 && t < 32 ? "30 seconds. Stop here or go for 60." : t > 58 && t < 62 ? "60 seconds. Last 30." : "");
  },
};

// ---------- if-then plan (playable) ----------
const ifthen = {
  thumbT: 30,
  draw(c, t, st) {
    bg(c, "#1d1d1d", "#0b0b0b");
    const p = st.thumb ? { cue: "it is after 23:00 and I'm in bed with my phone", act: "it goes on the charger in the kitchen" } : (st.plan || store("nnh-plan", { cue: "", act: "" }));
    text(c, "IF", 140, 220, 90, OR, "left"); lines(c, p.cue || "...", 760, 220, 44, 860, p.cue ? WHITE : GREY);
    text(c, "THEN", 140, 420, 90, OR, "left"); lines(c, p.act || "...", 800, 420, 44, 780, p.act ? WHITE : GREY);
    text(c, clock(120 - t), W - 80, 70, 40, WHITE, "right");
    caption(c, st.thumb ? "" : "Specific beats strong: a time, a place, one action.");
  },
  setup(st, ui) {
    st.plan = store("nnh-plan", { cue: "", act: "" });
    const f = el("form", "plan");
    f.innerHTML = `<label>If <input name="cue" maxlength="90" placeholder="it is after 23:00 and I am in bed with my phone"></label>
      <label>then <input name="act" maxlength="90" placeholder="I put it on the charger in the kitchen"></label><button class="btn btn-or">Save plan</button><span class="saved"></span>`;
    f.cue.value = st.plan.cue; f.act.value = st.plan.act;
    f.oninput = () => { st.plan = { cue: f.cue.value.trim(), act: f.act.value.trim() }; };
    f.onsubmit = e => { e.preventDefault(); save("nnh-plan", st.plan); f.querySelector(".saved").textContent = "Saved. It is on your streak page."; };
    ui.append(f);
  },
};

// ---------- testosterone claim (retracted) ----------
const testo = {
  thumbT: 150,
  draw(c, t) {
    bg(c, "#1e1e1e", "#0c0c0c");
    text(c, "Serum testosterone, % of baseline (Jiang et al. 2003)", 640, 70, 30, WHITE);
    const vals = [100, 101, 99, 102, 103, 104, 145.7, 106, 103, 101], ox = 200, base = 600, sc = 2.6, grow = ease(t / 40);
    c.strokeStyle = "#444"; c.lineWidth = 2; c.beginPath(); c.moveTo(ox - 20, base - 100 * sc); c.lineTo(ox + 900, base - 100 * sc); c.stroke();
    vals.forEach((v, i) => {
      const h = v * sc * grow; c.fillStyle = i === 6 ? OR : "#5a5a5a"; c.fillRect(ox + i * 90, base - h, 60, h);
      text(c, `day ${i + 1}`, ox + i * 90 + 30, base + 26, 20, GREY, "center", "normal");
    });
    if (grow > .9) text(c, "145.7%", ox + 6 * 90 + 30, base - vals[6] * sc - 26, 30, OR);
    text(c, "illustration of the claim; the other bars are not the paper's data", 640, 680, 18, GREY, "center", "normal");
    if (t > 60) {
      c.save(); c.translate(640, 320); c.rotate(-0.18); const a = ease((t - 60) / 4);
      c.globalAlpha = a; c.strokeStyle = "#e0312b"; c.lineWidth = 12; c.strokeRect(-330, -80, 660, 160);
      text(c, "RETRACTED", 0, -8, 110, "#e0312b"); text(c, "by the journal, 2021", 0, 56, 30, "#e0312b"); c.restore();
    }
    caption(c, at([[0, "The number every No Nut November post quotes."], [30, "28 volunteers. No control group."], [60, ""], [75, "The journal retracted the paper in 2021."],
      [130, "Short porn abstinence is barely studied (Fernandez et al. 2020)."], [190, "Do it because you want to, not for this chart."]], t));
  },
};

// ---------- habit curve ----------
const habit = {
  thumbT: 170,
  draw(c, t) {
    bg(c, "#161616", "#070707");
    const ox = 140, oy = 600, gw = 1000, gh = 420, maxD = 254, k = 66 / 3, shown = ease(t / 120) * maxD;
    c.strokeStyle = "#444"; c.lineWidth = 2; c.beginPath(); c.moveTo(ox, oy - gh); c.lineTo(ox, oy); c.lineTo(ox + gw, oy); c.stroke();
    text(c, "automaticity", ox, oy - gh - 30, 22, GREY, "left", "normal"); text(c, "days", ox + gw, oy + 34, 22, GREY, "right", "normal");
    c.fillStyle = "#ff900022"; c.fillRect(ox + gw * 18 / maxD, oy - gh, gw * (254 - 18) / maxD, gh);
    c.strokeStyle = OR; c.lineWidth = 6; c.beginPath();
    for (let d = 0; d <= shown; d += 1) { const y = oy - gh * 0.95 * (1 - Math.exp(-d / k)) / (1 - Math.exp(-maxD / k)); d ? c.lineTo(ox + gw * d / maxD, y) : c.moveTo(ox, y); }
    c.stroke();
    [[30, "November"], [66, "median: 66"]].forEach(([d, l]) => {
      if (shown < d) return; const x = ox + gw * d / maxD;
      c.strokeStyle = d === 66 ? WHITE : "#888"; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(x, oy); c.lineTo(x, oy - gh); c.stroke(); c.setLineDash([]);
      text(c, l, x + 10, oy - gh + 20 + (d === 30 ? 40 : 0), 24, d === 66 ? WHITE : GREY, "left");
    });
    text(c, "range 18 to 254 days", ox + gw * 140 / maxD, oy - 40, 22, "#ffb366", "center", "normal");
    caption(c, at([[0, "How long until a new behaviour runs on autopilot?"], [50, "Median 66 days. Anywhere from 18 to 254."], [110, "Missing one day did not reset the curve."], [150, "November is the first half. Keep going in December."]], t));
  },
};

// ---------- beeper study ----------
const beeper = {
  thumbT: 120,
  draw(c, t) {
    bg(c, "#181818", "#080808");
    const n = Math.floor(ease(t / 90) * 7827), cols = 150, s = 7.2, ox = (W - cols * s) / 2, oy = 150;
    c.fillStyle = OR;
    for (let i = 0; i < n; i++) { const x = ox + (i % cols) * s, y = oy + Math.floor(i / cols) * s; c.fillRect(x, y, s - 2, s - 2); }
    text(c, n.toLocaleString("en"), 640, 80, 72, WHITE);
    text(c, "desires logged by 205 adults in one week", 640, 130 - 4, 24, GREY, "center", "normal");
    caption(c, at([[0, "Every adult in this study wanted something, all day."], [60, "Most desires were harmless and passed on their own."], [110, "Having urges is normal. You choose which ones to follow."]], t));
  },
};

// ---------- after a slip ----------
const SLIP = [[0, "Shame is the worst plan."], [30, "Feeling addicted tracks moral conflict more than use."], [65, "So: what happened just before?"], [100, "Time, place, mood, screen. Write it down."],
  [135, "Turn it into a new if-then plan."], [160, "Your streak resets. Your clean days stay counted."]];
const slip = {
  thumbT: 40,
  draw(c, t) {
    bg(c, "#232323", "#0d0d0d");
    const days = 30, done = Math.min(days, Math.floor(t / 4)), cell = 70, ox = (W - 10 * cell) / 2, oy = 150;
    for (let i = 0; i < days; i++) {
      const x = ox + (i % 10) * cell, y = oy + Math.floor(i / 10) * cell, slipDay = i === 9;
      c.fillStyle = i >= done ? "#2c2c2c" : slipDay ? "#5b5b5b" : OR; c.fillRect(x + 4, y + 4, cell - 8, cell - 8);
      text(c, String(i + 1), x + cell / 2, y + cell / 2, 22, i >= done ? GREY : slipDay ? WHITE : "#000");
    }
    if (done > 9) text(c, `${done - 1} clean days of ${done}`, 640, 420, 44, WHITE);
    caption(c, at(SLIP, t));
  },
};

// ---------- phone out of the bedroom (playable) ----------
const STEPS = ["Phone charges outside the bedroom tonight", "Laptop stays in a shared room after 22:00", "Content blocker or DNS filter switched on",
  "Bookmarks and saved logins for the sites removed", "Notifications from the usual trigger apps off", "A book or a game on the nightstand instead"];
const phone = {
  thumbT: 50,
  draw(c, t, st) {
    bg(c, "#1a1a1a", "#0a0a0a");
    const done = st.thumb ? [1, 1, 1, 0, 0, 0] : store("nnh-setup", []);
    text(c, "Set up the room before the urge shows up", 640, 80, 38);
    STEPS.forEach((s, i) => {
      const y = 170 + i * 70, on = !!done[i];
      c.strokeStyle = on ? OR : "#666"; c.lineWidth = 4; c.strokeRect(200, y - 20, 40, 40);
      if (on) { c.strokeStyle = OR; c.lineWidth = 7; c.beginPath(); c.moveTo(208, y); c.lineTo(218, y + 12); c.lineTo(236, y - 12); c.stroke(); }
      text(c, s, 270, y, 32, on ? WHITE : "#bbb", "left", on ? "bold" : "normal");
    });
    const n = done.filter(Boolean).length;
    text(c, `${n} / ${STEPS.length}`, W - 120, 80, 40, OR, "right");
  },
  setup(st, ui) {
    const box = el("div", "checks"), done = store("nnh-setup", []);
    STEPS.forEach((s, i) => {
      const l = el("label", "", `<input type="checkbox"${done[i] ? " checked" : ""}> ${s}`);
      l.querySelector("input").onchange = e => { const d = store("nnh-setup", []); d[i] = e.target.checked; save("nnh-setup", d); };
      box.append(l);
    });
    ui.append(box);
  },
};

export const SCENES = { "urge-wave": wave, blocks, pushups, walk, breathe, cold, ifthen, testo, habit, beeper, slip, phone };
export { clock };
