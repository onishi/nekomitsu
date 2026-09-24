import './style.css';
import { FILL_GOAL, Game } from './game';
import { drawCat } from './render/catRenderer';
import { drawBackground, drawBowlBack, drawBowlFront, type View } from './render/scene';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stageNum = $('stageNum');
const fillBar = $('fillBar');
const fillPct = $('fillPct');
const catCount = $('catCount');
const hint = $('hint');
const clearEl = $('clear');
const soundBtn = $<HTMLButtonElement>('soundBtn');
const restartBtn = $<HTMLButtonElement>('restartBtn');
const nextBtn = $<HTMLButtonElement>('nextBtn');
const coarse = window.matchMedia('(pointer: coarse)').matches;
hint.textContent = coarse ? '左右に動かして、はなすと落ちる' : '左右に動かして、クリックで落とす';

const game = new Game();
const view: View = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 1, h: 1 };

function layout(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const b = game.bowl;
  const R = b.R;
  // 見せたい範囲: 吊るされた猫〜テーブル
  const top = game.dropY - R * 0.38;
  const bottom = b.bottomY + R * 0.14;
  const halfW = R * 1.04;
  const hudH = 56;
  const scale = Math.min(w / (halfW * 2), (h - hudH) / (bottom - top));
  view.scale = scale;
  view.dpr = dpr;
  view.w = w;
  view.h = h;
  view.ox = w / 2;
  // 下寄せ（テーブルが画面下に来る）
  view.oy = h - (bottom - 0) * scale - Math.max(0, (h - hudH - (bottom - top) * scale) * 0.35);
}
window.addEventListener('resize', layout);

// --- 入力 ---
function toWorldX(clientX: number): number {
  return (clientX - view.ox) / view.scale;
}
let pointerDown = false;
canvas.addEventListener('pointerdown', (e) => {
  game.sound.unlock();
  pointerDown = true;
  canvas.setPointerCapture(e.pointerId);
  game.targetX = toWorldX(e.clientX);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || pointerDown) game.targetX = toWorldX(e.clientX);
});
canvas.addEventListener('pointerup', (e) => {
  if (!pointerDown) return;
  pointerDown = false;
  game.targetX = toWorldX(e.clientX);
  if (game.phase === 'cleared') return;
  game.drop();
});
canvas.addEventListener('pointercancel', () => {
  pointerDown = false;
});
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    keys.add(e.key);
    e.preventDefault();
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    game.sound.unlock();
    if (e.repeat) return;
    if (game.phase === 'cleared') goNext();
    else game.drop();
  } else if (e.key === 'r' || e.key === 'R') {
    game.restart();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key));

// --- UI ---
let soundOn = true;
try {
  soundOn = localStorage.getItem('nekomitsu.sound') !== 'off';
} catch {
  /* ignore */
}
function syncSound(): void {
  game.sound.setEnabled(soundOn);
  soundBtn.classList.toggle('off', !soundOn);
  soundBtn.setAttribute('aria-label', soundOn ? 'サウンドOFF' : 'サウンドON');
  soundBtn.setAttribute('aria-pressed', String(soundOn));
}
syncSound();
soundBtn.addEventListener('click', () => {
  game.sound.unlock();
  soundOn = !soundOn;
  try {
    localStorage.setItem('nekomitsu.sound', soundOn ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  syncSound();
  soundBtn.blur();
});
restartBtn.addEventListener('click', () => {
  game.sound.unlock();
  game.restart();
  clearEl.hidden = true;
  layout();
  restartBtn.blur();
});
function goNext(): void {
  if (game.phase !== 'cleared' || performance.now() - clearShownAt < 900) return;
  game.nextStage();
  clearEl.hidden = true;
  layout();
}
nextBtn.addEventListener('click', goNext);
let clearShownAt = 0;
game.onClear = () => {
  setTimeout(() => {
    clearEl.hidden = false;
    clearShownAt = performance.now();
  }, 450);
};
game.onFirstDrop = () => hint.classList.add('fade');

// --- ループ ---
const DT = 1 / 60;
let acc = 0;
let last = performance.now();
function frame(now: number): void {
  let el = (now - last) / 1000;
  last = now;
  if (el > 0.1) el = 0.1;
  acc += el;
  let steps = 0;
  while (acc >= DT && steps < 3) {
    if (keys.has('ArrowLeft')) game.targetX = Math.min(game.targetX, game.dropX) - 520 * DT;
    if (keys.has('ArrowRight')) game.targetX = Math.max(game.targetX, game.dropX) + 520 * DT;
    game.update(DT);
    acc -= DT;
    steps++;
  }
  if (steps === 3) acc = 0;
  render();
  requestAnimationFrame(frame);
}

function render(): void {
  const b = game.bowl;
  drawBackground(ctx, view, b);
  ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, view.ox * view.dpr, view.oy * view.dpr);
  drawBowlBack(ctx, b);
  for (const c of game.cats) drawCat(ctx, c, game.time);
  drawBowlFront(ctx, b);
  const h = game.held;
  if (h) {
    // 落下地点のガイド
    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = 'rgba(120,90,70,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(game.dropX, h.cy + h.species.b * 1.6);
    ctx.lineTo(game.dropX, b.bottomY - 4);
    ctx.stroke();
    ctx.restore();
    drawCat(ctx, h, game.time);
    ctx.fillStyle = 'rgba(90,65,50,0.7)';
    ctx.font = `600 ${Math.max(11, 13 / view.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${h.coat.name}・${h.species.name}`, game.dropX, h.cy + h.species.b * 2.2 + 12 / view.scale);
    ctx.textAlign = 'start';
  }
  // HUD
  stageNum.textContent = String(game.stage);
  const pct = Math.round(game.fill * 100);
  fillPct.textContent = `${pct}%`;
  fillBar.style.width = `${Math.min(100, (game.fill / FILL_GOAL) * 100)}%`;
  fillBar.classList.toggle('full', game.fill >= FILL_GOAL);
  catCount.textContent = `${game.cats.length}匹`;
}

layout();
requestAnimationFrame(frame);

// デバッグ・自動テスト用
(window as unknown as { __game: Game }).__game = game;
