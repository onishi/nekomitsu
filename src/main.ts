import './style.css';
import { Game, type GameMode } from './game';
import type { KeshiEvent } from './keshi';
import { drawCat, strokeCatSilhouette } from './render/catRenderer';
import { Effects } from './render/effects';
import { drawBackground, drawBowlBack, drawBowlFront, tableWorldY, type View } from './render/scene';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stageNum = $('stageNum');
const hudLabel = $('hudLabel');
const titleBtn = $<HTMLButtonElement>('titleBtn');
const overEl = $('over');
const hint = $('hint');
const clearEl = $('clear');
const soundBtn = $<HTMLButtonElement>('soundBtn');
const nextBtn = $<HTMLButtonElement>('nextBtn');
const coarse = window.matchMedia('(pointer: coarse)').matches;
/** 画面下のヒント（狭い画面では「／」の区切りで折り返す） */
function setHint(mode: GameMode): void {
  const parts =
    mode === 'keshi'
      ? ['おなじ猫をくっつけると合体', '大きくなると、ぽんっと消える']
      : coarse
        ? ['タップで落とす', '鉢の中をなぞるとかき混ぜる']
        : ['クリックで落とす（← → / Space）', '鉢の中をドラッグでかき混ぜる'];
  hint.replaceChildren(
    ...parts.map((t, i) => {
      const span = document.createElement('span');
      span.textContent = i < parts.length - 1 ? `${t}／` : t;
      return span;
    }),
  );
  hint.classList.remove('fade');
}
setHint('mitsu');

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
  const top = game.dropY - Math.max(R * 0.38, 90);
  const bottom = tableWorldY(b) + R * 0.1;
  const halfW = Math.max(b.halfW * 1.06, 200);
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
// ・すぐ離す（タップ / クリック）: どこを触っても猫を落とす
// ・容器の中で押したまま動かす、または長押し: 落とさずに、中の猫をかき混ぜる
// ・容器の外で押したまま動かす: 猫を左右に動かして狙い、離すと落とす
const LONG_PRESS_MS = 300;
const MOVE_TOLERANCE = 10; // これ以上動いたら「タップ」ではなく、かき混ぜ（中）/ 狙う（外）
function toWorldX(clientX: number): number {
  return (clientX - view.ox) / view.scale;
}
function toWorldY(clientY: number): number {
  return (clientY - view.oy) / view.scale;
}
type PressMode = 'none' | 'pending' | 'aim' | 'stir';
let mode: PressMode = 'none';
let downX = 0;
let downY = 0;
let lastX = 0;
let lastY = 0;
let longTimer = 0;
let downInside = false;
/** 長押しの溜め表示（容器の中を押している間） */
const press = { active: false, x: 0, y: 0, t0: 0 };

function startStir(): void {
  if (mode !== 'pending') return;
  mode = 'stir';
  press.active = false;
  game.stirStart(toWorldX(lastX), toWorldY(lastY), performance.now());
}
function endPress(): void {
  clearTimeout(longTimer);
  press.active = false;
  if (mode === 'stir') game.stirEnd();
  mode = 'none';
}
canvas.addEventListener('pointerdown', (e) => {
  game.sound.unlock();
  canvas.setPointerCapture(e.pointerId);
  endPress();
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  mode = 'pending';
  const wx = toWorldX(e.clientX);
  const wy = toWorldY(e.clientY);
  // ねこけしではかき混ぜない（容器の中でもドラッグは狙う操作、タップは落とす）
  downInside = game.mode !== 'keshi' && game.isInside(wx, wy);
  if (downInside) {
    longTimer = window.setTimeout(startStir, LONG_PRESS_MS);
    Object.assign(press, { active: true, x: wx, y: wy, t0: performance.now() });
  }
});
canvas.addEventListener('pointermove', (e) => {
  lastX = e.clientX;
  lastY = e.clientY;
  if (mode === 'stir') {
    game.stirMove(toWorldX(e.clientX), toWorldY(e.clientY), performance.now());
    return;
  }
  if (mode === 'pending' && Math.hypot(e.clientX - downX, e.clientY - downY) > MOVE_TOLERANCE) {
    clearTimeout(longTimer);
    if (downInside) {
      // 容器の中で押したまま動かした: すぐにかき混ぜ
      startStir();
      game.stirMove(toWorldX(e.clientX), toWorldY(e.clientY), performance.now());
      return;
    }
    press.active = false;
    mode = 'aim';
  }
  if (mode === 'aim' || e.pointerType === 'mouse') game.targetX = toWorldX(e.clientX);
});
canvas.addEventListener('pointerup', (e) => {
  const m = mode;
  endPress();
  if (m === 'pending' || m === 'aim') {
    game.targetX = toWorldX(e.clientX);
    // タッチは指を離した位置に落とす。マウスは既に追従しているのでそのまま
    game.drop(e.pointerType !== 'mouse');
  }
});
canvas.addEventListener('pointercancel', endPress);
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  // メニューを出している間はダイアログのボタン操作に任せる
  if (menu.open) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    keys.add(e.key);
    e.preventDefault();
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    game.sound.unlock();
    if (e.repeat) return;
    // 吊るしている猫がいれば落とす。クリア後で猫がいなければ次のステージへ（ねこけしはもういちど）
    if (game.phase === 'gameover') retry();
    else if (game.held) game.drop();
    else if (game.phase === 'cleared') goNext();
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
function goNext(): void {
  if (game.phase !== 'cleared' || !clearShown || performance.now() - clearShownAt < 900) return;
  game.nextStage();
  fx.clear();
  clearEl.hidden = true;
  clearShown = false;
  layout();
}
nextBtn.addEventListener('click', goNext);

// --- オートモード（鑑賞用）: 適当な位置へ動かして落とし、クリアしたら次の面へ ---
const autoBtn = $<HTMLButtonElement>('autoBtn');
let auto = false;
let autoTimer = 0;
let autoAim: number | null = null;
function setAuto(on: boolean): void {
  auto = on;
  autoAim = null;
  autoTimer = 0.4;
  autoBtn.setAttribute('aria-pressed', String(on));
  autoBtn.setAttribute('aria-label', on ? 'オートモードを止める' : 'オートモードにする');
  if (on) hint.classList.add('fade');
}
setAuto(false);
autoBtn.addEventListener('click', () => {
  game.sound.unlock();
  setAuto(!auto);
  autoBtn.blur();
});
function updateAuto(dt: number): void {
  if (!auto) return;
  autoTimer -= dt;
  if (game.phase === 'cleared') {
    // クリアの余韻を少し見せてから次の面へ
    if (clearShown && performance.now() - clearShownAt > 3200) goNext();
    return;
  }
  if (game.phase === 'gameover') {
    // ねこけし: 結果を少し見せてから、もういちど
    if (overShown && performance.now() - overShownAt > 3500) retry();
    return;
  }
  // 判定中は落とさずに待つ
  if (game.phase !== 'playing' || !game.held || autoTimer > 0) return;
  if (autoAim === null) {
    // 狙う位置を決めて、そこまで猫を動かす
    const w = game.bowl.openHalfW;
    autoAim = (Math.random() * 2 - 1) * w;
    game.targetX = autoAim;
    autoTimer = 0.45 + Math.random() * 0.35;
  } else if (game.canDrop) {
    game.drop();
    autoAim = null;
    autoTimer = 0.5 + Math.random() * 0.9;
  }
}

// --- メニュー（開始時・タイトルを押したとき）: ねこみつ / ねこけし を選ぶ ---
const menu = $<HTMLDialogElement>('menu');
const menuClose = $<HTMLButtonElement>('menuClose');
let paused = false;
let testHold = false;
/** 開始時のメニューは閉じられない（モードを選ぶまで） */
let menuClosable = false;
const MODE_KEY = 'nekomitsu.mode';
function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function showMenu(closable: boolean): void {
  menuClosable = closable;
  menuClose.hidden = !closable;
  $('menuNote').hidden = !closable;
  const current: GameMode = closable ? game.mode : readStore(MODE_KEY) === 'keshi' ? 'keshi' : 'mitsu';
  for (const b of menu.querySelectorAll<HTMLButtonElement>('.mode')) b.classList.toggle('current', b.dataset.mode === current);
  const best = Number(readStore('nekomitsu.keshi.best') ?? 0) || 0;
  $('menuBest').textContent = best > 0 ? `ハイスコア ${best.toLocaleString()}` : '';
  paused = true;
  keys.clear();
  menu.showModal();
  menu.querySelector<HTMLButtonElement>(`.mode[data-mode="${current}"]`)?.focus();
}
function startMode(mode: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  game.startMode(mode);
  if (game.keshi) game.keshi.onEvent = onKeshiEvent;
  fx.clear();
  clearEl.hidden = true;
  clearShown = false;
  overEl.hidden = true;
  overShown = false;
  titleBtn.textContent = mode === 'keshi' ? 'ねこけし' : 'ねこみつ';
  hudLabel.textContent = mode === 'keshi' ? 'SCORE' : 'STAGE';
  hudLabel.classList.toggle('score', mode === 'keshi');
  setHint(mode);
  layout();
}
for (const b of menu.querySelectorAll<HTMLButtonElement>('.mode')) {
  b.addEventListener('click', () => {
    game.sound.unlock();
    startMode(b.dataset.mode === 'keshi' ? 'keshi' : 'mitsu');
    menu.close();
  });
}
menuClose.addEventListener('click', () => menu.close());
// 開始時のメニューは Esc で閉じない
menu.addEventListener('cancel', (e) => {
  if (!menuClosable) e.preventDefault();
});
menu.addEventListener('close', () => {
  paused = false;
  last = performance.now();
});
titleBtn.addEventListener('click', () => {
  game.sound.unlock();
  showMenu(true);
});

let clearShownAt = 0;
let clearShown = false;
game.onClear = () => {
  setTimeout(() => {
    clearEl.hidden = false;
    clearShown = true;
    clearShownAt = performance.now();
  }, 450);
};
game.onFirstDrop = () => hint.classList.add('fade');

// --- ねこけし: ゲームオーバー → もういちど ---
let overShown = false;
let overShownAt = 0;
function retry(): void {
  if (game.mode !== 'keshi' || game.phase !== 'gameover' || !overShown || performance.now() - overShownAt < 900) return;
  startMode('keshi');
}
$('retryBtn').addEventListener('click', retry);

// --- クリア時のハート ---
const fx = new Effects();
// 隣の猫に舐められると、小さなハート
game.onCatEvent = (kind, cat) => {
  if (kind !== 'lick') return;
  const h = cat.headFrame();
  fx.heart(h.x + (Math.random() - 0.5) * 16, h.y - cat.species.headR, 8 + Math.random() * 4);
};
/** ねこけしの融合・消滅・連鎖の演出 */
function onKeshiEvent(e: KeshiEvent): void {
  if (e.kind === 'merge') {
    fx.ripple(e.x, e.y, e.size * 0.9, e.coat.base);
    fx.text(`+${e.points}`, e.x, e.y - e.size * 0.6, 16, '#c9786a', 0.8);
  } else if (e.kind === 'pop') {
    fx.burst(e.x, e.y, e.size, [e.coat.base, e.coat.belly, e.coat.stripe ?? e.coat.line]);
    fx.text(`+${e.points.toLocaleString()}`, e.x, e.y + e.size * 0.45, 18, '#c9786a', 1.0);
    if (e.chain >= 2) {
      // 連鎖ほど大きく、目立つ色で
      const size = 34 + Math.min(6, e.chain) * 6;
      fx.text(`${e.chain}れんさ！`, 0, game.bowl.openY + game.bowl.R * 0.35, size, e.chain >= 4 ? '#e24a6a' : '#f0a02a', 1.6);
    }
  } else if (e.kind === 'newcoat') {
    // あたらしい猫が来るよ（難しくなる合図）
    const y = game.bowl.openY + game.bowl.R * 0.25;
    fx.text('あたらしい猫', 0, y, 30, '#e0784a', 2.2);
    fx.text(e.coat.name, 0, y + 38, 24, '#8a5a3a', 2.2);
    game.sound.clear();
  } else if (e.kind === 'harder') {
    const y = game.bowl.openY + game.bowl.R * 0.25;
    fx.text('むずかしくなった！', 0, y, 28, '#e24a6a', 2.4);
    fx.text(`${e.units}匹ぶんで消えるよ`, 0, y + 36, 20, '#8a5a3a', 2.4);
    game.sound.clear();
  } else if (e.kind === 'gameover') {
    const k = game.keshi!;
    $('overScore').textContent = k.score.toLocaleString();
    const bestEl = $('overBest');
    const isNew = k.newBest && k.score > 0;
    bestEl.textContent = isNew ? 'ハイスコア更新！' : `ハイスコア ${k.best.toLocaleString()}`;
    bestEl.classList.toggle('new', isNew);
    setTimeout(() => {
      if (game.phase !== 'gameover') return;
      overEl.hidden = false;
      overShown = true;
      overShownAt = performance.now();
    }, 900);
  }
}
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
  if (paused || testHold) acc = 0;
  while (acc >= DT && steps < 3) {
    if (keys.has('ArrowLeft')) game.targetX = Math.min(game.targetX, game.dropX) - 520 * DT;
    if (keys.has('ArrowRight')) game.targetX = Math.max(game.targetX, game.dropX) + 520 * DT;
    game.update(DT);
    updateEffects(DT);
    updateAuto(DT);
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
  const k = game.keshi;
  for (const c of game.cats) if (!c.fusing) drawCat(ctx, c, game.time);
  if (k) {
    // 融合中の2匹: 輪郭を先に描いてから中身を重ねると、境目が溶けて1つのかたまりに見える
    for (const f of k.fusions) {
      strokeCatSilhouette(ctx, f.a);
      strokeCatSilhouette(ctx, f.b);
      drawCat(ctx, f.a, game.time, false);
      drawCat(ctx, f.b, game.time, false);
    }
  }
  drawBowlFront(ctx, b);
  if (k) drawDangerLine(k.lineY, k.overTime);
  fx.draw(ctx);
  if (press.active) {
    // 長押しの溜め: 輪が一周するとかき混ぜ開始（短いタップでは出さない）
    const k = (performance.now() - press.t0 - 80) / (LONG_PRESS_MS - 80);
    if (k > 0) {
      ctx.beginPath();
      ctx.arc(press.x, press.y, Game.STIR_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k));
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  if (game.stir.active) {
    // かき混ぜている指
    const st = game.stir;
    ctx.beginPath();
    ctx.arc(st.x, st.y, Game.STIR_R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
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
  }
  // HUD
  stageNum.textContent = k ? k.score.toLocaleString() : String(game.stage);
}

/** ねこけしの上限ライン。超えている間は赤く点滅し、残り時間のゲージが縮んでいく */
function drawDangerLine(y: number, overTime: number): void {
  const w = game.bowl.openHalfW + 10;
  const warn = Math.min(1, overTime / (game.keshi?.overLimit ?? 3));
  const blink = overTime > 0 ? 0.5 + 0.5 * Math.sin(game.time * 14) : 0;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = overTime > 0 ? `rgba(226,74,74,${0.55 + 0.4 * blink})` : 'rgba(210,120,90,0.35)';
  ctx.beginPath();
  ctx.moveTo(-w, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  if (warn > 0) {
    ctx.setLineDash([]);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(226,74,74,0.85)';
    ctx.beginPath();
    ctx.moveTo(-w * (1 - warn), y - 12);
    ctx.lineTo(w * (1 - warn), y - 12);
    ctx.stroke();
  }
  ctx.restore();
}

layout();
requestAnimationFrame(frame);
// はじめに遊ぶゲームを選ぶ
showMenu(false);

// デバッグ・自動テスト用（__hold(true) でゲームの時間を止め、テストから1フレームずつ進められる）
(window as unknown as { __game: Game }).__game = game;
(window as unknown as { __hold: (v: boolean) => void }).__hold = (v) => {
  testHold = v;
};
