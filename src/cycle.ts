/**
 * ねこみつの周（12面）ごとの移り変わり: 容器の素材・一日の時間（朝 → 昼 → 夕方 → 夜）。
 * どれも見た目だけで、物理には関わらない。
 */
import { CYCLE, isTube, type ShapeKind } from './physics/shapes';
import type { ThemeKey } from './render/themes';

/** 容器の素材 */
export type Vessel = 'glass' | 'oke' | 'kago' | 'danbo' | 'donabe';

/** テーマごとの容器（細い管はどのテーマでもガラス） */
const VESSEL: Partial<Record<ThemeKey, Vessel>> = {
  garden: 'oke',
  meadow: 'kago',
  rooftop: 'danbo',
  kotatsu: 'donabe',
};

export function vesselFor(theme: ThemeKey, kind: string): Vessel {
  if (isTube(kind as ShapeKind)) return 'glass';
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

/** 夕方〜夜（ホタルなどに使う） */
export const isDusk = (stage: number) => (stage - 1) % CYCLE >= 7;
