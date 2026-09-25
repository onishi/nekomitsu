/**
 * 隠しページ「ねこ図鑑」（/zukan.html。メニュー右下のうっすらした肉球から入れる）。
 * ゲームと同じ Cat と drawCat で、柄・体型ごとに吊るした猫を並べる。タップすると鳴く。
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

const world = new World(
  new Container('zukan', [
    { x: -400, y: 0 },
    { x: -400, y: 400 },
    { x: 400, y: 400 },
    { x: 400, y: 0 },
  ]),
  16384,
);
const sound = new Sound();
void sound.loadSamples();

interface Entry {
  cat: Cat;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  /** 見出しの大きさに合わせた表示倍率 */
  scale: number;
}
const entries: Entry[] = [];

/** ねこけしで何匹目から出てくるか（出てこなければ null） */
function keshiFrom(coat: Coat): number | null {
  const i = KESHI_COATS.indexOf(coat);
  if (i < 0) return null;
  for (const [from, count] of COAT_STEPS) if (count > i) return from;
  return null;
}

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
  // 猫どうしは離して置く（吊るした猫は物理に参加しないので、同じ世界に並べてよい）
  const x = entries.length * 400 - 3000;
  const y = -200;
  const cat = new Cat(world, species, coat, 1, x, y);
  cat.placeHeld(x, y, 0, 1);
  const [el, er] = cat.extentsAt(1);
  const w = er - el + 30;
  entries.push({ cat, canvas, x: x + (el + er) / 2, y, scale: Math.min(1.25, 190 / w) });
  card.addEventListener('click', () => {
    sound.unlock();
    sound.meow(Math.pow((58 * 36) / (species.a * species.b), 0.3) * (0.92 + Math.random() * 0.16));
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

const env: CatEnv = {
  time: 0,
  rimY: 0,
  cats: [],
  event: () => {},
  squeeze: 0,
  cleared: false,
  sound: { posu: () => {}, munyu: () => {}, supo: () => {}, purr: () => {}, grumble: () => {} },
} as unknown as CatEnv;

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  env.time = t;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const e of entries) {
    e.cat.update(dt, env);
    const c = e.canvas;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const s = dpr * e.scale * (cw / 200);
    ctx.setTransform(s, 0, 0, s, c.width / 2 - e.x * s, c.height * 0.47 - e.y * s);
    drawCat(ctx, e.cat, t);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
