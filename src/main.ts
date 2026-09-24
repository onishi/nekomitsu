import './style.css';
import { FILL_GOAL, Game } from './game';
import { drawCat } from './render/catRenderer';
import { Effects } from './render/effects';
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
hint.textContent = coarse ? '左右に動かして、タップで落とす' : '左右に動かして、クリックで落とす（← → / Space）';

const game = new Game();
const view: View = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 1, h: 1 };

/** 重い端末では描画解像度を自動で下げる */
let maxDpr = 2;
function layout(): void {
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
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
  // タッチは指を離した位置に落とす。マウスは既に追従しているのでそのまま
  game.drop(e.pointerType !== 'mouse');
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
  fx.clear();
  clearEl.hidden = true;
  layout();
  restartBtn.blur();
});
function goNext(): void {
  if (game.phase !== 'cleared' || performance.now() - clearShownAt < 900) return;
  game.nextStage();
  fx.clear();
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

// --- クリア時のハート ---
const fx = new Effects();
let heartTimer = 0;
function updateEffects(dt: number): void {
  fx.update(dt);
  if (game.phase === 'cleared' && game.time - game.clearTime < 3 && game.cats.length) {
    heartTimer -= dt;
    if (heartTimer <= 0) {
      heartTimer = 0.09;
      const c = game.cats[Math.floor(Math.random() * game.cats.length)];
      const h = c.headFrame();
      fx.heart(h.x + (Math.random() - 0.5) * 20, h.y - c.species.headR * 1.2, 11 + Math.random() * 8);
    }
  }
}

// --- ループ ---
// ?perf を付けると描画時間を計測（window.__perf）
const perf = new URLSearchParams(location.search).has('perf') ? { render: 0, frames: 0 } : null;
(window as unknown as { __perf: typeof perf }).__perf = perf;
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
    updateEffects(DT);
    acc -= DT;
    steps++;
  }
  if (steps === 3) acc = 0;
  const r0 = performance.now();
  render();
  adaptQuality(now, performance.now() - r0);
  if (perf) {
    perf.render += performance.now() - r0;
    perf.frames++;
  }
  requestAnimationFrame(frame);
}

let slowFrames = 0;
let qualityChecks = 0;
function adaptQuality(now: number, renderMs: number): void {
  // 起動直後は除外し、描画が継続的に重ければ段階的に解像度を下げる
  if (now < 4000 || maxDpr <= 1) return;
  qualityChecks++;
  if (renderMs > 12) slowFrames++;
  if (qualityChecks >= 300) {
    if (slowFrames > 150) {
      maxDpr = Math.max(1, Math.min(maxDpr, window.devicePixelRatio || 1) - 0.5);
      layout();
    }
    qualityChecks = 0;
    slowFrames = 0;
  }
}

function render(): void {
  const b = game.bowl;
  drawBackground(ctx, view, b);
  ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, view.ox * view.dpr, view.oy * view.dpr);
  drawBowlBack(ctx, b);
  for (const c of game.cats) drawCat(ctx, c, game.time);
  drawBowlFront(ctx, b);
  fx.draw(ctx);
  const h = game.held;
  if (h && game.phase === 'playing') {
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
  }
  // HUD
  stageNum.textContent = String(game.stage);
  // クリア後は押し合いで数値が揺れないよう、クリア時の値を表示
  const shownFill = game.phase === 'cleared' ? game.clearFill : game.fill;
  const pct = Math.round(shownFill * 100);
  fillPct.textContent = `${pct}%`;
  fillBar.style.width = `${Math.min(100, (shownFill / FILL_GOAL) * 100)}%`;
  fillBar.classList.toggle('full', shownFill >= FILL_GOAL);
  catCount.textContent = `${game.cats.length}匹`;
}

layout();
requestAnimationFrame(frame);

// デバッグ・自動テスト用
(window as unknown as { __game: Game }).__game = game;
