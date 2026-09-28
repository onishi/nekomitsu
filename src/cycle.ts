/**
 * ねこみつの周（12面）ごとの移り変わり: 容器の素材・一日の時間（朝 → 昼 → 夕方 → 夜）。
 * 見た目のほか、連鎖あくび・こたつの眠気など猫のふるまいにも使う。
 */
import { CYCLE, isTube, type ShapeKind } from './physics/shapes';
import { themeForCycle, type ThemeKey } from './render/themes';

/** 容器の素材 */
export type Vessel = 'glass' | 'oke' | 'kago' | 'danbo' | 'donabe' | 'mug' | 'boot';

/** テーマごとの容器（細い管はどのテーマでもガラス） */
const VESSEL: Partial<Record<ThemeKey, Vessel>> = {
  garden: 'oke',
  meadow: 'kago',
  rooftop: 'danbo',
  kotatsu: 'donabe',
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

/** 面のテーマ（ねこみつ） */
export const themeKeyForStage = (stage: number): ThemeKey => themeForCycle(Math.floor((stage - 1) / CYCLE)).key;

/** 周の中の時刻 0..11（0 が朝、11 が夜更け） */
export const hourOf = (stage: number) => (stage - 1) % CYCLE;

/** 夜空の星の濃さ（2周目から。夜になるほど濃い） */
export function starAmount(stage: number): number {
  if (stage <= CYCLE) return 0;
  const h = hourOf(stage);
  return h >= 9 ? 1 : h === 8 ? 0.35 : 0;
}

/** ホタル（2周目から、夕方〜夜） */
export function fireflyAmount(stage: number): number {
  if (stage <= CYCLE) return 0;
  const h = hourOf(stage);
  return h >= 8 ? 1 : h === 7 ? 0.5 : 0;
}
