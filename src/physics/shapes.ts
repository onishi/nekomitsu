/**
 * 容器の形。右半分の内壁（底の中心 → 口の右端）を単位サイズで作り、
 * 左右対称にしてから目標の容量になるよう拡大する。
 */
import { Container, type Pt } from './container';

export type ShapeKind =
  | 'fishbowl'
  | 'wideBowl'
  | 'beaker'
  | 'flask'
  | 'roundFlask'
  | 'hexagon'
  | 'diamond'
  | 'hourglass'
  | 'vase';

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  fishbowl: '金魚鉢',
  wideBowl: 'どんぶり',
  beaker: 'ビーカー',
  flask: '三角フラスコ',
  roundFlask: '丸底フラスコ',
  hexagon: '六角形',
  diamond: 'ひし形',
  hourglass: '砂時計',
  vase: '花瓶',
};

export interface ShapeSpec {
  kind: ShapeKind;
  /** 金魚鉢の縦横比など、形ごとの変化（0..1） */
  variant?: number;
}

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Pt[] => {
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
};

/** 滑らかな輪郭: 制御点を Catmull-Rom で補間 */
const smoothProfile = (ctrl: Pt[], perSeg = 8): Pt[] => {
  const out: Pt[] = [];
  const n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(ctrl[n - 1]);
  return out;
};

/** 角を丸めた折れ線（幾何学形の角が鋭すぎないように） */
const roundCorners = (pts: Pt[], rad: number): Pt[] => {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const la = Math.hypot(a.x - b.x, a.y - b.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(rad, la * 0.45, lc * 0.45);
    const p = { x: b.x + ((a.x - b.x) / la) * r, y: b.y + ((a.y - b.y) / la) * r };
    const q = { x: b.x + ((c.x - b.x) / lc) * r, y: b.y + ((c.y - b.y) / lc) * r };
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      // 二次ベジェで角をなめらかに
      out.push({
        x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * b.x + t * t * q.x,
        y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * b.y + t * t * q.y,
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

/** 右半分の内壁（底の中心 x=0 から口の右端まで、y 下向き） */
function rightHalf(spec: ShapeSpec): Pt[] {
  const v = spec.variant ?? 0.5;
  switch (spec.kind) {
    case 'fishbowl': {
      // 円を上下でカットした典型的な金魚鉢。variant で縦横比と口の広さが変わる
      const sy = 0.88 + 0.26 * v;
      const open = 0.72 - 0.14 * v;
      const bot = 0.84;
      const aBot = Math.asin(bot);
      const aTop = -Math.asin(open);
      return [{ x: 0, y: bot * sy }, ...arc(0, 0, 1, sy, aBot, aTop, 36)];
    }
    case 'wideBowl': {
      // 浅くて広いどんぶり
      const rx = 1.35;
      const ry = 0.95;
      const aBot = Math.asin(0.8);
      return [{ x: 0, y: 0.8 * ry }, ...arc(0, 0, rx, ry, aBot, -0.12, 30)];
    }
    case 'beaker': {
      const w = 0.72;
      return roundCorners(
        [
          { x: 0, y: 0.95 },
          { x: w, y: 0.95 },
          { x: w, y: -1.05 },
        ],
        0.14,
      );
    }
    case 'flask': {
      // 三角フラスコ: 広い底から斜めに細くなって首
      return roundCorners(
        [
          { x: 0, y: 0.85 },
          { x: 1.0, y: 0.85 },
          { x: 0.36, y: -0.55 },
          { x: 0.36, y: -1.05 },
        ],
        0.14,
      );
    }
    case 'roundFlask': {
      // 丸底フラスコ: 球 + 首
      const r = 0.95;
      const cy = 0.1;
      const neck = 0.36;
      const aNeck = -Math.acos(neck / r);
      const flat = 0.22;
      const aBot = Math.asin(Math.sqrt(1 - flat * flat)) ;
      const body = arc(0, cy, r, r, aBot, aNeck, 36);
      return [{ x: 0, y: cy + r * Math.sin(aBot) }, ...body, { x: neck, y: -1.2 }];
    }
    case 'hexagon': {
      const s = 1.02;
      return [
        { x: 0, y: 0.866 * s },
        { x: 0.5 * s, y: 0.866 * s },
        { x: s, y: 0 },
        { x: 0.5 * s, y: -0.866 * s },
      ];
    }
    case 'diamond': {
      // ひし形（上の角は切り落として口にする）
      return roundCorners(
        [
          { x: 0, y: 1.05 },
          { x: 1.0, y: 0 },
          { x: 0.55, y: -0.5 },
        ],
        0.08,
      );
    }
    case 'hourglass': {
      // 砂時計: くびれを猫が液体のように通り抜ける
      const pts: Pt[] = [];
      const waist = 0.3;
      for (let k = 0; k <= 40; k++) {
        const y = 1.05 - (2.1 * k) / 40;
        const u = Math.abs(y) / 1.25;
        const x = waist + 0.62 * Math.pow(Math.sin(Math.PI * u), 0.8);
        pts.push({ x, y });
      }
      return [{ x: 0, y: 1.05 }, ...pts];
    }
    case 'vase': {
      // 花瓶: 下ぶくれ、細い首、口が少し開く
      return [
        { x: 0, y: 1.05 },
        ...smoothProfile(
          [
            { x: 0.5, y: 1.05 },
            { x: 0.85, y: 0.55 },
            { x: 0.88, y: 0.1 },
            { x: 0.55, y: -0.55 },
            { x: 0.42, y: -0.85 },
            { x: 0.52, y: -1.12 },
          ],
          8,
        ),
      ];
    }
  }
}

/** 形と目標容量から容器を作る（x=0 中心、上下の中央が y=0） */
export function buildContainer(spec: ShapeSpec, targetArea: number): Container {
  const right = rightHalf(spec);
  const left = right
    .slice(1)
    .reverse()
    .map((p) => ({ x: -p.x, y: p.y }));
  const wall0 = [...left, ...right];
  let A = 0;
  for (let k = 0; k < wall0.length; k++) {
    const p = wall0[k];
    const q = wall0[(k + 1) % wall0.length];
    A += p.x * q.y - q.x * p.y;
  }
  const s = Math.sqrt(targetArea / Math.abs(A / 2));
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of wall0) {
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const mid = (y0 + y1) / 2;
  return new Container(
    spec.kind,
    wall0.map((p) => ({ x: p.x * s, y: (p.y - mid) * s })),
  );
}

/** 金魚鉢 R=215 相当の容量 */
export const BASE_AREA = 2.45 * 215 * 215;

/**
 * ステージの容器。基本は金魚鉢で、大きさと形が少しずつ変わる。
 * ときどき金魚鉢を逸脱して、フラスコやビーカー、幾何学形になる。
 */
export function stageShape(stage: number): { spec: ShapeSpec; area: number } {
  const fixed: ShapeSpec[] = [
    { kind: 'fishbowl', variant: 0.5 },
    { kind: 'fishbowl', variant: 0.1 },
    { kind: 'beaker' },
    { kind: 'fishbowl', variant: 0.95 },
    { kind: 'flask' },
    { kind: 'wideBowl' },
    { kind: 'hexagon' },
    { kind: 'fishbowl', variant: 0.3 },
    { kind: 'roundFlask' },
    { kind: 'hourglass' },
    { kind: 'fishbowl', variant: 0.7 },
    { kind: 'diamond' },
    { kind: 'vase' },
  ];
  // 容量はだんだん大きく（上限あり）。後半は少しランダムに揺らす
  const growth = Math.min(2.1, 1 + 0.13 * (stage - 1));
  if (stage <= fixed.length) return { spec: fixed[stage - 1], area: BASE_AREA * growth };
  const others: ShapeKind[] = ['wideBowl', 'beaker', 'flask', 'roundFlask', 'hexagon', 'diamond', 'hourglass', 'vase'];
  const spec: ShapeSpec =
    Math.random() < 0.55
      ? { kind: 'fishbowl', variant: Math.random() }
      : { kind: others[Math.floor(Math.random() * others.length)] };
  return { spec, area: BASE_AREA * growth * (0.85 + Math.random() * 0.25) };
}
