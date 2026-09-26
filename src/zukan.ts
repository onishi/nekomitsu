/**
 * 隠しページ「ねこ図鑑」（/zukan.html。メニュー右下のうっすらした肉球から入れる）。
 * ゲームと同じ Cat と物理で、カードごとに小さな床に猫を1匹ずつ下ろし、思い思いに過ごさせる
 * （毛繕い・あくび・のびー・昼寝・ゆっくりまばたき・スン…）。ポインタを動かすと目で追い、タップすると鳴く。
 */
import './style.css';
import './zukan.css';
import { Sound } from './audio';
import { Cat, type CatEnv } from './cat/cat';
import { COATS, SPECIES, type Coat, type Species } from './cat/catTypes';
import { COAT_STEPS, KESHI_COATS } from './keshi';
import { Container } from './physics/container';
import { World } from './physics/world';
import { drawCat } from './render/catRenderer';

const sound = new Sound();
void sound.loadSamples();

/** 床の見えている高さ（ワールド座標で、床から上） */
const TOP = -400;
/** カードの表示: 横幅の何割を床の下に取るか */
const FLOOR_AT = 0.8;

interface Entry {
  world: World;
  cat: Cat;
  env: CatEnv;
  canvas: HTMLCanvasElement;
  /** 見えている横幅（ワールド座標） */
  viewW: number;
  /** 次に気まぐれを起こす時刻（秒） */
  nextWhim: number;
  visible: boolean;
}
const entries: Entry[] = [];

/** ポインタ（マウス・指）の位置。猫たちが目で追う */
const pointer = { x: 0, y: 0, t: -1e9 };
const onPointer = (e: PointerEvent) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.t = performance.now() / 1000;
};
window.addEventListener('pointermove', onPointer, { passive: true });
window.addEventListener('pointerdown', onPointer, { passive: true });

/** ねこけしで何匹目から出てくるか（出てこなければ null） */
function keshiFrom(coat: Coat): number | null {
  const i = KESHI_COATS.indexOf(coat);
  if (i < 0) return null;
  for (const [from, count] of COAT_STEPS) if (count > i) return from;
  return null;
}

const visibility = new IntersectionObserver((list) => {
  for (const it of list) {
    const e = entries.find((x) => x.canvas === it.target);
    if (e) e.visible = it.isIntersecting;
  }
});

function addCard(parent: HTMLElement, species: Species, coat: Coat, title: string, note: string): void {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  const canvas = document.createElement('canvas');
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = title;
  card.append(canvas, name);
  if (note) {
    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = note;
    card.append(n);
  }
  parent.append(card);

  // 猫の長さに合わせた床（見えない壁で囲う）。表示は壁より少し広く（壁際の猫の頭や耳が切れないように）
  const len = species.a * 2 + species.headR * 1.4 + species.tailLen * 0.6;
  const halfW = Math.max(95, len * 0.5);
  const world = new World(
    new Container('zukan', [
      { x: -halfW, y: TOP },
      { x: -halfW, y: 0 },
      { x: halfW, y: 0 },
      { x: halfW, y: TOP },
    ]),
    1024,
  );
  const facing: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const grumpy = Math.random() < 0.12;
  const cat = new Cat(world, species, coat, facing, 0, -150, grumpy);
  cat.stoic = !grumpy && Math.random() < 0.15;
  cat.placeHeld((Math.random() - 0.5) * halfW * 0.4, -170 - Math.random() * 60, 0, 1);
  cat.release(0, 0);
  const env: CatEnv = {
    time: 0,
    rimY: TOP,
    cats: [cat],
    event: () => {},
    squeeze: 0,
    cleared: false,
    sound: { posu: () => {}, munyu: () => {}, supo: () => {}, purr: () => {} },
    focus: null,
    focusMoving: false,
  };
  const e: Entry = { world, cat, env, canvas, viewW: halfW * 2 + species.headR * 2.4, nextWhim: 2 + Math.random() * 6, visible: true };
  entries.push(e);
  visibility.observe(canvas);
  card.addEventListener('click', () => {
    sound.unlock();
    sound.meow(Math.pow((58 * 36) / (species.a * species.b), 0.3) * (0.92 + Math.random() * 0.16));
    cat.poke();
  });
}

const coatsEl = document.getElementById('coats')!;
for (const coat of COATS) {
  const from = keshiFrom(coat);
  addCard(coatsEl, SPECIES.standard, coat, coat.name, from === null ? 'ねこみつのみ' : from === 0 ? 'ねこけし: 最初から' : `ねこけし: ${from}匹目から`);
}
const speciesEl = document.getElementById('species')!;
const kiji = COATS.find((c) => c.key === 'kiji')!;
for (const sp of Object.values(SPECIES)) addCard(speciesEl, sp, kiji, sp.name, sp.weight < 0.5 ? 'レア' : '');

/** 気まぐれ: 寝ている猫はたいてい起きる。起きている猫は、毛繕い・あくび・のびー・昼寝・まばたき・スン… */
function whim(e: Entry): void {
  const c = e.cat;
  const r = Math.random();
  if (c.expression === 'sleep') {
    if (r < 0.75) c.whim('wake');
    return;
  }
  // 昼寝以外の気まぐれのあとは、しばらく起きている（みんな一斉に寝てしまわないように）
  if (r >= 0.54 || r < 0.46) c.calm = Math.min(c.calm, 1 + Math.random() * 4);
  if (r < 0.2) c.whim('groom');
  else if (r < 0.32) c.whim('yawn');
  else if (r < 0.46) c.whim('stretch');
  else if (r < 0.54) c.whim('nap');
  else if (r < 0.82) c.whim('slowBlink');
  else c.whim('blank');
}

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
function frame(nowMs: number): void {
  acc = Math.min(0.1, acc + (nowMs - last) / 1000);
  last = nowMs;
  const t = nowMs / 1000;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const moving = t - pointer.t < 0.4;
  const watching = t - pointer.t < 5;
  const steps = Math.floor(acc / STEP);
  acc -= steps * STEP;
  for (const e of entries) {
    if (!e.visible) continue;
    const c = e.canvas;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    // 表示の変換: 横幅 viewW を canvas いっぱいに、床は下から FLOOR_AT の位置
    const s = cw / e.viewW;
    // ポインタをこの猫の世界の座標に（最近動いていれば、みんなで目で追う）
    if (watching) {
      const rect = c.getBoundingClientRect();
      e.env.focus = { x: (pointer.x - rect.left - cw / 2) / s, y: (pointer.y - rect.top - ch * FLOOR_AT) / s };
    } else e.env.focus = null;
    e.env.focusMoving = moving;
    for (let k = 0; k < steps; k++) {
      e.env.time += STEP;
      if (e.env.time > e.nextWhim) {
        e.nextWhim = e.env.time + 3 + Math.random() * 7;
        whim(e);
      }
      e.cat.update(STEP, e.env);
      e.world.beginFrame();
      e.world.step();
    }
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(s * dpr, 0, 0, s * dpr, (cw / 2) * dpr, ch * FLOOR_AT * dpr);
    // 床と影
    ctx.fillStyle = 'rgba(120, 85, 55, 0.08)';
    ctx.fillRect(-e.viewW / 2, 0, e.viewW, 400);
    ctx.fillStyle = 'rgba(90, 60, 30, 0.1)';
    ctx.beginPath();
    ctx.ellipse(e.cat.cx, 2, e.cat.species.a * 1.15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawCat(ctx, e.cat, t);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
