/* ============================================================
   USMANI ROAD RUN — Maskan Chowrangi to Gulshan Bridge
   A Karachi side-scroller. Pixel art, real landmarks.
   ============================================================ */
'use strict';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const H = 540;
let W = 960;                 // dynamic: follows the device aspect ratio
ctx.imageSmoothingEnabled = false;

// CSS fills the screen (it tracks the viewport, even as the mobile address bar
// slides). JS only matches the INTERNAL resolution to the displayed aspect so
// the bitmap never stretches and never goes stale.
function fitCanvas() {
  // prefer the visual viewport (most accurate visible area on iPad Safari w/ tab bar)
  const vv = window.visualViewport;
  const r = cv.getBoundingClientRect();
  const dispW = (vv && vv.width) || r.width || window.innerWidth;
  const dispH = (vv && vv.height) || r.height || window.innerHeight;
  if (dispW < 2 || dispH < 2) return;                  // not laid out yet
  let ar = dispW / dispH;
  ar = Math.min(2.6, Math.max(1.0, ar));               // clamp absurd extremes only
  const newW = Math.round(H * ar);
  if (Math.abs(newW - W) < 4) return;                  // ignore micro-jitter (no flicker)
  W = newW; cv.width = W; cv.height = H;
  ctx.imageSmoothingEnabled = false;                   // resize resets ctx state
  // camera re-clamps itself every step(), so no fix-up needed here
}
let fitT = 0;
function fitSoon() { clearTimeout(fitT); fitT = setTimeout(fitCanvas, 120); }
addEventListener('resize', fitSoon);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 300));
addEventListener('pageshow', fitSoon);
addEventListener('load', () => setTimeout(fitCanvas, 200));
if (window.visualViewport) visualViewport.addEventListener('resize', fitSoon);
if (window.ResizeObserver) new ResizeObserver(fitSoon).observe(cv);
fitCanvas();

// ---------- sprite images (real photos used as sprites) ----------
const sprites = {};
function loadSprite(key, src, opts) {
  opts = opts || {};
  const img = new Image();
  img.onload = () => {
    const oc = document.createElement('canvas');
    oc.width = img.naturalWidth; oc.height = img.naturalHeight;
    const octx = oc.getContext('2d');
    if (opts.flip) {                          // mirror horizontally at load
      octx.translate(oc.width, 0); octx.scale(-1, 1);
      octx.drawImage(img, 0, 0);
      octx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      octx.drawImage(img, 0, 0);
    }
    if (opts.knockoutWhite) {
      const th = opts.threshold || 236;
      const id = octx.getImageData(0, 0, oc.width, oc.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] >= th && d[i + 1] >= th && d[i + 2] >= th) d[i + 3] = 0;
      }
      // scrub leftover border artifacts: any row/column whose opaque pixels are
      // almost all near-white is a background line, not art — erase it
      const nearWhite = i => d[i] >= 226 && d[i + 1] >= 226 && d[i + 2] >= 226;
      for (let pxx = 0; pxx < oc.width; pxx++) {
        let op = 0, nw = 0;
        for (let py = 0; py < oc.height; py++) {
          const i = (py * oc.width + pxx) * 4;
          if (d[i + 3] > 16) { op++; if (nearWhite(i)) nw++; }
        }
        if (op > 0 && nw / op >= 0.85)
          for (let py = 0; py < oc.height; py++) d[(py * oc.width + pxx) * 4 + 3] = 0;
      }
      for (let py = 0; py < oc.height; py++) {
        let op = 0, nw = 0;
        for (let pxx = 0; pxx < oc.width; pxx++) {
          const i = (py * oc.width + pxx) * 4;
          if (d[i + 3] > 16) { op++; if (nearWhite(i)) nw++; }
        }
        if (op > 0 && nw / op >= 0.85)
          for (let pxx = 0; pxx < oc.width; pxx++) d[(py * oc.width + pxx) * 4 + 3] = 0;
      }
      octx.putImageData(id, 0, 0);
    }
    // measure opaque content bounds (ignore sparse rows/cols = knockout specks)
    const id2 = octx.getImageData(0, 0, oc.width, oc.height).data;
    const rowC = new Array(oc.height).fill(0), colC = new Array(oc.width).fill(0);
    for (let py = 0; py < oc.height; py++)
      for (let pxx = 0; pxx < oc.width; pxx++)
        if (id2[(py * oc.width + pxx) * 4 + 3] > 32) { rowC[py]++; colC[pxx]++; }
    const MIN = Math.max(4, Math.round(oc.width * 0.02));   // a real edge spans many px
    let minX = 0, maxX = oc.width - 1, minY = 0, maxY = oc.height - 1;
    while (minY < maxY && rowC[minY] < MIN) minY++;
    while (maxY > minY && rowC[maxY] < MIN) maxY--;
    while (minX < maxX && colC[minX] < MIN) minX++;
    while (maxX > minX && colC[maxX] < MIN) maxX--;
    oc.content = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    sprites[key] = oc;
  };
  img.onerror = () => {};   // missing file -> game falls back to drawn sprite
  img.src = src;
}
loadSprite('rickshaw', 'assets/rakh.png', { knockoutWhite: true });
loadSprite('bike', 'assets/cd70.jpeg', { knockoutWhite: true, flip: true, threshold: 244 });

// ---------- world constants ----------
const GROUND_Y = 470;          // top of footpath where player stands
const LEN = 13200;             // world length in px
const RAMP_X0 = 11600, RAMP_X1 = 12500, BRIDGE_Y = 330;
const FINISH_X = 12830;
const RIDER_X = 12980;         // your Bykea waits here (well clear of the police)
const GRAV = 0.55, JUMP_V = -11.6, WALK = 3.6, BOOST = 5.5;

function groundYAt(x) {
  if (x < RAMP_X0) return GROUND_Y;
  if (x < RAMP_X1) return GROUND_Y - (GROUND_Y - BRIDGE_Y) * (x - RAMP_X0) / (RAMP_X1 - RAMP_X0);
  return BRIDGE_Y;
}

// ---------- input ----------
const keys = {};
let anyKeyPressed = false;
addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true; anyKeyPressed = true; initAudio();
  if (e.code === 'Enter' && (state === 'title' || state === 'win')) startGame();
  if (e.code === 'KeyR' && (state === 'gameover' || state === 'win')) startGame();
  if ((e.code === 'KeyR' || e.code === 'Enter') && state === 'credits') { state = 'title'; titleStart = performance.now(); }
  if (e.code === 'KeyP' && state === 'play') paused = !paused;
  if (e.code === 'KeyM') musicOn = !musicOn;
  if (e.code === 'KeyE' && (state === 'title' || state === 'gameover')) easyMode = !easyMode;
  if (!e.repeat && (e.code === 'ArrowLeft' || e.code === 'KeyA')) recordCheat('L');
  if (!e.repeat && (e.code === 'ArrowRight' || e.code === 'KeyD')) recordCheat('R');
});
addEventListener('keyup', e => keys[e.code] = false);

// block iOS double-tap / pinch zoom — it desyncs the fixed canvas from the screen
addEventListener('dblclick', e => e.preventDefault(), { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend'])
  addEventListener(ev, e => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd < 350) e.preventDefault();   // kill double-tap zoom
  lastTouchEnd = now;
}, { passive: false });

// ---------- audio (tiny webaudio beeps) ----------
let AC = null;
function initAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} musicTarget = ''; }
  if (AC && AC.state === 'suspended') AC.resume();
  updateMusicTracks();
}
function tone(freq, dur, type, vol, when, slide) {
  if (!AC) return;
  const t = AC.currentTime + (when || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol || 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  jump:  () => tone(280, 0.18, 'square', 0.06, 0, 520),
  coin:  () => { tone(980, 0.07, 'sine', 0.07); tone(1320, 0.12, 'sine', 0.07, 0.06); },
  horn:  () => { tone(220, 0.25, 'sawtooth', 0.09); tone(277, 0.25, 'sawtooth', 0.09); },
  hurt:  () => tone(140, 0.3, 'square', 0.09, 0, 60),
  power: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'square', 0.06, i * 0.07)); },
  stomp: () => tone(200, 0.1, 'square', 0.07, 0, 90),
  win:   () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.07, i * 0.13)); },
  fall:  () => tone(500, 0.5, 'square', 0.07, 0, 80),
  toll:  () => tone(360, 0.12, 'square', 0.05, 0, 200),
  meow:  () => { tone(760, 0.16, 'sine', 0.07, 0, 540); tone(540, 0.22, 'sine', 0.05, 0.13, 400); },
  caw:   () => { tone(880, 0.09, 'sawtooth', 0.045, 0, 500); tone(820, 0.09, 'sawtooth', 0.04, 0.11, 470); },
  phat:  () => tone(60 + Math.random() * 50, 0.05, 'square', 0.085, 0, 40),
};

// user-supplied audio tracks (in assets/) — refs assigned immediately (no fragile gating)
const bgMusic = new Audio('assets/music.mp3'); bgMusic.loop = true; bgMusic.volume = 0.5; bgMusic.preload = 'auto';
const endMusic = new Audio('assets/musicend.mp3'); endMusic.loop = true; endMusic.volume = 0.36; endMusic.preload = 'auto';
const meowAud = new Audio('assets/meow.mp3'); meowAud.volume = 0.4; meowAud.preload = 'auto';
let endSeeked = false;
// once metadata is ready, jump musicend.mp3 to 0:48 (and keep it there each loop)
endMusic.addEventListener('loadedmetadata', () => { try { endMusic.currentTime = 48; endSeeked = true; } catch (e) {} });
endMusic.addEventListener('seeked', () => { endSeeked = true; });

function playMeow() {                                    // first 2.5 seconds only, loud
  try {
    meowAud.currentTime = 0;
    const p = meowAud.play();
    if (p) p.catch(() => sfx.meow());
    setTimeout(() => { try { meowAud.pause(); } catch (e) {} }, 2500);
  } catch (e) { sfx.meow(); }
}
// route background music by game state: music.mp3 in play, musicend.mp3 (from 0:48) in credits
let musicTarget = '';
function updateMusicTracks() {
  const want = !musicOn ? 'none'
    : (state === 'credits') ? 'end'
    : (state === 'play' || state === 'ride') ? 'bg' : 'none';
  // (re)assert the target every call so a track that failed to start gets retried
  if (want === 'bg') {
    endMusic.pause();
    if (bgMusic.paused) bgMusic.play().catch(() => {});
  } else if (want === 'end') {
    bgMusic.pause();
    if (musicTarget !== 'end') { try { endMusic.currentTime = 48; } catch (e) {} }   // restart intro skip on entry
    if (endMusic.paused) {
      const p = endMusic.play();
      if (p) p.then(() => { if (endMusic.currentTime < 47) { try { endMusic.currentTime = 48; } catch (e) {} } }).catch(() => {});
    }
  } else {
    bgMusic.pause(); endMusic.pause();
  }
  musicTarget = want;
}

// ---------- music (original 8-bit chiptune, 90s Karachi pop flavor) ----------
let musicOn = true;
let musicGain = null, iceGain = null;
let mStep = 0, mNext = 0, jStep = 0, jNext = 0;
const MSTEP = 60 / 124 / 2;            // 124 bpm, 8th notes
const JSTEP_T = 0.17;                  // Für Elise 16ths, poco moto
// original melody — bright 90s-pop groove, G major I-vi-IV-V (Babia *vibe*, original notes)
const LEAD = [
  67, 0, 71, 74, 71, 0, 74, 79, 76, 0, 74, 71, 74, 0, 0, 0,
  72, 0, 76, 79, 74, 0, 71, 67, 69, 71, 69, 67, 67, 0, 0, 0,
];
const BASS = [
  55, 0, 55, 62, 0, 55, 0, 62, 52, 0, 52, 59, 0, 52, 0, 59,
  48, 0, 48, 55, 0, 48, 0, 55, 50, 0, 50, 57, 0, 50, 0, 57,
];
// B section — second melody so the loop breathes
const LEAD_B = [
  79, 0, 81, 83, 81, 0, 79, 76, 74, 0, 76, 79, 76, 0, 0, 0,
  72, 0, 74, 76, 79, 0, 76, 74, 71, 72, 74, 71, 67, 0, 0, 0,
];
const BASS_B = [
  52, 0, 52, 59, 0, 52, 0, 59, 48, 0, 48, 55, 0, 48, 0, 55,
  55, 0, 55, 62, 0, 55, 0, 62, 50, 0, 50, 57, 0, 50, 0, 57,
];
// ethereal end-credits pad (slow, washy)
const PAD = [57, 64, 69, 72, 71, 67, 64, 60, 57, 64, 69, 76, 74, 71, 67, 64];
let cStep = 0, cNext = 0;
const CSTEP_T = 0.42;
// ice cream wala jingle — Für Elise (Beethoven, public domain — the real Karachi cart anthem)
const JINGLE = [
  76, 75, 76, 75, 76, 71, 74, 72,
  69, 0, 60, 64, 69, 71, 0, 64,
  68, 71, 72, 0, 64, 76, 75, 76,
  75, 76, 71, 74, 72, 69, 0, 60,
  64, 69, 71, 0, 64, 72, 71, 69,
  0, 0, 0, 0,
];

function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function ensureMusicNodes() {
  if (!AC || musicGain) return;
  musicGain = AC.createGain(); musicGain.gain.value = 0.045; musicGain.connect(AC.destination);
  iceGain = AC.createGain(); iceGain.gain.value = 0; iceGain.connect(AC.destination);
}
function noteAt(midi, t, dur, type, dest, vol) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = midiHz(midi);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
setInterval(() => {
  if (!AC) return;
  ensureMusicNodes();
  const now = AC.currentTime;
  // background loop
  if (mNext < now) mNext = now + 0.05;
  while (mNext < now + 0.3) {
    if ((state === 'title' || (state === 'play' && !bgMusic)) && musicOn && !paused) {  // 8-bit on title; synth in play only if no mp3
      const useB = Math.floor(mStep / 32) % 2 === 1;        // alternate A/B sections
      const L = (useB ? LEAD_B : LEAD)[mStep % 32];
      if (L) noteAt(L, mNext, MSTEP * 0.85, 'square', musicGain, 0.9);
      const B = (useB ? BASS_B : BASS)[mStep % 32];
      if (B) noteAt(B, mNext, MSTEP * 0.95, 'triangle', musicGain, 1.5);
    }
    mStep++; mNext += MSTEP;
  }
  // ethereal pad for the end credits
  if (cNext < now) cNext = now + 0.05;
  while (cNext < now + 0.3) {
    if (state === 'credits' && musicOn && !endMusic) {       // synth pad only if no mp3 track
      const P = PAD[cStep % PAD.length];
      noteAt(P, cNext, 1.6, 'sine', musicGain, 0.55);
      noteAt(P + 12, cNext + 0.1, 1.2, 'sine', musicGain, 0.18);
      if (cStep % 4 === 0) noteAt(P - 24, cNext, 2.0, 'triangle', musicGain, 0.5);
    }
    cStep++; cNext += CSTEP_T;
  }
  // ice cream jingle (always scheduled; volume controlled by proximity gain)
  if (jNext < now) jNext = now + 0.05;
  while (jNext < now + 0.3) {
    const J = JINGLE[jStep % JINGLE.length];
    if (J && state === 'play' && !paused) {
      noteAt(J, jNext, JSTEP_T * 0.9, 'sine', iceGain, 1);
      noteAt(J + 12, jNext, JSTEP_T * 0.45, 'sine', iceGain, 0.25);
    }
    jStep++; jNext += JSTEP_T;
  }
}, 100);

// ---------- level data ----------
const buildings = [];   // back layer facades with signboards
const decors = [];      // small props (carts, poles, signs, cones...)
const platforms = [];   // one-way (awnings, shelters)
const solids = [];      // full AABB (barriers, parked cars, containers)
const trenches = [];    // gaps in the ground {x,w}
const wires = [];       // sparking wire hazards {x,y,w,h}
const coinsAll = [];    // {x,y,taken}
const powerups = [];    // {x,y,kind,taken}
const banners = [];     // cloth banners across the road {x,text}

const ZONES = [
  { x: 0,     name: 'Maskan Chowrangi' },
  { x: 900,   name: 'Usmani Road — Block 7' },
  { x: 4000,  name: 'Food Street — Block 4' },
  { x: 6600,  name: 'Block 2 — Disco Bakery' },
  { x: 8700,  name: 'Road Under Construction' },
  { x: 11600, name: 'Gulshan Chowrangi Flyover' },
];
const CHECKPOINTS = [60, 4050, 6950, 8750, 11500];

function addBldg(x, w, h, name, c1, c2, opts) {
  opts = opts || {};
  buildings.push({ x, w, h, name, c1, c2, sign: opts.sign || '#fff', signText: opts.signText || '#c0392b', urdu: opts.urdu, floors: opts.floors });
  if (opts.awning) {
    platforms.push({ x: x + 4, y: GROUND_Y - 92, w: w - 8, h: 10, awning: true, c: opts.awning });
  }
}
function coinRow(x, y, n, gap) { for (let i = 0; i < n; i++) coinsAll.push({ x: x + i * (gap || 34), y, taken: false }); }
function coinArc(x, y, n) { for (let i = 0; i < n; i++) coinsAll.push({ x: x + i * 30, y: y - Math.sin(i / (n - 1) * Math.PI) * 70, taken: false }); }

function buildLevel() {
  // --- Zone A: Maskan Chowrangi (start) ---
  decors.push({ kind: 'chowrangi', x: 110 });
  decors.push({ kind: 'kugate', x: 330 });
  addBldg(560, 240, 230, 'BEACONHOUSE', '#dfe6e9', '#b2bec3', { signText: '#0a3d62' });
  coinRow(640, GROUND_Y - 130, 4);

  // --- Zone B: Block 7 / Block 4 commercial strip ---
  addBldg(960,  200, 260, 'SUNNY ARCADE', '#f5d76e', '#e0b13c', { awning: '#2ecc71' });
  addBldg(1160, 150, 200, 'MASTER ELECTRONICS', '#74b9ff', '#3a7bd5', { awning: '#e74c3c' });
  decors.push({ kind: 'jannat', x: 1330, w: 175, h: 250 });    // residential block w/ Jannat BBQ شاپ
  // open dining space next to Jannat (no building here) — outdoor plastic tables
  decors.push({ kind: 'tables', x: 1490 });
  addBldg(1680, 200, 240, 'MASKAN VENUE', '#fde3a7', '#f5b041');
  decors.push({ kind: 'kepole', x: 1640, spark: false });
  addBldg(1910, 140, 170, 'Y MEN SALON', '#e74c3c', '#b03226', { sign: '#ffffff', signText: '#c0392b', awning: '#2c3e50' });
  addBldg(2070, 160, 200, 'MADINA STORE', '#55efc4', '#00b894', { awning: '#e67e22' });
  addBldg(2250, 150, 190, 'JAFFERY OPTICAL', '#dff9fb', '#c7ecee', { signText: '#130f40', awning: '#2c3e50' });
  decors.push({ kind: 'kepole', x: 2430, spark: true });
  wires.push({ x: 2400, y: GROUND_Y - 118, w: 70, h: 26 });
  addBldg(2480, 170, 210, 'MOBILE MALL', '#ff7979', '#eb4d4b', { awning: '#f9ca24' });
  addBldg(2670, 140, 180, 'PHARMACY', '#b8e994', '#78e08f', { signText: '#0a7d35' });
  // Regency Apartments + Coffee Wagera (tall landmark)
  addBldg(2860, 260, 330, 'REGENCY APARTMENTS', '#fad390', '#f8c291', { floors: 6 });
  addBldg(2880, 120, 110, 'COFFEE WAGERA', '#4a2c11', '#2d1a08', { sign: '#f7d794', signText: '#3d2208', awning: '#c0894f' });
  addBldg(3130, 190, 230, 'MEEZAN BANK', '#ecf0f1', '#bdc3c7', { signText: '#6c3483' });
  solids.push({ x: 3180, y: GROUND_Y - 42, w: 120, h: 42, kind: 'mehran' });    // parked Mehran = platform
  coinArc(3140, GROUND_Y - 60, 6);
  addBldg(3340, 180, 220, 'HBL', '#dcdde1', '#aab0b6', { signText: '#0b6e4f' });
  addBldg(3540, 150, 190, 'AATA CHAKKI', '#e8d6b3', '#cbb88a', { awning: '#9b59b6' });
  trenches.push({ x: 3740, w: 45, label: 'POTHOLE' });   // first open manhole!
  decors.push({ kind: 'manholesign', x: 3700 });
  addBldg(3860, 130, 170, 'JUICE CORNER', '#fdcb6e', '#e1a32a', { awning: '#16a085' });
  powerups.push({ x: 3100, y: GROUND_Y - 150, kind: 'chai', taken: false });
  coinRow(2880, GROUND_Y - 140, 5);

  // --- Zone C: Food Street (Block 4) ---
  banners.push({ x: 4100, text: 'GULSHAN FOOD STREET' });
  addBldg(4080, 200, 230, 'ALFAREED PAKWAN', '#e17055', '#c44d33', { awning: '#27ae60' });
  decors.push({ kind: 'cart', x: 4180, label: 'GOL GAPPA' });
  addBldg(4290, 150, 190, 'MADINA MEAT SHOP', '#8c2f2f', '#6d2222', { sign: '#f5e9e9', signText: '#7a1010' });
  decors.push({ kind: 'chickenwala', x: 4345 });
  addBldg(4450, 190, 210, 'MANPASAND FOOD VALLEY', '#fab1a0', '#e58e7e', { awning: '#d63031' });
  decors.push({ kind: 'cart', x: 4690, label: 'JUICE' });
  addBldg(4790, 170, 200, 'BISMILLAH HOTEL', '#ffeaa7', '#fdcb6e', { awning: '#2d3436' });
  decors.push({ kind: 'dhaba', x: 5010 });
  addBldg(5150, 160, 190, 'CHIPY EATS', '#fd79a8', '#e84393', { awning: '#fdcb6e' });
  solids.push({ x: 5380, y: GROUND_Y - 50, w: 150, h: 50, kind: 'suzuki' });   // fruit pickup = platform
  coinArc(5340, GROUND_Y - 70, 6);
  addBldg(5590, 170, 210, 'BBQ CORNER', '#d63031', '#a82324', { awning: '#f39c12' });
  addBldg(5780, 160, 190, 'UNITED BAKERY', '#ffd54a', '#e6bb2e', { awning: '#e84393' });
  trenches.push({ x: 6000, w: 50, label: 'POTHOLE' });  // dug-up gas line
  decors.push({ kind: 'cones', x: 5950 });
  addBldg(6160, 180, 220, 'KARACHI BROAST', '#f8a5c2', '#f78fb3', { awning: '#218c5c' });
  addBldg(6360, 150, 180, 'PAAN & COLD CORNER', '#6ab04c', '#4a8b34', { awning: '#e74c3c' });
  coinRow(4470, GROUND_Y - 140, 5);
  coinRow(5600, GROUND_Y - 140, 4);
  powerups.push({ x: 5050, y: GROUND_Y - 60, kind: 'bunkabab', taken: false });

  // --- Zone D: Block 2 — Disco Bakery ---
  addBldg(6700, 160, 200, 'JUNIORS CLINIC', '#dfe6e9', '#b2bec3', { signText: '#c0392b' });
  // Disco Bakery — the icon
  addBldg(6900, 280, 280, 'DISCO BAKERY', '#1c1c22', '#101015', { sign: '#ffd32a', signText: '#1c1c22', awning: '#ffd32a' });
  decors.push({ kind: 'billboard', x: 6900, lines: ['IGLOO', 'ICE CREAM', 'thanda matlab...'], bg: '#e60026', fg: '#ffffff' });
  addBldg(7155, 85, 110, 'DOODH DAHI', '#f8f8f8', '#e8e8e8', { signText: '#1a5276', awning: '#85c1e9' });
  decors.push({ kind: 'signal', x: 7205 });
  decors.push({ kind: 'busstop', x: 7260 });
  platforms.push({ x: 7250, y: GROUND_Y - 100, w: 130, h: 10, shelter: true });
  addBldg(7440, 260, 340, 'RUFI APARTMENTS', '#a4b0be', '#747d8c', { floors: 7 });
  addBldg(7730, 170, 200, 'GULSHAN PHARMACY', '#7bed9f', '#2ed573', { signText: '#14502c', awning: '#3742fa' });
  addBldg(7900, 135, 290, 'HAMID SQUARE', '#f0e6d2', '#d8c4a0', { sign: '#1b6ca8', signText: '#ffffff', floors: 4 });
  decors.push({ kind: 'kepole', x: 7880, spark: true });
  wires.push({ x: 7850, y: GROUND_Y - 122, w: 70, h: 26 });
  addBldg(8045, 255, 310, 'IMTIAZ SQUARE', '#eef3f7', '#c3d1dc', { sign: '#d61f2c', signText: '#ffffff', floors: 4 });
  decors.push({ kind: 'trolley', x: 8250 });
  solids.push({ x: 8260, y: GROUND_Y - 42, w: 120, h: 42, kind: 'mehran' });
  coinArc(8220, GROUND_Y - 60, 6);
  addBldg(8430, 180, 220, 'MILAN SWEETS', '#f1c40f', '#d4ac0d', { awning: '#c0392b' });
  coinRow(6940, GROUND_Y - 150, 6);
  banners.push({ x: 7000, text: 'DISCO BAKERY — SINCE 1972' });

  // --- Zone E: Construction (the gauntlet) ---
  decors.push({ kind: 'kmcsign', x: 8740 });
  solids.push({ x: 8900, y: GROUND_Y - 40, w: 70, h: 40, kind: 'barrier' });
  trenches.push({ x: 9030, w: 55 });
  decors.push({ kind: 'cones', x: 8990 });
  solids.push({ x: 9200, y: GROUND_Y - 40, w: 70, h: 40, kind: 'barrier' });
  decors.push({ kind: 'sand', x: 9320 });
  solids.push({ x: 9330, y: GROUND_Y - 34, w: 110, h: 34, kind: 'sandpile' });
  trenches.push({ x: 9500, w: 65 });
  decors.push({ kind: 'rebar', x: 9660 });
  wires.push({ x: 9700, y: GROUND_Y - 60, w: 60, h: 60 });   // rebar zap zone (low!)
  solids.push({ x: 9820, y: GROUND_Y - 64, w: 180, h: 64, kind: 'container' });
  coinRow(9840, GROUND_Y - 120, 5);
  trenches.push({ x: 10060, w: 75 });
  decors.push({ kind: 'mixer', x: 10260 });
  solids.push({ x: 10400, y: GROUND_Y - 40, w: 70, h: 40, kind: 'barrier' });
  decors.push({ kind: 'crane', x: 10550 });
  addBldg(10560, 300, 300, 'GULSHAN HEIGHTS MALL', '#95a5a6', '#7f8c8d', { sign: '#f39c12', signText: '#1e272e' });
  decors.push({ kind: 'scaffold', x: 10580 });
  trenches.push({ x: 10920, w: 60 });
  decors.push({ kind: 'cones', x: 10880 });
  solids.push({ x: 11090, y: GROUND_Y - 40, w: 70, h: 40, kind: 'barrier' });
  solids.push({ x: 11230, y: GROUND_Y - 34, w: 110, h: 34, kind: 'sandpile' });
  decors.push({ kind: 'sand', x: 11220 });
  decors.push({ kind: 'rastaband', x: 11420 });
  powerups.push({ x: 8850, y: GROUND_Y - 150, kind: 'biryani', taken: false });
  coinArc(9480, GROUND_Y - 80, 7);
  coinArc(10040, GROUND_Y - 80, 8);

  // --- Zone F: Flyover ramp ---
  banners.push({ x: 11700, text: 'GULSHAN CHOWRANGI' });
  decors.push({ kind: 'bykea', x: RIDER_X });   // your ride home, waiting at the top
  decors.push({ kind: 'police', x: 12560 });    // police checkpoint at the bridge
  coinRow(11750, groundYAt(11850) - 80, 5, 40);
  coinRow(12100, groundYAt(12200) - 80, 5, 40);
  coinRow(12340, BRIDGE_Y - 70, 5, 40);
  decors.push({ kind: 'finish', x: FINISH_X });

  // --- Karachi street life ---
  addBldg(800, 158, 210, 'DARBAR', '#ffd54a', '#e6bb2e', { sign: '#7a1f1f', signText: '#7a1f1f', awning: '#b71540' });
  decors.push({ kind: 'masjid', x: 6510 });                      // Akbar Masjid (اکبر مسجد) + speaker
  decors.push({ kind: 'fixit', x: 6720 });                       // Fixit free-food stall, just before Disco Bakery
  decors.push({ kind: 'desibbq', x: 1370 });                     // Jannat's desi BBQ grill out front
  decors.push({ kind: 'chaiwala', x: 3030 });                    // chai wala by the chai power-up
  decors.push({ kind: 'billboard', x: 3560, lines: ['9/10 PEOPLE SAY', 'KARACHI LOVES SHAN', '(the masala, not the actor)'], bg: '#fff8ec', fg: '#c0392b' });
  decors.push({ kind: 'billboard', x: 9240, lines: ['BYKEA KARO'], bg: '#0aa54f', fg: '#ffffff' });
  [[1230, '#7d7d85'], [4520, '#b58a5a'], [7320, '#3a3a3a'], [10180, '#c98f4e']].forEach((c2, i) =>
    decors.push({ kind: 'cat', x: c2[0], base: c2[0], dir: i % 2 ? 1 : -1, tint: c2[1] }));
  const cowX = 3300 + Math.floor(Math.random() * 5200);          // exactly one cow per run
  decors.push({ kind: 'cow', x: cowX, base: cowX, dir: 1 });
  decors.push({ kind: 'rollstall', x: 4980 });                   // Hot N Spicy rolls
  decors.push({ kind: 'goldperformer', x: 7050 });             // gold living statue at Disco Bakery
  decors.push({ kind: 'admirer', x: 7118 });                   // pedestrian gawking at the gold boy
  decors.push({ kind: 'flock', x: 4360 });                     // crows flying together over the meat shop
  decors.push({ kind: 'foosball', x: 2360 });                   // roadside foosball
  decors.push({ kind: 'foosball', x: 8600 });
  decors.push({ kind: 'excavator', x: 10720 });                 // parked excavator by a pothole
  decors.push({ kind: 'sand', x: 10830 });
  decors.push({ kind: 'flowerseller', x: 7280 });               // rose seller, just after the Disco signal
  decors.push({ kind: 'beggar', x: 2760, phrase: 'kuch dedo?' });
  decors.push({ kind: 'beggar', x: 8650, phrase: 'khuda kay naam pe kuch dedo', nearOnly: true });
  // pedestrians: ~40% female (half burqa, half floral), rest men
  // mostly on the main road; exactly one walker up on the bridge (12000)
  const peds = [620, 980, 1450, 2050, 2900, 3550, 4250, 5050, 5750, 6300, 7050, 7650, 8200, 9050, 9650, 10500, 12000];
  const pedTints = ['#34495e', '#7f8c8d', '#16607a', '#5b3a29', '#3d6b4a', '#6c3483', '#2c3e50'];
  peds.forEach((pxx, i) => {
    const female = Math.random() < 0.4;
    const smoker = (i === 2 || i === 9);                         // a couple of smokers (men)
    const greet = (i === 5 || i === 12);                         // a couple greet you
    const type = female && !smoker ? 'floral' : 'man';
    decors.push({ kind: 'pedestrian', x: pxx, base: pxx, dir: i % 2 ? 1 : -1, tint: pedTints[i % pedTints.length], type, smoker, greet });
    if (type === 'floral')                                       // women always with company
      decors.push({ kind: 'pedestrian', x: pxx + 22, base: pxx + 22, dir: i % 2 ? 1 : -1, tint: pedTints[(i + 3) % pedTints.length], type: 'man' });
  });
  // trees of varying sizes all along the street
  const treeX = [200, 760, 1280, 2200, 3150, 3850, 4600, 5350, 6150, 7000, 8050, 8950, 10250, 11400];
  treeX.forEach((tx, i) => decors.push({ kind: 'tree', x: tx, size: 0.65 + ((i * 0.41) % 1) * 0.85 }));

  // streetlights: white from Maskan to Disco, warm from Disco to the bridge
  for (let x = 500; x < LEN - 300; x += 220) decors.push({ kind: 'lamp', x, warm: x >= 6900 });
}
buildLevel();

// ---------- dynamic state ----------
let state = 'title';   // title | play | gameover | win
let titleStart = performance.now();  // drives day/night cycle on title screen
let paused = false;
let player, cam, vehicles, spawnT, rupees, hearts, tStart, tEnd, iframes, boostT, starT, shedT, shedDone, toast, deathX;
let lastGroundX = 60;   // last x where player stood on solid ground (for easy-mode pit respawn)
let toastPending = null; // { text, t } — shown after current toast expires
let iceCount = 0, lastIceX = -99999;
let godMode = false, cheatSeq = [];   // L L L R R R = unlimited health, this run only
let easyMode = false;                 // toggled on title screen — sets godMode on game start
let policeTollLeft = 20, policeTollCd = 0, policeTollDone = 0;   // chai-paani vasooli at the bridge
let playerSay = { t: 0, text: '' }, sayTimer = 0, sayScript = [], sayDelay = 0;
let rideT = 0, bikeX = 0, creditsT = 0, rupeesCollected = 0;
const crowSeen = new Set();

function recordCheat(dir) {
  cheatSeq.push(dir);
  if (cheatSeq.length > 6) cheatSeq.shift();
  if (cheatSeq.join('') === 'LLLRRR' && state === 'play' && !godMode) {
    godMode = true;
    toast = { text: 'CHEAT ON: UNLIMITED HEALTH!', t: 160 };
    sfx.power();
  }
}

function startGame() {
  player = { x: 60, y: GROUND_Y - 44, w: 26, h: 44, vx: 0, vy: 0, onGround: true, face: 1, anim: 0 };
  cam = { x: 0 };
  vehicles = [];
  spawnT = 60;
  rupees = 0; hearts = 3;
  iframes = 0; boostT = 0; starT = 0;
  shedT = 0; shedDone = false;
  toast = { text: 'MASKAN CHOWRANGI', t: 150 };
  iceCount = 0; lastIceX = -99999;
  godMode = easyMode; cheatSeq = [];  // easy mode = permanent god mode for this run
  policeTollLeft = 20; policeTollCd = 0; policeTollDone = 0;
  rideT = 0; bikeX = 0; creditsT = 0; rupeesCollected = 0; crowSeen.clear();
  playerSay = { t: 0, text: '' };
  sayScript = [['ghar chaltay hain', 95], ['bykea karun ya walk?', 95], ['chaltay hain ajj', 62], ['kitna he bura hoga', 62]];
  sayDelay = 110;
  sayTimer = 600 + Math.floor(Math.random() * 900);
  tStart = performance.now(); tEnd = 0;
  coinsAll.forEach(c => c.taken = false);
  powerups.forEach(p => p.taken = false);
  state = 'play'; paused = false;
}

// ---------- vehicles ----------
const VTYPES = {
  rickshaw: { w: 78, h: 58, sp: 2.7, score: 0 },
  qingqi:   { w: 90, h: 56, sp: 3.3, score: 0 },
  car:      { w: 110, h: 44, sp: 3.4, score: 0 },
  bus:      { w: 220, h: 64, sp: 2.1, score: 0 },
  bike:     { w: 64, h: 50, sp: 4.3, score: 0 },
  dumper:   { w: 170, h: 72, sp: 1.9, score: 0 },
  icecream: { w: 122, h: 60, sp: 1.4, score: 0 },
};
function zoneAt(x) { let z = 0; for (let i = 0; i < ZONES.length; i++) if (x >= ZONES[i].x) z = i; return z; }
const ZONE_SPAWN = [
  ['rickshaw', 'car', 'bike'],
  ['rickshaw', 'car', 'bus', 'qingqi', 'bike'],
  ['rickshaw', 'bike', 'qingqi'],
  ['rickshaw', 'car', 'bus', 'bike'],
  ['dumper', 'rickshaw'],
  ['bus', 'car'],
];
const ZONE_RATE = [500, 317, 367, 333, 567, 1067]; // 70% fewer vehicles than before

function spawnVehicle() {
  const z = zoneAt(player.x);
  const pool = ZONE_SPAWN[z];
  let kind = pool[Math.floor(Math.random() * pool.length)];
  // ice cream wala: max 3 per route, spaced well apart
  if (z <= 3 && iceCount < 3 && player.x - lastIceX > 2200 && Math.random() < 0.08) {
    kind = 'icecream'; iceCount++; lastIceX = player.x;
  }
  const t = VTYPES[kind];
  const x = cam.x + W + 80;
  if (x > LEN - 100) return;
  const CARCOLORS = ['#ecf0f1', '#2d3436', '#c0392b', '#2980b9', '#16a085', '#d4ac0d', '#7f8c8d'];
  vehicles.push({ kind, x, w: t.w, h: t.h, vx: -(t.sp + Math.random() * 0.6), honked: false,
    lightOn: Math.random() < 0.5,
    color: CARCOLORS[Math.floor(Math.random() * CARCOLORS.length)] });
}

// ---------- physics helpers ----------
function overTrench(cx) {
  if (cx >= RAMP_X0) return false;
  for (const t of trenches) if (cx > t.x + 6 && cx < t.x + t.w - 6) return true;
  return false;
}
function rectHit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function damage(knockDir) {
  if (iframes > 0 || starT > 0) return;
  if (!godMode) hearts--;
  iframes = 85; sfx.hurt();
  player.vy = -7; player.vx = 6 * knockDir;
  if (hearts <= 0) { state = 'gameover'; tEnd = performance.now(); }
}
function respawn() {
  sfx.fall();
  if (godMode) {
    // easy mode: reappear just before the pit, no heart loss
    const safeX = lastGroundX - 6;
    player.x = safeX; player.y = groundYAt(safeX) - player.h;
    player.vx = 0; player.vy = 0; player.onGround = true;
    iframes = 120;
    toast = { text: 'OOPS! FELL IN THE POTHOLE!', t: 160 };
    toastPending = { text: "THANK GOD I'M PLAYING ON EASY MODE!", t: 160 };
    return;
  }
  let cp = CHECKPOINTS[0];
  for (const c of CHECKPOINTS) if (c < player.x - 20) cp = c;
  hearts--;
  if (hearts <= 0) { state = 'gameover'; tEnd = performance.now(); return; }
  player.x = cp; player.y = groundYAt(cp) - player.h; player.vx = 0; player.vy = 0;
  iframes = 100;
}

// ---------- update ----------
function step() {
  if (state === 'ride') { stepRide(); return; }
  if (state === 'credits') { creditsT++; return; }
  if (state !== 'play' || paused) return;

  // input → velocity
  const spd = boostT > 0 ? BOOST : WALK;
  let mx = 0;
  if (keys.ArrowRight || keys.KeyD) mx = spd;
  if (keys.ArrowLeft || keys.KeyA) mx = -spd;
  if (Math.abs(player.vx) > spd) { player.vx *= 0.9; } else player.vx = mx;
  if (mx) player.face = Math.sign(mx);
  if ((keys.ArrowUp || keys.Space || keys.KeyW) && player.onGround) {
    player.vy = JUMP_V; player.onGround = false; sfx.jump();
  }
  if (!(keys.ArrowUp || keys.Space || keys.KeyW) && player.vy < -4) player.vy = -4; // variable jump

  player.vy += GRAV;
  if (player.vy > 14) player.vy = 14;
  player.x += player.vx;
  player.y += player.vy;
  if (player.x < 10) player.x = 10;
  if (player.x > LEN - 40) player.x = LEN - 40;

  // solids: AABB resolve
  player.onGround = false;
  for (const s of solids) {
    if (!rectHit(player, s)) continue;
    const prevB = player.y + player.h - player.vy;
    const prevX = player.x - player.vx;
    if (player.vy >= 0 && prevB <= s.y + 8) {                 // land on top
      player.y = s.y - player.h; player.vy = 0; player.onGround = true;
    } else if (prevX + player.w <= s.x + 6) {                  // hit from left
      player.x = s.x - player.w;
    } else if (prevX >= s.x + s.w - 6) {                       // hit from right
      player.x = s.x + s.w;
    } else { player.y = s.y - player.h; player.vy = 0; player.onGround = true; }
  }
  // one-way platforms (awnings, shelters)
  for (const p of platforms) {
    const prevB = player.y + player.h - player.vy;
    if (player.vy >= 0 && prevB <= p.y + 6 && player.y + player.h >= p.y &&
        player.x + player.w > p.x + 4 && player.x < p.x + p.w - 4) {
      player.y = p.y - player.h; player.vy = 0; player.onGround = true;
    }
  }
  // ground (with trenches and ramp)
  const gy = groundYAt(player.x + player.w / 2);
  if (!overTrench(player.x + player.w / 2)) {
    if (player.y + player.h >= gy) { player.y = gy - player.h; player.vy = 0; player.onGround = true; lastGroundX = player.x; }
  }
  if (player.y > H + 60) { respawn(); return; }

  // vehicles — stop spawning oncoming traffic once near the police at the top of the bridge
  const NO_TRAFFIC_X = 12150;
  spawnT--;
  if (spawnT <= 0 && player.x < NO_TRAFFIC_X) { spawnVehicle(); spawnT = ZONE_RATE[zoneAt(player.x)] * (0.7 + Math.random() * 0.6); }
  else if (spawnT <= 0) spawnT = 120;
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    v.x += v.vx;
    v.y = groundYAt(v.x + v.w / 2) - v.h;
    if (v.x + v.w < cam.x - 200) { vehicles.splice(i, 1); continue; }
    if (!v.honked && Math.abs(v.x - player.x) < 320 && Math.random() < 0.01) { v.honked = true; if (Math.abs(v.x-player.x)<340) sfx.horn(); }
    if (v.kind === 'bus' && Math.random() < 0.0035 && Math.abs(v.x - player.x) < 900) sfx.horn();   // buses honk on principle
    if (rectHit(player, v)) {
      const prevB = player.y + player.h - player.vy;
      if (player.vy > 0 && prevB <= v.y + 12) {               // bounce off the roof!
        player.y = v.y - player.h; player.vy = -8.6; sfx.stomp(); rupees += 0;
      } else damage(player.x + player.w / 2 < v.x + v.w / 2 ? -1 : 1);
    }
  }

  // wire / rebar hazards
  for (const wz of wires) if (rectHit(player, wz)) damage(player.face * -1 || -1);

  // coins
  for (const c of coinsAll) {
    if (c.taken) continue;
    if (player.x + player.w > c.x - 9 && player.x < c.x + 9 && player.y + player.h > c.y - 9 && player.y < c.y + 9) {
      c.taken = true; rupees++; rupeesCollected++; sfx.coin();
    }
  }
  // powerups
  for (const p of powerups) {
    if (p.taken) continue;
    if (player.x + player.w > p.x - 14 && player.x < p.x + 14 && player.y + player.h > p.y - 14 && player.y < p.y + 18) {
      p.taken = true; sfx.power();
      if (p.kind === 'chai') { boostT = 480; toast = { text: 'CHAI! SPEED BOOST!', t: 120 }; }
      if (p.kind === 'bunkabab') { hearts = Math.min(4, hearts + 1); toast = { text: 'BUN KABAB! +1 HEART', t: 120 }; }
      if (p.kind === 'biryani') { starT = 420; toast = { text: 'BIRYANI POWER!!', t: 120 }; }
    }
  }

  if (iframes > 0) iframes--;
  if (boostT > 0) boostT--;
  if (starT > 0) starT--;

  // police chai-paani vasooli: standing by the cops drains up to 20 rupees
  if (player.x > 12640 && player.x < 12824 && policeTollLeft > 0 && rupees > 0) {
    if (++policeTollCd >= 7) {
      policeTollCd = 0; rupees--; policeTollLeft--; policeTollDone++;
      sfx.toll();
      toast = { text: 'Chai paani... -1 Rs', t: 60 };
    }
  }

  // opening monologue, then occasional Bykea mutters (only past Disco Bakery)
  if (sayScript.length > 0) {
    if (--sayDelay <= 0) { const nxt = sayScript.shift(); playerSay = { t: nxt[1], text: nxt[0] }; sayDelay = nxt[1] + 14; }
  } else if (player.x > 7200 && --sayTimer <= 0) {
    playerSay = { t: 150, text: 'Bykea he mangwaleta...' };
    sayTimer = 900 + Math.floor(Math.random() * 900);
  }
  if (playerSay.t > 0) playerSay.t--;

  // pedestrians, cats and the cow move along the footpath
  for (const d of decors) {
    if (d.kind === 'pedestrian') { d.x += d.dir * 0.45; if (d.x > d.base + 140) d.dir = -1; else if (d.x < d.base - 140) d.dir = 1; }
    else if (d.kind === 'cat') {
      d.x += d.dir * 0.7;
      if (d.x > d.base + 170) d.dir = -1; else if (d.x < d.base - 170) d.dir = 1;
      const dxp = Math.abs(player.x - d.x);                  // meow every time you cross one
      if (dxp < 44 && !d.meowed) { d.meowed = true; playMeow(); }
      else if (dxp > 220) d.meowed = false;
    }
    else if (d.kind === 'cow') { d.x += d.dir * 0.18; if (d.x > d.base + 320) d.dir = -1; else if (d.x < d.base - 320) d.dir = 1; }
  }

  // ice cream wala jingle: louder as the cart gets closer, fades as it passes
  if (AC && iceGain) {
    let nearest = Infinity;
    for (const v of vehicles) if (v.kind === 'icecream') {
      const d = Math.abs((v.x + v.w / 2) - (player.x + player.w / 2));
      if (d < nearest) nearest = d;
    }
    const target = (musicOn && nearest < 750) ? 0.14 * (1 - nearest / 750) : 0;
    iceGain.gain.setTargetAtTime(target, AC.currentTime, 0.15);
  }

  // load shedding — happens once per run
  if (!shedDone) {
    shedT++;
    if (shedT === 1320) toast = { text: 'LOAD SHEDDING AANE WALI HAI...', t: 110 };
    if (shedT >= 1620) { shedDone = true; shedT = 0; }  // dark period halved (180 ticks instead of 360)
  }

  // zone toast
  const z = zoneAt(player.x), zPrev = zoneAt(player.x - player.vx);
  if (z !== zPrev && player.vx > 0) toast = { text: ZONES[z].name.toUpperCase(), t: 140 };
  if (toast.t > 0) toast.t--;
  else if (toastPending) { toast = toastPending; toastPending = null; }

  // camera
  cam.x = Math.max(0, Math.min(LEN - W, player.x - 330));

  player.anim += Math.abs(player.vx) * 0.08;

  // reach your Bykea at the top of the bridge -> ride away
  if (player.x + player.w >= RIDER_X - 6) {
    state = 'ride'; tEnd = performance.now();
    rideT = 0; bikeX = RIDER_X;
    for (const k in keys) keys[k] = false;
    playerSay.t = 0;
    sfx.win();                                   // level-clear jingle
  }
}

function stepRide() {
  rideT++;
  if (rideT > 55) {
    bikeX += 2.3;
    if (rideT % 5 === 0 && Math.random() < 0.85) sfx.phat();   // phattay silencer
  }
  player.x = bikeX;
  cam.x = Math.max(0, Math.min(LEN - W, bikeX - 330));
  // traffic keeps flowing behind us
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    v.x += v.vx;
    if (v.x + v.w < cam.x - 200) vehicles.splice(i, 1);
  }
  if (bikeX > LEN + 80) { state = 'credits'; creditsT = 0; }
}

// ============================================================
// RENDERING
// ============================================================
const isDark = () => state === 'play' && shedT >= 1440;        // lights out
const isFlicker = () => state === 'play' && shedT >= 1320 && shedT < 1440 && (shedT % 14 < 5);

// day fades to night over the first 100 seconds of a run
function nightFactor() {
  if (state === 'title' || !tStart) return 0;
  const el = ((tEnd || performance.now()) - tStart) / 1000;
  return Math.min(1, Math.max(0, el / 70));     // 5:30 PM -> 7:30 PM (full night) over 70s
}
function lerpColor(a, b, f) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * f);
  const g = ((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * f);
  const bl = (pa & 255) + (((pb & 255) - (pa & 255)) * f);
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')';
}

function px(x) { return Math.round(x - cam.x); }

function drawPlane(sx, sy, scale, t) {
  scale = scale || 1;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(scale, scale);
  ctx.fillStyle = '#d6dbe4';
  ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(14, -3); ctx.lineTo(20, 0); ctx.lineTo(14, 3); ctx.closePath(); ctx.fill(); // fuselage
  ctx.fillStyle = '#aab2be';
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-12, -9); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();   // wing up
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-12, 9); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();    // wing down
  ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-26, -6); ctx.lineTo(-19, 0); ctx.closePath(); ctx.fill(); // tail fin
  // flickering nav lights: red, green, white strobe
  const blink = Math.floor(t / 220) % 2 === 0;
  const strobe = Math.floor(t / 130) % 4 === 0;
  if (blink) { ctx.fillStyle = '#ff3b30'; ctx.fillRect(-13, -9, 2, 2); ctx.fillStyle = '#2ecc71'; ctx.fillRect(-13, 8, 2, 2); }
  if (strobe) { ctx.fillStyle = '#ffffff'; ctx.fillRect(18, -1, 3, 3); }
  ctx.restore();
}
// planes crossing the sky (left->right). 5:30pm one in daytime; recurring at night.
function drawSkyPlanes(nf) {
  const t = performance.now();
  if (state !== 'play' && state !== 'ride') return;
  const el = ((tEnd || performance.now()) - (tStart || performance.now())) / 1000;
  // daytime flight ~5:30pm (near the start now): one pass across ~18s + chemtrail fading over 30s
  if (el > 6 && el < 54) {
    const planeF = (el - 6) / 18;                              // >1 after it has exited
    for (let i = 0; i <= 64; i++) {                            // chemtrail puffs along the flown path
      const ff = i / 64;
      if (ff > Math.min(1, planeF)) break;
      const age = el - (6 + ff * 18), a = 1 - age / 30;
      if (a <= 0) continue;
      const tx = ff * (W + 120) - 60, ty = 56 + Math.sin(ff * 3) * 6;
      ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#eef3f7';
      ctx.fillRect(tx - 18, ty - 2, 8, 4);
    }
    ctx.globalAlpha = 1;
    if (planeF <= 1.05) drawPlane(planeF * (W + 120) - 60, 56 + Math.sin(planeF * 3) * 6, 1.4, t);
  }
  // night flights: recurring once it's dark
  if (nf > 0.6) {
    for (let k = 0; k < 2; k++) {
      const cyc = (t / 1000 + k * 9) % 16;                     // a plane every ~16s, staggered
      if (cyc < 11) {
        const f = cyc / 11;
        drawPlane(f * (W + 140) - 70, 44 + k * 34 + Math.sin(f * 4 + k) * 5, 1.2, t + k * 300);
      }
    }
  }
}

function draw() {
  // sky: day -> dusk -> night over the run; load shedding stays its own darkness
  const nf = nightFactor();
  const shed = isDark() || isFlicker();
  const dark = shed || nf > 0.55;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  if (shed) { skyGrad.addColorStop(0, '#0d1030'); skyGrad.addColorStop(1, '#2a2547'); }
  else {
    skyGrad.addColorStop(0, lerpColor('#6fb7e8', '#0e1233', nf));
    skyGrad.addColorStop(1, lerpColor('#cfe8d9', '#2b2148', nf));
  }
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);
  if (nf > 0.6 && state !== 'title') {                          // stars come out
    ctx.fillStyle = 'rgba(220,228,255,' + (0.7 * (nf - 0.6) / 0.4).toFixed(2) + ')';
    for (let i = 0; i < 24; i++) ctx.fillRect((i * 167 + 23) % W, (i * 59) % 180 + 8, 2, 2);
  }
  // setting sun: high & bright at 4:30, sinks behind the skyline and fades out by 7:30
  if (!shed && nf < 0.98 && (state === 'play' || state === 'ride')) {
    const sunX = W * 0.74;
    const sunY = 70 + nf * (GROUND_Y - 30);                    // descends past the rooftops
    const sunR = 26;
    const a = Math.max(0, 1 - nf / 0.95);
    const warm = lerpColor('#ffd86b', '#ff6a3d', nf);          // yellow -> deep orange
    ctx.globalAlpha = 0.20 * a; ctx.fillStyle = warm; circle(sunX, sunY, sunR + 18);
    ctx.globalAlpha = a; ctx.fillStyle = warm; circle(sunX, sunY, sunR);
    ctx.globalAlpha = 1;
  }
  // night planes + the one 5:30pm daytime flight, crossing left -> right
  drawSkyPlanes(nf);

  if (state === 'title') { drawTitle(); return; }
  if (state === 'credits') { drawCredits(); return; }

  drawSkyline(dark);
  drawClouds(dark);
  drawRoadAndGround(dark);
  for (const b of buildings) if (b.x + b.w > cam.x - 20 && b.x < cam.x + W + 20) drawBuilding(b, dark);
  drawWiresLayer(dark);
  for (const d of decors) if (d.x > cam.x - 400 && d.x < cam.x + W + 400) drawDecor(d, dark);
  for (const ban of banners) if (ban.x > cam.x - 500 && ban.x < cam.x + W + 100) drawBanner(ban);
  for (const p of platforms) if (p.x + p.w > cam.x && p.x < cam.x + W) drawPlatform(p);
  for (const s of solids) if (s.x + s.w > cam.x && s.x < cam.x + W) drawSolid(s);
  drawTrenchesAndWires();
  for (const c of coinsAll) if (!c.taken && c.x > cam.x - 20 && c.x < cam.x + W + 20) drawCoin(c);
  for (const p of powerups) if (!p.taken && p.x > cam.x - 30 && p.x < cam.x + W + 30) drawPowerup(p);
  for (const v of vehicles) if (v.x + v.w > cam.x && v.x < cam.x + W) drawVehicle(v);
  drawPlayer();
  if (state === 'ride') drawRideScene();
  if (playerSay.t > 0 && state === 'play')
    speechBubble(px(player.x) + player.w / 2, Math.round(player.y) - 52, playerSay.text);

  if (dark) drawDarkness();
  drawHUD();
  if (state === 'gameover') drawGameOver();
  if (state === 'win') drawWin();
  if (paused && state === 'play') {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px monospace'; ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2); ctx.textAlign = 'left';
  }
}

function drawSkyline(dark) {
  // distant parallax silhouettes (KU trees early, apartments later)
  const off = cam.x * 0.3;
  ctx.fillStyle = dark ? '#1c1838' : '#a8c8b8';
  for (let i = -1; i < 9; i++) {
    const bx = i * 260 - (off % 260);
    const hh = 90 + ((i * 73) % 70);
    ctx.fillRect(bx, GROUND_Y - 150 - hh + 60, 120, hh + 90);
    ctx.fillRect(bx + 140, GROUND_Y - 110 - ((i * 37) % 50) + 60, 80, 200);
  }
}

const CLOUDS = [{ wx: 600, y: 78, s: 1 }, { wx: 2950, y: 58, s: 1.35 }, { wx: 5600, y: 96, s: 0.85 }, { wx: 8300, y: 66, s: 1.2 }, { wx: 11400, y: 88, s: 1 }];
function drawClouds(dark) {
  const t = performance.now() / 1000;
  ctx.fillStyle = dark ? 'rgba(200,205,230,0.10)' : 'rgba(255,255,255,0.85)';
  for (const c of CLOUDS) {
    let sx = (c.wx - cam.x * 0.4 + t * 7) % (LEN * 0.6);
    if (sx < -260) sx += LEN * 0.6;
    if (sx > W + 260) continue;
    circle(sx, c.y, 18 * c.s); circle(sx + 20 * c.s, c.y + 4, 14 * c.s);
    circle(sx - 20 * c.s, c.y + 5, 13 * c.s); circle(sx + 5 * c.s, c.y - 8, 12 * c.s);
  }
}

function maybeCaw(id, sx, hasCrow) {
  if (!hasCrow || state !== 'play') return;
  if (sx < -10 || sx > W + 10) { crowSeen.delete(id); return; }
  if (!crowSeen.has(id)) { crowSeen.add(id); if (Math.random() < 0.5) sfx.caw(); }   // 50% of sightings
}
function crowAt(sx, sy, flap) {
  ctx.fillStyle = '#15151a';
  ctx.fillRect(sx - 4, sy - 4, 9, 5);                       // body
  ctx.fillRect(sx + 4, sy - 7, 4, 4);                       // head
  ctx.fillStyle = '#e8a13c'; ctx.fillRect(sx + 8, sy - 6, 3, 2);  // beak
  ctx.fillStyle = '#15151a'; ctx.fillRect(sx - 8, sy - 6, 5, 3);  // tail
  if (flap !== undefined) ctx.fillRect(sx - 2, sy - (flap ? 10 : 1), 8, 3);            // wings
  else { ctx.fillRect(sx - 3, sy + 1, 2, 3); ctx.fillRect(sx + 1, sy + 1, 2, 3); }      // legs
}
function drawWiresLayer(dark) {
  const top = GROUND_Y - 172;
  ctx.strokeStyle = dark ? '#0c0c10' : '#1b1b1f'; ctx.lineWidth = 1.6;
  for (let wx = 140; wx < LEN - 200; wx += 460) {           // wires run the whole road, bridge too
    if (wx + 460 < cam.x || wx > cam.x + W) continue;
    const onBridge = wx >= RAMP_X0;
    const ptop = onBridge ? groundYAt(wx) - 168 : top;       // poles ride up with the deck
    const pbot = onBridge ? groundYAt(wx) : GROUND_Y;
    const sx = px(wx);
    maybeCaw('pole' + wx, sx + 226, ((wx / 460) | 0) % 3 === 1);
    ctx.fillStyle = dark ? '#241c12' : '#4e3b24';            // pole + crossarm
    ctx.fillRect(sx - 3, ptop - 10, 6, pbot - ptop + 10);
    ctx.fillRect(sx - 16, ptop - 6, 32, 4);
    const nextTop = (wx + 460 >= RAMP_X0) ? groundYAt(wx + 460) - 168 : top;
    for (let j = 0; j < 3; j++) {                            // sagging cables to the next pole
      ctx.beginPath(); ctx.moveTo(sx, ptop + j * 6);
      ctx.quadraticCurveTo((sx + px(wx + 460)) / 2, (ptop + nextTop) / 2 + 26 + j * 7, px(wx + 460), nextTop + j * 6);
      ctx.stroke();
    }
    if (((wx / 460) | 0) % 3 === 1) crowAt(sx + 226, ptop + 14);
  }
  // crow committee over Madina Meat Shop
  if (4200 > cam.x - 300 && 4500 < cam.x + W + 300) {
    maybeCaw('committee', px(4368), true);
    crowAt(px(4310), top + 16); crowAt(px(4368), top + 19); crowAt(px(4425), top + 15);
    crowAt(px(4400), GROUND_Y - 192);                        // one on the shop roof
  }
  // flying crows
  const t = performance.now();
  for (let i = 0; i < 2; i++) {
    const wxf = (t * 0.045 + i * 5200) % LEN;
    const sxf = px(wxf);
    if (sxf < -40 || sxf > W + 40) continue;
    crowAt(sxf, 150 + Math.sin(t / 900 + i * 2) * 35, Math.floor(t / 160 + i) % 2 === 0);
  }
}

function drawRoadAndGround(dark) {
  const DECK = 24;                                          // bridge deck thickness
  // under-bridge scene first (so the deck and pillars overlay it)
  if (cam.x + W > RAMP_X0 + 20) drawUnderpass(dark);

  // footpath strip + road / deck, following the profile
  for (let sx = 0; sx <= W; sx += 4) {
    const wx = cam.x + sx;
    const gy = groundYAt(wx);
    const onBridge = wx >= RAMP_X0 + 10;
    ctx.fillStyle = dark ? '#3a3a46' : '#b9b1a3';            // footpath / deck edge
    ctx.fillRect(sx, gy, 4, 16);
    if (onBridge) {
      ctx.fillStyle = dark ? '#23232b' : '#5a5660';          // deck slab (finite thickness)
      ctx.fillRect(sx, gy + 16, 4, DECK);
      ctx.fillStyle = dark ? '#15151b' : '#403d45';          // deck soffit shadow
      ctx.fillRect(sx, gy + 16 + DECK - 4, 4, 4);
      if (wx % 80 < 40) { ctx.fillStyle = dark ? '#4a4a3a' : '#d9d090'; ctx.fillRect(sx, gy + 30, 4, 4); }
    } else {
      ctx.fillStyle = dark ? '#26262e' : '#555259';          // road asphalt to bottom
      ctx.fillRect(sx, gy + 16, 4, H - gy - 16);
      if (wx % 80 < 40) { ctx.fillStyle = dark ? '#4a4a3a' : '#d9d090'; ctx.fillRect(sx, gy + 44, 4, 5); }
    }
  }
  // trench holes (only on the ground-level stretch)
  for (const t of trenches) {
    if (t.x + t.w < cam.x || t.x > cam.x + W) continue;
    ctx.fillStyle = '#14100c';
    ctx.fillRect(px(t.x), GROUND_Y, t.w, H - GROUND_Y);
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(px(t.x) - 5, GROUND_Y - 3, 5, 8); ctx.fillRect(px(t.x + t.w), GROUND_Y - 3, 5, 8);
    if (t.label) {                                            // labelled potholes
      const lx = px(t.x + t.w / 2);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(lx - 30, GROUND_Y - 58, 60, 16);
      ctx.fillStyle = '#1e1e1e'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(t.label, lx, GROUND_Y - 47);
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(lx - 1, GROUND_Y - 42, 2, 12); ctx.textAlign = 'left';
    }
  }
  // bridge railing along the deck
  if (cam.x + W > RAMP_X0 - 100) {
    ctx.strokeStyle = '#2e7d52'; ctx.lineWidth = 4;
    ctx.beginPath();
    let started = false;
    for (let sx = 0; sx <= W; sx += 8) {
      const wx = cam.x + sx;
      if (wx < RAMP_X0) continue;
      const gy = groundYAt(wx) - 34;
      if (!started) { ctx.moveTo(sx, gy); started = true; } else ctx.lineTo(sx, gy);
    }
    ctx.stroke();
    for (let wx2 = RAMP_X0; wx2 < LEN; wx2 += 40) {
      if (wx2 < cam.x || wx2 > cam.x + W) continue;
      ctx.fillStyle = '#2e7d52';
      ctx.fillRect(px(wx2), groundYAt(wx2) - 34, 4, 34);
    }
  }
}

// The road that passes UNDER the flyover, running into the distance
// (perpendicular to our left-right travel), plus the support pillars.
function drawUnderpass(dark) {
  const x0 = Math.max(0, Math.round(RAMP_X0 + 10 - cam.x));
  const horizon = GROUND_Y - 6;                            // where the underpass meets the gap
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, 0, W - x0, H); ctx.clip();
  // distant ground / haze under the bridge
  const g = ctx.createLinearGradient(0, horizon - 60, 0, H);
  if (dark) { g.addColorStop(0, '#2a3340'); g.addColorStop(1, '#1b2028'); }
  else { g.addColorStop(0, '#b7c4d0'); g.addColorStop(1, '#8c97a3'); }
  ctx.fillStyle = g; ctx.fillRect(x0, horizon - 60, W - x0, H - (horizon - 60));
  // perspective cross-road, anchored in WORLD space so it parallaxes as you move
  const UNDER_X = 12150;                                   // where Rashid Minhas crosses
  const cxw = px(UNDER_X);
  const vpx = cxw + 6, vpy = horizon - 48;
  const nearL = cxw - 250, nearR = cxw + 285;
  ctx.fillStyle = dark ? '#22222a' : '#514d57';
  ctx.beginPath();
  ctx.moveTo(nearL, H); ctx.lineTo(vpx - 14, vpy); ctx.lineTo(vpx + 14, vpy); ctx.lineTo(nearR, H);
  ctx.closePath(); ctx.fill();
  // dashed centre line converging to the vanishing point
  ctx.strokeStyle = dark ? '#4a4a3a' : '#d9d090'; ctx.lineWidth = 3;
  const midNear = (nearL + nearR) / 2;
  for (let i = 0; i < 6; i++) {
    const f0 = i / 6 + 0.04, f1 = i / 6 + 0.13;
    ctx.beginPath();
    ctx.moveTo(vpx + (midNear - vpx) * f0, vpy + (H - vpy) * f0);
    ctx.lineTo(vpx + (midNear - vpx) * f1, vpy + (H - vpy) * f1);
    ctx.stroke();
  }
  // road edge lines converging with the lanes
  ctx.strokeStyle = 'rgba(230,225,180,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nearL, H); ctx.lineTo(vpx - 13, vpy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nearR, H); ctx.lineTo(vpx + 13, vpy); ctx.stroke();
  // detailed cars in their own lanes — left lane comes toward us, right lane recedes
  const t = performance.now() / 1000;
  const halfNear = (nearR - nearL) / 2;
  const cars = [
    { lane: -1, off: 0.00, col: '#2980b9' }, { lane: -1, off: 0.55, col: '#27ae60' },
    { lane: 1, off: 0.28, col: '#c0392b' }, { lane: 1, off: 0.78, col: '#ecf0f1' },
  ];
  for (const c of cars) {
    const approaching = c.lane < 0;                          // toward viewer => shows headlights
    const f = approaching ? ((t * 0.16 + c.off) % 1) : (1 - ((t * 0.14 + c.off) % 1));
    const half = 13 + (halfNear - 13) * f;
    const cx2 = vpx + (midNear - vpx) * f + c.lane * 0.5 * half;
    const cy2 = vpy + (H - vpy) * f;
    const cw = 6 + f * 30, ch = 4 + f * 15;
    const bx = cx2 - cw / 2, by = cy2 - ch;
    ctx.fillStyle = c.col; ctx.fillRect(bx, by, cw, ch);     // body
    ctx.fillStyle = shade(c.col[0] === '#' && c.col.length === 7 ? c.col : '#888', 0.7);
    ctx.fillRect(bx, by, cw, Math.max(1, ch * 0.32));        // cabin/roof
    ctx.fillStyle = 'rgba(170,210,235,0.8)'; ctx.fillRect(bx + cw * 0.18, by + ch * 0.18, cw * 0.64, ch * 0.2); // windscreen
    if (approaching) {                                        // white headlights facing us
      ctx.fillStyle = '#fff6c0'; ctx.fillRect(bx + 1, by + ch - 3, 3, 2.5); ctx.fillRect(bx + cw - 4, by + ch - 3, 3, 2.5);
      if (dark) { ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff3a8'; ctx.fillRect(bx - cw * 0.3, by + ch - 4, cw * 1.6, 5); ctx.globalAlpha = 1; }
    } else {                                                  // red tail-lights facing away
      ctx.fillStyle = '#ff3b30'; ctx.fillRect(bx + 1, by + 1, 3, 2.5); ctx.fillRect(bx + cw - 4, by + 1, 3, 2.5);
    }
  }
  // RASHID MINHAS ROAD sign — big, low and near the camera so it's clearly readable
  const gx = cxw, gtop = horizon - 30;                     // low in the open, below the deck
  ctx.fillStyle = dark ? '#26303a' : '#5a6470';
  ctx.fillRect(gx - 84, gtop + 22, 6, horizon - gtop - 16); ctx.fillRect(gx + 78, gtop + 22, 6, horizon - gtop - 16);
  ctx.fillStyle = dark ? '#0a4f29' : '#0b6e3a'; ctx.fillRect(gx - 90, gtop, 180, 24);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(gx - 90, gtop, 180, 24);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  ctx.fillText('RASHID MINHAS ROAD', gx, gtop + 16); ctx.textAlign = 'left';
  ctx.restore();
  // support pillars from the deck soffit down (none in the carriageway itself)
  for (let wx = Math.ceil((RAMP_X0 + 10) / 220) * 220; wx < LEN; wx += 220) {
    if (Math.abs(wx - 12150) < 140) continue;               // keep the crossing clear
    const sx = wx - cam.x; if (sx < x0 - 30 || sx > W + 30) continue;
    const top = groundYAt(wx) + 40;
    ctx.fillStyle = dark ? '#4a4640' : '#7d7972';
    ctx.fillRect(sx - 9, top, 18, horizon - top + 4);
    ctx.fillStyle = dark ? '#3a362f' : '#6a665f';
    ctx.fillRect(sx - 9, top, 4, horizon - top + 4);        // shade
    ctx.fillStyle = dark ? '#534f48' : '#8c887f';
    ctx.fillRect(sx - 12, horizon, 24, 7);                  // footing
  }
}

function drawBuilding(b, dark) {
  const x = px(b.x), top = GROUND_Y - b.h;
  ctx.fillStyle = dark ? shade(b.c1, 0.35) : b.c1;
  ctx.fillRect(x, top, b.w, b.h);
  ctx.fillStyle = dark ? shade(b.c2, 0.35) : b.c2;
  ctx.fillRect(x, top, b.w, 8);
  ctx.fillRect(x, top, 6, b.h);
  // windows
  const floors = b.floors || Math.max(2, Math.floor(b.h / 70));
  for (let f = 0; f < floors; f++) {
    for (let wx = x + 16; wx < x + b.w - 22; wx += 34) {
      const wy = top + 36 + f * ((b.h - 60) / floors);
      if (wy > GROUND_Y - 50) continue;
      ctx.fillStyle = dark ? (Math.random() < 0.04 ? '#ffe9a8' : '#11112a') : '#2c4b66';
      ctx.fillRect(wx, wy, 18, 22);
    }
  }
  // texture: water tank, dish antenna, AC units, drain pipe (deterministic per building)
  const seed = (b.x * 7919) % 97;
  if (b.w >= 130) {
    if (seed % 3 !== 0) {                                    // rooftop water tank
      ctx.fillStyle = dark ? shade('#caa53d', 0.4) : '#caa53d';
      ctx.fillRect(x + 14 + (seed % 30), top - 14, 24, 14);
      ctx.fillStyle = dark ? shade('#8c6f1f', 0.4) : '#8c6f1f';
      ctx.fillRect(x + 14 + (seed % 30), top - 14, 24, 3);
    }
    if (seed % 4 === 1) {                                    // satellite dish
      ctx.fillStyle = '#cfd6dc'; ctx.beginPath(); ctx.arc(x + b.w - 26, top - 6, 9, Math.PI * 0.9, Math.PI * 1.9); ctx.fill();
      ctx.fillStyle = '#9aa4ad'; ctx.fillRect(x + b.w - 27, top - 8, 3, 9);
    }
    if (b.h > 150) {                                          // AC units
      ctx.fillStyle = '#c8cfd4'; ctx.fillRect(x + 12 + (seed % 24), top + 64, 15, 9);
      ctx.fillStyle = '#9aa4ad'; ctx.fillRect(x + 12 + (seed % 24), top + 68, 15, 2);
      if (seed % 2) {
        ctx.fillStyle = '#c8cfd4'; ctx.fillRect(x + b.w - 36, top + 118, 15, 9);
        ctx.fillStyle = '#9aa4ad'; ctx.fillRect(x + b.w - 36, top + 122, 15, 2);
      }
    }
    ctx.fillStyle = 'rgba(40,40,40,0.25)';                    // drain pipe + damp stain
    ctx.fillRect(x + b.w - 10, top + 30, 4, b.h - 30);
    ctx.fillStyle = 'rgba(60,50,30,0.12)';
    ctx.fillRect(x + b.w - 16, top + 40, 14, b.h - 44);
  }
  // signboard
  const sh = 26;
  ctx.fillStyle = dark ? shade(b.sign, 0.4) : b.sign;
  ctx.fillRect(x + 2, top + 6, b.w - 4, sh);
  ctx.strokeStyle = '#00000033'; ctx.strokeRect(x + 2, top + 6, b.w - 4, sh);
  const fs = Math.min(13, Math.floor((b.w - 12) * 1.7 / b.name.length));
  ctx.font = 'bold ' + fs + 'px monospace';
  ctx.fillStyle = dark ? shade(b.signText, 0.5) : b.signText;
  ctx.textAlign = 'center';
  ctx.fillText(b.name, x + b.w / 2, top + 6 + sh / 2 + fs / 2 - 1);
  ctx.textAlign = 'left';
  // shop shutter at street level
  ctx.fillStyle = dark ? '#1a1a22' : '#46555e';
  ctx.fillRect(x + 10, GROUND_Y - 44, Math.min(60, b.w - 20), 44);
}

function shade(hex, f) {
  // darken a #rrggbb color by factor f
  if (hex[0] !== '#' || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * f | 0, g = ((n >> 8) & 255) * f | 0, bl = (n & 255) * f | 0;
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

function drawPlatform(p) {
  const x = px(p.x);
  if (p.awning) {
    ctx.fillStyle = p.c || '#2ecc71';
    ctx.fillRect(x, p.y, p.w, 8);
    for (let i = 0; i < p.w; i += 22) { ctx.fillRect(x + i, p.y + 8, 12, 7); }
  } else {
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x, p.y, p.w, 6);
  }
}

function drawSolid(s) {
  const x = px(s.x);
  if (s.kind === 'mehran') {
    ctx.fillStyle = '#eef2f5'; ctx.fillRect(x, s.y + 12, s.w, 22);
    ctx.fillRect(x + 22, s.y, s.w - 44, 16);
    ctx.fillStyle = '#9fb6c4'; ctx.fillRect(x + 26, s.y + 3, s.w - 52, 12);
    ctx.fillStyle = '#222'; circle(x + 24, s.y + 36, 9); circle(x + s.w - 24, s.y + 36, 9);
  } else if (s.kind === 'suzuki') {
    ctx.fillStyle = '#3867d6'; ctx.fillRect(x, s.y + 16, s.w, 20);
    ctx.fillRect(x + s.w - 44, s.y - 2, 40, 20);
    ctx.fillStyle = '#e58e26'; ctx.fillRect(x + 6, s.y, 70, 16);   // fruit crates
    ctx.fillStyle = '#c23616'; ctx.fillRect(x + 10, s.y - 6, 60, 8);
    ctx.fillStyle = '#222'; circle(x + 24, s.y + 40, 10); circle(x + s.w - 28, s.y + 40, 10);
  } else if (s.kind === 'barrier') {
    for (let i = 0; i < s.h; i += 10) {
      ctx.fillStyle = (i / 10) % 2 ? '#fff' : '#e74c3c';
      ctx.fillRect(x, s.y + i, s.w, 10);
    }
  } else if (s.kind === 'container') {
    ctx.fillStyle = '#c0573a'; ctx.fillRect(x, s.y, s.w, s.h);
    ctx.fillStyle = '#93402a';
    for (let i = 8; i < s.w; i += 18) ctx.fillRect(x + i, s.y + 4, 6, s.h - 8);
  } else if (s.kind === 'sandpile') {
    ctx.fillStyle = '#d9b36c';
    ctx.beginPath();
    ctx.moveTo(x, s.y + s.h); ctx.lineTo(x + s.w / 2, s.y - 6); ctx.lineTo(x + s.w, s.y + s.h);
    ctx.closePath(); ctx.fill();
  }
}

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function drawCop(cx, gy, face) {
  // Karachi police constable: khaki shirt, dark trousers, peaked cap
  face = face || 1;
  ctx.fillStyle = '#2b2f38';                                  // trousers
  ctx.fillRect(cx - 6, gy - 18, 5, 18); ctx.fillRect(cx + 1, gy - 18, 5, 18);
  ctx.fillStyle = '#1a1d23'; ctx.fillRect(cx - 7, gy - 2, 7, 3); ctx.fillRect(cx, gy - 2, 7, 3); // boots
  ctx.fillStyle = '#a98c54';                                  // khaki shirt
  ctx.fillRect(cx - 7, gy - 33, 14, 16);
  ctx.fillStyle = '#8f7544'; ctx.fillRect(cx - 7, gy - 33, 14, 3);  // shoulder line
  ctx.fillStyle = '#c69a6b'; ctx.fillRect(cx + 6 * face - 2, gy - 31, 4, 12); // arm
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 5, gy - 44, 10, 11);          // head
  ctx.fillStyle = '#23303f'; ctx.fillRect(cx - 6, gy - 47, 12, 5);           // cap
  ctx.fillStyle = '#23303f'; ctx.fillRect(cx + (face > 0 ? 5 : -9), gy - 44, 4, 2); // cap peak
  ctx.fillStyle = '#1a1d23'; ctx.fillRect(cx - 4 + (face > 0 ? 3 : 0), gy - 40, 2, 2); // eye
}
function speechBubble(cx, by, text) {
  ctx.font = 'bold 13px monospace';
  const tw = ctx.measureText(text).width, bw = tw + 22, bh = 30;
  const bx = cx - bw / 2;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1e272e'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 7); else ctx.rect(bx, by, bw, bh);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath();                    // tail
  ctx.moveTo(cx - 6, by + bh); ctx.lineTo(cx + 4, by + bh); ctx.lineTo(cx - 2, by + bh + 9); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = '#1e272e';
  ctx.beginPath(); ctx.moveTo(cx - 6, by + bh); ctx.lineTo(cx - 2, by + bh + 9); ctx.lineTo(cx + 4, by + bh); ctx.stroke();
  ctx.fillStyle = '#1e272e'; ctx.textAlign = 'center';
  ctx.fillText(text, cx, by + bh / 2 + 5); ctx.textAlign = 'left';
}
function pedFace(cx, gy, face) {
  face = face || 1;
  const e = face > 0 ? 0 : -1;                                 // shift eyes toward facing dir
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 3 + e, gy - 37, 2, 2); ctx.fillRect(cx + 1 + e, gy - 37, 2, 2);
  ctx.fillStyle = '#15151a'; ctx.fillRect(cx - 2 + e, gy - 37, 1, 1); ctx.fillRect(cx + 2 + e, gy - 37, 1, 1); // pupils
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(cx - 3 + e, gy - 39, 2, 1); ctx.fillRect(cx + 1 + e, gy - 39, 2, 1); // brows
  ctx.fillStyle = '#a9763f'; ctx.fillRect(cx + e, gy - 35, 1, 2);                                              // nose
  ctx.fillStyle = '#7a3b2a'; ctx.fillRect(cx - 1 + e, gy - 33, 3, 1);                                          // mouth
}
function drawPedestrian(cx, gy, shirt, ph, idle, type) {
  type = type || 'man';
  const sw = idle ? 0 : Math.sin(ph) * 2.5;
  if (type === 'burqa') type = 'floral';                       // no lone all-black figures
  // legs (shalwar)
  ctx.fillStyle = '#dcdcd2';
  ctx.fillRect(cx - 5 + sw, gy - 16, 5, 16);
  ctx.fillRect(cx + 1 - sw, gy - 16, 5, 16);
  ctx.fillStyle = '#2b2b2b'; ctx.fillRect(cx - 6 + sw, gy - 2, 6, 2); ctx.fillRect(cx + sw, gy - 2, 6, 2); // chappals
  if (type === 'floral') {
    // printed floral shalwar kameez + dupatta
    ctx.fillStyle = '#f3e2ec'; ctx.fillRect(cx - 6, gy - 31, 13, 19);
    const fc = ['#e84393', '#27ae60', '#e67e22', '#8e44ad'];
    for (let i = 0; i < 7; i++) { ctx.fillStyle = fc[i % 4]; circle(cx - 4 + ((i * 5) % 12), gy - 28 + ((i * 6) % 15), 1.4); }
    ctx.fillStyle = '#d63384'; ctx.fillRect(cx - 7, gy - 31, 15, 3);           // dupatta across
    ctx.fillRect(cx + 5, gy - 31, 3, 13);
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 4, gy - 40, 8, 9);            // head
    ctx.fillStyle = '#d63384'; ctx.fillRect(cx - 5, gy - 43, 10, 5);          // headscarf
    ctx.fillStyle = '#d63384'; ctx.fillRect(cx - 6, gy - 39, 2, 6); ctx.fillRect(cx + 4, gy - 39, 2, 6); // scarf sides
    pedFace(cx, gy, 1);
    return;
  }
  // man
  ctx.fillStyle = shirt; ctx.fillRect(cx - 6, gy - 31, 13, 19);
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 4, gy - 40, 8, 9);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cx - 5, gy - 42, 10, 3);            // hair
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cx - 5, gy - 40, 1, 4); ctx.fillRect(cx + 4, gy - 40, 1, 4); // sideburns
  pedFace(cx, gy, 1);
}
function wheel(cx, cy, r) {
  ctx.fillStyle = '#161616'; circle(cx, cy, r);          // tyre
  ctx.fillStyle = '#3a3f44'; circle(cx, cy, r * 0.55);   // rim
  ctx.fillStyle = '#aab2b8'; circle(cx, cy, r * 0.32);   // hub
  ctx.fillStyle = '#161616'; circle(cx, cy, 1.5);        // bolt
}
function spokeWheel(cx, cy, r) {
  ctx.fillStyle = '#161616'; circle(cx, cy, r);          // black tyre
  ctx.fillStyle = '#e0231a'; circle(cx, cy, r - 3);      // red rim
  ctx.fillStyle = '#eef0f1'; circle(cx, cy, r - 5);      // spoke field
  ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5)); ctx.stroke(); }
  ctx.fillStyle = '#444'; circle(cx, cy, 2.5);           // hub
}

function drawTrenchesAndWires() {
  for (const wz of wires) {
    if (wz.x + wz.w < cam.x || wz.x > cam.x + W) continue;
    const x = px(wz.x);
    if (wz.y < GROUND_Y - 100) {
      // hanging wire tangle
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 30, wz.y - 40);
      ctx.quadraticCurveTo(x + wz.w / 2, wz.y + 36, x + wz.w + 30, wz.y - 44);
      ctx.stroke();
    } else {
      // rebar spikes
      ctx.fillStyle = '#8a4b2d';
      for (let i = 0; i < wz.w; i += 12) ctx.fillRect(x + i, wz.y, 4, wz.h);
    }
    if (Math.floor(performance.now() / 120) % 3 === 0) {
      ctx.fillStyle = '#ffe45c';
      ctx.fillRect(x + wz.w / 2 - 3 + (Math.random() * 8 - 4), wz.y + 6, 6, 6);
    }
  }
}

function drawCoin(c) {
  const x = px(c.x);
  const bob = Math.sin(performance.now() / 280 + c.x) * 3;
  ctx.fillStyle = '#f1c40f'; circle(x, c.y + bob, 9);
  ctx.fillStyle = '#b7950b'; circle(x, c.y + bob, 6);
  ctx.fillStyle = '#f9e79f';
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('R', x, c.y + bob + 3); ctx.textAlign = 'left';
}

function drawPowerup(p) {
  const x = px(p.x);
  const bob = Math.sin(performance.now() / 240 + p.x) * 4;
  const y = p.y + bob;
  if (p.kind === 'chai') {
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 9, y - 6, 18, 16);
    ctx.fillStyle = '#b46a32'; ctx.fillRect(x - 7, y - 3, 14, 11);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + 12, y + 2, 5, -1.2, 1.2); ctx.stroke();
    steam(x, y - 12);
  } else if (p.kind === 'bunkabab') {
    ctx.fillStyle = '#e8b04b'; ctx.fillRect(x - 12, y - 8, 24, 7);
    ctx.fillStyle = '#7a4421'; ctx.fillRect(x - 11, y - 1, 22, 5);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(x - 11, y + 4, 22, 3);
    ctx.fillStyle = '#e8b04b'; ctx.fillRect(x - 12, y + 7, 24, 6);
  } else if (p.kind === 'biryani') {
    ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.ellipse(x, y + 6, 16, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.ellipse(x, y + 2, 13, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f5cd79'; ctx.fillRect(x - 8, y - 4, 3, 5); ctx.fillRect(x - 1, y - 6, 3, 7); ctx.fillRect(x + 6, y - 4, 3, 5);
    steam(x, y - 14);
  }
}
function steam(x, y) {
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
  const t = performance.now() / 300;
  ctx.beginPath(); ctx.moveTo(x - 4, y + 6);
  ctx.quadraticCurveTo(x - 8 + Math.sin(t) * 3, y, x - 4, y - 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 4, y + 6);
  ctx.quadraticCurveTo(x + 8 + Math.cos(t) * 3, y, x + 4, y - 7); ctx.stroke();
}

function drawVehicle(v) {
  const x = px(v.x), y = groundYAt(v.x + v.w / 2) - v.h;
  // tilt the whole vehicle to match the road slope (bridge ramp)
  const slopeAng = Math.atan2(groundYAt(v.x + v.w) - groundYAt(v.x), v.w);
  ctx.save();
  if (slopeAng) {
    const pivX = x + v.w / 2, pivY = groundYAt(v.x + v.w / 2);
    ctx.translate(pivX, pivY); ctx.rotate(slopeAng); ctx.translate(-pivX, -pivY);
  }
  if (v.kind === 'rickshaw' && sprites.rickshaw) {
    // real photo sprite — scale by opaque content, land its wheels on the road
    const spr = sprites.rickshaw, c = spr.content || { x: 0, y: 0, w: spr.width, h: spr.height };
    const s = Math.min((v.w + 16) / c.w, (v.h + 8) / c.h);
    const dw = spr.width * s, dh = spr.height * s;
    const dx = x + v.w / 2 - (c.x + c.w / 2) * s;          // centre content over the box
    const dy = y + v.h - (c.y + c.h) * s + 1;             // content bottom on the ground line
    ctx.drawImage(spr, dx, dy, dw, dh);
    // driver up front so it isn't a ghost rickshaw
    ctx.fillStyle = '#3a2f26'; ctx.fillRect(dx + dw * 0.30, dy + dh * 0.30, dh * 0.13, dh * 0.13);  // head
    ctx.fillStyle = '#5d4a3a'; ctx.fillRect(dx + dw * 0.285, dy + dh * 0.42, dh * 0.17, dh * 0.16); // torso
  } else if (v.kind === 'rickshaw') {
    // fallback drawn sprite (used until assets/rickshaw.png is present)
    const G = '#4f9d5f', GD = '#2f6e3d', K = '#9a917c', KD = '#6f6857';
    const wy = y + v.h - 6;
    // curved green fenders over wheels (front smaller, rear larger)
    ctx.fillStyle = GD;
    ctx.beginPath(); ctx.arc(x + 16, wy - 1, 13, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + v.w - 16, wy - 1, 15, Math.PI, 0); ctx.closePath(); ctx.fill();
    wheel(x + 16, wy, 8);
    wheel(x + v.w - 16, wy, 10);
    // lower green body, rounded nose (left) and tail (right)
    ctx.fillStyle = G;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 35);
    ctx.quadraticCurveTo(x + 1, y + 37, x + 2, y + 45);            // front nose
    ctx.lineTo(x + 2, y + v.h - 6);
    ctx.lineTo(x + v.w - 2, y + v.h - 6);
    ctx.lineTo(x + v.w - 2, y + 43);
    ctx.quadraticCurveTo(x + v.w - 1, y + 35, x + v.w - 9, y + 35); // tail
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = G; ctx.fillRect(x + 5, y + 33, v.w - 10, 6);   // cabin sill the canopy sits on
    // open passenger compartment (rear two-thirds) with centre + rear pillars
    ctx.fillStyle = '#eef1ee'; ctx.fillRect(x + 27, y + 21, v.w - 35, 17);
    ctx.fillStyle = G; ctx.fillRect(x + 27 + (v.w - 35) / 2 - 2, y + 21, 4, 17); // centre pillar
    ctx.fillStyle = GD; ctx.fillRect(x + v.w - 10, y + 21, 4, 17);               // rear pillar
    // front driver bay: quarter panel + windscreen + driver
    ctx.fillStyle = G; ctx.fillRect(x + 4, y + 21, 23, 17);
    ctx.fillStyle = '#13456e'; ctx.fillRect(x + 6, y + 22, 15, 13);            // screen frame
    ctx.fillStyle = '#cfe8f2'; ctx.fillRect(x + 7, y + 23, 13, 10);           // glass
    ctx.fillStyle = '#3a2f26'; ctx.fillRect(x + 23, y + 23, 5, 12);           // driver
    // --- tall domed khaki soft-top canopy ---
    ctx.fillStyle = K;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 22);
    ctx.bezierCurveTo(x + 1, y + 1, x + v.w - 3, y + 1, x + v.w - 3, y + 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = KD; ctx.fillRect(x + 5, y + 19, v.w - 10, 3);             // shadow lip
    ctx.strokeStyle = KD; ctx.lineWidth = 1;                                   // canopy ribs
    for (let rx = x + 20; rx < x + v.w - 8; rx += 15) {
      ctx.beginPath(); ctx.moveTo(rx, y + 20); ctx.quadraticCurveTo(rx + 3, y + 7, rx + 8, y + 4); ctx.stroke();
    }
    // black front peak / sun visor
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 21); ctx.quadraticCurveTo(x + 2, y + 6, x + 17, y + 7);
    ctx.lineTo(x + 13, y + 21); ctx.closePath(); ctx.fill();
    // headlamp + amber indicator on the nose
    ctx.fillStyle = '#2a2a2a'; circle(x + 2, y + 43, 4);
    ctx.fillStyle = '#f3c34a'; circle(x + 2, y + 43, 2.4);
    ctx.fillStyle = '#e67e22'; ctx.fillRect(x, y + 48, 4, 3);
  } else if (v.kind === 'qingqi') {
    ctx.fillStyle = '#1e272e'; ctx.fillRect(x + 4, y, v.w - 8, 14);            // canopy
    ctx.fillStyle = '#2980b9'; ctx.fillRect(x, y + 12, v.w, v.h - 26);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(x, y + 12, v.w, 5);                // trim
    ctx.fillStyle = '#aed6f1'; ctx.fillRect(x + 6, y + 16, 20, 14);            // windscreen
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x + 30, y + 18, 12, 12);           // driver
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x + v.w - 26, y + 16, 22, 16);     // pillion box
    wheel(x + 14, y + v.h - 8, 9); wheel(x + v.w - 16, y + v.h - 8, 9);
  } else if (v.kind === 'car') {
    const c = v.color || '#ecf0f1';
    ctx.fillStyle = c; ctx.fillRect(x, y + 20, v.w, v.h - 30);                  // lower body
    ctx.beginPath();                                                            // cabin, windscreen slants down-left (front)
    ctx.moveTo(x + 20, y + 20); ctx.lineTo(x + 32, y + 4);
    ctx.lineTo(x + v.w - 24, y + 4); ctx.lineTo(x + v.w - 14, y + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bfe0f0';
    ctx.beginPath();
    ctx.moveTo(x + 24, y + 18); ctx.lineTo(x + 34, y + 7);
    ctx.lineTo(x + v.w - 26, y + 7); ctx.lineTo(x + v.w - 18, y + 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c; ctx.fillRect(x + v.w / 2 - 2, y + 7, 4, 11);             // B-pillar
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 1, y + 22, 5, 6);               // headlight (front-left)
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x + v.w - 4, y + 22, 3, 6);         // tail-light (rear-right)
    wheel(x + 22, y + v.h - 8, 9); wheel(x + v.w - 22, y + v.h - 8, 9);
  } else if (v.kind === 'bus') {
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y + 6, v.w, v.h - 18);
    ctx.fillStyle = '#f39c12'; ctx.fillRect(x, y + 6, v.w, 9);
    ctx.fillStyle = '#16a085'; ctx.fillRect(x, y + v.h - 22, v.w, 8);
    ctx.fillStyle = '#f7dc6f';                                              // decorations
    for (let i = 8; i < v.w - 8; i += 16) ctx.fillRect(x + i, y + 18, 7, 7);
    ctx.fillStyle = '#aed6f1';
    for (let i = 10; i < v.w - 30; i += 34) ctx.fillRect(x + i, y + 28, 22, 14);
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 10, y, v.w - 20, 8);          // roof rack
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(x, y + 24, 20, 18);               // front windscreen (left)
    ctx.fillStyle = '#aed6f1'; ctx.fillRect(x + 2, y + 26, 16, 12);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 1, y + v.h - 24, 4, 6);       // headlight (front-left)
    ctx.fillStyle = '#222'; circle(x + 34, y + v.h - 8, 11); circle(x + v.w - 38, y + v.h - 8, 11);
    ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('W-11', x + v.w / 2 + 8, y + 16); ctx.textAlign = 'left';
  } else if (v.kind === 'bike' && sprites.bike) {
    // real CD70 photo (mirrored to face left) with a rider on top
    const spr = sprites.bike, c = spr.content || { x: 0, y: 0, w: spr.width, h: spr.height };
    const s = Math.min((v.w + 18) / c.w, (v.h + 6) / c.h);
    const dw = spr.width * s, dh = spr.height * s;
    const dx = x + v.w / 2 - (c.x + c.w / 2) * s;
    const dy = y + v.h - (c.y + c.h) * s + 1;
    ctx.drawImage(spr, dx, dy, dw, dh);
    // rider perched on the seat (faces left toward the handlebars)
    const rx = x + v.w / 2 + 3, seatY = y + v.h - dh * 0.52;
    ctx.fillStyle = '#3a2f26'; ctx.fillRect(rx + 2, seatY, 5, 10);              // thigh (forward+down)
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(rx - 5, seatY - 13, 12, 14);        // torso
    ctx.fillStyle = '#24527a'; ctx.fillRect(rx - 11, seatY - 8, 7, 4);          // arm reaching to bars
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(rx - 4, seatY - 22, 9, 9);          // head
    ctx.fillStyle = '#b22222'; ctx.fillRect(rx - 5, seatY - 25, 11, 5);         // helmet top
    ctx.fillStyle = '#7a1818'; ctx.fillRect(rx - 9, seatY - 21, 4, 4);          // helmet visor (left)
  } else if (v.kind === 'bike') {
    // motorcycle facing left (fallback drawing)
    wheel(x + 12, y + v.h - 9, 10); wheel(x + v.w - 12, y + v.h - 9, 10);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 12, y + v.h - 9); ctx.lineTo(x + 30, y + 24);
    ctx.lineTo(x + v.w - 12, y + v.h - 9); ctx.stroke();                        // frame
    ctx.beginPath(); ctx.moveTo(x + 12, y + v.h - 9); ctx.lineTo(x + 8, y + 20); ctx.stroke(); // fork (left)
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 5, y + 18, 9, 3);              // handlebar
    ctx.fillStyle = '#888'; ctx.fillRect(x + v.w - 16, y + 28, 10, 4);         // exhaust (right)
    ctx.fillStyle = '#34495e'; ctx.fillRect(x + 24, y + 14, 18, 18);          // rider torso
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x + 23, y + 4, 13, 12);           // head
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(x + 21, y + 2, 17, 5);            // helmet
  } else if (v.kind === 'icecream') {
    // Wall's-style ice cream tricycle, facing LEFT (bike front-left, cart on the right)
    const R = '#e0231a', RD = '#a5160f';
    const wy = y + v.h - 11;
    // --- wheels: small bike wheel (left), big cart wheel (right) ---
    spokeWheel(x + 22, wy, 13);
    spokeWheel(x + v.w - 24, wy, 16);
    // --- bike frame + rider (left) ---
    ctx.strokeStyle = R; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 22, wy); ctx.lineTo(x + 42, y + 30);      // down/seat tube
    ctx.lineTo(x + 56, wy); ctx.lineTo(x + 22, wy);          // chain stay + crank
    ctx.moveTo(x + 42, y + 30); ctx.lineTo(x + 18, y + 26);  // top tube to bars
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 22, wy); ctx.lineTo(x + 16, y + 24); ctx.stroke(); // fork
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 36, y + 26, 13, 5);  // saddle
    ctx.fillStyle = '#888'; circle(x + 49, wy - 1, 3);              // pedal crank
    ctx.fillStyle = '#34495e'; ctx.fillRect(x + 30, y + 12, 14, 16); // rider torso
    ctx.fillStyle = '#c68642'; ctx.fillRect(x + 31, y + 3, 12, 11);  // rider head
    ctx.fillStyle = '#1e272e'; ctx.fillRect(x + 30, y + 1, 14, 4);   // cap
    // --- cart box (right) ---
    const bx = x + v.w - 56, bw = 54, byT = y + 18, bh = v.h - 26;
    ctx.fillStyle = '#fff'; ctx.fillRect(bx, byT, bw, bh);          // white body
    ctx.fillStyle = R; ctx.fillRect(bx - 2, byT - 7, bw + 6, 11);   // red lid
    ctx.fillStyle = '#ffd1cd'; ctx.fillRect(bx, byT - 5, bw, 3);    // lid highlight
    ctx.fillStyle = R; ctx.fillRect(bx, byT + bh - 14, bw, 14);     // red strawberry band
    ctx.fillStyle = '#ffb3ab'; for (let i = 4; i < bw; i += 12) circle(bx + i, byT + bh - 6, 2); // splash dots
    // heart motif + label (generic, not the trademark)
    ctx.fillStyle = R; ctx.fillRect(bx + 6, byT + 6, 18, 16);
    ctx.fillStyle = '#fff'; heart(bx + 15, byT + 13, 6);
    ctx.fillStyle = R; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left';
    ctx.fillText('ICE', bx + 28, byT + 12); ctx.fillText('CREAM', bx + 28, byT + 21);
    // --- pole + parasol ---
    const pX = bx + bw / 2, pTop = y - 36, pr = 42;
    ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pX, byT - 6); ctx.lineTo(pX, pTop); ctx.stroke();
    ctx.fillStyle = R;                                              // red dome
    ctx.beginPath(); ctx.moveTo(pX - pr, pTop + 6); ctx.quadraticCurveTo(pX, pTop - 26, pX + pr, pTop + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';                                         // white panel wedges
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.moveTo(pX, pTop - 18); ctx.lineTo(pX + s * 16, pTop + 5); ctx.lineTo(pX + s * 30, pTop + 5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = R;                                             // scalloped fringe
    for (let sx = pX - pr; sx < pX + pr; sx += 11) circle(sx + 5, pTop + 6, 5);
    ctx.fillStyle = '#888'; circle(pX, pTop - 24, 2.5);           // finial
    // music notes
    ctx.fillStyle = '#6c5ce7'; ctx.font = 'bold 13px monospace';
    const nb = Math.sin(performance.now() / 250) * 5;
    ctx.fillText('♪', x + 6, y + 4 + nb);
    ctx.fillText('♫', x + 24, y - 6 - nb);
  } else if (v.kind === 'dumper') {
    // cab (front) on the LEFT, dump bed on the right
    ctx.fillStyle = '#d35400'; ctx.fillRect(x, y + 14, 46, v.h - 32);          // cab
    ctx.fillStyle = '#aed6f1'; ctx.fillRect(x + 6, y + 18, 26, 14);            // windscreen
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(x, y + v.h - 24, 4, 6);            // headlight (front-left)
    ctx.fillStyle = '#e67e22'; ctx.fillRect(x + 50, y + 4, v.w - 50, v.h - 22);// bed
    ctx.fillStyle = '#935116'; ctx.fillRect(x + 56, y - 4, v.w - 64, 12);      // dirt heaped
    ctx.fillStyle = '#222'; circle(x + 22, y + v.h - 9, 12); circle(x + v.w - 60, y + v.h - 9, 12); circle(x + v.w - 24, y + v.h - 9, 12);
  }
  // small headlight on every nose — half of them broken, very Karachi
  if (v.kind !== 'icecream') {
    const on = v.lightOn !== false;
    const hy = y + v.h - 20;
    if (on) {
      ctx.fillStyle = '#fff6c0'; circle(x + 2, hy, 3);
      ctx.globalAlpha = 0.08 + 0.30 * Math.max(nightFactor(), (isDark() || isFlicker()) ? 1 : 0);
      ctx.fillStyle = '#fff3a8';
      ctx.beginPath(); ctx.moveTo(x + 2, hy - 3); ctx.lineTo(x - 26, hy - 10); ctx.lineTo(x - 26, hy + 10); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#3c3c3c'; circle(x + 2, hy, 3);
      ctx.fillStyle = '#222'; ctx.fillRect(x, hy - 1, 5, 2);
    }
  }
  ctx.restore();
}

function drawPlayer() {
  if (state === 'gameover' || state === 'ride') return;   // on the bike during the ride
  const x = px(player.x), y = Math.round(player.y);
  const f = player.face;                                  // 1 right, -1 left
  const t = performance.now();
  const moving = player.onGround && Math.abs(player.vx) > 0.3;
  const airborne = !player.onGround;
  const flashHide = iframes > 0 && Math.floor(iframes / 5) % 2 === 0;

  // ground shadow (skip while airborne) — drawn in world space, behind player
  if (!airborne) {
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x + player.w / 2, y + player.h + 1, 12, 3, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  if (flashHide) return;                                  // invuln blink

  // walk/limb phase
  const ph = player.anim;
  const sw = moving ? Math.sin(ph) : 0;                   // stride swing
  let legF, legB, armF, armB, bob;
  if (moving) {
    legF = sw * 4; legB = -sw * 4;
    armF = -sw * 3; armB = sw * 3;
    bob = -Math.abs(Math.cos(ph)) * 1.5;                 // rise on each stride
  } else if (airborne) {
    const up = player.vy < 0;
    legF = up ? 3 : -3; legB = up ? -2 : 4;
    armF = up ? -5 : 5; armB = up ? -3 : 3; bob = 0;
  } else {
    legF = legB = 0; armF = armB = 0;
    bob = Math.sin(t / 450) * 1;                          // idle breathing
  }

  ctx.save();
  if (starT > 0) ctx.globalAlpha = 0.95;
  // mirror around centre so art is authored facing right
  ctx.translate(x + player.w / 2, y); ctx.scale(f, 1); ctx.translate(-player.w / 2, 0);
  const c = player.w / 2;                                 // local centre (13)

  // palette
  const skin = '#c68642', skinD = '#a96f31';
  const shirt  = starT > 0 ? 'hsl(' + (t / 3 % 360) + ',85%,62%)' : '#eef2f7';
  const shirtD = starT > 0 ? 'hsl(' + (t / 3 % 360) + ',70%,48%)' : '#ccd5df';
  const jeans = '#2c3a92', jeansD = '#1f2a6e', shoe = '#23262c';
  const hair = '#1b1e24', pack = '#9b2c33', packD = '#751f25', strap = '#5e1419';

  // back arm (behind torso)
  ctx.fillStyle = skinD; ctx.fillRect(c - 8 + armB, 16 + bob, 4, 10);
  ctx.fillStyle = skin;  ctx.fillRect(c - 8 + armB, 24 + bob, 4, 3);   // hand

  // backpack on the back (left when facing right)
  ctx.fillStyle = packD; ctx.fillRect(c - 13, 14 + bob, 8, 18);
  ctx.fillStyle = pack;  ctx.fillRect(c - 12, 15 + bob, 6, 15);
  ctx.fillStyle = packD; ctx.fillRect(c - 11, 20 + bob, 4, 6);         // pocket
  ctx.fillStyle = strap; ctx.fillRect(c - 5, 15 + bob, 2, 15);         // shoulder strap

  // back leg
  ctx.fillStyle = jeansD; ctx.fillRect(c - 3 + legB, 31 + bob, 5, 11);
  ctx.fillStyle = shoe;   ctx.fillRect(c - 4 + legB, 41 + bob, 8, 3);
  // front leg
  ctx.fillStyle = jeans;  ctx.fillRect(c + 1 + legF, 31 + bob, 5, 11);
  ctx.fillStyle = shoe;   ctx.fillRect(c + legF, 41 + bob, 8, 3);

  // torso (shirt) with shading + collar
  ctx.fillStyle = shirt;  ctx.fillRect(c - 7, 15 + bob, 15, 17);
  ctx.fillStyle = shirtD; ctx.fillRect(c - 7, 15 + bob, 3, 17);        // side shade
  ctx.fillStyle = shirtD; ctx.fillRect(c - 7, 28 + bob, 15, 4);        // hem shade
  ctx.fillStyle = '#dbe2ea'; ctx.fillRect(c - 3, 15 + bob, 6, 3);      // collar

  // front arm (over torso)
  ctx.fillStyle = skin;  ctx.fillRect(c + 4 + armF, 16 + bob, 4, 10);
  ctx.fillStyle = skinD; ctx.fillRect(c + 4 + armF, 24 + bob, 4, 3);   // hand

  // head
  const hy = bob;
  ctx.fillStyle = skin;  ctx.fillRect(c - 6, 2 + hy, 13, 13);
  ctx.fillStyle = skinD; ctx.fillRect(c - 6, 12 + hy, 13, 3);          // jaw shade
  ctx.fillStyle = skin;  ctx.fillRect(c - 7, 7 + hy, 2, 4);            // ear
  // hair
  ctx.fillStyle = hair;
  ctx.fillRect(c - 7, 0 + hy, 15, 5);
  ctx.fillRect(c - 7, 0 + hy, 3, 8);                                   // back sideburn
  ctx.fillRect(c + 5, 1 + hy, 3, 5);                                   // front fringe
  // face (facing right)
  ctx.fillStyle = '#1e272e';
  ctx.fillRect(c + 2, 6 + hy, 3, 1);                                   // eyebrow
  const blink = (t % 2800) < 120;
  if (!blink) ctx.fillRect(c + 2, 8 + hy, 2, 3); else ctx.fillRect(c + 2, 9 + hy, 3, 1);
  ctx.strokeStyle = '#7a4a2b'; ctx.lineWidth = 1;                      // small smile
  ctx.beginPath(); ctx.arc(c + 2, 11 + hy, 2.4, 0.2, Math.PI - 0.2); ctx.stroke();

  ctx.restore();
}

function drawDecor(d, dark) {
  const x = px(d.x);
  ctx.textAlign = 'left';
  if (d.kind === 'chowrangi') {
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x, GROUND_Y - 90, 14, 90);
    ctx.fillStyle = '#2e7d52'; ctx.fillRect(x - 50, GROUND_Y - 110, 114, 28);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('MASKAN', x + 7, GROUND_Y - 98);
    ctx.fillText('CHOWRANGI', x + 7, GROUND_Y - 87);
  } else if (d.kind === 'kugate') {
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(x, GROUND_Y - 150, 22, 150); ctx.fillRect(x + 160, GROUND_Y - 150, 22, 150);
    ctx.fillRect(x - 8, GROUND_Y - 172, 198, 30);
    ctx.fillStyle = '#5d4037'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('UNIVERSITY OF KARACHI', x + 91, GROUND_Y - 152);
    ctx.fillStyle = '#3b6b48'; ctx.fillText('MASKAN GATE', x + 91, GROUND_Y - 130);
    // two gate guards: blue wardi, moustache, danda
    for (const ggx of [x + 18, x + 196]) {
      ctx.fillStyle = '#1d3f8f'; ctx.fillRect(ggx - 5, GROUND_Y - 16, 5, 16); ctx.fillRect(ggx + 1, GROUND_Y - 16, 5, 16);
      ctx.fillStyle = '#16306e'; ctx.fillRect(ggx - 6, GROUND_Y - 33, 13, 18);
      ctx.fillStyle = '#c8a06f'; ctx.fillRect(ggx - 4, GROUND_Y - 42, 9, 10);
      ctx.fillStyle = '#10254f'; ctx.fillRect(ggx - 5, GROUND_Y - 45, 11, 4);        // cap
      ctx.fillStyle = '#1e1e1e'; ctx.fillRect(ggx - 3, GROUND_Y - 36, 7, 2);         // moustache
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(ggx + 7, GROUND_Y - 30, 3, 22);        // danda
    }
  } else if (d.kind === 'lamp') {
    const lgy = groundYAt(d.x);
    ctx.fillStyle = '#444c55'; ctx.fillRect(x, lgy - 130, 6, 130);
    ctx.fillRect(x, lgy - 130, 26, 5);
    const off = isDark() || isFlicker();
    const lit = !off && nightFactor() > 0.5;                    // lamps switch on at dusk
    const col = d.warm ? '#ffcf87' : '#eaf4ff';                 // warm after Disco, white before
    ctx.fillStyle = off ? '#333' : (lit ? col : '#8a93a0');
    ctx.fillRect(x + 22, lgy - 128, 10, 8);
    if (lit) {
      const nfL = nightFactor();
      // large bulb halo
      ctx.globalAlpha = 0.55 + 0.20 * nfL;
      ctx.fillStyle = col; circle(x + 27, lgy - 123, 46);
      // downward light cone to ground
      ctx.globalAlpha = 0.22 + 0.18 * nfL;
      const cg = ctx.createRadialGradient(x + 27, lgy - 118, 0, x + 27, lgy, 95);
      cg.addColorStop(0, col); cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg; ctx.fillRect(x - 65, lgy - 118, 180, 118);
      ctx.globalAlpha = 1;
    }
  } else if (d.kind === 'kepole') {
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x, GROUND_Y - 160, 8, 160);
    ctx.fillRect(x - 22, GROUND_Y - 152, 52, 4);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(x - 20, GROUND_Y - 150 + i * 3);
      ctx.quadraticCurveTo(x + 4, GROUND_Y - 120 + i * 6, x + 28, GROUND_Y - 148 + i * 3);
      ctx.stroke();
    }
  } else if (d.kind === 'cart') {
    ctx.fillStyle = '#a0522d'; ctx.fillRect(x, GROUND_Y - 42, 80, 12);
    ctx.fillStyle = '#ffd32a'; ctx.fillRect(x + 4, GROUND_Y - 56, 72, 14);
    ctx.fillStyle = '#222'; circle(x + 18, GROUND_Y - 14, 11); circle(x + 62, GROUND_Y - 14, 11);
    ctx.fillStyle = '#7a3b10'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(d.label, x + 40, GROUND_Y - 46); ctx.textAlign = 'left';
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x + 8, GROUND_Y - 96, 64, 6);       // umbrella
    ctx.fillRect(x + 36, GROUND_Y - 92, 5, 38);
  } else if (d.kind === 'dhaba') {
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(x, GROUND_Y - 30, 90, 30);
    ctx.fillStyle = '#fdd835'; ctx.font = 'bold 10px monospace';
    ctx.fillText('CHAI DHABA', x + 8, GROUND_Y - 34);
    ctx.fillStyle = '#bcaaa4';
    ctx.fillRect(x + 8, GROUND_Y - 14, 18, 14); ctx.fillRect(x + 36, GROUND_Y - 14, 18, 14);
  } else if (d.kind === 'signal') {
    // traffic signal at Disco Bakery — blinks yellow during load shedding
    ctx.fillStyle = '#3d4852'; ctx.fillRect(x, GROUND_Y - 150, 8, 150);
    ctx.fillStyle = '#222831'; ctx.fillRect(x - 9, GROUND_Y - 196, 26, 62);
    const ph = (performance.now() / 1000) % 10;
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    const shedOff = isDark() || isFlicker();
    const lit = shedOff ? (blink ? 'y' : '-') : (ph < 4.5 ? 'r' : ph < 9 ? 'g' : 'y');
    ctx.fillStyle = lit === 'r' ? '#ff3f34' : '#4a1d1a'; circle(x + 4, GROUND_Y - 184, 8);
    ctx.fillStyle = lit === 'y' ? '#ffd32a' : '#4a3f12'; circle(x + 4, GROUND_Y - 165, 8);
    ctx.fillStyle = lit === 'g' ? '#05c46b' : '#123a28'; circle(x + 4, GROUND_Y - 146, 8);
  } else if (d.kind === 'trolley') {
    ctx.strokeStyle = '#9aa7b0'; ctx.lineWidth = 2;
    ctx.strokeRect(x, GROUND_Y - 30, 26, 18);
    ctx.beginPath(); ctx.moveTo(x + 26, GROUND_Y - 30); ctx.lineTo(x + 34, GROUND_Y - 40); ctx.stroke();
    ctx.fillStyle = '#222'; circle(x + 5, GROUND_Y - 6, 4); circle(x + 21, GROUND_Y - 6, 4);
  } else if (d.kind === 'busstop') {
    ctx.fillStyle = '#90a4ae'; ctx.fillRect(x, GROUND_Y - 100, 6, 100); ctx.fillRect(x + 120, GROUND_Y - 100, 6, 100);
    ctx.fillStyle = '#1565c0'; ctx.fillRect(x - 6, GROUND_Y - 112, 138, 14);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('BUS STOP', x + 63, GROUND_Y - 102); ctx.textAlign = 'left';
  } else if (d.kind === 'manholesign' || d.kind === 'cones') {
    for (let i = 0; i < 3; i++) {
      const cx2 = x + i * 22;
      ctx.fillStyle = '#e67e22';
      ctx.beginPath(); ctx.moveTo(cx2, GROUND_Y); ctx.lineTo(cx2 + 8, GROUND_Y - 20); ctx.lineTo(cx2 + 16, GROUND_Y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(cx2 + 4, GROUND_Y - 10, 8, 4);
    }
  } else if (d.kind === 'kmcsign') {
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 30, GROUND_Y - 86, 8, 86);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(x - 30, GROUND_Y - 130, 130, 48);
    ctx.fillStyle = '#1e272e'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('KAAM JARI HAI', x + 35, GROUND_Y - 110);
    ctx.fillText('— KMC —', x + 35, GROUND_Y - 94);
    ctx.textAlign = 'left';
  } else if (d.kind === 'rastaband') {
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x, GROUND_Y - 110, 110, 36);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('RASTA BAND HAI', x + 55, GROUND_Y - 88);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 50, GROUND_Y - 74, 8, 74);
  } else if (d.kind === 'rebar') {
    ctx.fillStyle = '#6e2c00';
    ctx.fillRect(x, GROUND_Y - 8, 90, 8);
  } else if (d.kind === 'sand') {
    // drawn as solid already; add shovel
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(x + 60, GROUND_Y - 70, 4, 40);
    ctx.fillStyle = '#aaa'; ctx.fillRect(x + 54, GROUND_Y - 78, 16, 10);
  } else if (d.kind === 'mixer') {
    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.ellipse(x + 30, GROUND_Y - 40, 28, 22, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 4, GROUND_Y - 22, 56, 22);
    ctx.fillStyle = '#222'; circle(x + 14, GROUND_Y - 8, 8); circle(x + 48, GROUND_Y - 8, 8);
  } else if (d.kind === 'crane') {
    ctx.strokeStyle = '#d35400'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, GROUND_Y - 320); ctx.lineTo(x + 180, GROUND_Y - 320); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 150, GROUND_Y - 320); ctx.lineTo(x + 150, GROUND_Y - 250); ctx.stroke();
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 138, GROUND_Y - 250, 24, 18);
  } else if (d.kind === 'scaffold') {
    ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * 70, GROUND_Y); ctx.lineTo(x + i * 70, GROUND_Y - 200); ctx.stroke();
    }
    for (let j = 0; j < 4; j++) {
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y - j * 60 - 30); ctx.lineTo(x + 210, GROUND_Y - j * 60 - 30); ctx.stroke();
    }
  } else if (d.kind === 'bykea') {
    if (state !== 'ride') {
      const bgy = groundYAt(d.x);
      drawWaitingBike(x, bgy, false, false);
      if (typeof player !== 'undefined' && player && state === 'play' && Math.abs(player.x - d.x) < 480)
        speechBubble(x + 22, bgy - 122, 'your bykea is waiting');
    }
  } else if (d.kind === 'ferris') {
    // Aladin Park wheel, far background
    const fx = x, fy = 240;
    ctx.strokeStyle = dark ? '#3a3560' : '#b08bbf'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(fx, fy, 70, 0, 7); ctx.stroke();
    const rot = performance.now() / 3000;
    for (let i = 0; i < 8; i++) {
      const a = rot + i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * 70, fy + Math.sin(a) * 70); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(fx - 50, fy + 130); ctx.lineTo(fx, fy); ctx.lineTo(fx + 50, fy + 130); ctx.stroke();
  } else if (d.kind === 'police') {
    const gy = groundYAt(d.x);
    const flip = Math.floor(performance.now() / 220) % 2 === 0;
    // --- police mobile (parked, facing right) ---
    const cw = 124, ch = 42, cy = gy - ch;
    ctx.fillStyle = '#f4f6f7'; ctx.fillRect(x, cy + 14, cw, ch - 22);          // lower body
    ctx.beginPath();                                                            // cabin
    ctx.moveTo(x + 28, cy + 14); ctx.lineTo(x + 42, cy + 2);
    ctx.lineTo(x + cw - 30, cy + 2); ctx.lineTo(x + cw - 18, cy + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#152f4d'; ctx.fillRect(x, cy + 22, cw, 7);                 // navy stripe
    ctx.fillStyle = '#bfe0f0'; ctx.fillRect(x + 34, cy + 5, 22, 9); ctx.fillRect(x + cw - 44, cy + 5, 22, 9); // windows
    ctx.fillStyle = '#152f4d'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('POLICE', x + cw / 2, cy + 38); ctx.textAlign = 'left';
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + cw - 3, cy + 16, 3, 6);         // front light
    // flashing roof lightbar + glow
    ctx.fillStyle = '#10131a'; ctx.fillRect(x + 44, cy - 4, 36, 5);            // bar base
    ctx.fillStyle = flip ? '#ff2b2b' : '#3355ff'; ctx.fillRect(x + 46, cy - 8, 16, 6);
    ctx.fillStyle = flip ? '#3355ff' : '#ff2b2b'; ctx.fillRect(x + 62, cy - 8, 16, 6);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = flip ? '#ff2b2b' : '#3355ff'; circle(x + 54, cy - 5, 22);
    ctx.fillStyle = flip ? '#3355ff' : '#ff2b2b'; circle(x + 70, cy - 5, 22);
    ctx.globalAlpha = 1;
    wheel(x + 28, gy - 6, 10); wheel(x + cw - 28, gy - 6, 10);
    // --- three constables ---
    drawCop(x + 160, gy, 1);
    drawCop(x + 192, gy, -1);
    drawCop(x + 224, gy, 1);
    // chai-paani request over the middle cop (raised higher)
    speechBubble(x + 192, gy - 120, 'Sir chai paani?');
  } else if (d.kind === 'tree') {
    const s = d.size, th = 64 * s;
    ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 4 * s, GROUND_Y - th, 8 * s, th);   // trunk
    ctx.fillStyle = '#2e7d32';
    circle(x, GROUND_Y - th - 12 * s, 21 * s);
    circle(x - 15 * s, GROUND_Y - th - 2 * s, 15 * s);
    circle(x + 15 * s, GROUND_Y - th - 2 * s, 15 * s);
    ctx.fillStyle = '#388e3c'; circle(x - 6 * s, GROUND_Y - th - 20 * s, 13 * s);
    ctx.fillStyle = '#43a047'; circle(x + 8 * s, GROUND_Y - th - 14 * s, 10 * s);
  } else if (d.kind === 'foosball') {
    ctx.fillStyle = '#1e7d34'; ctx.fillRect(x, GROUND_Y - 26, 58, 14);             // table top
    ctx.fillStyle = '#145323'; ctx.fillRect(x, GROUND_Y - 26, 58, 3);
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x + 3, GROUND_Y - 12, 6, 12); ctx.fillRect(x + 49, GROUND_Y - 12, 6, 12); // legs
    ctx.fillStyle = '#b0b6bb';                                                       // rods
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 6, GROUND_Y - 24 + i * 4, 70, 2);
    drawPedestrian(x - 13, GROUND_Y, '#c0392b', performance.now() / 110, false, 'man');
    drawPedestrian(x + 70, GROUND_Y, '#2980b9', performance.now() / 95, false, 'man');
  } else if (d.kind === 'goldperformer') {
    const t = performance.now();
    const dancing = Math.floor(t / 2600) % 3 === 0;
    const ph = dancing ? t / 170 : 0;
    const sw = dancing ? Math.sin(ph) * 3 : 0;
    const armUp = dancing ? Math.max(0, Math.sin(t / 200)) * 9 : 0;
    const G = '#d4af37', GD = '#a8862a';
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x - 12, GROUND_Y - 5, 24, 5);          // pedestal
    ctx.fillStyle = G; ctx.fillRect(x - 5 + sw, GROUND_Y - 22, 5, 17); ctx.fillRect(x + 1 - sw, GROUND_Y - 22, 5, 17);
    ctx.fillStyle = G; ctx.fillRect(x - 6, GROUND_Y - 39, 13, 18);                 // torso
    ctx.fillStyle = GD; ctx.fillRect(x - 6, GROUND_Y - 39, 3, 18);
    ctx.fillStyle = G; ctx.fillRect(x - 10, GROUND_Y - 37 - armUp, 4, 13);         // arms
    ctx.fillRect(x + 7, GROUND_Y - 37 - (dancing ? armUp : 0), 4, 13);
    ctx.fillStyle = G; ctx.fillRect(x - 4, GROUND_Y - 49, 9, 10);                  // head
    ctx.fillStyle = GD; ctx.fillRect(x - 4, GROUND_Y - 49, 9, 2);
    if (Math.floor(t / 180) % 4 === 0) { ctx.fillStyle = '#fff8dc'; ctx.fillRect(x + 2, GROUND_Y - 45, 2, 2); } // shimmer
  } else if (d.kind === 'excavator') {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x, GROUND_Y - 22, 104, 20);            // track
    ctx.fillStyle = '#444'; for (let i = 0; i < 7; i++) circle(x + 12 + i * 14, GROUND_Y - 12, 6);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(x + 12, GROUND_Y - 70, 64, 48);        // cab
    ctx.fillStyle = '#d4ac0d'; ctx.fillRect(x + 12, GROUND_Y - 70, 64, 6);
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(x + 18, GROUND_Y - 62, 27, 22);        // window
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 9;                                // boom + arm
    ctx.beginPath(); ctx.moveTo(x + 70, GROUND_Y - 60); ctx.lineTo(x + 118, GROUND_Y - 50); ctx.lineTo(x + 138, GROUND_Y - 10); ctx.stroke();
    ctx.fillStyle = '#e0a800';                                                      // bucket
    ctx.beginPath(); ctx.moveTo(x + 131, GROUND_Y - 19); ctx.lineTo(x + 154, GROUND_Y - 14); ctx.lineTo(x + 146, GROUND_Y + 3); ctx.lineTo(x + 125, GROUND_Y - 3); ctx.closePath(); ctx.fill();
    // piled sand + trash beside it
    ctx.fillStyle = '#d9b36c';
    ctx.beginPath(); ctx.moveTo(x + 152, GROUND_Y); ctx.lineTo(x + 185, GROUND_Y - 34); ctx.lineTo(x + 222, GROUND_Y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9a35c'; ctx.beginPath(); ctx.moveTo(x + 175, GROUND_Y); ctx.lineTo(x + 196, GROUND_Y - 20); ctx.lineTo(x + 215, GROUND_Y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2f3640';                                                     // trash bags
    circle(x - 14, GROUND_Y - 7, 8); circle(x - 26, GROUND_Y - 5, 6); circle(x - 7, GROUND_Y - 4, 5);
    ctx.fillStyle = '#57606f'; ctx.fillRect(x - 30, GROUND_Y - 3, 30, 3);
  } else if (d.kind === 'tables') {
    const t = performance.now();
    // ── FAMILY AREA: 2 tables behind partial white cloth ──
    const fleft = x - 20, fright = x + 125, fh = 36;
    ctx.globalAlpha = 0.84; ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(fleft, GROUND_Y - fh, fright - fleft, fh);
    ctx.globalAlpha = 1; ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(fleft, GROUND_Y - fh, fright - fleft, 2);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(fleft - 2, GROUND_Y - fh - 6, 4, fh + 6);
    ctx.fillRect(fright - 2, GROUND_Y - fh - 6, 4, fh + 6);
    ctx.fillRect((fleft + fright) / 2 - 2, GROUND_Y - fh - 4, 4, fh + 4);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('FAMILY AREA', (fleft + fright) / 2, GROUND_Y - fh - 10); ctx.textAlign = 'left';
    drawTableGroup(x + 14, GROUND_Y, '#6c3483', 'man', '#e84393', 'floral', t);
    drawTableGroup(x + 70, GROUND_Y, '#e67e22', 'man', '#27ae60', 'floral', t + 120);
    drawServer(x + 45, GROUND_Y, t + 300, false);
    // ── DIVIDER ──
    const gx2 = x + 138;
    ctx.fillStyle = '#7a0f2b'; ctx.fillRect(gx2, GROUND_Y - 44, 4, 44);
    // ── GENTS AREA: 1 table, open air ──
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('GENTS AREA', gx2 + 44, GROUND_Y - 52); ctx.textAlign = 'left';
    drawTableGroup(gx2 + 30, GROUND_Y, '#16607a', 'man', '#2980b9', 'man', t + 80);
    // owner near seating
    drawOwner(x - 14, GROUND_Y, t);
  } else if (d.kind === 'chaiwala') {
    ctx.fillStyle = '#7a4a21'; ctx.fillRect(x, GROUND_Y - 34, 56, 34);             // counter
    ctx.fillStyle = '#925a2b'; ctx.fillRect(x - 3, GROUND_Y - 40, 62, 8);
    ctx.fillStyle = '#c0c7cc'; ctx.fillRect(x + 8, GROUND_Y - 56, 18, 16);         // samovar
    ctx.fillRect(x + 24, GROUND_Y - 52, 8, 3);                                      // spout
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 36, GROUND_Y - 47, 12, 4); ctx.fillRect(x + 38, GROUND_Y - 51, 8, 4); // cups
    steam(x + 17, GROUND_Y - 64);
    drawPedestrian(x + 66, GROUND_Y, '#9b3d12', 0, true, 'man');
    ctx.fillStyle = '#7a1010'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('CHAI', x + 28, GROUND_Y - 62); ctx.textAlign = 'left';
  } else if (d.kind === 'chickenwala') {
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(x, GROUND_Y - 30, 62, 30);             // table
    ctx.strokeStyle = '#aab2b8'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 4, GROUND_Y - 52, 54, 22);                                   // cage
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + 4 + i * 9, GROUND_Y - 52); ctx.lineTo(x + 4 + i * 9, GROUND_Y - 30); ctx.stroke(); }
    for (const cxx of [x + 14, x + 36]) {                                            // chickens
      ctx.fillStyle = '#f5f1e6'; circle(cxx, GROUND_Y - 38, 6); circle(cxx + 5, GROUND_Y - 42, 4);
      ctx.fillStyle = '#d63031'; ctx.fillRect(cxx + 4, GROUND_Y - 47, 3, 3);
      ctx.fillStyle = '#e8a13c'; ctx.fillRect(cxx + 8, GROUND_Y - 42, 4, 2);
    }
    ctx.fillStyle = '#1b1b1f'; ctx.fillRect(x + 64, GROUND_Y - 36, 36, 30);         // blackboard
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 2; ctx.strokeRect(x + 64, GROUND_Y - 36, 36, 30);
    ctx.fillStyle = '#f4f6f6'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('ZINDA', x + 82, GROUND_Y - 27);
    ctx.fillText('600', x + 82, GROUND_Y - 19);
    ctx.fillText('RUPAY', x + 82, GROUND_Y - 11);
    ctx.textAlign = 'left';
    drawPedestrian(x + 112, GROUND_Y, '#5b3a29', 0, true, 'man');
  } else if (d.kind === 'cat') {
    const col = d.tint || '#b58a5a';
    ctx.fillStyle = col;
    ctx.fillRect(x - 8, GROUND_Y - 10, 16, 6);                                      // body
    const hx = d.dir > 0 ? x + 6 : x - 12;
    ctx.fillRect(hx, GROUND_Y - 14, 6, 6);                                          // head
    ctx.fillRect(hx, GROUND_Y - 16, 2, 3); ctx.fillRect(hx + 4, GROUND_Y - 16, 2, 3); // ears
    ctx.fillRect(d.dir > 0 ? x - 11 : x + 8, GROUND_Y - 16, 3, 9);                  // tail up
    const sw2 = Math.sin(performance.now() / 130) > 0 ? 1 : -1;
    ctx.fillRect(x - 6 + sw2, GROUND_Y - 4, 3, 4); ctx.fillRect(x + 3 - sw2, GROUND_Y - 4, 3, 4);
  } else if (d.kind === 'cow') {
    const st = Math.sin(performance.now() / 260) * 2;
    ctx.fillStyle = '#f2ede3'; ctx.fillRect(x - 20, GROUND_Y - 34, 40, 19);         // body
    ctx.fillStyle = '#7a5230';                                                       // patches
    ctx.fillRect(x - 14, GROUND_Y - 32, 11, 9); ctx.fillRect(x + 4, GROUND_Y - 26, 12, 9);
    ctx.fillStyle = '#f2ede3'; ctx.fillRect(x - 30, GROUND_Y - 38, 12, 12);          // head
    ctx.fillStyle = '#d8cfc0'; ctx.fillRect(x - 33, GROUND_Y - 31, 6, 5);            // muzzle
    ctx.fillStyle = '#5b4a36'; ctx.fillRect(x - 31, GROUND_Y - 41, 4, 3); ctx.fillRect(x - 23, GROUND_Y - 41, 4, 3); // horns
    ctx.fillStyle = '#f2ede3';
    ctx.fillRect(x - 17 + st, GROUND_Y - 15, 5, 15); ctx.fillRect(x - 7 - st, GROUND_Y - 15, 5, 15);
    ctx.fillRect(x + 4 + st, GROUND_Y - 15, 5, 15); ctx.fillRect(x + 13 - st, GROUND_Y - 15, 5, 15);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(x + 19, GROUND_Y - 33, 3, 14);           // tail
  } else if (d.kind === 'billboard') {
    const pw = 232, ph2 = 70, topY = GROUND_Y - 286;
    ctx.fillStyle = '#5d6770'; ctx.fillRect(x + pw / 2 - 5, topY + ph2, 10, GROUND_Y - topY - ph2);
    ctx.fillStyle = d.bg || '#ffffff'; ctx.fillRect(x, topY, pw, ph2);
    ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 3; ctx.strokeRect(x, topY, pw, ph2);
    ctx.textAlign = 'center';
    if (d.lines.length === 1) {
      ctx.fillStyle = d.fg || '#fff'; ctx.font = 'bold 22px monospace';
      ctx.fillText(d.lines[0], x + pw / 2, topY + ph2 / 2 + 8);
    } else {
      for (let i = 0; i < d.lines.length; i++) {
        ctx.fillStyle = d.fg || '#c0392b';
        ctx.font = (i === d.lines.length - 1 ? 'italic 9px' : 'bold 13px') + ' monospace';
        ctx.fillText(d.lines[i], x + pw / 2, topY + 20 + i * 18);
      }
    }
    ctx.textAlign = 'left';
  } else if (d.kind === 'desibbq') {
    const t = performance.now();
    // customers
    drawPedestrian(x - 16, GROUND_Y, '#34495e', t / 300, false, 'man');
    drawPedestrian(x + 106, GROUND_Y, '#6c3483', 0, true, 'man');
    drawPedestrian(x + 120, GROUND_Y, '#7f8c8d', 0, true, 'man');
    // cook
    drawPedestrian(x + 44, GROUND_Y, '#f4f4f4', 0, true, 'man');
    // wide charcoal grill (100px)
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x, GROUND_Y - 26, 100, 14);
    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(x, GROUND_Y - 13, 100, 3);
    for (let i = 0; i < 11; i++) { ctx.fillStyle = (Math.floor(t / 280 + i) % 2) ? '#e25822' : '#ff8c34'; ctx.fillRect(x + 4 + i * 9, GROUND_Y - 22, 7, 4); }
    ctx.fillStyle = '#7a4a2b'; for (let i = 0; i < 9; i++) ctx.fillRect(x + 4 + i * 10, GROUND_Y - 30, 9, 3);
    // thick dark smoke from 7 sources
    for (let src = 0; src < 7; src++) {
      const ox = x + 7 + src * 13;
      for (let i = 0; i < 6; i++) {
        const sy = (t / 700 * 22 + i * 14 + src * 8) % 110;
        ctx.globalAlpha = 0.70 * (1 - sy / 110);
        ctx.fillStyle = sy < 30 ? '#3a3a3a' : '#6a6a6a';
        circle(ox + Math.sin(t / 500 + i + src) * 9, GROUND_Y - 32 - sy, 4 + sy * 0.09);
      }
    }
    ctx.globalAlpha = 1;
    drawStandingFan(x + 108, GROUND_Y, t);
    drawOwner(x - 10, GROUND_Y, t);
  } else if (d.kind === 'jannat') {
    drawJannatFacade(x, GROUND_Y, d.w, d.h, dark);
  } else if (d.kind === 'masjid') {
    const w = 185, top = GROUND_Y - 250;
    ctx.fillStyle = '#1f7a4d'; ctx.fillRect(x, top + 38, w, 250 - 38);          // body
    ctx.fillStyle = '#17633e'; ctx.fillRect(x, top + 38, w, 7);
    // minarets (reach the ground)
    for (const mx of [x + 12, x + w - 24]) {
      ctx.fillStyle = '#26935c'; ctx.fillRect(mx, top - 30, 12, 280);
      ctx.fillStyle = '#2e9e66'; ctx.beginPath(); ctx.arc(mx + 6, top - 30, 8, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(mx + 4, top - 44, 4, 11);
    }
    // central dome + finial
    ctx.fillStyle = '#2e9e66'; ctx.beginPath(); ctx.arc(x + w / 2, top + 48, 46, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(x + w / 2 - 2, top - 6, 4, 18); circle(x + w / 2, top - 8, 5);
    // arched windows
    ctx.fillStyle = '#cdeedd';
    for (let i = 0; i < 3; i++) { const ax = x + 42 + i * 42; ctx.fillRect(ax, GROUND_Y - 80, 24, 50); ctx.beginPath(); ctx.arc(ax + 12, GROUND_Y - 80, 12, Math.PI, 0); ctx.fill(); }
    // loudspeaker on the right minaret + sound waves
    const spx = x + w - 24 + 6;
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(spx - 2, top - 18, 4, 6);
    ctx.fillStyle = '#888'; ctx.beginPath(); ctx.moveTo(spx, top - 21); ctx.lineTo(spx + 16, top - 27); ctx.lineTo(spx + 16, top - 9); ctx.lineTo(spx, top - 15); ctx.closePath(); ctx.fill();
    if (Math.floor(performance.now() / 450) % 2 === 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(spx + 18, top - 18, 7, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(spx + 18, top - 18, 12, -0.7, 0.7); ctx.stroke(); }
    // Urdu name plate: اکبر مسجد
    ctx.fillStyle = '#0b3d26'; ctx.fillRect(x + w / 2 - 62, top + 8, 124, 26);
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('اکبر مسجد', x + w / 2, top + 27); ctx.textAlign = 'left';
  } else if (d.kind === 'fixit') {
    const t = performance.now();
    ctx.fillStyle = '#16a085'; ctx.fillRect(x, GROUND_Y - 66, 72, 66);          // stall
    ctx.fillStyle = '#1abc9c'; ctx.fillRect(x - 4, GROUND_Y - 74, 80, 12);      // counter
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('FIXIT', x + 36, GROUND_Y - 50);
    ctx.font = '7px monospace'; ctx.fillText('FREE FOOD', x + 36, GROUND_Y - 40);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#555'; ctx.fillRect(x + 18, GROUND_Y - 30, 36, 16);        // degh (pot)
    ctx.fillStyle = '#888'; ctx.fillRect(x + 16, GROUND_Y - 33, 40, 4);
    steam(x + 36, GROUND_Y - 42);
    // server behind the counter
    drawPedestrian(x + 50, GROUND_Y, '#ecf0f1', 0, true, 'man');
    // hand passing a plate out to the front of the queue (animated)
    const reach = (Math.sin(t / 500) * 0.5 + 0.5) * 26;        // arm extends + retracts
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(x + 58, GROUND_Y - 36, 8 + reach, 4); // arm
    ctx.fillStyle = '#dfe6e9'; ctx.beginPath(); ctx.ellipse(x + 66 + reach, GROUND_Y - 35, 6, 2.5, 0, 0, 7); ctx.fill(); // plate
    ctx.fillStyle = '#e67e22'; circle(x + 66 + reach, GROUND_Y - 37, 2.5);       // food on plate
    // queue of needy people, the front one reaching back for the plate
    const qc = ['#8e44ad', '#c0392b', '#2980b9', '#d35400', '#27ae60'];
    for (let i = 0; i < 5; i++) drawPedestrian(x + 92 + i * 19, GROUND_Y, qc[i], 0, true, 'man');
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(x + 84, GROUND_Y - 34, 8, 4);        // front person's outstretched hand
  } else if (d.kind === 'rollstall') {
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x, GROUND_Y - 62, 84, 62);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x - 4, GROUND_Y - 72, 92, 12);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('HOT N SPICY', x + 42, GROUND_Y - 50);
    ctx.fillStyle = '#ffd700'; ctx.font = '8px monospace'; ctx.fillText('ROLLS', x + 42, GROUND_Y - 39);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2c2c2c'; ctx.fillRect(x + 10, GROUND_Y - 30, 64, 8);      // griddle
    ctx.fillStyle = '#e67e22'; ctx.fillRect(x + 16, GROUND_Y - 34, 12, 5); ctx.fillRect(x + 34, GROUND_Y - 34, 12, 5); ctx.fillRect(x + 52, GROUND_Y - 34, 12, 5);
    drawPedestrian(x + 94, GROUND_Y, '#2c3e50', 0, true);
  } else if (d.kind === 'beggar') {
    ctx.fillStyle = '#6d5a44'; ctx.fillRect(x - 9, GROUND_Y - 15, 19, 15);      // folded legs
    ctx.fillStyle = '#52442f'; ctx.fillRect(x - 8, GROUND_Y - 27, 15, 13);      // ragged torso
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(x - 5, GROUND_Y - 37, 9, 10);       // head
    ctx.fillStyle = '#3a2f26'; ctx.fillRect(x - 6, GROUND_Y - 39, 11, 4);       // hair
    ctx.fillStyle = '#999'; ctx.beginPath(); ctx.ellipse(x + 13, GROUND_Y - 12, 7, 3, 0, 0, 7); ctx.fill(); // bowl
    if (!d.nearOnly || (typeof player !== 'undefined' && player && Math.abs(player.x - d.x) < 170))
      speechBubble(x, GROUND_Y - 82, d.phrase || 'kuch dedo?');
  } else if (d.kind === 'flowerseller') {
    drawPedestrian(x, GROUND_Y, '#8e44ad', performance.now() / 260, false);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(x + 6, GROUND_Y - 26, 2, 12);       // stems
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#e84393'; circle(x + 3 + i * 3, GROUND_Y - 28 - (i % 2) * 3, 3); }
    speechBubble(x, GROUND_Y - 80, 'flower lelein?');
  } else if (d.kind === 'pedestrian') {
    const pgy = groundYAt(d.x);
    drawPedestrian(x, pgy, d.tint, performance.now() / 150 + d.base, false, d.type);
    if (d.smoker) {
      const mx = x + 6, my = pgy - 36;
      ctx.fillStyle = '#fff'; ctx.fillRect(mx, my, 5, 2);
      ctx.fillStyle = '#ff5e3a'; ctx.fillRect(mx + 5, my, 2, 2);
      if (Math.floor(performance.now() / 400) % 2 === 0) {
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#ccc';
        circle(mx + 8, my - 7, 3); circle(mx + 11, my - 13, 4);
        ctx.globalAlpha = 1;
      }
    }
    if (d.greet && typeof player !== 'undefined' && player && Math.abs(player.x - d.x) < 140)
      speechBubble(x, pgy - 80, 'salam bhai kese ho');
  } else if (d.kind === 'flock') {
    // a group of crows wheeling together over the meat shop
    const t = performance.now() / 1000;
    for (let i = 0; i < 9; i++) {
      const ang = t * 0.5 + i * 0.7;
      const fx = x + Math.cos(ang) * (40 + (i % 3) * 16) + i * 4;
      const fy = GROUND_Y - 250 + Math.sin(ang * 1.3 + i) * 22 - (i % 4) * 8;
      crowAt(fx, fy, Math.floor(t * 6 + i) % 2 === 0);
    }
  } else if (d.kind === 'admirer') {
    // pedestrian facing the gold boy, gawking
    drawPedestrian(x, GROUND_Y, '#2980b9', 0, true, 'man');
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, GROUND_Y - 37, 2, 2); ctx.fillRect(x - 1, GROUND_Y - 37, 2, 2);
    ctx.fillStyle = '#15151a'; ctx.fillRect(x - 5, GROUND_Y - 37, 1, 1); ctx.fillRect(x - 1, GROUND_Y - 37, 1, 1); // eyes left
    if (typeof player !== 'undefined' && player && Math.abs(player.x - d.x) < 200)
      speechBubble(x - 4, GROUND_Y - 80, 'golden boy ko dekho');
  } else if (d.kind === 'finish') {
    const gy = groundYAt(d.x);
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(x, gy - 170, 10, 170);
    ctx.fillStyle = '#27ae60'; ctx.fillRect(x + 10, gy - 170, 120, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('GULSHAN', x + 70, gy - 153);
    ctx.fillText('BRIDGE', x + 70, gy - 138);
    ctx.textAlign = 'left';
  }
}

function drawBanner(b) {
  const x = px(b.x);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x, 120, 360, 34);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
  ctx.fillText(b.text, x + 180, 142); ctx.textAlign = 'left';
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x - 30, 80); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 360, 120); ctx.lineTo(x + 390, 80); ctx.stroke();
}

function drawDarkness() {
  const pxx = px(player.x + player.w / 2), pyy = player.y + player.h / 2;
  const g = ctx.createRadialGradient(pxx, pyy, 100, pxx, pyy, 420);
  g.addColorStop(0, 'rgba(5,5,20,0)');
  g.addColorStop(1, 'rgba(5,5,20,0.48)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawHUD() {
  // top bar
  ctx.fillStyle = 'rgba(20,20,30,.72)';
  ctx.fillRect(0, 0, W, 44);
  // hearts
  for (let i = 0; i < 4; i++) {
    if (i >= Math.max(hearts, 3) && hearts <= 3 && i >= 3) continue;
    ctx.fillStyle = godMode ? '#ffd32a' : (i < hearts ? '#e74c3c' : '#4a4a55');
    heart(24 + i * 30, 22, 11);
  }
  // rupees
  ctx.fillStyle = '#f1c40f'; circle(160, 22, 10);
  ctx.fillStyle = '#1e272e'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText('R', 160, 26); ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace';
  ctx.fillText('x ' + rupees, 178, 29);
  // timer
  const el = ((tEnd || performance.now()) - tStart) / 1000;
  ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#fff';
  ctx.fillText(el.toFixed(1) + 's', W - 92, 18);
  // clock: 5:30 PM at start -> 7:30 PM by 70s
  const mins = 17 * 60 + 30 + nightFactor() * 120;             // minutes since midnight
  let hh = Math.floor(mins / 60) % 24, mm = Math.floor(mins % 60);
  const ampm = hh >= 12 ? 'PM' : 'AM'; let h12 = hh % 12; if (h12 === 0) h12 = 12;
  ctx.fillStyle = '#ffd98a'; ctx.font = 'bold 15px monospace';
  ctx.fillText(h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm, W - 92, 37);
  // progress bar  Maskan → Gulshan
  const bx = 300, bw = W - 480;
  ctx.fillStyle = '#3a3a46'; ctx.fillRect(bx, 16, bw, 12);
  ctx.fillStyle = '#27ae60'; ctx.fillRect(bx, 16, bw * Math.min(1, player.x / FINISH_X), 12);
  ctx.fillStyle = '#ffd32a';
  const mk = bx + bw * Math.min(1, player.x / FINISH_X);
  ctx.fillRect(mk - 3, 12, 6, 20);
  ctx.fillStyle = '#bbb'; ctx.font = 'bold 10px monospace';
  ctx.fillText('MASKAN', bx, 40);
  ctx.fillText('GULSHAN BRIDGE', bx + bw - 90, 40);
  // toast
  if (toast.t > 0) {
    ctx.globalAlpha = Math.min(1, toast.t / 30);
    ctx.fillStyle = 'rgba(20,20,30,.8)';
    const tw = ctx.measureText(toast.text).width;
    ctx.font = 'bold 24px monospace';
    const tw2 = ctx.measureText(toast.text).width;
    ctx.fillRect(W / 2 - tw2 / 2 - 20, 70, tw2 + 40, 44);
    ctx.fillStyle = '#ffd32a'; ctx.textAlign = 'center';
    ctx.fillText(toast.text, W / 2, 99); ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
  // goal hint at the very start of the run
  if (state === 'play' && player.x < 720) {
    ctx.fillStyle = 'rgba(20,20,30,.72)';
    ctx.fillRect(W / 2 - 255, 118, 510, 42);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd32a'; ctx.font = 'bold 13px monospace';
    ctx.fillText('GOAL: dodge cars, potholes & wires — jump with ↑ / SPACE', W / 2, 135);
    ctx.fillStyle = '#cfd8e8';
    ctx.fillText('Reach Gulshan Bridge — your Bykea is waiting', W / 2, 152);
    ctx.textAlign = 'left';
  }
  // power timers
  if (boostT > 0) { ctx.fillStyle = '#f39c12'; ctx.fillRect(24, 50, boostT / 480 * 120, 8); }
  if (starT > 0) { ctx.fillStyle = 'hsl(' + (performance.now() / 4 % 360) + ',90%,60%)'; ctx.fillRect(24, 62, starT / 420 * 120, 8); }
}
function heart(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.6);
  ctx.arc(x - r / 2, y - r * 0.2, r / 2, 0.8, Math.PI + 2.2);
  ctx.arc(x + r / 2, y - r * 0.2, r / 2, Math.PI - 2.2 - Math.PI, 2.2 - Math.PI + Math.PI);
  ctx.lineTo(x, y + r * 0.6);
  ctx.fill();
}

function drawPepsiFridge(cx, gy) {
  ctx.fillStyle = '#003087'; ctx.fillRect(cx - 12, gy - 56, 24, 56);
  ctx.fillStyle = '#001a5e'; ctx.fillRect(cx - 12, gy - 56, 24, 10);   // dark blue top
  ctx.fillStyle = '#b8d4f0'; ctx.fillRect(cx - 12, gy - 46, 24, 8);   // light blue band
  ctx.fillStyle = '#003087'; ctx.fillRect(cx - 10, gy - 36, 20, 30);
  ctx.fillStyle = '#a0a8b8'; ctx.fillRect(cx - 2, gy - 32, 4, 2); ctx.fillRect(cx - 2, gy - 14, 4, 2);
  ctx.fillStyle = '#0047b3'; ctx.fillRect(cx - 7, gy - 44, 14, 4);    // medium blue logo band
  ctx.fillStyle = '#003087'; ctx.fillRect(cx - 7, gy - 40, 14, 2);
  ctx.fillStyle = '#001a5e'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center';
  ctx.fillText('PEPSI', cx, gy - 39);  // sits on the light-blue band for contrast
  ctx.font = 'bold 5px monospace';
  ctx.fillText('COLA', cx, gy - 32);
  ctx.textAlign = 'left';
}
function drawBeggar(cx, gy) {
  ctx.fillStyle = '#7a6450'; ctx.fillRect(cx - 8, gy - 20, 16, 20);
  ctx.fillStyle = '#c8a06f'; circle(cx, gy - 24, 5);
  ctx.fillStyle = '#52402e'; ctx.fillRect(cx - 10, gy - 28, 20, 9);
  ctx.fillStyle = '#fff'; ctx.fillRect(cx + 2, gy - 25, 2, 2);
  ctx.fillStyle = '#8a6450'; ctx.fillRect(cx - 10, gy - 3, 20, 3);
  ctx.fillStyle = '#7a5a3a'; ctx.fillRect(cx - 5, gy - 1, 10, 4);
  ctx.fillStyle = '#c9a878'; ctx.fillRect(cx - 4, gy, 8, 2);
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx + 7, gy - 9, 8, 3);
}
function drawJannatFacade(x, baseY, w, h, dark) {
  const top = baseY - h, shopH = 60;
  // residential tower
  ctx.fillStyle = dark ? '#5a5340' : '#e8dcc0'; ctx.fillRect(x, top, w, h);
  ctx.fillStyle = dark ? '#4a4534' : '#d8c8a4'; ctx.fillRect(x, top, w, 8); ctx.fillRect(x, top, 6, h);
  // parapet + water tank
  ctx.fillStyle = dark ? '#3f3a2c' : '#cdbf96'; ctx.fillRect(x - 3, top - 6, w + 6, 6);
  ctx.fillStyle = dark ? '#6b5f33' : '#b9a86a'; ctx.fillRect(x + 16, top - 18, 26, 12);
  ctx.fillStyle = dark ? '#52471f' : '#9a8a4a'; ctx.fillRect(x + 16, top - 18, 26, 3);
  // apartment floors
  const floors = Math.floor((h - 14 - shopH) / 44);
  for (let f = 0; f < floors; f++) {
    const fy = top + 16 + f * 44;
    for (let wx = x + 14; wx < x + w - 22; wx += 40) {
      ctx.fillStyle = dark ? (((wx + f) % 3) ? '#16213a' : '#ffdf9a') : '#9ab2c4';
      ctx.fillRect(wx, fy, 22, 20);
      ctx.fillStyle = dark ? '#0e1730' : '#7892a6'; ctx.fillRect(wx, fy + 14, 22, 6);
    }
    ctx.fillStyle = dark ? '#4a4838' : '#c9b98c'; ctx.fillRect(x + 8, fy + 22, w - 16, 4);
    ctx.fillStyle = dark ? '#5a5644' : '#b7a877';
    for (let bx = x + 12; bx < x + w - 12; bx += 8) ctx.fillRect(bx, fy + 26, 2, 7);
  }
  // ── OPEN SHOPFRONT: white walls, strip lights, meat, cooks ──
  const sy = baseY - shopH;
  const iw = w - 10, ix = x + 5;
  // bright white interior
  ctx.fillStyle = '#f6f6f6'; ctx.fillRect(ix, sy, iw, shopH);
  // warm light glow (stronger at night)
  ctx.globalAlpha = dark ? 0.55 : 0.28;
  const lg = ctx.createLinearGradient(ix, sy, ix, sy + shopH);
  lg.addColorStop(0, 'rgba(255,252,210,1)'); lg.addColorStop(1, 'rgba(255,252,210,0)');
  ctx.fillStyle = lg; ctx.fillRect(ix, sy, iw, shopH);
  ctx.globalAlpha = 1;
  // strip lights on ceiling
  ctx.fillStyle = '#fffde4';
  ctx.fillRect(ix + 5,  sy + 1, Math.round(iw * 0.27), 3);
  ctx.fillRect(ix + Math.round(iw * 0.38), sy + 1, Math.round(iw * 0.27), 3);
  ctx.fillRect(ix + Math.round(iw * 0.73), sy + 1, Math.round(iw * 0.24), 3);
  // meat hanging from hooks
  const mCols = ['#8b1a1a','#a0280a','#7b3a2a','#6b2418','#992e1a'];
  const mN = Math.floor((iw - 30) / 25);
  for (let m = 0; m < mN; m++) {
    const mx = ix + 30 + m * 25;
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(mx - 1, sy + 4, 2, 7);
    ctx.fillStyle = mCols[m % 5]; ctx.fillRect(mx - 5, sy + 11, 10, 14);
    ctx.fillStyle = 'rgba(220,100,60,0.22)'; ctx.fillRect(mx - 3, sy + 11, 4, 14);
  }
  // cash person behind counter — drawn BEFORE counter so counter occludes lower body
  const crx = ix + iw - 42;
  const cpx = crx + 16;
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(cpx - 4, sy + 3, 8, 10);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cpx - 4, sy + 1, 8, 4);
  ctx.fillStyle = '#15151a'; ctx.fillRect(cpx - 2, sy + 6, 1, 2); ctx.fillRect(cpx + 2, sy + 6, 1, 2);
  ctx.fillStyle = '#7a3b2a'; ctx.fillRect(cpx - 1, sy + 10, 3, 1);
  ctx.fillStyle = '#1e3a6e'; ctx.fillRect(cpx - 5, sy + 13, 10, 50);  // dark blue body extends below counter
  // white tiled counter — drawn AFTER person, covers their lower body
  ctx.fillStyle = '#e2e2e2'; ctx.fillRect(ix, sy + 38, iw, 22);
  ctx.fillStyle = '#f3f3f3'; ctx.fillRect(ix, sy + 41, iw, 6);
  ctx.strokeStyle = '#cacaca'; ctx.lineWidth = 0.5;
  for (let tx2 = ix; tx2 < ix + iw; tx2 += 12) { ctx.beginPath(); ctx.moveTo(tx2, sy + 38); ctx.lineTo(tx2, sy + 60); ctx.stroke(); }
  // cooks above counter (white uniform, chef cap, facing street)
  const cooks = [ix + Math.round(iw * 0.18), ix + Math.round(iw * 0.50), ix + Math.round(iw * 0.76)];
  for (const cx2 of cooks) {
    const hTop = sy + 5;
    ctx.fillStyle = '#1e3a6e'; ctx.fillRect(cx2 - 5, hTop, 10, 8);     // hat body (dark blue)
    ctx.fillStyle = '#1a3360'; ctx.fillRect(cx2 - 7, hTop + 7, 14, 3); // hat brim
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx2 - 4, hTop + 9, 8, 9);  // head
    ctx.fillStyle = '#15151a'; ctx.fillRect(cx2 - 2, hTop + 12, 1, 2); ctx.fillRect(cx2 + 2, hTop + 12, 1, 2);
    ctx.fillStyle = '#7a3b2a'; ctx.fillRect(cx2 - 1, hTop + 15, 3, 1);
    ctx.fillStyle = '#1e3a6e'; ctx.fillRect(cx2 - 6, hTop + 18, 12, 20); // torso (dark blue)
    ctx.fillStyle = '#1e3a6e'; ctx.fillRect(cx2 - 12, sy + 34, 6, 3); ctx.fillRect(cx2 + 6, sy + 34, 6, 3); // arms
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(cx2 - 8, sy + 31, 16, 5); // grill pan
    ctx.fillStyle = '#e25822'; ctx.fillRect(cx2 - 7, sy + 32, 14, 2);
  }
  // cash register screen (right side of counter)
  ctx.fillStyle = '#1a1a2a'; ctx.fillRect(crx + 2, sy + 26, 28, 18);
  ctx.fillStyle = '#3ae870'; ctx.fillRect(crx + 4, sy + 28, 24, 14);
  ctx.fillStyle = '#003300'; ctx.font = '5px monospace'; ctx.textAlign = 'center';
  ctx.fillText('PKR 850', crx + 16, sy + 38); ctx.textAlign = 'left';
  // beggar sitting outside left of building
  drawBeggar(x - 20, baseY);
  // Pepsi fridge outside right of building (blue)
  drawPepsiFridge(x + w + 10, baseY);
  // awning
  ctx.fillStyle = '#b71540'; ctx.fillRect(x - 2, sy - 8, w + 4, 12);
  ctx.fillStyle = '#fff'; for (let ax = x; ax < x + w; ax += 18) ctx.fillRect(ax, sy - 8, 9, 12);
  // sign board
  ctx.fillStyle = '#7a1010'; ctx.fillRect(x + 8, sy - 34, w - 16, 24);
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1; ctx.strokeRect(x + 8, sy - 34, w - 16, 24);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff5d0'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('جنت بی بی کیو', x + w / 2, sy - 22);
  ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#ffd98a';
  ctx.fillText('JANNAT BBQ', x + w / 2, sy - 12);
  ctx.textAlign = 'left';
}

// ─── Title screen helpers ────────────────────────────────────────────────────
function lerpHex(c1, c2, f) {
  const r1=c1>>16&0xff,g1=c1>>8&0xff,b1=c1&0xff;
  const r2=c2>>16&0xff,g2=c2>>8&0xff,b2=c2&0xff;
  return 'rgb('+(r1+(r2-r1)*f|0)+','+(g1+(g2-g1)*f|0)+','+(b1+(b2-b1)*f|0)+')';
}
function drawCatTitle(cx, gy, col, t) {
  ctx.fillStyle = col;
  ctx.fillRect(cx-7,gy-10,14,8);                     // body
  ctx.fillRect(cx-5,gy-19,10,9);                     // head
  ctx.beginPath(); ctx.moveTo(cx-5,gy-18); ctx.lineTo(cx-9,gy-24); ctx.lineTo(cx-1,gy-18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx+4,gy-18); ctx.lineTo(cx+8,gy-24); ctx.lineTo(cx+2,gy-18); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#f9a8d4';
  ctx.beginPath(); ctx.moveTo(cx-4,gy-19); ctx.lineTo(cx-7,gy-23); ctx.lineTo(cx-1,gy-19); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx+3,gy-19); ctx.lineTo(cx+6,gy-23); ctx.lineTo(cx+1,gy-19); ctx.closePath(); ctx.fill();
  const blink = (t%4100)<120;
  if (blink) {
    ctx.fillStyle=col; ctx.fillRect(cx-3,gy-16,3,1); ctx.fillRect(cx+1,gy-16,3,1);
  } else {
    ctx.fillStyle='#4ade80'; ctx.fillRect(cx-3,gy-17,3,4); ctx.fillRect(cx+1,gy-17,3,4);
    ctx.fillStyle='#15151a'; ctx.fillRect(cx-2,gy-16,1,3); ctx.fillRect(cx+2,gy-16,1,3);
  }
  ctx.fillStyle='#f9a8d4'; ctx.fillRect(cx,gy-13,1,1);
  ctx.strokeStyle=(col==='#1a1a1a')?'#666':'#bbb'; ctx.lineWidth=0.7;
  ctx.beginPath(); ctx.moveTo(cx-5,gy-13); ctx.lineTo(cx-10,gy-11.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-5,gy-13); ctx.lineTo(cx-10,gy-14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+4,gy-13); ctx.lineTo(cx+9,gy-11.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+4,gy-13); ctx.lineTo(cx+9,gy-14); ctx.stroke();
  ctx.strokeStyle=col; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(cx+6,gy-6);
  ctx.quadraticCurveTo(cx+16+Math.sin(t/220)*5,gy-18,cx+14+Math.sin(t/190)*4,gy-28+Math.cos(t/170)*5);
  ctx.stroke();
}
function drawPersonOnChair(cx, gy, shirt, t, type) {
  type = type || 'man';
  const bob = Math.sin(t / 700) * 1.2;
  // chair back (tallest, behind person head)
  ctx.fillStyle = '#a8814f';
  ctx.fillRect(cx - 5, gy - 50, 10, 3);
  ctx.fillRect(cx - 4, gy - 47, 2, 25);
  ctx.fillRect(cx + 2, gy - 47, 2, 25);
  // chair seat + front legs
  ctx.fillStyle = '#c9a86c'; ctx.fillRect(cx - 7, gy - 23, 14, 3);
  ctx.fillStyle = '#a8814f';
  ctx.fillRect(cx - 7, gy - 20, 3, 20); ctx.fillRect(cx + 4, gy - 20, 3, 20);
  // lower legs + chappals (visible below table)
  ctx.fillStyle = '#dcdcd2';
  ctx.fillRect(cx - 5, gy - 23, 4, 15); ctx.fillRect(cx + 1, gy - 23, 4, 15);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(cx - 5, gy - 9, 5, 2); ctx.fillRect(cx, gy - 9, 5, 2);
  // body + head anchored to seat level (bobs with eating)
  const by = gy - 23 + bob;
  if (type === 'floral') {
    ctx.fillStyle = '#f3e2ec'; ctx.fillRect(cx - 5, by - 15, 10, 15);
    const fc = ['#e84393', '#27ae60', '#e67e22'];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = fc[i%3]; circle(cx - 2 + i*2, by - 10, 1.2); }
    ctx.fillStyle = '#d63384'; ctx.fillRect(cx - 6, by - 16, 12, 3);
    ctx.fillStyle = '#d63384'; ctx.fillRect(cx - 6, by - 15, 1, 9); ctx.fillRect(cx + 5, by - 15, 1, 9);
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 3, by - 24, 7, 8);
    ctx.fillStyle = '#d63384'; ctx.fillRect(cx - 4, by - 27, 9, 4);
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 9, by - 5, 4, 2); ctx.fillRect(cx + 5, by - 5, 4, 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 2, by - 21, 2, 2); ctx.fillRect(cx + 1, by - 21, 2, 2);
    ctx.fillStyle = '#15151a'; ctx.fillRect(cx - 2, by - 21, 1, 1); ctx.fillRect(cx + 2, by - 21, 1, 1);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(cx - 2, by - 23, 2, 1); ctx.fillRect(cx + 1, by - 23, 2, 1);
    ctx.fillStyle = '#7a3b2a'; ctx.fillRect(cx, by - 18, 2, 1);
  } else {
    ctx.fillStyle = shirt; ctx.fillRect(cx - 5, by - 15, 10, 15);
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 3, by - 24, 7, 8);
    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cx - 4, by - 26, 9, 3);
    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cx - 4, by - 23, 1, 4); ctx.fillRect(cx + 3, by - 23, 1, 4);
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 9, by - 5, 4, 2); ctx.fillRect(cx + 5, by - 5, 4, 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 2, by - 21, 2, 2); ctx.fillRect(cx + 1, by - 21, 2, 2);
    ctx.fillStyle = '#15151a'; ctx.fillRect(cx - 2, by - 21, 1, 1); ctx.fillRect(cx + 2, by - 21, 1, 1);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(cx - 2, by - 23, 2, 1); ctx.fillRect(cx + 1, by - 23, 2, 1);
    ctx.fillStyle = '#7a3b2a'; ctx.fillRect(cx, by - 18, 2, 1);
  }
}
function drawTableGroup(cx, gy, leftShirt, leftType, rightShirt, rightType, t) {
  // 1. Chair backs (behind heads — draw first)
  ctx.fillStyle = '#a8814f';
  ctx.fillRect(cx - 17, gy - 50, 8, 3); ctx.fillRect(cx - 16, gy - 47, 2, 25); ctx.fillRect(cx - 13, gy - 47, 2, 25);
  ctx.fillRect(cx + 9, gy - 50, 8, 3);  ctx.fillRect(cx + 11, gy - 47, 2, 25); ctx.fillRect(cx + 14, gy - 47, 2, 25);
  // 2. Table legs
  ctx.fillStyle = '#7a5c2e';
  ctx.fillRect(cx - 19, gy - 24, 3, 24); ctx.fillRect(cx + 16, gy - 24, 3, 24);
  // 3. People on chairs (drawn before table surface so table hides their lower half)
  drawPersonOnChair(cx - 14, gy, leftShirt, t, leftType);
  drawPersonOnChair(cx + 14, gy, rightShirt, t + 300, rightType);
  // 4. Table surface + apron (drawn LAST — creates seated-behind-table illusion)
  ctx.fillStyle = '#c9a86c'; ctx.fillRect(cx - 19, gy - 28, 38, 4);
  ctx.fillStyle = '#b87d3c'; ctx.fillRect(cx - 19, gy - 28, 38, 2);
  ctx.fillStyle = '#a8814f'; ctx.fillRect(cx - 17, gy - 24, 34, 8);    // front apron hides lower body
  ctx.fillStyle = '#8a6636'; ctx.fillRect(cx - 17, gy - 24, 34, 1);    // shadow line
  // 5. Plates + food
  ctx.fillStyle = '#f0ebe0'; circle(cx - 8, gy - 26, 5); circle(cx + 8, gy - 26, 5);
  ctx.fillStyle = '#e29b38'; circle(cx - 8, gy - 26, 3);
  ctx.fillStyle = '#8b3a1e'; circle(cx + 8, gy - 26, 3);
  ctx.fillStyle = 'rgba(100,160,220,0.75)'; ctx.fillRect(cx - 15, gy - 28, 3, 5); ctx.fillRect(cx + 12, gy - 28, 3, 5);
}
function drawServer(cx, gy, t, idle) {
  const ph = idle ? 0 : Math.sin(t / 150) * 2.5;
  ctx.fillStyle = '#1a3565'; ctx.fillRect(cx - 5 + ph, gy - 16, 5, 16); ctx.fillRect(cx + 1 - ph, gy - 16, 5, 16);
  ctx.fillStyle = '#1e1e2a'; ctx.fillRect(cx - 6 + ph, gy - 2, 6, 2); ctx.fillRect(cx + ph, gy - 2, 6, 2);
  ctx.fillStyle = '#1a3565'; ctx.fillRect(cx - 6, gy - 31, 13, 15);
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, gy - 30, 3, 14); ctx.fillRect(cx - 1, gy - 31, 3, 3);
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 4, gy - 40, 8, 9);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cx - 5, gy - 42, 10, 3);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cx - 5, gy - 40, 1, 4); ctx.fillRect(cx + 4, gy - 40, 1, 4);
  pedFace(cx, gy, 1);
  ctx.fillStyle = '#c9a86c'; ctx.fillRect(cx + 5, gy - 26, 14, 2);      // tray
  ctx.fillStyle = 'rgba(100,160,220,0.8)'; circle(cx + 10, gy - 28, 2.5); circle(cx + 14, gy - 28, 2);
}
function drawOwner(cx, gy, t) {
  const panSide = Math.sin(t / 700) > 0 ? 1 : -1;
  const phase = t / 800;  // slow stride cycle

  // bending legs: thigh + shin as parallelograms; one leg swings while the other is planted
  const hipY = gy - 23;
  const thighH = 12, lean = 5;

  function drawLeg(hipX, legP) {
    // legP > 0 → swing phase: knee bends forward visibly
    // legP ≤ 0 → stance phase: leg nearly straight (no backward bend)
    let kx, ky, fx;
    if (legP > 0) {
      kx = hipX + Math.round(legP * lean);          // knee swings forward
      ky = hipY + thighH - Math.round(legP * 2);    // knee lifts slightly
      fx = kx - Math.round(legP * lean * 0.65);     // foot trails behind bent knee
    } else {
      const b = -legP;                               // 0..1 stance amount
      kx = hipX - Math.round(b * 2);                // barely leans back
      ky = hipY + thighH;
      fx = kx + Math.round(b * 1);                  // foot almost under knee
    }
    ctx.fillStyle = '#dcdcd2';
    ctx.beginPath();
    ctx.moveTo(hipX - 2, hipY); ctx.lineTo(hipX + 3, hipY);
    ctx.lineTo(Math.round(kx) + 3, Math.round(ky)); ctx.lineTo(Math.round(kx) - 2, Math.round(ky));
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(Math.round(kx) - 2, Math.round(ky)); ctx.lineTo(Math.round(kx) + 3, Math.round(ky));
    ctx.lineTo(Math.round(fx) + 3, gy - 2); ctx.lineTo(Math.round(fx) - 2, gy - 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(Math.round(fx) - 3, gy - 2, 7, 2);
  }

  // left and right legs use opposite phases — when one swings the other is planted
  drawLeg(cx - 3, Math.sin(phase));
  drawLeg(cx + 3, Math.sin(phase + Math.PI));

  // kameez (21px: gy-44 to gy-23)
  ctx.fillStyle = '#f0f0f0'; ctx.fillRect(cx - 8, gy - 44, 17, 21);
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(cx - 8, gy - 44, 2, 21);

  // head (13px: gy-57 to gy-44)
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 5, gy - 57, 11, 13);

  // kufi topi (7px: gy-64 to gy-57)
  ctx.fillStyle = '#f0f0f0'; ctx.fillRect(cx - 5, gy - 64, 11, 7);
  ctx.fillStyle = '#dcdcd2'; ctx.fillRect(cx - 4, gy - 64, 9, 2);

  // beard
  ctx.fillStyle = '#2e1a0a';
  ctx.fillRect(cx - 4, gy - 51, 9, 7);
  ctx.fillRect(cx - 3, gy - 45, 6, 2);
  ctx.fillRect(cx - 2, gy - 44, 4, 1);

  // mustache
  ctx.fillStyle = '#3a2010'; ctx.fillRect(cx - 4, gy - 55, 9, 2);

  // eyes
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 4, gy - 54, 2, 2); ctx.fillRect(cx + 2, gy - 54, 2, 2);
  ctx.fillStyle = '#15151a'; ctx.fillRect(cx - 3, gy - 54, 1, 2); ctx.fillRect(cx + 3, gy - 54, 1, 2);

  // facial expression: neutral → smile → neutral → frown → neutral
  const expr = Math.floor(t / 2800) % 5;
  ctx.fillStyle = '#6e2c1a';
  if (expr === 1) {
    ctx.fillRect(cx - 1, gy - 49, 4, 1);
    ctx.fillRect(cx - 2, gy - 50, 1, 1); ctx.fillRect(cx + 3, gy - 50, 1, 1);
  } else if (expr === 3) {
    ctx.fillRect(cx - 1, gy - 50, 4, 1);
    ctx.fillRect(cx - 2, gy - 49, 1, 1); ctx.fillRect(cx + 3, gy - 49, 1, 1);
  } else {
    ctx.fillRect(cx - 1, gy - 49, 4, 1);
  }

  // pan blush
  ctx.fillStyle = 'rgba(200,80,50,0.6)'; circle(cx + panSide * 3, gy - 52, 2.5);
}
function drawStandingFan(cx, gy, t) {
  // compact fan — head at face level (~gy-44)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(cx - 9, gy - 3, 18, 4);           // base plate
  ctx.fillRect(cx - 2, gy - 42, 4, 40);           // short pole
  ctx.fillStyle = '#2c2c2c'; ctx.fillRect(cx - 3, gy - 28, 6, 6); // tilt joint
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, gy - 46, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, gy - 46, 8, 0, Math.PI * 2); ctx.stroke();
  const angle = (t / 60) % (Math.PI * 2);
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  for (let b = 0; b < 3; b++) {
    const a = angle + b * Math.PI * 2 / 3;
    ctx.beginPath(); ctx.moveTo(cx, gy - 46);
    ctx.lineTo(cx + Math.cos(a) * 6, gy - 46 + Math.sin(a) * 6); ctx.stroke();
  }
  ctx.fillStyle = '#1a1a1a'; circle(cx, gy - 46, 2.5);
}
function drawDeliveryBike(cx, gy, t) {
  ctx.save(); ctx.translate(cx, gy); ctx.rotate(-0.07);
  wheel(-16, -9, 9); wheel(24, -9, 9);
  ctx.strokeStyle = '#ff69b4'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-16, -9); ctx.lineTo(4, -24); ctx.lineTo(24, -9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -24); ctx.lineTo(12, -26); ctx.stroke();
  ctx.fillStyle = '#555'; ctx.fillRect(-4, -26, 6, 2);
  ctx.fillStyle = '#ff69b4'; ctx.fillRect(6, -28, 18, 4);
  ctx.fillStyle = '#e8dada'; ctx.fillRect(-8, -32, 12, 10);
  ctx.restore();
  // FoodPanda delivery bag on rear rack
  const bx = cx - 18, by = gy - 56;
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(bx, by, 34, 30);
  ctx.fillStyle = '#e4e4e4'; ctx.fillRect(bx + 4, by + 3, 26, 22);
  ctx.fillStyle = '#111'; circle(bx + 11, by + 11, 5); circle(bx + 23, by + 11, 5);
  ctx.fillStyle = '#eee'; circle(bx + 12, by + 10, 2); circle(bx + 24, by + 10, 2);
  ctx.fillStyle = '#333'; circle(bx + 17, by + 17, 2);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx + 14, by + 20); ctx.quadraticCurveTo(bx + 17, by + 23, bx + 20, by + 20); ctx.stroke();
  ctx.fillStyle = '#e01060'; ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center';
  ctx.fillText('foodpanda', bx + 17, by + 29); ctx.textAlign = 'left';
}
function drawDeliveryBoy(cx, gy) {
  ctx.fillStyle = '#dcdcd2'; ctx.fillRect(cx - 5, gy - 16, 5, 16); ctx.fillRect(cx + 1, gy - 16, 5, 16);
  ctx.fillStyle = '#2b2b2b'; ctx.fillRect(cx - 6, gy - 2, 6, 2); ctx.fillRect(cx, gy - 2, 6, 2);
  ctx.fillStyle = '#ff69b4'; ctx.fillRect(cx - 6, gy - 31, 13, 19);
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(cx - 4, gy - 40, 8, 9);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(cx - 5, gy - 42, 10, 3); ctx.fillRect(cx - 5, gy - 40, 1, 4); ctx.fillRect(cx + 4, gy - 40, 1, 4);
  pedFace(cx, gy, 1);
  ctx.fillStyle = '#ff69b4';
  ctx.beginPath(); ctx.arc(cx, gy - 44, 7, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(200,220,255,0.45)'; ctx.fillRect(cx - 4, gy - 44, 8, 4);
}
function drawWalkingCat(cx, gy, col, t) {
  const s = Math.sin(t / 165);

  // tail
  ctx.strokeStyle = col; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 7, gy - 10);
  ctx.quadraticCurveTo(cx - 17 + s * 1.5, gy - 13, cx - 15 + s, gy - 26 + s * 2);
  ctx.stroke();

  // bent-knee leg helper: draws upper+lower segment meeting at a knee
  function bentLeg(topX, topY, phase) {
    const kx = topX + Math.round(phase * 4);  // knee swings fore/aft
    const ky = topY + 4;
    const fx = kx + Math.round(-phase * 2);   // foot eases back under body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(topX, topY); ctx.lineTo(topX + 2, topY);
    ctx.lineTo(kx + 2, ky); ctx.lineTo(kx, ky);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(kx, ky); ctx.lineTo(kx + 2, ky);
    ctx.lineTo(fx + 2, gy); ctx.lineTo(fx, gy);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(fx - 1, gy - 1, 4, 1);  // paw
  }

  // rear legs drawn behind body
  bentLeg(cx - 4, gy - 8, -s);
  bentLeg(cx + 0, gy - 8,  s);

  // body, neck, head
  ctx.fillStyle = col;
  ctx.fillRect(cx - 7, gy - 14, 18, 8);
  ctx.fillRect(cx + 9, gy - 17, 5, 5);
  ctx.fillRect(cx + 8, gy - 22, 9, 9);

  // front legs drawn in front of body
  bentLeg(cx + 5, gy - 8,  s);
  bentLeg(cx + 9, gy - 8, -s);

  // ears
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(cx+8,gy-21); ctx.lineTo(cx+6,gy-27); ctx.lineTo(cx+12,gy-21); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx+13,gy-21); ctx.lineTo(cx+15,gy-27); ctx.lineTo(cx+17,gy-21); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f9a8d4';
  ctx.beginPath(); ctx.moveTo(cx+9,gy-21); ctx.lineTo(cx+7,gy-25); ctx.lineTo(cx+12,gy-21); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx+13,gy-21); ctx.lineTo(cx+15,gy-25); ctx.lineTo(cx+17,gy-21); ctx.closePath(); ctx.fill();

  // eye
  const blink2 = (t % 3600) < 110;
  if (blink2) { ctx.fillStyle = col; ctx.fillRect(cx+10, gy-18, 4, 1); }
  else { ctx.fillStyle = '#4ade80'; ctx.fillRect(cx+10, gy-19, 4, 4); ctx.fillStyle = '#15151a'; ctx.fillRect(cx+11, gy-18, 2, 3); }

  // nose + whiskers
  ctx.fillStyle = '#f9a8d4'; ctx.fillRect(cx+15, gy-14, 1, 1);
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(cx+15, gy-14); ctx.lineTo(cx+21, gy-13); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+15, gy-14); ctx.lineTo(cx+21, gy-15); ctx.stroke();
}
function drawWalkingCatBrown(t, baseY) {
  const cycleMs = 20000;
  const catX = (t % cycleMs) / cycleMs * (W + 140) - 70;
  if (catX < -40 || catX > W + 25) return;
  drawWalkingCat(catX, baseY, '#8b5a2b', t);
  // bubble: 1.5s visible, 1s hidden, alternating 'meow?' / 'meow'
  const bubCycle = (t / 1000) % 5;
  let phrase = null, ba = 0;
  if (bubCycle < 1.5) {
    phrase = 'meow?';
    ba = bubCycle < 0.15 ? bubCycle / 0.15 : bubCycle > 1.35 ? (1.5 - bubCycle) / 0.15 : 1;
  } else if (bubCycle >= 2.5 && bubCycle < 4.0) {
    const p = bubCycle - 2.5;
    phrase = 'meow';
    ba = p < 0.15 ? p / 0.15 : p > 1.35 ? (1.5 - p) / 0.15 : 1;
  }
  if (phrase && ba > 0) {
    ctx.font = '9px monospace'; ctx.textAlign = 'center';
    const tw = ctx.measureText(phrase).width + 10;
    ctx.globalAlpha = ba * 0.95;
    ctx.fillStyle = '#fffbf0'; ctx.fillRect(catX - tw / 2, baseY - 50, tw, 16);
    ctx.strokeStyle = '#c9a86c'; ctx.lineWidth = 1; ctx.strokeRect(catX - tw / 2, baseY - 50, tw, 16);
    ctx.fillStyle = '#2c2c2c'; ctx.fillText(phrase, catX, baseY - 39);
    ctx.fillStyle = '#fffbf0'; ctx.beginPath(); ctx.moveTo(catX - 3, baseY - 34); ctx.lineTo(catX + 3, baseY - 34); ctx.lineTo(catX, baseY - 29); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
}
function drawTitleParkedBike(cx, gy, col) {
  ctx.save(); ctx.translate(cx,gy); ctx.rotate(-0.07);
  wheel(-16,-9,9); wheel(24,-9,9);
  ctx.strokeStyle=col; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(-16,-9); ctx.lineTo(4,-24); ctx.lineTo(24,-9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4,-24); ctx.lineTo(12,-26); ctx.stroke();
  ctx.fillStyle='#555'; ctx.fillRect(-4,-26,6,2);
  ctx.fillStyle=col; ctx.fillRect(6,-28,18,4);
  ctx.fillStyle='#444'; ctx.fillRect(6,-28,4,12);
  ctx.strokeStyle='#888'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-14,-5); ctx.lineTo(-20,4); ctx.stroke();
  ctx.fillStyle='#aaa'; ctx.fillRect(-10,-30,6,2); ctx.fillRect(8,-30,6,2);
  ctx.restore();
}
function drawTitleParkedCar(cx, gy, col) {
  const bx=cx-34, carH=20, by=gy-carH;
  ctx.fillStyle=col; ctx.fillRect(bx,by,68,carH);
  ctx.fillStyle=col; ctx.fillRect(bx+12,by-16,40,16);
  ctx.fillStyle='rgba(80,140,190,0.75)';
  ctx.fillRect(bx+14,by-14,17,11); ctx.fillRect(bx+33,by-14,17,11);
  ctx.fillStyle='#2a2a3a'; ctx.fillRect(bx+31,by-14,2,11);
  wheel(bx+13,gy-1,9); wheel(bx+55,gy-1,9);
  ctx.fillStyle='#fff9c4'; ctx.fillRect(bx,by+6,5,6);
  ctx.fillStyle='#ff4422'; ctx.fillRect(bx+63,by+6,5,6);
  ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(cx,by); ctx.lineTo(cx,gy); ctx.stroke();
  ctx.fillStyle='#aaa'; ctx.fillRect(bx-2,by+14,5,6); ctx.fillRect(bx+65,by+14,5,6);
  ctx.fillStyle='#fff'; ctx.fillRect(bx+22,gy-6,20,7);
  ctx.fillStyle='#333'; ctx.font='5px monospace'; ctx.textAlign='center';
  ctx.fillText('KHI-786',cx,gy-1); ctx.textAlign='left';
}
function drawTitleLamp(lx, baseY, nf) {
  ctx.fillStyle='#4a4a5a'; ctx.fillRect(lx-2,baseY-108,5,108);
  ctx.fillStyle='#3a3a4a'; ctx.fillRect(lx-2,baseY-108,24,4); ctx.fillRect(lx+20,baseY-108,5,16);
  if (nf > 0.22) {
    const la=Math.min(1,(nf-0.22)*4);
    ctx.fillStyle='#fff8c4'; ctx.fillRect(lx+19,baseY-107,8,12);
    ctx.globalAlpha=la*0.40;
    const g=ctx.createRadialGradient(lx+23,baseY-101,0,lx+23,baseY-101,130);
    g.addColorStop(0,'#fde68a'); g.addColorStop(1,'rgba(253,230,138,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(lx+23,baseY-101,130,0,7); ctx.fill();
    // downward ground cone
    ctx.globalAlpha=la*0.18;
    const gc=ctx.createRadialGradient(lx+23,baseY-90,0,lx+23,baseY,110);
    gc.addColorStop(0,'#fde68a'); gc.addColorStop(1,'rgba(253,230,138,0)');
    ctx.fillStyle=gc; ctx.fillRect(lx-80,baseY-90,200,90);
    ctx.globalAlpha=1;
  }
}

function drawTitle() {
  const t = performance.now();
  const titleEl = (t - titleStart) / 1000;
  const titleNF = Math.min(1, titleEl / 70);
  const baseY = H - 56;
  const jw = 200, jx = W / 2 - jw / 2 + 70;

  // ── SKY ──
  const sg = ctx.createLinearGradient(0, 0, 0, H);
  if (titleNF < 0.5) {
    const f = titleNF / 0.5;
    sg.addColorStop(0, lerpHex(0x8ec5e8, 0xc87030, f));
    sg.addColorStop(1, lerpHex(0xf6d9a8, 0xe05018, f));
  } else {
    const f = (titleNF - 0.5) / 0.5;
    sg.addColorStop(0, lerpHex(0xc87030, 0x0c0e26, f));
    sg.addColorStop(1, lerpHex(0xe05018, 0x241a36, f));
  }
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

  // ── SUN ──
  const sunX = W * 0.13;
  const sunY = H * 0.18 + titleNF * H * 0.80;
  const sunVis = Math.max(0, 1 - Math.max(0, (sunY - (baseY - 24)) / 55));
  if (sunVis > 0) {
    const sunHex = titleNF < 0.35 ? 0xffd86b : titleNF < 0.65 ? 0xf47020 : 0xe84020;
    ctx.fillStyle = '#' + sunHex.toString(16).padStart(6, '0');
    ctx.globalAlpha = sunVis * 0.18; circle(sunX, sunY, 72);
    ctx.globalAlpha = sunVis * 0.09; circle(sunX, sunY, 98);
    ctx.globalAlpha = sunVis; circle(sunX, sunY, 32);
    ctx.globalAlpha = 1;
  }

  // ── CRESCENT MOON (top right, rises with night) ──
  if (titleNF > 0.55) {
    const ma = Math.min(1, (titleNF - 0.55) / 0.22);
    const mx = W * 0.89, my = H * 0.07 - (1 - ma) * 30;
    ctx.globalAlpha = ma;
    ctx.fillStyle = '#ffe96a'; circle(mx, my, 16);
    // bite out of it with sky-matching color
    const skyTop = titleNF > 0.9 ? '#0c0e26' : '#1a1230';
    ctx.fillStyle = skyTop; circle(mx + 10, my - 5, 13);
    ctx.globalAlpha = 1;
  }

  // ── STARS ──
  if (titleNF > 0.4) {
    const sa = Math.min(1, (titleNF - 0.4) * 3);
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = sa * (0.3 + 0.4 * Math.abs(Math.sin(t / 1500 + i)));
      ctx.fillStyle = '#e8eeff';
      ctx.fillRect(((i * 211 + 53) % (W - 60)) + 30, ((i * 97 + 13) % Math.round(H * 0.44)) + 8, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // ── BACK SKYLINE ──
  ctx.fillStyle = titleNF > 0.55 ? '#1e2240' : '#b9cdba';
  for (let i = 0; i < Math.ceil(W / 110) + 1; i++) {
    const hh = 80 + (i * 67) % 90;
    ctx.fillRect(i * 110, H - 150 - hh + 40, 90, hh + 150);
  }

  // ── STREET LAMPS ──
  drawTitleLamp(Math.round(W * 0.08), baseY, titleNF);
  drawTitleLamp(Math.round(W * 0.27), baseY, titleNF);
  drawTitleLamp(Math.round(W * 0.50), baseY, titleNF);
  drawTitleLamp(Math.round(W * 0.70), baseY, titleNF);
  drawTitleLamp(Math.round(W * 0.93), baseY, titleNF);

  // ── GROUND + STILL ROAD MARKINGS ──
  ctx.fillStyle = titleNF > 0.5 ? '#8e8880' : '#b9b1a3';
  ctx.fillRect(0, baseY, W, 16);
  ctx.fillStyle = titleNF > 0.5 ? '#3a3638' : '#555259';
  ctx.fillRect(0, baseY + 16, W, H);
  ctx.fillStyle = '#d9d090';
  for (let i = 0; i < W; i += 80) ctx.fillRect(i, baseY + 40, 40, 5);  // static

  // ── LEFT PARKING: 2 bikes only ──
  const pvX = Math.round(W * 0.04);
  drawTitleParkedBike(pvX + 14, baseY, '#1abc9c');
  drawTitleParkedBike(pvX + 50, baseY, '#f39c12');
  drawCatTitle(pvX + 84, baseY, '#888888', t + 1000);

  // ── LEFT SEATING: 2 family tables (cloth enclosure) + 1 gents table ──
  const tableX0 = jx - 285;
  const areaCol = titleNF > 0.5 ? '#ffd86b' : '#2c3e50';

  // family area cloth enclosure (partial height white cloth)
  const fLeft = tableX0 - 22, fRight = tableX0 + 128, fH = 34;
  ctx.globalAlpha = 0.82; ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(fLeft, baseY - fH, fRight - fLeft, fH);
  ctx.globalAlpha = 1; ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(fLeft, baseY - fH, fRight - fLeft, 2);
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(fLeft - 2, baseY - fH - 7, 4, fH + 7);
  ctx.fillRect(fRight - 2, baseY - fH - 7, 4, fH + 7);
  ctx.fillRect((fLeft + fRight) / 2 - 2, baseY - fH - 5, 4, fH + 5);
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = areaCol;
  ctx.fillText('FAMILY AREA', (fLeft + fRight) / 2, baseY - fH - 12);
  ctx.textAlign = 'left';
  drawTableGroup(tableX0,       baseY, '#6c3483', 'man', '#e84393', 'floral', t);
  drawTableGroup(tableX0 + 55,  baseY, '#2ecc71', 'man', '#c0392b', 'floral', t + 90);
  drawServer(tableX0 + 82, baseY, t, false);

  // small divider post between family and gents
  ctx.fillStyle = '#8a8a8a'; ctx.fillRect(tableX0 + 130, baseY - 42, 4, 42);

  // gents area (1 table, open)
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = areaCol;
  ctx.fillText('GENTS AREA', tableX0 + 168, baseY - 52);
  ctx.textAlign = 'left';
  drawTableGroup(tableX0 + 155, baseY, '#16607a', 'man', '#2980b9', 'man', t + 180);

  drawCatTitle(tableX0 - 24, baseY, '#b58a5a', t);

  // "hmm yummy alhamdulillah" bubble over family table diner
  const bphase = (t / 1000) % 10;
  if (bphase < 5.5) {
    const ba = bphase < 0.4 ? bphase / 0.4 : bphase > 5.1 ? (5.5 - bphase) / 0.4 : 1;
    ctx.globalAlpha = ba; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    const btx = tableX0 + 5, bty = baseY - 70;
    const bwm = Math.max(ctx.measureText('hmm yummy').width, ctx.measureText('alhamdulillah!').width) + 10;
    ctx.fillStyle = '#fffbf0'; ctx.fillRect(btx - bwm / 2, bty - 28, bwm, 30);
    ctx.strokeStyle = '#c9a86c'; ctx.lineWidth = 1; ctx.strokeRect(btx - bwm / 2, bty - 28, bwm, 30);
    ctx.fillStyle = '#2c2c2c'; ctx.fillText('hmm yummy', btx, bty - 15); ctx.fillText('alhamdulillah!', btx, bty - 3);
    ctx.fillStyle = '#fffbf0'; ctx.beginPath(); ctx.moveTo(btx - 4, bty + 2); ctx.lineTo(btx + 4, bty + 2); ctx.lineTo(btx, bty + 10); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  // ── JANNAT BBQ BUILDING ──
  drawJannatFacade(jx, baseY, jw, 250, titleNF > 0.5);

  // ── WIDE BBQ GRILL + SMOKE + FAN ──
  const gx = jx - 50;
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(gx, baseY - 26, 90, 14);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(gx, baseY - 14, 90, 14);
  ctx.fillStyle = '#ff5e3a'; for (let i = 0; i < 10; i++) ctx.fillRect(gx + 4 + i * 8, baseY - 24, 5, 4);
  ctx.fillStyle = '#6d4c2f'; for (let i = 0; i < 9; i++) ctx.fillRect(gx + 5 + i * 9, baseY - 27, 7, 3);
  for (let src = 0; src < 7; src++) {
    const ox = gx + 7 + src * 12;
    for (let i = 0; i < 6; i++) {
      const sy2 = (t / 700 * 22 + i * 14 + src * 8) % 110;
      ctx.globalAlpha = 0.70 * (1 - sy2 / 110);
      ctx.fillStyle = sy2 < 30 ? '#3a3a3a' : '#6a6a6a';
      circle(ox + Math.sin(t / 500 + i + src) * 9, baseY - 32 - sy2, 4 + sy2 * 0.09);
    }
  }
  ctx.globalAlpha = 1;
  drawPedestrian(gx + 44, baseY, '#9b3d12', 0, true, 'man');   // cook AT grill
  drawStandingFan(gx + 92, baseY, t);
  drawCatTitle(gx - 16, baseY, '#1a1a1a', t + 500);
  // owner paces left-to-right within the seating area
  const ownerPeriod = 13000;
  const ownerPhase = (t % ownerPeriod) / ownerPeriod;
  const ownerBounce = ownerPhase < 0.5 ? ownerPhase * 2 : (1 - ownerPhase) * 2;
  const ownerX = Math.round(fLeft + 10 + ownerBounce * (tableX0 + 168 - fLeft - 20));
  if (ownerPhase >= 0.5) {
    ctx.save(); ctx.translate(ownerX * 2, 0); ctx.scale(-1, 1);
    drawOwner(ownerX, baseY, t);
    ctx.restore();
  } else {
    drawOwner(ownerX, baseY, t);
  }

  // ── SMALL CROWD — all LEFT of grill (idle, no leg twitch) ──
  const crowd = [['man','#34495e'],['floral','#e84393'],['man','#16607a']];
  for (let i = 0; i < crowd.length; i++) {
    const ccx = jx - 130 + i * 24 + Math.sin(t / 800 + i) * 1.5;
    drawPedestrian(ccx, baseY, crowd[i][1], 0, true, crowd[i][0]);
  }

  // ── RIGHT PARKING: car + teal bike + delivery bike ──
  const rpX = jx + jw + 30;
  drawTitleParkedBike(rpX, baseY, '#1abc9c');
  drawTitleParkedCar(rpX + 55, baseY, '#c0392b');
  if (rpX + 160 < W) {
    drawDeliveryBike(rpX + 148, baseY, t);
    drawDeliveryBoy(rpX + 182, baseY);
  }

  // ── 2 WALKERS crossing the scene ──
  const walkers = [
    { base: 0.05, spd: 0.80, col: '#e67e22', type: 'man'    },
    { base: 0.15, spd: 0.65, col: '#e84393', type: 'floral' },
  ];
  for (const w of walkers) {
    const wx = ((w.base * W + t / 50 * w.spd) % (W + 80)) - 40;
    if (wx < -30 || wx > W + 10) continue;
    drawPedestrian(wx, baseY, w.col, t * w.spd / 150, false, w.type);
  }

  // ── BROWN WALKING CAT ──
  drawWalkingCatBrown(t, baseY);

  // ── CREAM CAT far right ──
  drawCatTitle(W - 30, baseY, '#f5f5dc', t + 2000);

  // ── SPEECH BUBBLES (pinned over real people) ──
  const chatter = [
    { x: tableX0 + 82,    y: baseY - 66, text: 'Yaar chai piyo!' },     // server between family tables
    { x: jx + 28,         y: baseY - 88, text: 'Seekh aur do!' },        // crowd near entrance
    { x: tableX0 + 155,   y: baseY - 66, text: 'Kahan ja raha?' },       // gents table person
    { x: tableX0 + 58,    y: baseY - 72, text: 'Aaj bhi garmi hai!' },   // owner (walking in seating area)
    { x: jx - 106,        y: baseY - 66, text: 'Biryani lao!' },         // crowd[1]
  ];
  ctx.font = '10px monospace';
  for (let ci = 0; ci < chatter.length; ci++) {
    const phase = ((t / 1000) + ci * 1.4) % 6.5;
    if (phase > 4.2) continue;
    const alpha = phase < 0.35 ? phase / 0.35 : phase > 3.85 ? (4.2 - phase) / 0.35 : 1;
    const cl = chatter[ci];
    const tw = ctx.measureText(cl.text).width + 12;
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = '#fffbf0'; ctx.fillRect(cl.x - tw / 2, cl.y - 14, tw, 17);
    ctx.strokeStyle = '#c9a86c'; ctx.lineWidth = 1; ctx.strokeRect(cl.x - tw / 2, cl.y - 14, tw, 17);
    ctx.fillStyle = '#2c2c2c'; ctx.fillText(cl.text, cl.x - tw / 2 + 6, cl.y);
    ctx.fillStyle = '#fffbf0'; ctx.beginPath(); ctx.moveTo(cl.x - 4, cl.y + 3); ctx.lineTo(cl.x + 4, cl.y + 3); ctx.lineTo(cl.x, cl.y + 10); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── TITLE TEXT ──
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px monospace';
  ctx.fillStyle = '#1e272e'; ctx.fillText('BARA AYA', W / 2 + 3, 92);
  ctx.fillStyle = '#c0392b'; ctx.fillText('BARA AYA', W / 2, 89);
  ctx.font = 'bold 40px monospace';
  ctx.fillStyle = '#1e272e'; ctx.fillText('ALLAMA ROAD RUN', W / 2 + 3, 137);
  ctx.fillStyle = '#ffd32a'; ctx.fillText('ALLAMA ROAD RUN', W / 2, 134);
  ctx.font = 'bold 16px monospace'; ctx.fillStyle = titleNF > 0.5 ? '#d4c9e0' : '#2c3e50';
  ctx.fillText('Maskan Chowrangi  →  Gulshan Bridge', W / 2, 165);
  if (Math.floor(t / 500) % 2 === 0) {
    ctx.font = 'bold 26px monospace'; ctx.fillStyle = '#c0392b';
    ctx.fillText('PRESS ENTER TO START', W / 2, 215);
  }
  ctx.font = 'bold 14px monospace'; ctx.fillStyle = titleNF > 0.5 ? '#aaa8b8' : '#2c3e50';
  ctx.fillText('← →  move      SPACE / ↑  jump      P  pause      M  music', W / 2, 250);
  // easy mode + music toggles — top right
  ctx.textAlign = 'right'; ctx.font = 'bold 13px monospace';
  ctx.fillStyle = easyMode ? '#2ecc71' : (titleNF > 0.5 ? '#888' : '#7f8c8d');
  ctx.fillText(easyMode ? '[✓] EASY MODE  ON  (E)' : '[ ] EASY MODE  OFF  (E)', W - 12, 22);
  ctx.fillStyle = musicOn ? '#3498db' : (titleNF > 0.5 ? '#888' : '#7f8c8d');
  ctx.fillText(musicOn ? '[♪] MUSIC  ON  (M)' : '[✕] MUSIC  OFF  (M)', W - 12, 40);
  ctx.textAlign = 'left';
}

function drawWaitingBike(sx, gy, withPassenger, smoking, bob, riderLift) {
  const yy = gy + (bob || 0);
  const lift = riderLift || 0;                                  // riders sit this many px above the seat (mounting)
  // CD70 sprite, flipped to face RIGHT (the ride direction)
  const spr = sprites.bike;
  if (spr) {
    const c = spr.content || { x: 0, y: 0, w: spr.width, h: spr.height };
    const s = 54 / c.h, dw = spr.width * s, dh = spr.height * s;
    ctx.save();
    ctx.translate(sx + 24, yy); ctx.scale(-1, 1);
    ctx.drawImage(spr, -(c.x + c.w / 2) * s, -(c.y + c.h) * s, dw, dh);
    ctx.restore();
  } else {                                                       // simple fallback bike
    wheel(sx, yy - 8, 9); wheel(sx + 46, yy - 8, 9);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx, yy - 8); ctx.lineTo(sx + 20, yy - 24); ctx.lineTo(sx + 46, yy - 8); ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(sx + 12, yy - 27, 24, 4);
  }
  // riders SITTING on the bike (butt on the seat, thighs forward, shins down)
  const seat = yy - 24 - lift;
  if (withPassenger) {                                          // pillion (our hero), behind — drawn first
    ctx.fillStyle = '#22336a'; ctx.fillRect(sx + 6, seat, 11, 4);              // thigh
    ctx.fillStyle = '#2c3a92'; ctx.fillRect(sx + 14, seat + 2, 4, 12);         // shin
    ctx.fillStyle = '#8e2433'; ctx.fillRect(sx + 1, seat - 13, 5, 14);         // backpack
    ctx.fillStyle = '#eef2f7'; ctx.fillRect(sx + 5, seat - 15, 11, 16);        // shirt
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(sx + 6, seat - 24, 9, 9);          // head
    ctx.fillStyle = '#1b1e24'; ctx.fillRect(sx + 5, seat - 26, 11, 4);         // hair
    ctx.fillStyle = '#1e272e'; ctx.fillRect(sx + 12, seat - 20, 2, 2);         // eye
    ctx.strokeStyle = '#7a4a2b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx + 10, seat - 17, 2.2, 0.25, Math.PI - 0.25); ctx.stroke(); // smile
  }
  // driver — green Bykea kit, black helmet, front
  ctx.fillStyle = '#0a7e3a'; ctx.fillRect(sx + 26, seat, 12, 4);               // thigh
  ctx.fillStyle = '#2b2b2b'; ctx.fillRect(sx + 35, seat + 2, 4, 12);           // shin to peg
  ctx.fillStyle = '#0aa54f'; ctx.fillRect(sx + 24, seat - 15, 11, 16);         // torso
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(sx + 33, seat - 11, 10, 3);          // arm to bars
  ctx.fillStyle = '#c8a06f'; ctx.fillRect(sx + 25, seat - 24, 9, 9);           // head
  ctx.fillStyle = '#15151a'; ctx.fillRect(sx + 24, seat - 27, 11, 7);          // black helmet
  ctx.fillStyle = '#0a3a1e'; ctx.fillRect(sx + 32, seat - 23, 4, 3);           // visor
  if (smoking) {                                                                 // phattay exhaust
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#aab';
    circle(sx - 8 - Math.random() * 8, yy - 12, 3 + Math.random() * 3);
    circle(sx - 16 - Math.random() * 8, yy - 14, 2 + Math.random() * 3);
    ctx.globalAlpha = 1;
  }
}

function drawRideScene() {
  // climb-on animation: riders rise up and settle onto the seat over the first ~30 frames
  const lift = rideT < 30 ? (1 - rideT / 30) * 14 + Math.abs(Math.sin(rideT * 0.4)) * 3 : 0;
  const showRiders = true;
  drawWaitingBike(px(bikeX), groundYAt(bikeX), showRiders, rideT > 55, 0, lift);
  if (rideT <= 55) {
    ctx.fillStyle = 'rgba(20,20,30,.7)'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd32a';
    ctx.fillText('GULSHAN BRIDGE PAHUNCH GAYE!', W / 2, 110);
    ctx.textAlign = 'left';
  }
}

function drawCredits() {
  const t = performance.now();
  const SY = H - 112;                                          // top of the night-ride strip
  const RD = H - 96;                                           // road top
  const scroll = creditsT * 2.1;                              // slower, serene drift
  // night sky
  const g2 = ctx.createLinearGradient(0, 0, 0, H);
  g2.addColorStop(0, '#0c0e26'); g2.addColorStop(1, '#241a36');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {                              // stars
    const sy = (i * 97) % H, sx2 = ((i * 211) + t * 0.006 * (10 + i % 7)) % W;
    ctx.globalAlpha = 0.22 + 0.45 * Math.abs(Math.sin(t / 1300 + i));
    ctx.fillStyle = '#cfd8ff'; ctx.fillRect(sx2, sy * 0.5, 2, 2);
  }
  ctx.globalAlpha = 1;
  // crescent moon, top-right (full disc minus an offset disc cut from it)
  const mx = W - 64, my = 60, mr = 24;
  ctx.globalAlpha = 0.22; ctx.fillStyle = '#fdf6c9'; circle(mx, my, mr + 8); ctx.globalAlpha = 1;  // glow
  ctx.fillStyle = '#f4ecc2'; circle(mx, my, mr);
  ctx.fillStyle = '#0c0e26';                                  // carve the crescent with the sky colour
  circle(mx + 9, my - 5, mr - 1);
  // a plane crosses in the first ~10s, then planes recur through the credits
  if (creditsT < 620) {
    const f = creditsT / 620;
    drawPlane(f * (W + 140) - 70, 70 + Math.sin(f * 3) * 6, 1.3, t);
  }
  for (let k = 0; k < 2; k++) {
    const cyc = (t / 1000 + k * 10 + 5) % 18;
    if (cyc < 12) { const f = cyc / 12; drawPlane(f * (W + 140) - 70, 38 + k * 30 + Math.sin(f * 4 + k) * 5, 1.15, t + k * 250); }
  }
  // soft night clouds drifting behind the buildings — credits rise out from here
  for (let i = 0; i < 5; i++) {
    let cx = ((i * 230 + 60) - scroll * 0.10) % (W + 360); if (cx < -200) cx += W + 360;
    const cy = 80 + (i * 53) % 130;
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#aeb6e0';
    circle(cx, cy, 26); circle(cx + 26, cy + 6, 20); circle(cx - 26, cy + 7, 18); circle(cx + 6, cy - 12, 17);
    ctx.globalAlpha = 1;
  }
  // far skyline (dim, behind the text)
  for (let bi = 0; bi < 9; bi++) {
    const bw = 90 + (bi * 71) % 70, bh = 38 + (bi * 53) % 40;
    let bx = ((bi * 250) - (scroll * 0.16)) % (W + 320); if (bx < -240) bx += W + 320;
    if (bx > W + 20) continue;
    ctx.fillStyle = '#10132a'; ctx.fillRect(bx, SY - bh, bw, bh + (H - SY));
    for (let r = 0; r < bh / 16 - 1; r++) for (let col = 0; col < bw / 13 - 1; col++) {
      ctx.fillStyle = (((col * 7 + r * 13 + bi * 17) % 7) < 2) ? '#c9b06a' : '#0a0d20';
      ctx.fillRect(bx + 6 + col * 13, SY - bh + 9 + r * 16, 6, 7);
    }
  }
  // --- rolling credits text (drawn here, so the NEAR buildings in front hide its lower part) ---
  const secs = ((tEnd - tStart) / 1000).toFixed(1);
  const lines = [
    ['BARA AYA ALLAMA ROAD RUN', 'title'],
    ['Maskan Chowrangi → Gulshan Bridge', 'sub'],
    ['', ''],
    ['- RUN STATS -', 'head'],
    ['Time taken: ' + secs + 's', ''],
    ['Rupees picked up: ' + rupeesCollected, ''],
    ['Chai paani to police: ' + policeTollDone + ' Rs', ''],
    ['Rupees left in pocket: ' + rupees, ''],
    ['', ''],
    ['- MADE BY ABU MUSA -', 'head'],
    ['on Claude Code', ''],
    ['when he was testing what it could do', ''],
    ['', ''],
    ['"I can add random things', 'it'],
    ['if you tell me on WhatsApp"', 'it'],
    ['', ''],
    ['Shukriya for playing', 'head'],
  ];
  const total = lines.length * 34;
  const yStart = H - ((creditsT * 0.42) % (total + H + 80));   // slow, looping roll
  ctx.textAlign = 'center';
  for (let i = 0; i < lines.length; i++) {
    const ly = yStart + i * 34;
    if (ly < -20 || ly > H) continue;
    const st = lines[i][1];
    if (st === 'title') { ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#ffd32a'; }
    else if (st === 'head') { ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#7fe3a8'; }
    else if (st === 'sub') { ctx.font = '16px monospace'; ctx.fillStyle = '#aab4d4'; }
    else if (st === 'it') { ctx.font = 'italic 16px monospace'; ctx.fillStyle = '#d9c8f2'; }
    else { ctx.font = '17px monospace'; ctx.fillStyle = '#e8ecf4'; }
    ctx.fillText(lines[i][0], W / 2, ly);
  }
  ctx.textAlign = 'left';
  // --- near apartment blocks IN FRONT of the text (text emerges from behind their roofs) ---
  for (let bi = 0; bi < 11; bi++) {
    const bw = 64 + (bi * 53) % 56, bh = 70 + (bi * 97) % 64;
    let bx = ((bi * 210) - (scroll * 0.35)) % (W + 250); if (bx < -180) bx += W + 250;
    if (bx > W + 20) continue;
    ctx.fillStyle = '#161a32'; ctx.fillRect(bx, SY - bh, bw, bh + (H - SY));
    ctx.fillStyle = '#0f1226'; ctx.fillRect(bx, SY - bh, bw, 4);               // roof line
    for (let r = 0; r < bh / 15 - 1; r++) for (let col = 0; col < bw / 13 - 1; col++) {
      ctx.fillStyle = (((col * 11 + r * 7 + bi * 31) % 5) < 2) ? '#ffd98a' : '#0d1024';
      ctx.fillRect(bx + 6 + col * 13, SY - bh + 9 + r * 15, 7, 8);
    }
  }
  // wide road (foreground)
  ctx.fillStyle = '#1b1e30'; ctx.fillRect(0, RD, W, H - RD);
  ctx.fillStyle = '#2a2e44'; ctx.fillRect(0, RD, W, 4);
  ctx.fillStyle = '#3a3f5c'; ctx.fillRect(0, (RD + H) / 2 - 1, W, 2);
  ctx.fillStyle = '#d9d090';
  for (let dx2 = -(scroll % 110); dx2 < W; dx2 += 110) { ctx.fillRect(dx2, RD + 26, 44, 4); ctx.fillRect(dx2 + 55, H - 22, 44, 4); }
  for (let lx = -(scroll % 300); lx < W + 80; lx += 300) {     // street lights w/ cones
    ctx.fillStyle = '#3a4061'; ctx.fillRect(lx, RD - 86, 5, 86); ctx.fillRect(lx, RD - 86, 30, 4);
    ctx.fillStyle = '#fff0c4'; ctx.fillRect(lx + 25, RD - 84, 9, 6);
    const grd = ctx.createLinearGradient(lx + 29, RD - 80, lx + 29, H);
    grd.addColorStop(0, 'rgba(255,220,150,0.20)'); grd.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(lx + 25, RD - 78); ctx.lineTo(lx + 34, RD - 78); ctx.lineTo(lx + 60, H); ctx.lineTo(lx - 2, H); ctx.closePath(); ctx.fill();
  }
  const period = W + 900;                                       // SHAHRAH-E-FAISAL oncoming board
  const gb = W + 120 - ((creditsT * 2.0) % period);
  if (gb > -240 && gb < W + 40) {
    ctx.fillStyle = '#34507a'; ctx.fillRect(gb + 36, RD - 56, 6, 56); ctx.fillRect(gb + 198, RD - 56, 6, 56);
    ctx.fillStyle = '#0b6e3a'; ctx.fillRect(gb + 14, RD - 62, 212, 26);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(gb + 14, RD - 62, 212, 26);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillText('SHAHRAH-E-FAISAL', gb + 120, RD - 44); ctx.textAlign = 'left';
  }
  // our bike — fixed position, gentle bob
  const bob = Math.sin(creditsT / 11) * 1.2;
  drawWaitingBike(W * 0.32, H - 14, true, Math.floor(creditsT / 7) % 3 === 0, bob);
  if (Math.floor(t / 600) % 2 === 0) {
    ctx.textAlign = 'center'; ctx.font = 'bold 15px monospace'; ctx.fillStyle = '#ffd32a';
    ctx.fillText('press R  /  tap to restart', W / 2, H - 6);
    ctx.textAlign = 'left';
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(10,8,14,.78)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 46px monospace'; ctx.fillStyle = '#e74c3c';
  ctx.fillText('GAME OVER', W / 2, 210);
  ctx.font = '20px monospace'; ctx.fillStyle = '#ecf0f1';
  ctx.fillText('Gulshan bridge to door tha...', W / 2, 258);
  ctx.fillText('Rupees collected: ' + rupees, W / 2, 290);
  ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#ffd32a';
  ctx.fillText('PRESS R TO TRY AGAIN', W / 2, 348);
  // easy mode toggle
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = easyMode ? '#2ecc71' : '#7f8c8d';
  ctx.fillText((easyMode ? '[✓] EASY MODE  ON' : '[ ] EASY MODE  OFF') + '  — can\'t die  (press E)', W / 2, 383);
  // music toggle
  ctx.fillStyle = musicOn ? '#3498db' : '#7f8c8d';
  ctx.fillText((musicOn ? '[♪] MUSIC  ON' : '[✕] MUSIC  OFF') + '  (press M)', W / 2, 403);
  ctx.textAlign = 'left';
}
function drawWin() {
  ctx.fillStyle = 'rgba(10,30,16,.8)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px monospace'; ctx.fillStyle = '#2ecc71';
  ctx.fillText('GULSHAN BRIDGE PAHUNCH GAYE!', W / 2, 200);
  const el = ((tEnd - tStart) / 1000).toFixed(1);
  ctx.font = '22px monospace'; ctx.fillStyle = '#ecf0f1';
  ctx.fillText('Time: ' + el + 's     Rupees: ' + rupees, W / 2, 255);
  ctx.font = '17px monospace'; ctx.fillStyle = '#bdc3c7';
  ctx.fillText('Maskan se Gulshan — traffic, khuddai aur load shedding ke bawajood.', W / 2, 300);
  ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#ffd32a';
  ctx.fillText('PRESS ENTER TO RUN AGAIN', W / 2, 370);
  ctx.textAlign = 'left';
}

// ---------- touch controls (mobile) ----------
function bindTouchBtn(id, code) {
  const el = document.getElementById(id);
  if (!el) return;
  const press = e => {
    e.preventDefault(); initAudio();
    keys[code] = true;
    if (code === 'ArrowLeft') recordCheat('L');
    if (code === 'ArrowRight') recordCheat('R');
    if (code === 'Space' && (state === 'title' || state === 'gameover' || state === 'win')) startGame();
    if (code === 'Space' && state === 'credits') { state = 'title'; titleStart = performance.now(); }
  };
  const release = e => { e.preventDefault(); keys[code] = false; };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
bindTouchBtn('btnL', 'ArrowLeft');
bindTouchBtn('btnR', 'ArrowRight');
bindTouchBtn('btnJ', 'Space');
// tap anywhere on the canvas to start / restart on touch devices
cv.addEventListener('pointerdown', e => {
  initAudio();
  const rect = cv.getBoundingClientRect();
  const cy2 = (e.clientY - rect.top) / rect.height * cv.height;
  if (state === 'title') {
    if (cy2 > 262 && cy2 < 285) { easyMode = !easyMode; return; }          // easy mode row
    if (cy2 > 280 && cy2 < 303) { musicOn = !musicOn; updateMusicTracks(); return; } // music row
    startGame();
  } else if (state === 'gameover') {
    if (cy2 > 371 && cy2 < 394) { easyMode = !easyMode; return; }           // easy mode row
    if (cy2 > 391 && cy2 < 414) { musicOn = !musicOn; updateMusicTracks(); return; } // music row
    startGame();
  } else if (state === 'win') startGame();
  else if (state === 'credits') { state = 'title'; titleStart = performance.now(); }
});

// ---------- main loop (fixed timestep) ----------
let last = 0, acc = 0, refitTick = 0;
function loop(t) {
  if (!last) last = t;
  acc += Math.min(t - last, 100); last = t;
  // self-healing viewport: re-check the real display size ~4x/sec so the canvas
  // can never stay stuck at a wrong size after a flaky mobile resize event.
  if (++refitTick % 15 === 0) fitCanvas();
  updateMusicTracks();
  while (acc >= 16.666) { step(); acc -= 16.666; }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
