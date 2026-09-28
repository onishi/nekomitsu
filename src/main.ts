import './style.css';
import { Game, type GameMode } from './game';
import type { KeshiEvent } from './keshi';
import { drawCat, strokeCatSilhouette } from './render/catRenderer';
import { Effects } from './render/effects';
import { CYCLE } from './physics/shapes';
import { drawBackground, drawBowlBack, drawBowlFront, tableWorldY, type View } from './render/scene';
import { THEMES, type Theme } from './render/themes';
import { dayOf, FEATURE_NAMES, featureForStage, fireflyAmount, hourOf, starAmount, themeKeyForStage, timeTint, vesselFor, type Tint, type Vessel } from './cycle';
import { Petals } from './render/petals';
import { EVENTS, type SceneEvent } from './render/events';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stageNum = $('stageNum');
const hudLabel = $('hudLabel');
const titleBtn = $<HTMLButtonElement>('titleBtn');
const overEl = $('over');
const hint = $('hint');
const bestBox = $('best');
const bestNum = $('bestNum');
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
void game.sound.loadSamples();
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
  const bottom = tableWorldY(b, vessel()) + R * 0.1;
  // 左右非対称の容器（マグカップの取っ手・長靴のつま先）は、容器全体が真ん中に来るようにずらす
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const p of b.wall) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
  }
  const cxw = (x0 + x1) / 2;
  const halfW = Math.max(((x1 - x0) / 2) * 1.06, 200);
  const hudH = 56;
  const scale = Math.min(w / (halfW * 2), (h - hudH) / (bottom - top));
  view.scale = scale;
  view.dpr = dpr;
  view.w = w;
  view.h = h;
  view.ox = w / 2 - cxw * scale;
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
  downInside = game.isInside(wx, wy);
  if (downInside) {
    longTimer = window.setTimeout(startStir, LONG_PRESS_MS);
    Object.assign(press, { active: true, x: wx, y: wy, t0: performance.now() });
  }
});
canvas.addEventListener('pointermove', (e) => {
  lastX = e.clientX;
  lastY = e.clientY;
  if (mode === 'stir') {
    // マウスのボタンがもう押されていない（離したのが伝わらなかった）
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      endPress();
      return;
    }
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
// 指を離したことが伝わらないまま、かき混ぜの指が残らないように
canvas.addEventListener('lostpointercapture', endPress);
window.addEventListener('blur', endPress);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) endPress();
});
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
  petals.clear();
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
/** 隠しモード: オートのボタンを長押しすると倍速（次の猫を落とすまでの間を半分に。落ちる速さは同じ） */
let autoFast = false;
function setAuto(on: boolean, fast = false): void {
  auto = on;
  autoFast = on && fast;
  game.pace = autoFast ? 2 : 1;
  autoAim = null;
  autoTimer = 0.4;
  autoBtn.setAttribute('aria-pressed', String(on));
  autoBtn.classList.toggle('fast', autoFast);
  autoBtn.setAttribute('aria-label', on ? 'オートモードを止める' : 'オートモードにする');
  if (on) hint.classList.add('fade');
}
setAuto(false);
// 長押し（0.6秒）で倍速のオート。長押しのあとのクリックは無視する
let autoPressTimer = 0;
let autoLongPressed = false;
autoBtn.addEventListener('pointerdown', () => {
  autoLongPressed = false;
  clearTimeout(autoPressTimer);
  autoPressTimer = window.setTimeout(() => {
    autoLongPressed = true;
    game.sound.unlock();
    setAuto(true, true);
  }, 600);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) autoBtn.addEventListener(ev, () => clearTimeout(autoPressTimer));
autoBtn.addEventListener('contextmenu', (e) => e.preventDefault());
autoBtn.addEventListener('click', () => {
  if (autoLongPressed) {
    autoLongPressed = false;
    autoBtn.blur();
    return;
  }
  game.sound.unlock();
  setAuto(!auto);
  autoBtn.blur();
});
function updateAuto(dt: number): void {
  if (!auto) return;
  autoTimer -= dt;
  if (game.phase === 'cleared') {
    // クリアの余韻を少し見せてから次の面へ
    // みんな眠ってしまった面は、寝顔を長めに見せる
    const linger = (autoFast ? 1600 : 3200) * (game.clearNap ? 2 : 1);
    if (clearShown && performance.now() - clearShownAt > linger) goNext();
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
    autoTimer = (0.45 + Math.random() * 0.35) / game.pace;
  } else if (game.canDrop) {
    game.drop();
    autoAim = null;
    autoTimer = (0.5 + Math.random() * 0.9) / game.pace;
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
  petals.clear();
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
const clearSub = clearEl.querySelector('.sub');
game.onClear = () => {
  if (clearSub) clearSub.textContent = game.clearNap ? 'みんなおやすみ…' : '猫でいっぱい！';
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
// 桜の公園では、手前にも花びらが舞って猫の上に乗る
const petals = new Petals();
function updateEffects(dt: number): void {
  fx.update(dt);
  const R = game.bowl.R;
  const fall = game.mode !== 'mitsu' ? null : themeNow.key === 'sakura' ? 'petal' : themeNow.key === 'autumn' ? 'leaf' : null;
  petals.update(dt, fall, game.bowl, game.cats, game.world, game.dropY - Math.max(R * 0.38, 90));
  if (game.phase === 'cleared' && game.clearNap && game.cats.length) {
    // みんなおやすみ: ハートの代わりに zzz
    heartTimer -= dt;
    if (heartTimer <= 0) {
      heartTimer = 0.35;
      const c = game.cats[Math.floor(Math.random() * game.cats.length)];
      const h = c.headFrame();
      fx.text(Math.random() < 0.5 ? 'z' : 'Z', h.x + c.species.headR * 0.6, h.y - c.species.headR, 20 + Math.random() * 10, '#7d8cc4', 2);
    }
  } else if (game.phase === 'cleared' && game.time - game.clearTime < 3 && game.cats.length) {
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

// 背景のテーマ: ねこみつは周（12面）ごとに情景が変わり（部屋 → 庭先 → 草原 → 屋根の上 → …）、
// 変わり目では約2.5秒かけてじわっと移り変わる。ねこけしはいつもの部屋
let themeNow: Theme = THEMES.room;
let themePrev: Theme | null = null;
let themeT = 1;
let themeLast = performance.now();
const themeMeta = document.querySelector('meta[name="theme-color"]');
function themeLayers(): { theme: Theme; alpha: number }[] {
  const now = performance.now();
  const dt = Math.min(0.1, (now - themeLast) / 1000);
  themeLast = now;
  const want = game.mode === 'keshi' ? THEMES.room : THEMES[themeKeyForStage(game.stage)];
  if (want !== themeNow) {
    themePrev = themeNow;
    themeNow = want;
    themeT = 0;
    // 画面の外（スクロールの跳ね返りなど）やブラウザの上のバーの色、暗いテーマでのタイトルの色
    document.body.style.background = want.top;
    themeMeta?.setAttribute('content', want.top);
    document.body.classList.toggle('theme-dark', want.dark);
  }
  if (themePrev && themeT < 1) {
    themeT = Math.min(1, themeT + dt / 2.5);
    const e = themeT * themeT * (3 - 2 * themeT);
    return [
      { theme: themePrev, alpha: 1 },
      { theme: themeNow, alpha: e },
    ];
  }
  themePrev = null;
  return [{ theme: themeNow, alpha: 1 }];
}

/** 今の面の容器の素材（ねこみつの周のテーマで決まる。ねこけしはいつもガラス） */
function vessel(): Vessel {
  return game.mode === 'keshi' ? 'glass' : vesselFor(themeKeyForStage(game.stage), game.bowl.kind);
}

// 一日の時間（周の中で朝 → 昼 → 夕方 → 夜）。面が変わると約2.5秒かけて色が移る
const tintNow: Tint = [255, 255, 255, 0];
// 虹: 晴れた外のテーマで、クリアしたときにときどき（次の面へ進むと消えていく）
const RAINBOW_THEMES = new Set(['garden', 'meadow', 'rooftop', 'beach', 'rain', 'autumn']);
// 夜の星（外のテーマ）・ホタル（草原・庭先）
const STAR_THEMES = new Set(['garden', 'meadow', 'rooftop', 'sakura', 'beach', 'autumn']);
const FIREFLY_THEMES = new Set(['garden', 'meadow']);
let stars = 0;
let fireflies = 0;
let rainbow = 0;
let rainbowOn = false;
let rainbowStage = -1;
let ambientLast = performance.now();
function ambient(): { tint: Tint; rainbow: number; stars: number; fireflies: number } {
  const now = performance.now();
  const dt = Math.min(0.1, (now - ambientLast) / 1000);
  ambientLast = now;
  const keshi = game.mode === 'keshi';
  const want = keshi ? ([255, 255, 255, 0] as Tint) : timeTint(game.stage, themeNow.dark);
  const k = 1 - Math.exp(-dt * 1.6);
  // 色の変わり目で白っぽくならないよう、濃さが 0 のときは色だけ先に合わせる
  if (tintNow[3] < 0.005) for (let i = 0; i < 3; i++) tintNow[i] = want[i];
  if (want[3] < 0.005) {
    tintNow[3] += (0 - tintNow[3]) * k;
  } else {
    for (let i = 0; i < 4; i++) tintNow[i] += (want[i] - tintNow[i]) * k;
  }
  if (game.phase === 'cleared' && rainbowStage !== game.stage) {
    rainbowStage = game.stage;
    // 雨の日は、クリアすると雨上がりの虹が出やすい
    rainbowOn = !keshi && RAINBOW_THEMES.has(themeNow.key) && Math.random() < (themeNow.key === 'rain' ? 0.7 : 0.35);
  }
  if (game.phase !== 'cleared') rainbowOn = false;
  rainbow = Math.max(0, Math.min(1, rainbow + (rainbowOn ? dt / 1.5 : -dt / 2)));
  const wantStars = !keshi && STAR_THEMES.has(themeNow.key) ? starAmount(game.stage) : 0;
  const wantFlies = !keshi && FIREFLY_THEMES.has(themeNow.key) ? fireflyAmount(game.stage) : 0;
  stars += (wantStars - stars) * k;
  fireflies += (wantFlies - fireflies) * k;
  return { tint: tintNow, rainbow, stars, fireflies };
}

// 背景の出来事（猫じゃらし・すずめ・流星群・雷・UFO…）: ねこみつで、25〜50秒に1回くらい
let sceneEv: { e: SceneEvent; t0: number } | null = null;
let sceneEvNext = performance.now() / 1000 + 12 + Math.random() * 12;
function startSceneEvent(e: SceneEvent): void {
  const now = performance.now() / 1000;
  sceneEv = { e, t0: now };
  if (e.sound) game.sound.ambient(e.sound);
  if (e.spook) for (const c of game.cats) c.spook();
  if (e.gust) petals.gust(e.gust, 22, game.bowl, game.dropY - Math.max(game.bowl.R * 0.38, 90));
}
function updateSceneEvent(gy: number): void {
  const now = performance.now() / 1000;
  if (sceneEv) {
    const p = (now - sceneEv.t0) / sceneEv.e.dur;
    if (p >= 1 || themePrev || game.mode !== 'mitsu') {
      sceneEv = null;
      game.attention = null;
      sceneEvNext = now + 25 + Math.random() * 25;
      return;
    }
    const f = sceneEv.e.focus?.(view, gy, p, now) ?? null;
    game.attention = f ? { x: (f.x - view.ox) / view.scale, y: (f.y - view.oy) / view.scale } : null;
  } else if (now > sceneEvNext && !paused && !themePrev && game.mode === 'mitsu') {
    const list = EVENTS[themeNow.key];
    startSceneEvent(list[Math.floor(Math.random() * list.length)]);
  }
}

// 1日の旅（2周目から）: 日の始まりに「2日目・子猫の日」、場所が変わるたびに「昼・海辺」の札を少し出す
const dayBanner = $('dayBanner');
const dayLine = dayBanner.querySelector('.day')!;
const placeLine = dayBanner.querySelector('.place')!;
const SLOT_NAMES = ['朝', '昼', '夕方', '夜'];
let bannerStage = 0;
let bannerTimer = 0;
function updateDayBanner(): void {
  if (game.mode !== 'mitsu' || game.stage === bannerStage) return;
  const first = bannerStage === 0;
  bannerStage = game.stage;
  const st = game.stage;
  if (st <= CYCLE) return;
  const h = hourOf(st);
  // 新しい場所に着いたとき（途中の面から始めたときも）
  if (h % 3 !== 0 && !first) return;
  const f = featureForStage(st);
  dayLine.textContent = h === 0 || first ? `${dayOf(st)}日目${f ? ` ・ ${FEATURE_NAMES[f]}` : ''}` : '';
  placeLine.textContent = `${SLOT_NAMES[Math.floor(h / 3)]} ・ ${THEMES[themeKeyForStage(st)].name}`;
  dayBanner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => dayBanner.classList.remove('show'), 3500);
}

function render(): void {
  updateDayBanner();
  const b = game.bowl;
  const ves = vessel();
  const amb = ambient();
  const now = performance.now() / 1000;
  drawBackground(ctx, view, b, themeLayers(), now, { vessel: ves, ...amb });
  const gyScreen = view.oy + tableWorldY(b, ves) * view.scale;
  updateSceneEvent(gyScreen);
  const drawEv = (front: boolean) => {
    const f = sceneEv && (front ? sceneEv.e.drawFront : sceneEv.e.draw);
    if (!sceneEv || !f) return;
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    f.call(sceneEv.e, ctx, view, gyScreen, (now - sceneEv.t0) / sceneEv.e.dur, now);
    ctx.restore();
  };
  drawEv(false);
  ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, view.ox * view.dpr, view.oy * view.dpr);
  drawBowlBack(ctx, b, ves);
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
  petals.draw(ctx);
  drawBowlFront(ctx, b, ves);
  drawEv(true);
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
  // ねこけしのハイスコア（画面下。操作ヒントが消えてから出す。更新中は色を変える）
  const bestVal = k ? k.best : 0;
  bestBox.classList.toggle('show', !!k && bestVal > 0 && hint.classList.contains('fade'));
  bestBox.classList.toggle('new', !!k && k.newBest);
  const bestText = bestVal.toLocaleString();
  if (bestNum.textContent !== bestText) bestNum.textContent = bestText;
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
(window as unknown as { __view: View }).__view = view;
// 背景の出来事をすぐ起こす（動作確認用。名前を省くと今のテーマの最初の出来事）
(window as unknown as { __event: (name?: string) => string }).__event = (name) => {
  const list = EVENTS[themeNow.key];
  const e = list.find((x) => x.name === name) ?? list[0];
  startSceneEvent(e);
  return e.name;
};
(window as unknown as { __hold: (v: boolean) => void }).__hold = (v) => {
  testHold = v;
};
