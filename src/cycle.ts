/**
 * ねこみつの周（12面）ごとの移り変わり。2周目からは1周を「1日の旅」にして、
 * 朝・昼・夕方・夜に3面ずつ、時間帯に合った場所を巡る（組み合わせは周ごとに変わる）。
 * 周ごとに「特集」（子猫の日・黒猫の日…）もある。
 * 見た目のほか、連鎖あくび・こたつの眠気など猫のふるまいにも使う。
 */
import { CYCLE, isTube, type ShapeKind } from './physics/shapes';
import type { ThemeKey } from './render/themes';

/** 容器の素材 */
export type Vessel = 'glass' | 'oke' | 'kago' | 'danbo' | 'donabe' | 'mug' | 'boot';

/** テーマごとの容器（細い管はどのテーマでもガラス） */
const VESSEL: Partial<Record<ThemeKey, Vessel>> = {
  garden: 'oke',
  meadow: 'kago',
  rooftop: 'danbo',
  kotatsu: 'donabe',
  sento: 'oke',
};

export function vesselFor(theme: ThemeKey, kind: string): Vessel {
  if (isTube(kind as ShapeKind)) return 'glass';
  // マグカップ・長靴はどのテーマでもその素材
  if (kind === 'mug' || kind === 'boot') return kind;
  return VESSEL[theme] ?? 'glass';
}

/** 背景に掛け合わせる（乗算）色（r, g, b, 濃さ） */
export type Tint = [number, number, number, number];

/** 周の中の面（0..11）ごとの時間帯の色: 朝（淡い金色）→ 昼（そのまま）→ 夕方（橙）→ 夜（紺） */
const TOD: Tint[] = [
  [255, 215, 150, 0.22],
  [255, 230, 180, 0.13],
  [255, 240, 210, 0.05],
  [255, 255, 255, 0],
  [255, 255, 255, 0],
  [255, 255, 255, 0],
  [255, 205, 150, 0.14],
  [255, 165, 105, 0.34],
  [235, 130, 115, 0.42],
  [130, 120, 190, 0.5],
  [95, 100, 170, 0.58],
  [80, 88, 160, 0.62],
];

/** 時間帯の色（1周目はいつもの部屋のままにする。もともと暗いテーマは控えめに） */
export function timeTint(stage: number, dark: boolean): Tint {
  if (stage <= CYCLE) return [255, 255, 255, 0];
  const t = TOD[(stage - 1) % CYCLE];
  return [t[0], t[1], t[2], dark ? t[3] * 0.35 : t[3]];
}

/** 周の中の時刻 0..11（0 が朝、11 が夜更け） */
export const hourOf = (stage: number) => (stage - 1) % CYCLE;

/** 決まった乱数 0..1（同じ引数なら毎回同じ） */
function hash01(a: number, b: number): number {
  let t = (a * 0x9e3779b1 + b * 0x85ebca6b + 0x632be5ab) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 時間帯（朝・昼・夕方・夜）ごとに行ける場所 */
const SLOTS: ThemeKey[][] = [
  ['garden', 'sakura', 'meadow'],
  ['beach', 'aquarium', 'autumn'],
  ['rooftop', 'sento', 'rain', 'meadow'],
  ['nightWindow', 'kotatsu', 'space'],
];
/** 2日目（2周目）はおなじみの場所から */
const FIRST_DAY: ThemeKey[] = ['garden', 'beach', 'rooftop', 'nightWindow'];

/** 決まった並べ替え（seed ごとに毎回同じ） */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hash01(seed, 300 + i) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * その周（1 始まり）の1日の旅程: 朝・昼・夕方・夜の場所。
 * 時間帯ごとに、候補の数だけの日数で全部の場所を1回ずつ巡る（並びは毎回変わる）
 */
function dayPlan(cycle: number): ThemeKey[] {
  if (cycle <= 1) return FIRST_DAY;
  const d = cycle - 2;
  const plan: ThemeKey[] = [];
  SLOTS.forEach((opts, slot) => {
    const n = opts.length;
    const order = shuffled(opts, (Math.floor(d / n) + 1) * 16 + slot);
    // 3日目は2日目と同じ場所から始めない（先頭がそうなら最後へ回す）
    if (d < n && order[0] === FIRST_DAY[slot]) order.push(order.shift()!);
    let pick = order[d % n];
    // 同じ日に同じ場所（朝と夕方の草原）にはしない
    if (plan.includes(pick)) pick = order[(d + 1) % n];
    plan.push(pick);
  });
  return plan;
}

/** 面の場所（ねこみつ）。1周目はいつもの部屋、2周目からは3面ごとに場所が変わる */
export function themeKeyForStage(stage: number): ThemeKey {
  if (stage <= CYCLE) return 'room';
  const cycle = Math.floor((stage - 1) / CYCLE);
  return dayPlan(cycle)[Math.floor(hourOf(stage) / 3)];
}

/** 周の特集 */
export type Feature = 'kitten' | 'black' | 'fluffy' | 'long' | 'sleepy' | 'dressup' | 'big';
export const FEATURE_NAMES: Record<Feature, string> = {
  kitten: '子猫の日',
  black: '黒猫の日',
  fluffy: 'ふわふわの日',
  long: '長ネコの日',
  sleepy: 'おねむの日',
  dressup: 'おめかしの日',
  big: '大きな器の日',
};
const FEATURES = Object.keys(FEATURE_NAMES) as Feature[];
/** 特集の数の日ごとに、全部の特集を1回ずつ（並びは毎回変わる。2日目は子猫の日から） */
function featureBlock(block: number): Feature[] {
  const order = FEATURES.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(hash01(block, 200 + i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (block === 0) {
    const k = order.indexOf('kitten');
    [order[0], order[k]] = [order[k], order[0]];
  } else if (order[0] === featureBlock(block - 1)[FEATURES.length - 1]) {
    // 前のひと巡りの最後と同じ特集が続かないように
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}
/** 面の特集（2周目から） */
export function featureForStage(stage: number): Feature | null {
  if (stage <= CYCLE) return null;
  const c = Math.floor((stage - 1) / CYCLE) - 1;
  return featureBlock(Math.floor(c / FEATURES.length))[c % FEATURES.length];
}

/** 何日目か（1周目が1日目） */
export const dayOf = (stage: number) => Math.floor((stage - 1) / CYCLE) + 1;


/** 夜空の星の濃さ（2周目から。夜になるほど濃い） */
export function starAmount(stage: number): number {
  if (stage <= CYCLE) return 0;
  const h = hourOf(stage);
  return h >= 9 ? 1 : h === 8 ? 0.35 : 0;
}

/** ホタル（2周目から、夕方〜夜。夕暮れの草原など） */
export function fireflyAmount(stage: number): number {
  if (stage <= CYCLE) return 0;
  const h = hourOf(stage);
  return h >= 8 ? 1 : h === 7 ? 0.5 : 0;
}
