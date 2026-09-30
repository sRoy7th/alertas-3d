import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ============================================================
// Configuración (StreamElements la sobreescribe en onWidgetLoad)
// ============================================================
const CFG = {
  models: './models/',
  volume: 0.6,
  currency: '$',
  holdMs: 5000,
  // Estilo de la etiqueta sobre el nombre: 'tema' (por objeto), 'liston' o 'editorial'
  look: new URLSearchParams(location.search).get('look') || 'tema',
};
const TEST = new URLSearchParams(location.search).has('test');

// ============================================================
// Escenario 1920x1080 escalado a la ventana
// ============================================================
const stage = document.getElementById('stage');
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit);
fit();

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), alpha: true, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(1920, 1080, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 1920 / 1080, 0.1, 100);
const CAM_BASE = new THREE.Vector3(0, 0, 10);
camera.position.copy(CAM_BASE);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x201830, 0.6));
const key = new THREE.DirectionalLight(0xffe2b0, 2.2);
key.position.set(3, 5, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fb8ff, 1.6);
rim.position.set(-4, 2, -5);
scene.add(rim);

// Centro visual de los modelos (a 201.5 px por unidad; el texto va debajo)
const ANCHOR = new THREE.Vector3(0, 0.75, 0);

// ============================================================
// Utilidades de animación
// ============================================================
// Reloj propio: en vivo avanza con requestAnimationFrame; en modo ?step se avanza a mano
// (window.__advance) para capturar fotogramas exactos.
let NOW = 0;
const timers = [];
const tickers = new Set();
const wait = (ms) => new Promise((r) => timers.push({ at: NOW + ms, r }));
function tween(ms, fn) {
  return new Promise((resolve) => {
    const start = NOW;
    const tk = (now) => {
      const t = Math.min(1, (now - start) / ms);
      fn(t);
      if (t >= 1) { tickers.delete(tk); resolve(); }
    };
    tickers.add(tk);
    fn(0);
  });
}
const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t ** 3,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

// ============================================================
// Texturas procedurales
// ============================================================
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX_GLOW = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.2, 'rgba(255,255,255,.8)');
  r.addColorStop(0.5, 'rgba(255,255,255,.22)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const TEX_SMOKE = canvasTex(128, 128, (g, w) => {
  for (let i = 0; i < 26; i++) {
    const x = w / 2 + rand(-28, 28), y = w / 2 + rand(-28, 28), rr = rand(14, 34);
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(255,255,255,.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  }
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  m.addColorStop(0.5, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, w, w);
});
const TEX_RAY = canvasTex(64, 256, (g, w, h) => {
  const v = g.createLinearGradient(0, h, 0, 0);
  v.addColorStop(0, 'rgba(255,255,255,0)');
  v.addColorStop(0.18, 'rgba(255,255,255,1)');
  v.addColorStop(0.5, 'rgba(255,255,255,.45)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const x = g.createLinearGradient(0, 0, w, 0);
  x.addColorStop(0, 'rgba(0,0,0,0)');
  x.addColorStop(0.35, 'rgba(0,0,0,.35)');
  x.addColorStop(0.5, 'rgba(0,0,0,1)');
  x.addColorStop(0.65, 'rgba(0,0,0,.35)');
  x.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = x; g.fillRect(0, 0, w, h);
});
const TEX_RING = canvasTex(256, 256, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0.62, 'rgba(255,255,255,0)');
  r.addColorStop(0.86, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const TEX_COIN = canvasTex(256, 256, (g, w) => {
  const c = w / 2;
  const base = g.createRadialGradient(c * 0.7, c * 0.6, 10, c, c, c);
  base.addColorStop(0, '#fff2b0');
  base.addColorStop(0.55, '#f2bd3c');
  base.addColorStop(1, '#a8680f');
  g.fillStyle = base; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#8a5208'; g.lineWidth = 10;
  g.beginPath(); g.arc(c, c, c * 0.8, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#8a5208';
  g.font = `900 ${w * 0.5}px "Yu Gothic","MS Gothic",serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('両', c, c + 6);
});

// ============================================================
// Partículas (pool de sprites)
// ============================================================
const _c = new THREE.Color();
function sampleColors(stops, k, out) {
  const f = k * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f));
  return out.copy(stops[i]).lerp(stops[i + 1], f - i);
}
class Pool {
  constructor(n, blending) {
    this.items = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX_GLOW, blending, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      }));
      s.visible = false;
      scene.add(s);
      this.items.push({ s, alive: false, vel: new THREE.Vector3() });
    }
  }
  spawn(o) {
    const p = this.items.find((i) => !i.alive);
    if (!p) return;
    p.alive = true; p.age = 0; p.life = o.life;
    p.vel.copy(o.vel); p.grav = o.grav ?? 0; p.drag = o.drag ?? 0;
    p.size0 = o.size; p.size1 = o.size1 ?? o.size;
    p.colors = o.colors; p.alpha = o.alpha ?? 1; p.spin = o.spin ?? 0;
    p.s.position.copy(o.pos);
    p.s.material.map = o.map || TEX_GLOW;
    p.s.material.rotation = Math.random() * Math.PI * 2;
    p.s.renderOrder = o.order ?? 10;
    p.s.visible = true;
  }
  update(dt) {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.alive = false; p.s.visible = false; continue; }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(lerp(p.size0, p.size1, ease.outCubic(k)));
      p.s.material.rotation += p.spin * dt;
      p.s.material.color.copy(sampleColors(p.colors, k, _c));
      p.s.material.opacity = p.alpha * (k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.92);
    }
  }
}
const FX = new Pool(600, THREE.AdditiveBlending);
const SMOKE = new Pool(160, THREE.NormalBlending);

const C = (hex) => new THREE.Color(hex);
const GOLD = [C('#ffffff'), C('#ffe08a'), C('#f5a623'), C('#7a3b00')];
const FIRE = [C('#ffffff'), C('#fff1a8'), C('#ffb03a'), C('#ff5a14'), C('#6b1300')];

function sparkBurst(pos, n, { speed = 4, colors = GOLD, size = 0.12, life = 1.1, grav = 2.5 } = {}) {
  for (let i = 0; i < n; i++) {
    const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-0.4, 0.4)).normalize();
    FX.spawn({ pos, vel: dir.multiplyScalar(speed * rand(0.4, 1)), grav, drag: 1.4, life: life * rand(0.6, 1.2), size: size * rand(0.6, 1.4), size1: size * 0.3, colors });
  }
}

// ============================================================
// Rayos, halo, anillos de choque y sacudida de cámara
// ============================================================
const rays = new THREE.Group();
const rayMat = new THREE.MeshBasicMaterial({
  map: TEX_RAY, color: 0xffd36b, transparent: true, blending: THREE.AdditiveBlending,
  depthWrite: false, side: THREE.DoubleSide, toneMapped: false, opacity: 0.7,
});
const rayGeo = new THREE.PlaneGeometry(0.1, 1).translate(0, 0.5, 0);
for (let i = 0; i < 18; i++) {
  const m = new THREE.Mesh(rayGeo, rayMat);
  m.rotation.z = (i / 18) * Math.PI * 2 + rand(-0.06, 0.06);
  m.scale.set(i % 2 ? 0.6 : 1.3, i % 2 ? rand(0.55, 0.75) : rand(0.95, 1.2), 1);
  rays.add(m);
}
rays.position.copy(ANCHOR).setZ(-1.2);
rays.scale.setScalar(0.001);
rays.renderOrder = 1;
scene.add(rays);

const halo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: TEX_GLOW, color: 0xffc85a, blending: THREE.AdditiveBlending, transparent: true,
  depthWrite: false, toneMapped: false, opacity: 0,
}));
halo.position.copy(ANCHOR).setZ(-1);
halo.scale.setScalar(4.5);
halo.renderOrder = 2;
scene.add(halo);

const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: TEX_GLOW, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true,
  depthWrite: false, depthTest: false, toneMapped: false, opacity: 0,
}));
flashSprite.renderOrder = 50;
scene.add(flashSprite);
function flash(pos, size = 5, ms = 450, color = 0xffffff) {
  flashSprite.position.copy(pos);
  flashSprite.material.color.set(color);
  return tween(ms, (t) => {
    flashSprite.scale.setScalar(size * (0.4 + 0.6 * ease.outCubic(t)));
    flashSprite.material.opacity = 1 - t;
  });
}

const ringGeo = new THREE.PlaneGeometry(1, 1);
function shockwave(pos, size = 7, ms = 800, color = 0xffd36b) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    map: TEX_RING, color, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, toneMapped: false,
  }));
  m.position.copy(pos);
  m.renderOrder = 40;
  scene.add(m);
  return tween(ms, (t) => {
    m.scale.setScalar(0.2 + size * ease.outCubic(t));
    m.material.opacity = 1 - t;
  }).then(() => { scene.remove(m); m.material.dispose(); });
}

let shakeAmp = 0;
const shake = (a) => { shakeAmp = Math.max(shakeAmp, a); };

// ============================================================
// Audio sintetizado (no requiere archivos)
// ============================================================
let ac, master;
function audio() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  master.gain.value = CFG.volume;
  return ac;
}
function tone(freq, when, dur, { type = 'sine', gain = 0.2, to = null, attack = 0.005 } = {}) {
  const a = audio(), t0 = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
let noiseBuf;
function noise(when, dur, { type = 'bandpass', from = 800, to = 800, q = 1, gain = 0.3, attack = 0.01 } = {}) {
  const a = audio(), t0 = a.currentTime + when;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
  return g;
}
const sfx = {
  whoosh: (up = true) => noise(0, 0.6, { from: up ? 300 : 3000, to: up ? 3500 : 250, q: 1.2, gain: 0.35, attack: 0.25 }),
  shimmer(level = 1) {
    const notes = [659, 831, 988, 1319, 1661, 1976, 2637];
    const n = 3 + level;
    for (let i = 0; i < n; i++) {
      tone(notes[i % notes.length], i * 0.07, 1.4, { type: 'triangle', gain: 0.09 });
      tone(notes[i % notes.length] * 2.01, i * 0.07, 0.8, { gain: 0.03 });
    }
  },
  boom(big = 1) {
    tone(140, 0, 1.2 * big, { to: 32, gain: 0.7 });
    noise(0, 1.4 * big, { type: 'lowpass', from: 2400, to: 90, gain: 0.8 });
    noise(0, 0.25, { type: 'highpass', from: 3000, to: 1500, gain: 0.25 });
  },
  thunk() {
    tone(210, 0, 0.18, { to: 90, gain: 0.5 });
    noise(0, 0.08, { type: 'highpass', from: 4000, to: 2000, gain: 0.3 });
    tone(1850, 0.01, 0.5, { gain: 0.05 });
    tone(2790, 0.01, 0.4, { gain: 0.03 });
  },
  sizzle(ms) {
    const s = ms / 1000;
    for (let t = 0; t < s; t += 0.12) noise(t, rand(0.08, 0.2), { type: 'highpass', from: 5000, to: 7000, gain: 0.03 + 0.1 * (t / s) });
  },
  coin() {
    const f = rand(1900, 2600);
    tone(f, 0, 0.25, { gain: 0.08 });
    tone(f * 2.76, 0, 0.18, { gain: 0.035 });
    tone(f * 5.4, 0, 0.1, { gain: 0.02 });
  },
  land() {
    tone(160, 0, 0.25, { to: 70, gain: 0.45 });
    noise(0, 0.15, { type: 'lowpass', from: 900, to: 200, gain: 0.3 });
  },
};

// ============================================================
// Tarjeta de texto
// ============================================================
const card = document.getElementById('card');
const el = {
  kicker: card.querySelector('.kicker'), name: card.querySelector('.name'),
  amount: card.querySelector('.amount'), msg: card.querySelector('.msg'),
};
function showCard({ kicker, name, amount = '', msg = '', accent = '#f5c451', theme = 'puzzle' }) {
  card.style.setProperty('--accent', accent);
  card.dataset.look = CFG.look;
  card.dataset.theme = theme;
  el.kicker.textContent = '';
  const b = document.createElement('span'), t = document.createElement('span');
  b.className = 'b';
  t.className = 't';
  t.textContent = kicker;
  b.appendChild(t);
  el.kicker.appendChild(b);
  el.name.textContent = '';
  el.name.style.fontSize = `${Math.max(46, 86 - Math.max(0, name.length - 14) * 3.2)}px`;
  [...name].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.animationDelay = `${0.08 + i * 0.035}s`;
    el.name.appendChild(s);
  });
  el.amount.textContent = amount;
  el.msg.textContent = msg;
  card.className = '';
  void card.offsetWidth;
  card.className = 'show';
}
async function hideCard() {
  card.className = 'hide';
  await wait(420);
  card.className = '';
}
function bumpAmount(text) {
  el.amount.textContent = text;
  el.amount.classList.remove('bump');
  void el.amount.offsetWidth;
  el.amount.classList.add('bump');
}
const money = (v) => `${CFG.currency}${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ============================================================
// Modelos
// ============================================================
const loader = new GLTFLoader();
// rig (posición/escala animada) > idle (flotación) > modelo centrado
function makeRig(obj, fitSize, axis = 'y') {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = fitSize / size[axis];
  const wrap = new THREE.Group();
  obj.position.copy(center).multiplyScalar(-s);
  obj.scale.setScalar(s);
  wrap.add(obj);
  const idle = new THREE.Group();
  idle.add(wrap);
  const rig = new THREE.Group();
  rig.add(idle);
  rig.visible = false;
  rig.userData = { idle, wrap, model: obj, size: size.multiplyScalar(s) };
  scene.add(rig);
  return rig;
}
const M = {};
async function loadModels() {
  const [puzzle, kunai, wallet] = await Promise.all(
    ['puzzle.glb', 'kunai.glb', 'wallet.glb'].map((f) => loader.loadAsync(CFG.models + f)),
  );
  M.puzzle = makeRig(puzzle.scene, 2.3);
  // La boca de la rana mira hacia +X en el modelo: la giramos hacia la cámara
  wallet.scene.rotation.y = -Math.PI / 2;
  wallet.scene.updateMatrixWorld(true);
  M.wallet = makeRig(wallet.scene, 3.6, 'x');
  M.kunaiSrc = kunai.scene;
}

// Cada kunai es un clon con su propio material para el papel (se enciende solo)
// Dirección en pantalla hacia donde apunta la hoja (abajo a la izquierda)
const KUNAI_DIR = new THREE.Vector3(-0.55, -1, 0).normalize();
function makeKunai() {
  const obj = M.kunaiSrc.clone(true);
  const part = (name) => {
    let m = null;
    obj.traverse((o) => { if (o.isMesh && (o.parent?.name?.startsWith(name) || o.name.startsWith(name))) m = o; });
    return m;
  };
  const paper = part('Plane001'), blade = part('pCube1');
  if (paper) {
    paper.material = paper.material.clone();
    paper.material.emissive = new THREE.Color(0xff5a14);
    paper.material.emissiveIntensity = 0;
  }
  // Alinea el eje papel→hoja con KUNAI_DIR y gira sobre ese eje para que el papel mire a cámara
  if (paper && blade) {
    obj.updateMatrixWorld(true);
    const cp = new THREE.Box3().setFromObject(paper).getCenter(new THREE.Vector3());
    const cb = new THREE.Box3().setFromObject(blade).getCenter(new THREE.Vector3());
    const axis = cb.clone().sub(cp).normalize();
    const nAttr = paper.geometry.attributes.normal;
    const nrm = new THREE.Vector3();
    for (let i = 0; i < nAttr.count; i += 7) nrm.add(new THREE.Vector3().fromBufferAttribute(nAttr, i));
    nrm.transformDirection(paper.matrixWorld);
    const q = new THREE.Quaternion().setFromUnitVectors(axis, KUNAI_DIR);
    nrm.applyQuaternion(q).projectOnPlane(KUNAI_DIR).normalize();
    const want = new THREE.Vector3(0, 0, 1).projectOnPlane(KUNAI_DIR).normalize();
    const roll = nrm.dot(want) < -0.99
      ? new THREE.Quaternion().setFromAxisAngle(KUNAI_DIR, Math.PI)
      : new THREE.Quaternion().setFromUnitVectors(nrm, want);
    obj.quaternion.premultiply(q).premultiply(roll);
  }
  const rig = makeRig(obj, 2.9, 'y');
  rig.userData.paper = paper;
  return rig;
}

// ============================================================
// Emisores continuos mientras la alerta está en pantalla
// ============================================================
const emitters = new Set();

// ============================================================
// Alerta: Rompecabezas del Milenio (follow, bits, raid)
// ============================================================
async function puzzleAlert({ level = 1, color = '#ffd36b', kicker, name, amount = '', msg = '', hold = CFG.holdMs, raid = false }) {
  const P = M.puzzle, idle = P.userData.idle;
  const col = new THREE.Color(color);
  rayMat.color.copy(col);
  halo.material.color.copy(col);
  const colors = [C('#ffffff'), col.clone().lerp(C('#ffffff'), 0.4), col, col.clone().multiplyScalar(0.3)];

  P.visible = true;
  P.position.copy(ANCHOR);
  idle.position.set(0, 0, 0);
  idle.rotation.set(0, 0, 0);
  sfx.whoosh(true);
  await tween(950, (t) => {
    const e = ease.outCubic(t);
    P.scale.setScalar(ease.outBack(t));
    P.rotation.y = (1 - e) * -Math.PI * 4;
    P.position.y = ANCHOR.y - 1.4 * (1 - e);
  });

  const eye = ANCHOR.clone().setZ(0.6);
  flash(eye, 3 + level, 500, color);
  sparkBurst(eye, 30 + level * 30, { speed: 3 + level, colors });
  sfx.shimmer(level);
  if (raid) {
    sfx.boom(1.3);
    shake(0.35);
    shockwave(ANCHOR, 12, 1100, color);
    wait(250).then(() => shockwave(ANCHOR, 9, 1000, color));
  }
  showCard({ kicker, name, amount, msg, accent: color });

  const rayTarget = 1.6 + level * 0.55;
  tween(700, (t) => {
    rays.scale.setScalar(0.001 + rayTarget * ease.outBack(t));
    halo.material.opacity = 0.35 + 0.12 * level * t;
  });

  const bob = (now, dt) => {
    const s = now / 1000;
    idle.position.y = Math.sin(s * 2) * 0.07;
    idle.rotation.y = Math.sin(s * 1.1) * 0.4;
    rays.rotation.z -= dt * (0.25 + level * 0.08);
    const rate = 12 * level * dt;
    for (let i = 0; i < rate || Math.random() < rate; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0.6, 1.5);
      FX.spawn({
        pos: new THREE.Vector3(ANCHOR.x + Math.cos(a) * r, ANCHOR.y + Math.sin(a) * r, rand(-0.5, 0.8)),
        vel: new THREE.Vector3(0, rand(0.3, 0.9), 0), life: rand(1, 1.8), size: rand(0.05, 0.14), colors,
      });
    }
  };
  emitters.add(bob);
  let pulsing = raid;
  (async () => {
    while (pulsing) {
      await wait(1400);
      if (pulsing) { shockwave(ANCHOR, 8, 900, color); sfx.shimmer(1); }
    }
  })();

  await wait(hold);
  pulsing = false;
  emitters.delete(bob);
  hideCard();
  sfx.whoosh(false);
  const r0 = P.rotation.y;
  await tween(650, (t) => {
    const e = ease.inCubic(t);
    P.scale.setScalar(1 - e);
    P.rotation.y = r0 + e * Math.PI * 3;
    P.position.y = ANCHOR.y + e * 0.6;
    rays.scale.setScalar(0.001 + rayTarget * (1 - e));
    halo.material.opacity *= 0.9;
  });
  sparkBurst(ANCHOR, 25, { speed: 2.5, colors, size: 0.08 });
  halo.material.opacity = 0;
  P.visible = false;
}

// ============================================================
// Alerta: Kunai explosivo (subs y regalos)
// ============================================================
async function kunaiAlert({ count = 1, big = 1, kicker, name, msg = '', hold = CFG.holdMs, accent = '#ff7a1a' }) {
  const n = Math.min(count, 5);
  const spread = n === 1 ? [0] : Array.from({ length: n }, (_, i) => lerp(-2.6, 2.6, i / (n - 1)));
  const ks = spread.map((x, i) => {
    const k = makeKunai();
    k.userData.target = new THREE.Vector3(ANCHOR.x + x, ANCHOR.y + (n > 1 ? -Math.abs(x) * 0.12 : 0), 0);
    k.userData.delay = i * 140;
    return k;
  });

  // Entran volando desde arriba a la derecha, con la hoja por delante, y se clavan
  await Promise.all(ks.map(async (k) => {
    await wait(k.userData.delay);
    const tgt = k.userData.target, from = tgt.clone().add(new THREE.Vector3(6, 4, 2));
    k.visible = true;
    k.rotation.set(0, 0, -0.5);
    sfx.whoosh(true);
    await tween(420, (t) => {
      const e = ease.inCubic(t);
      k.position.lerpVectors(from, tgt, e);
      k.scale.setScalar(0.6 + 0.4 * e);
      k.userData.idle.rotation.y = (1 - e) * Math.PI * 6;
    });
    sfx.thunk();
    shake(0.08);
    sparkBurst(tgt.clone().add(new THREE.Vector3(-0.3, -0.9, 0.3)), 18, { speed: 3, size: 0.07, life: 0.5 });
    // vibración amortiguada al clavarse
    tween(700, (t) => { k.userData.idle.rotation.z = Math.sin(t * 40) * 0.12 * (1 - t); });
  }));

  showCard({ kicker, name, msg, accent, theme: 'kunai' });

  // Mecha: el papel se enciende, brilla y chispea cada vez más
  sfx.sizzle(hold);
  const start = NOW;
  const PAPER_HOT = C('#ffb070');
  for (const kn of ks) {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX_GLOW, color: 0xff7a20, blending: THREE.AdditiveBlending, transparent: true,
      depthWrite: false, depthTest: false, toneMapped: false, opacity: 0,
    }));
    g.renderOrder = 20;
    scene.add(g);
    kn.userData.glow = g;
  }
  const paperBox = new THREE.Box3();
  const fuse = (now) => {
    const k = Math.min(1, (now - start) / hold);
    const flick = 0.7 + Math.random() * 0.6;
    for (const kn of ks) {
      const p = kn.userData.paper;
      kn.userData.idle.position.set(rand(-1, 1) * 0.03 * k * k, rand(-1, 1) * 0.03 * k * k, 0);
      if (!p) continue;
      p.material.emissiveIntensity = k * 1.6 * flick;
      p.material.color.setRGB(1, 1, 1).lerp(PAPER_HOT, k);
      paperBox.setFromObject(p);
      const c = paperBox.getCenter(new THREE.Vector3());
      const g = kn.userData.glow;
      g.position.copy(c).setZ(c.z + 0.3);
      g.scale.setScalar((0.8 + 1.6 * k) * flick);
      g.material.opacity = 0.25 + 0.6 * k;
      const edge = () => new THREE.Vector3(rand(paperBox.min.x, paperBox.max.x), rand(paperBox.min.y, paperBox.max.y), paperBox.max.z + 0.1);
      const sparks = 1 + Math.floor(k * 5);
      for (let i = 0; i < sparks; i++) {
        FX.spawn({
          pos: edge(), vel: new THREE.Vector3(rand(-2.5, 2.5), rand(0.5, 3.5), rand(-0.5, 1)),
          grav: 6, drag: 0.5, life: rand(0.35, 0.7), size: rand(0.07, 0.15), size1: 0.02, colors: FIRE, order: 21,
        });
      }
      if (Math.random() < 0.2 + k * 0.4) {
        SMOKE.spawn({
          pos: edge(), vel: new THREE.Vector3(rand(-0.2, 0.2), rand(0.4, 0.9), 0), life: rand(1, 1.6),
          size: 0.25, size1: 0.9, map: TEX_SMOKE, colors: [C('#8a8a8a'), C('#3a3a3a')], alpha: 0.3,
        });
      }
    }
  };
  emitters.add(fuse);
  await wait(hold);
  emitters.delete(fuse);

  // ¡Boom! en cadena: explota el papel y el kunai sale disparado girando
  hideCard();
  for (const kn of ks) {
    const g = kn.userData.glow;
    const at = g.position.clone().setZ(0.4);
    scene.remove(g);
    g.material.dispose();
    explode(at, big * (n > 1 ? 0.8 : 1));
    if (kn.userData.paper) kn.userData.paper.visible = false;
    const from = kn.position.clone(), dir = new THREE.Vector3(rand(-1, 1), rand(-1.4, -0.6), 1.5);
    tween(700, (t) => {
      kn.position.copy(from).addScaledVector(dir, ease.outCubic(t) * 3);
      kn.rotation.z -= 0.35;
      kn.scale.setScalar(1 - t);
    }).then(() => scene.remove(kn));
    await wait(160);
  }
  await wait(1400);
}

const FIREBALL = [C('#fff4c0'), C('#ffc040'), C('#ff6a10'), C('#a01c00'), C('#2a0800')];
function explode(pos, big = 1) {
  sfx.boom(big);
  shake(0.3 * big);
  flash(pos, 3.5 * big, 220, 0xffe6b0);
  shockwave(pos, 3.6 * big, 450, 0xff9a40);
  for (let i = 0; i < 16 * big; i++) {
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-0.3, 0.5)).normalize();
    FX.spawn({
      pos: pos.clone().addScaledVector(dir, rand(0, 0.25)), vel: dir.multiplyScalar(rand(1, 3) * big),
      drag: 3, grav: -0.6, life: rand(0.45, 0.85), size: rand(0.35, 0.65) * big, size1: rand(1, 1.5) * big,
      colors: FIREBALL, alpha: 0.9, map: TEX_SMOKE, spin: rand(-2, 2), order: 12,
    });
  }
  for (let i = 0; i < 14 * big; i++) {
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-0.2, 0.3)).normalize();
    SMOKE.spawn({
      pos: pos.clone(), vel: dir.multiplyScalar(rand(0.6, 1.6) * big), drag: 1.4, grav: -0.35,
      life: rand(1.4, 2.3), size: rand(0.4, 0.7) * big, size1: rand(1.4, 2) * big, map: TEX_SMOKE,
      colors: [C('#4a3c34'), C('#2a2522'), C('#1a1a1a')], alpha: 0.5, spin: rand(-0.6, 0.6), order: 5,
    });
  }
  sparkBurst(pos, 50 * big, { speed: 7 * big, colors: FIRE, size: 0.08, life: 1.1, grav: 5 });
}

// ============================================================
// Alerta: Monedero de Gama-chan (donaciones)
// ============================================================
const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.035, 32);
const coinFace = new THREE.MeshStandardMaterial({ map: TEX_COIN, metalness: 0.85, roughness: 0.3 });
const coinSide = new THREE.MeshStandardMaterial({ color: 0xc8871f, metalness: 0.9, roughness: 0.35 });
const coinMats = [coinSide, coinFace, coinFace];

// Punto de la boca en el espacio local de la rana (sigue giro, escala y aplastado)
// (la boca del modelo mira hacia -X dentro de su grupo; FRONT la gira hacia la cámara)
const MOUTH_LOCAL = new THREE.Vector3(-0.95, 0.18, 0);
const FRONT = Math.PI / 2;

async function walletAlert({ name, amount, msg = '', hold = CFG.holdMs }) {
  const W = M.wallet, idle = W.userData.idle;
  const base = ANCHOR.clone().add(new THREE.Vector3(0, -0.2, 0));
  // pose: giro base; sway: cuánto se balancea/brinca sola (0 = quieta)
  const pose = { yaw: FRONT, pitch: -0.15, roll: 0, sway: 0 };
  const spring = { v: 0, x: 0 };
  let got = 0;
  W.visible = true;
  W.scale.setScalar(1);
  idle.position.set(0, 0, 0);
  const mouth = () => idle.localToWorld(MOUTH_LOCAL.clone());

  const coins = [];
  const g = 9;
  const phys = (now, dt) => {
    const s = now / 1000;
    spring.v += (-spring.x * 220 - spring.v * 12) * dt;
    spring.x += spring.v * dt;
    W.scale.setScalar(1 + 0.3 * Math.min(1, got / 40));
    idle.scale.set(1 + spring.x, 1 - spring.x, 1 + spring.x);
    idle.rotation.set(
      pose.pitch + Math.sin(s * 3.1) * 0.08 * pose.sway,
      pose.yaw + Math.sin(s * 1.7) * 0.75 * pose.sway,
      pose.roll + Math.sin(s * 2.3) * 0.1 * pose.sway,
    );
    idle.position.y = Math.abs(Math.sin(s * 4.2)) * 0.14 * pose.sway;
    for (const c of coins) {
      if (c.done) continue;
      c.t += dt;
      c.vel.y -= g * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      // tramo final: la moneda se corrige hacia la boca, que se está moviendo
      if (c.t > c.T * 0.6) c.mesh.position.lerp(mouth(), Math.min(1, dt * 14));
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.t >= c.T) {
        c.done = true;
        scene.remove(c.mesh);
        got++;
        spring.v += 1.4;
        sfx.coin();
        FX.spawn({ pos: c.mesh.position.clone(), vel: new THREE.Vector3(0, 0.6, 0), life: 0.35, size: 0.35, size1: 0.6, colors: GOLD });
        bumpAmount(money(amount * got / n));
      }
    }
  };
  emitters.add(phys);

  // Entrada: cae girando y aterriza de frente
  sfx.whoosh(false);
  await tween(1000, (t) => {
    W.position.set(base.x, lerp(base.y + 4, base.y, ease.outBounce(t)), 0);
    pose.yaw = FRONT + (1 - ease.outCubic(t)) * Math.PI * 5;
  });
  sfx.land();
  shake(0.06);
  spring.v += 2;

  showCard({ kicker: 'Donación', name, amount: money(0), msg, accent: '#ff8a2a', theme: 'wallet' });

  // Lluvia de monedas: la rana se balancea y brinca mientras las atrapa
  tween(400, (t) => { pose.sway = t; });
  const n = Math.min(60, 6 + Math.round(Math.sqrt(amount) * 4));
  const spawnSpan = Math.min(3000, n * 80);
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(coinGeo, coinMats);
    const p0 = new THREE.Vector3(rand(-4, 4), rand(3, 3.6), rand(-0.5, 0.5));
    const T = rand(0.7, 1.05);
    const vel = mouth().sub(p0).addScaledVector(new THREE.Vector3(0, -g, 0), -0.5 * T * T).divideScalar(T);
    mesh.position.copy(p0);
    mesh.rotation.set(rand(0, 6), 0, rand(0, 6));
    scene.add(mesh);
    coins.push({ mesh, vel, T, t: 0, spin: { x: rand(-12, 12), z: rand(-8, 8) } });
    await wait(spawnSpan / n);
  }
  while (got < n) await wait(50);
  bumpAmount(money(amount));

  // Se queda quieta de frente y da un salto con vuelta completa
  const sw0 = pose.sway;
  await tween(300, (t) => { pose.sway = sw0 * (1 - t); });
  sfx.shimmer(2);
  sparkBurst(mouth(), 50, { speed: 3.5, colors: GOLD });
  const y0 = W.position.y;
  await tween(700, (t) => {
    W.position.y = y0 + Math.sin(t * Math.PI) * 0.9;
    pose.yaw = FRONT + ease.inOutSine(t) * Math.PI * 2;
    pose.pitch = -0.15 - Math.sin(t * Math.PI) * 0.35;
  });
  pose.yaw = FRONT;
  sfx.land();
  spring.v += 3;

  // Espera contenta, con un balanceo suave
  tween(500, (t) => { pose.sway = 0.3 * t; });
  await wait(Math.max(1500, hold - 2700));

  // Salida: brinca hacia arriba girando y se encoge
  emitters.delete(phys);
  hideCard();
  sfx.whoosh(true);
  spring.v += 2;
  const yaw0 = idle.rotation.y;
  await tween(650, (t) => {
    const e = ease.inCubic(t);
    W.position.y = y0 + Math.sin(t * Math.PI * 0.5) * 3.2;
    idle.rotation.y = yaw0 + e * Math.PI * 3;
    W.scale.multiplyScalar(0.985);
  });
  sparkBurst(W.position.clone(), 30, { speed: 2.5, colors: GOLD, size: 0.08 });
  W.visible = false;
}

// ============================================================
// Cola de alertas
// ============================================================
const queue = [];
let busy = false;
function enqueue(fn) {
  queue.push(fn);
  if (!busy) run();
}
async function run() {
  busy = true;
  while (queue.length) {
    try { await queue.shift()(); } catch (e) { console.error(e); }
    await wait(500);
  }
  busy = false;
}

const TIERS = { 1000: 'Tier 1', 2000: 'Tier 2', 3000: 'Tier 3', prime: 'Prime' };
function bitsColor(b) {
  if (b >= 10000) return '#ff3d4a';
  if (b >= 5000) return '#3d8bff';
  if (b >= 1000) return '#1fd6c1';
  if (b >= 100) return '#a970ff';
  return '#c9c9d6';
}

const api = {
  follow: (name) => enqueue(() => puzzleAlert({ level: 1, kicker: 'Nuevo seguidor', name, hold: 4000 })),
  sub: ({ name, months = 1, tier = '1000', msg = '' }) => enqueue(() => kunaiAlert({
    name, msg, big: tier === '3000' ? 1.4 : 1,
    kicker: months > 1 ? `${months} meses · ${TIERS[tier] || 'Sub'}` : `Nueva sub · ${TIERS[tier] || 'Tier 1'}`,
  })),
  gift: ({ sender, count = 1, recipient = '' }) => enqueue(() => kunaiAlert({
    name: sender, count, big: count >= 10 ? 1.3 : 1,
    kicker: count > 1 ? `Regaló ${count} subs` : `Regaló una sub a ${recipient}`,
  })),
  cheer: ({ name, amount, msg = '' }) => enqueue(() => puzzleAlert({
    level: amount >= 5000 ? 4 : amount >= 1000 ? 3 : amount >= 100 ? 2 : 1,
    color: bitsColor(amount), kicker: `${amount.toLocaleString('es-MX')} bits`, name, msg,
  })),
  raid: ({ name, viewers }) => enqueue(() => puzzleAlert({
    level: 4, raid: true, color: '#b36bff', kicker: `¡Raid de ${viewers} espectadores!`, name, hold: 7000,
  })),
  tip: ({ name, amount, msg = '' }) => enqueue(() => walletAlert({ name, amount, msg })),
};
window.alerts3d = api;

// ============================================================
// StreamElements
// ============================================================
// Un script clásico en el HTML guarda en window.__se lo que llegue antes de que este módulo cargue
function seLoad(detail) {
  const f = detail?.fieldData || {};
  if (f.modelsUrl) CFG.models = f.modelsUrl.replace(/\/?$/, '/');
  if (f.volume != null) CFG.volume = f.volume / 100;
  if (f.holdSeconds) CFG.holdMs = f.holdSeconds * 1000;
  if (f.look) CFG.look = f.look;
  CFG.currency = f.currency || detail?.currency?.symbol || CFG.currency;
}
function seEvent(detail) {
  const l = detail?.listener, e = detail?.event;
  if (!e) return;
  const name = e.name || 'Anónimo';
  switch (l) {
    case 'follower-latest': api.follow(name); break;
    case 'subscriber-latest':
      if (e.isCommunityGift) break; // los individuales de un regalo masivo
      if (e.bulkGifted) api.gift({ sender: e.sender || name, count: e.amount });
      else if (e.gifted) api.gift({ sender: e.sender || 'Anónimo', recipient: name });
      else api.sub({ name, months: e.amount || 1, tier: String(e.tier || '1000'), msg: e.message || '' });
      break;
    case 'cheer-latest': api.cheer({ name, amount: e.amount, msg: e.message || '' }); break;
    case 'raid-latest': api.raid({ name, viewers: e.amount }); break;
    case 'tip-latest': api.tip({ name, amount: e.amount, msg: e.message || '' }); break;
  }
}
const SE = window.__se || { load: null, queue: [] };
if (SE.load) seLoad(SE.load);
window.addEventListener('onWidgetLoad', (obj) => seLoad(obj.detail));

// ============================================================
// Bucle principal
// ============================================================
function frame(dt) {
  NOW += dt * 1000;
  for (let i = timers.length - 1; i >= 0; i--) {
    if (timers[i].at <= NOW) { timers[i].r(); timers.splice(i, 1); }
  }
  for (const tk of [...tickers]) tk(NOW);
  for (const em of emitters) em(NOW, dt);
  FX.update(dt);
  SMOKE.update(dt);
  shakeAmp *= Math.exp(-dt * 6);
  camera.position.set(CAM_BASE.x + rand(-1, 1) * shakeAmp, CAM_BASE.y + rand(-1, 1) * shakeAmp, CAM_BASE.z);
  renderer.render(scene, camera);
}

const STEP = new URLSearchParams(location.search).has('step');
let last = performance.now();
function loop(now) {
  frame(Math.min(0.05, (now - last) / 1000));
  last = now;
  requestAnimationFrame(loop);
}

await loadModels();
// Eventos que llegaron mientras cargaban los modelos
window.addEventListener('onEventReceived', (obj) => seEvent(obj.detail));
SE.ready = true;
SE.queue.splice(0).forEach(seEvent);
if (STEP) {
  // Avanza la escena y las animaciones CSS del texto de forma determinista
  window.__advance = async (ms) => {
    const dt = 1 / 60;
    for (let t = 0; t < ms; t += dt * 1000) {
      frame(dt);
      await new Promise((r) => setTimeout(r, 0));
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = (a.currentTime || 0) + dt * 1000;
      }
    }
    return NOW;
  };
} else {
  requestAnimationFrame(loop);
}
window.__ready = true;

// ============================================================
// Panel de prueba (?test)
// ============================================================
if (TEST) {
  document.body.classList.add('test');
  window.__dbg = { THREE, M, scene, camera, makeKunai, ANCHOR, rays, halo };
  const panel = document.createElement('div');
  panel.id = 'panel';
  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { audio(); fn(); };
    panel.appendChild(b);
  };
  panel.innerHTML = '<b>Alertas 3D · prueba</b>';
  btn('Follow', () => api.follow('YugiMuto_99'));
  btn('Sub nueva', () => api.sub({ name: 'NarutoFan' }));
  btn('Resub 12 meses T3', () => api.sub({ name: 'Kakashi_Sensei', months: 12, tier: '3000', msg: '¡Un año ya! Sigue así 🔥' }));
  btn('Regalo 5 subs', () => api.gift({ sender: 'JiraiyaSama', count: 5 }));
  btn('Bits 100', () => api.cheer({ name: 'Joey', amount: 100, msg: 'Cheer100 ¡vamos!' }));
  btn('Bits 5000', () => api.cheer({ name: 'SetoKaiba', amount: 5000, msg: 'Pura clase.' }));
  btn('Raid 150', () => api.raid({ name: 'PharaohAtem', viewers: 150 }));
  btn('Donación $50', () => api.tip({ name: 'Hinata', amount: 50, msg: 'Para el ramen 🍜' }));
  btn('Donación $500', () => api.tip({ name: 'Tsunade', amount: 500, msg: 'Apuesta segura esta vez.' }));
  btn('Ráfaga (cola)', () => {
    api.follow('Uno'); api.cheer({ name: 'Dos', amount: 1000 }); api.tip({ name: 'Tres', amount: 20 });
  });
  // ?test&demo=<botón> dispara una alerta al cargar (para capturas automáticas)
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) {
    panel.style.display = 'none';
    [...panel.querySelectorAll('button')].find((b) => b.textContent.toLowerCase().startsWith(demo.toLowerCase()))?.click();
  }
  const sm = document.createElement('small');
  sm.textContent = 'Haz clic una vez para activar el audio.';
  panel.appendChild(sm);
  document.body.appendChild(panel);
}
