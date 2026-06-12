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

// size the internal resolution to the screen so the game fills any device
function fitCanvas() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const MIN_AR = 1.2, MAX_AR = 2.4;            // sane gameplay range
  const ar = vw / vh;
  const clamped = Math.min(MAX_AR, Math.max(MIN_AR, ar));
  W = Math.round(H * clamped);
  cv.width = W; cv.height = H;
  if (ar >= MIN_AR && ar <= MAX_AR) {           // fill the screen exactly
    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  } else if (ar > MAX_AR) {                     // ultra-wide: pillarbox
    cv.style.height = vh + 'px'; cv.style.width = Math.round(vh * clamped) + 'px';
  } else {                                      // portrait: letterbox
    cv.style.width = vw + 'px'; cv.style.height = Math.round(vw / clamped) + 'px';
  }
  ctx.imageSmoothingEnabled = false;            // canvas resize resets ctx state
}
addEventListener('resize', fitCanvas);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 250));
addEventListener('pageshow', fitCanvas);                       // iOS back/forward cache
addEventListener('load', () => setTimeout(fitCanvas, 300));    // iOS late viewport settle
if (window.visualViewport) visualViewport.addEventListener('resize', fitCanvas);
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
loadSprite('bike', 'assets/cd70.png', { knockoutWhite: true, flip: true });

// ---------- world constants ----------
const GROUND_Y = 470;          // top of footpath where player stands
const LEN = 13200;             // world length in px
const RAMP_X0 = 11600, RAMP_X1 = 12500, BRIDGE_Y = 330;
const FINISH_X = 12830;
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
  if (e.code === 'KeyP' && state === 'play') paused = !paused;
  if (e.code === 'KeyM') musicOn = !musicOn;
  if (!e.repeat && (e.code === 'ArrowLeft' || e.code === 'KeyA')) recordCheat('L');
  if (!e.repeat && (e.code === 'ArrowRight' || e.code === 'KeyD')) recordCheat('R');
});
addEventListener('keyup', e => keys[e.code] = false);

// ---------- audio (tiny webaudio beeps) ----------
let AC = null;
function initAudio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); }
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
};

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
    if (state === 'play' && musicOn && !paused) {
      const L = LEAD[mStep % LEAD.length];
      if (L) noteAt(L, mNext, MSTEP * 0.85, 'square', musicGain, 0.9);
      const B = BASS[mStep % BASS.length];
      if (B) noteAt(B, mNext, MSTEP * 0.95, 'triangle', musicGain, 1.5);
    }
    mStep++; mNext += MSTEP;
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
  addBldg(1340, 130, 180, 'PAN SHOP', '#27ae60', '#1e8449', { awning: '#f39c12' });
  addBldg(1480, 170, 220, 'MEEZAN BANK', '#ecf0f1', '#bdc3c7', { signText: '#6c3483' });
  addBldg(1680, 200, 240, 'MASKAN VENUE', '#fde3a7', '#f5b041');
  decors.push({ kind: 'kepole', x: 1640, spark: false });
  addBldg(1910, 140, 170, 'PHOTOSTAT', '#a29bfe', '#6c5ce7', { awning: '#3498db' });
  addBldg(2070, 160, 200, 'MADINA STORE', '#55efc4', '#00b894', { awning: '#e67e22' });
  addBldg(2250, 150, 190, 'JAFFERY OPTICAL', '#dff9fb', '#c7ecee', { signText: '#130f40', awning: '#2c3e50' });
  decors.push({ kind: 'kepole', x: 2430, spark: true });
  wires.push({ x: 2400, y: GROUND_Y - 118, w: 70, h: 26 });
  addBldg(2480, 170, 210, 'MOBILE MALL', '#ff7979', '#eb4d4b', { awning: '#f9ca24' });
  addBldg(2670, 140, 180, 'PHARMACY', '#b8e994', '#78e08f', { signText: '#0a7d35' });
  // Regency Apartments + Coffee Wagera (tall landmark)
  addBldg(2860, 260, 330, 'REGENCY APARTMENTS', '#fad390', '#f8c291', { floors: 6 });
  addBldg(2880, 120, 110, 'COFFEE WAGERA', '#4a2c11', '#2d1a08', { sign: '#f7d794', signText: '#3d2208', awning: '#c0894f' });
  solids.push({ x: 3180, y: GROUND_Y - 42, w: 120, h: 42, kind: 'mehran' });    // parked Mehran = platform
  coinArc(3140, GROUND_Y - 60, 6);
  addBldg(3340, 180, 220, 'HBL', '#dcdde1', '#aab0b6', { signText: '#0b6e4f' });
  addBldg(3540, 150, 190, 'AATA CHAKKI', '#e8d6b3', '#cbb88a', { awning: '#9b59b6' });
  trenches.push({ x: 3740, w: 90 });   // first open manhole!
  decors.push({ kind: 'manholesign', x: 3700 });
  addBldg(3860, 130, 170, 'JUICE CORNER', '#fdcb6e', '#e1a32a', { awning: '#16a085' });
  powerups.push({ x: 3100, y: GROUND_Y - 150, kind: 'chai', taken: false });
  coinRow(2880, GROUND_Y - 140, 5);
  banners.push({ x: 1800, text: 'GRAND SALE — 50% OFF' });

  // --- Zone C: Food Street (Block 4) ---
  banners.push({ x: 4100, text: 'GULSHAN FOOD STREET' });
  addBldg(4080, 200, 230, 'ALFAREED PAKWAN', '#e17055', '#c44d33', { awning: '#27ae60' });
  decors.push({ kind: 'cart', x: 4330, label: 'GOL GAPPA' });
  addBldg(4450, 190, 210, 'MANPASAND FOOD VALLEY', '#fab1a0', '#e58e7e', { awning: '#d63031' });
  decors.push({ kind: 'cart', x: 4690, label: 'JUICE' });
  addBldg(4790, 170, 200, 'BISMILLAH HOTEL', '#ffeaa7', '#fdcb6e', { awning: '#2d3436' });
  decors.push({ kind: 'dhaba', x: 5010 });
  addBldg(5150, 160, 190, 'CHIPY EATS', '#fd79a8', '#e84393', { awning: '#fdcb6e' });
  solids.push({ x: 5380, y: GROUND_Y - 50, w: 150, h: 50, kind: 'suzuki' });   // fruit pickup = platform
  coinArc(5340, GROUND_Y - 70, 6);
  addBldg(5590, 170, 210, 'BBQ CORNER', '#d63031', '#a82324', { awning: '#f39c12' });
  addBldg(5780, 160, 190, 'UNITED BAKERY', '#81ecec', '#00cec9', { awning: '#e84393' });
  trenches.push({ x: 6000, w: 100 });  // dug-up gas line
  decors.push({ kind: 'cones', x: 5950 });
  addBldg(6160, 180, 220, 'KARACHI BROAST', '#f8a5c2', '#f78fb3', { awning: '#218c5c' });
  addBldg(6360, 150, 180, 'PAAN & COLD CORNER', '#6ab04c', '#4a8b34', { awning: '#e74c3c' });
  coinRow(4470, GROUND_Y - 140, 5);
  coinRow(5600, GROUND_Y - 140, 4);
  powerups.push({ x: 5050, y: GROUND_Y - 60, kind: 'bunkabab', taken: false });

  // --- Zone D: Block 2 — Disco Bakery ---
  addBldg(6700, 160, 200, 'CLINIC LAB', '#dfe6e9', '#b2bec3', { signText: '#c0392b' });
  // Disco Bakery — the icon
  addBldg(6900, 280, 280, 'DISCO BAKERY', '#ffd32a', '#e8b50e', { sign: '#1e272e', signText: '#ffd32a', awning: '#1e272e' });
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
  trenches.push({ x: 9030, w: 110 });
  decors.push({ kind: 'cones', x: 8990 });
  solids.push({ x: 9200, y: GROUND_Y - 40, w: 70, h: 40, kind: 'barrier' });
  decors.push({ kind: 'sand', x: 9320 });
  solids.push({ x: 9330, y: GROUND_Y - 34, w: 110, h: 34, kind: 'sandpile' });
  trenches.push({ x: 9500, w: 130 });
  decors.push({ kind: 'rebar', x: 9660 });
  wires.push({ x: 9700, y: GROUND_Y - 60, w: 60, h: 60 });   // rebar zap zone (low!)
  solids.push({ x: 9820, y: GROUND_Y - 64, w: 180, h: 64, kind: 'container' });
  coinRow(9840, GROUND_Y - 120, 5);
  trenches.push({ x: 10060, w: 150 });
  decors.push({ kind: 'mixer', x: 10260 });
  solids.push({ x: 10400, y: GROUND_Y - 40, w: 70, h: 40, kind: 'barrier' });
  decors.push({ kind: 'crane', x: 10550 });
  addBldg(10560, 300, 300, 'GULSHAN HEIGHTS MALL', '#95a5a6', '#7f8c8d', { sign: '#f39c12', signText: '#1e272e' });
  decors.push({ kind: 'scaffold', x: 10580 });
  trenches.push({ x: 10920, w: 120 });
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
  decors.push({ kind: 'ferris', x: 12900 });   // Aladin Park in the distance
  decors.push({ kind: 'police', x: 12560 });    // police checkpoint at the bridge
  coinRow(11750, groundYAt(11850) - 80, 5, 40);
  coinRow(12100, groundYAt(12200) - 80, 5, 40);
  coinRow(12340, BRIDGE_Y - 70, 5, 40);
  decors.push({ kind: 'finish', x: FINISH_X });

  // streetlights along the whole road
  for (let x = 500; x < LEN - 300; x += 420) decors.push({ kind: 'lamp', x });
}
buildLevel();

// ---------- dynamic state ----------
let state = 'title';   // title | play | gameover | win
let paused = false;
let player, cam, vehicles, spawnT, rupees, hearts, tStart, tEnd, iframes, boostT, starT, shedT, toast, deathX;
let iceCount = 0, lastIceX = -99999;
let godMode = false, cheatSeq = [];   // L L L R R R = unlimited health, this run only

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
  shedT = 0;
  toast = { text: 'MASKAN CHOWRANGI', t: 150 };
  iceCount = 0; lastIceX = -99999;
  godMode = false; cheatSeq = [];     // cheat lasts one run only
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
const ZONE_RATE = [150, 95, 110, 100, 170, 130];

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
  let cp = CHECKPOINTS[0];
  for (const c of CHECKPOINTS) if (c < player.x - 20) cp = c;
  if (!godMode) hearts--;
  sfx.fall();
  if (hearts <= 0) { state = 'gameover'; tEnd = performance.now(); return; }
  player.x = cp; player.y = groundYAt(cp) - player.h; player.vx = 0; player.vy = 0;
  iframes = 100;
}

// ---------- update ----------
function step() {
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
    if (player.y + player.h >= gy) { player.y = gy - player.h; player.vy = 0; player.onGround = true; }
  }
  if (player.y > H + 60) { respawn(); return; }

  // vehicles
  spawnT--;
  if (spawnT <= 0) { spawnVehicle(); spawnT = ZONE_RATE[zoneAt(player.x)] * (0.7 + Math.random() * 0.6); }
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    v.x += v.vx;
    v.y = groundYAt(v.x + v.w / 2) - v.h;
    if (v.x + v.w < cam.x - 200) { vehicles.splice(i, 1); continue; }
    if (!v.honked && Math.abs(v.x - player.x) < 320 && Math.random() < 0.01) { v.honked = true; if (Math.abs(v.x-player.x)<340) sfx.horn(); }
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
      c.taken = true; rupees++; sfx.coin();
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

  // load shedding cycle: 30s period — dark from 24s to 30s
  shedT = (shedT + 1) % 1800;
  if (shedT === 1320) toast = { text: 'LOAD SHEDDING AANE WALI HAI...', t: 110 };

  // zone toast
  const z = zoneAt(player.x), zPrev = zoneAt(player.x - player.vx);
  if (z !== zPrev && player.vx > 0) toast = { text: ZONES[z].name.toUpperCase(), t: 140 };
  if (toast.t > 0) toast.t--;

  // camera
  cam.x = Math.max(0, Math.min(LEN - W, player.x - 330));

  player.anim += Math.abs(player.vx) * 0.08;

  // win!
  if (player.x >= FINISH_X) { state = 'win'; tEnd = performance.now(); sfx.win(); }
}

// ============================================================
// RENDERING
// ============================================================
const isDark = () => state === 'play' && shedT >= 1440;        // lights out
const isFlicker = () => state === 'play' && shedT >= 1320 && shedT < 1440 && (shedT % 14 < 5);

function px(x) { return Math.round(x - cam.x); }

function draw() {
  // sky
  const dark = isDark() || isFlicker();
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  if (dark) { skyGrad.addColorStop(0, '#0d1030'); skyGrad.addColorStop(1, '#2a2547'); }
  else { skyGrad.addColorStop(0, '#6fb7e8'); skyGrad.addColorStop(1, '#cfe8d9'); }
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);

  if (state === 'title') { drawTitle(); return; }

  drawSkyline(dark);
  drawRoadAndGround(dark);
  for (const b of buildings) if (b.x + b.w > cam.x - 20 && b.x < cam.x + W + 20) drawBuilding(b, dark);
  for (const d of decors) if (d.x > cam.x - 400 && d.x < cam.x + W + 400) drawDecor(d, dark);
  for (const ban of banners) if (ban.x > cam.x - 500 && ban.x < cam.x + W + 100) drawBanner(ban);
  for (const p of platforms) if (p.x + p.w > cam.x && p.x < cam.x + W) drawPlatform(p);
  for (const s of solids) if (s.x + s.w > cam.x && s.x < cam.x + W) drawSolid(s);
  drawTrenchesAndWires();
  for (const c of coinsAll) if (!c.taken && c.x > cam.x - 20 && c.x < cam.x + W + 20) drawCoin(c);
  for (const p of powerups) if (!p.taken && p.x > cam.x - 30 && p.x < cam.x + W + 30) drawPowerup(p);
  for (const v of vehicles) if (v.x + v.w > cam.x && v.x < cam.x + W) drawVehicle(v);
  drawPlayer();

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

function drawRoadAndGround(dark) {
  // footpath strip + road below, following ramp profile
  for (let sx = 0; sx <= W; sx += 4) {
    const wx = cam.x + sx;
    const gy = groundYAt(wx);
    ctx.fillStyle = dark ? '#3a3a46' : '#b9b1a3';            // footpath tiles
    ctx.fillRect(sx, gy, 4, 16);
    ctx.fillStyle = dark ? '#26262e' : '#555259';            // road asphalt
    ctx.fillRect(sx, gy + 16, 4, H - gy - 16);
    if (wx % 80 < 40) { ctx.fillStyle = dark ? '#4a4a3a' : '#d9d090'; ctx.fillRect(sx, gy + 44, 4, 5); } // lane dashes
  }
  // trench holes (cut into ground)
  for (const t of trenches) {
    if (t.x + t.w < cam.x || t.x > cam.x + W) continue;
    ctx.fillStyle = '#14100c';
    ctx.fillRect(px(t.x), GROUND_Y, t.w, H - GROUND_Y);
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(px(t.x) - 5, GROUND_Y - 3, 5, 8); ctx.fillRect(px(t.x + t.w), GROUND_Y - 3, 5, 8);
  }
  // bridge railing on ramp
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
  if (v.kind === 'rickshaw' && sprites.rickshaw) {
    // real photo sprite — scale by opaque content, land its wheels on the road
    const spr = sprites.rickshaw, c = spr.content || { x: 0, y: 0, w: spr.width, h: spr.height };
    const s = Math.min((v.w + 16) / c.w, (v.h + 8) / c.h);
    const dw = spr.width * s, dh = spr.height * s;
    const dx = x + v.w / 2 - (c.x + c.w / 2) * s;          // centre content over the box
    const dy = y + v.h - (c.y + c.h) * s + 1;             // content bottom on the ground line
    ctx.drawImage(spr, dx, dy, dw, dh);
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
    // rider seated over the bike (faces left)
    const seatX = x + v.w / 2 + 4, seatY = y + v.h - dh * 0.42;
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(seatX - 5, seatY, 13, 13);          // torso
    ctx.fillStyle = '#24527a'; ctx.fillRect(seatX - 9, seatY + 2, 6, 4);        // forward arm to bars
    ctx.fillStyle = '#3a2f26'; ctx.fillRect(seatX + 5, seatY + 11, 5, 8);       // thigh
    ctx.fillStyle = '#c8a06f'; ctx.fillRect(seatX - 4, seatY - 9, 9, 9);        // head
    ctx.fillStyle = '#b22222'; ctx.fillRect(seatX - 5, seatY - 12, 11, 5);      // helmet
    ctx.fillStyle = '#7a1818'; ctx.fillRect(seatX - 8, seatY - 10, 3, 3);       // helmet front (left)
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
}

function drawPlayer() {
  if (state === 'gameover') return;
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
  ctx.fillStyle = skinD; ctx.fillRect(c + 1, 12 + hy, 4, 1);           // mouth

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
  } else if (d.kind === 'lamp') {
    ctx.fillStyle = '#444c55'; ctx.fillRect(x, GROUND_Y - 130, 6, 130);
    ctx.fillRect(x, GROUND_Y - 130, 26, 5);
    ctx.fillStyle = (isDark() || isFlicker()) ? '#333' : '#ffe9a8';
    ctx.fillRect(x + 22, GROUND_Y - 128, 10, 8);
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
  const g = ctx.createRadialGradient(pxx, pyy, 60, pxx, pyy, 260);
  g.addColorStop(0, 'rgba(5,5,20,0)');
  g.addColorStop(1, 'rgba(5,5,20,0.88)');
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
  ctx.fillText(el.toFixed(1) + 's', W - 110, 29);
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

function drawTitle() {
  // mini scene
  drawSkylineTitle();
  ctx.fillStyle = '#1e272e'; ctx.textAlign = 'center';
  ctx.font = 'bold 52px monospace';
  ctx.fillStyle = '#c0392b';
  ctx.fillText('USMANI ROAD RUN', W / 2 + 3, 173);
  ctx.fillStyle = '#ffd32a';
  ctx.fillText('USMANI ROAD RUN', W / 2, 170);
  ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#2c3e50';
  ctx.fillText('Maskan Chowrangi  →  Gulshan Bridge', W / 2, 215);
  ctx.font = '16px monospace'; ctx.fillStyle = '#34495e';
  ctx.fillText('Dodge the rickshaws. Mind the manholes. Survive the load shedding.', W / 2, 255);
  ctx.font = 'bold 17px monospace'; ctx.fillStyle = '#1e272e';
  ctx.fillText('← →  move      SPACE / ↑  jump      P  pause      M  music', W / 2, 320);
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.font = 'bold 26px monospace'; ctx.fillStyle = '#c0392b';
    ctx.fillText('PRESS ENTER TO START', W / 2, 400);
  }
  ctx.font = '13px monospace'; ctx.fillStyle = '#7f8c8d';
  ctx.fillText('Allama Shabbir Ahmed Usmani Road · Gulshan-e-Iqbal · Karachi', W / 2, 480);
  ctx.textAlign = 'left';
}
function drawSkylineTitle() {
  ctx.fillStyle = '#a8c8b8';
  for (let i = 0; i < Math.ceil(W / 115) + 1; i++) {
    const hh = 60 + ((i * 67) % 80);
    ctx.fillRect(i * 115, H - 120 - hh, 90, hh + 120);
  }
  ctx.fillStyle = '#555259'; ctx.fillRect(0, H - 60, W, 60);
  ctx.fillStyle = '#d9d090';
  for (let i = 0; i < W; i += 80) ctx.fillRect(i, H - 32, 40, 5);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(10,8,14,.78)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 46px monospace'; ctx.fillStyle = '#e74c3c';
  ctx.fillText('GAME OVER', W / 2, 220);
  ctx.font = '20px monospace'; ctx.fillStyle = '#ecf0f1';
  ctx.fillText('Gulshan bridge to door tha...', W / 2, 270);
  ctx.fillText('Rupees collected: ' + rupees, W / 2, 305);
  ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#ffd32a';
  ctx.fillText('PRESS R TO TRY AGAIN', W / 2, 370);
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
  if (state === 'title' || state === 'gameover' || state === 'win') startGame();
});

// ---------- main loop (fixed timestep) ----------
let last = 0, acc = 0;
function loop(t) {
  if (!last) last = t;
  acc += Math.min(t - last, 100); last = t;
  while (acc >= 16.666) { step(); acc -= 16.666; }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
