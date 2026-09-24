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
  | 'vase'
  | 'sCurve'
  | 'crank'
  | 'spiral';

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
  sCurve: 'S字',
  crank: 'クランク',
  spiral: '螺旋',
};

/** 曲がりくねった管の形（現実にはない容器）。中心線に沿って一定の太さの管を作る */
const TUBES: Partial<Record<ShapeKind, { center: () => Pt[]; w: number }>> = {
  sCurve: {
    w: 0.5,
    center: () =>
      smoothProfile(
        [
          { x: 0, y: -1.3 },
          { x: 0, y: -1.05 },
          { x: 0.35, y: -0.78 },
          { x: 0.75, y: -0.45 },
          { x: 0.7, y: -0.12 },
          { x: 0.05, y: 0.12 },
          { x: -0.65, y: 0.4 },
          { x: -0.75, y: 0.75 },
          { x: -0.6, y: 1.0 },
          { x: -0.6, y: 1.15 },
        ],
        10,
      ),
  },
  crank: {
    w: 0.5,
    center: () =>
      densify(
        roundCorners(
          [
            { x: 0, y: -1.3 },
            { x: 0, y: -0.6 },
            { x: 0.9, y: -0.25 },
            { x: 0.9, y: 0.3 },
            { x: 0, y: 0.65 },
            { x: 0, y: 1.15 },
          ],
          0.16,
        ),
        0.05,
      ),
  },
  spiral: {
    w: 0.44,
    // 横から見たらせん: 左右に振れながら下っていく
    center: () =>
      smoothProfile(
        [
          { x: 0, y: -1.2 },
          { x: 0, y: -1.02 },
          { x: 0.42, y: -0.84 },
          { x: 0.62, y: -0.6 },
          { x: 0.3, y: -0.4 },
          { x: -0.35, y: -0.2 },
          { x: -0.6, y: 0.02 },
          { x: -0.3, y: 0.24 },
          { x: 0.35, y: 0.44 },
          { x: 0.6, y: 0.66 },
          { x: 0.35, y: 0.88 },
          { x: 0.2, y: 1.05 },
          { x: 0.2, y: 1.2 },
        ],
        10,
      ),
  },
};

/** 長い直線を細かく分ける（管の壁をなめらかにずらすため） */
function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** 中心線（上から下へ）から管の内壁を作る: 口の左端 → 左の壁 → 平らな底 → 右の壁 → 口の右端 */
function tubeWall(center0: Pt[], w: number): Pt[] {
  // 口と底が水平になるよう、両端にまっすぐ縦の区間を足す
  const first = center0[0];
  const last = center0[center0.length - 1];
  const center = [
    { x: first.x, y: first.y - 0.12 },
    { x: first.x, y: first.y - 0.06 },
    ...center0,
    { x: last.x, y: last.y + 0.06 },
    { x: last.x, y: last.y + 0.12 },
  ];
  const n = center.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = center[Math.max(0, k - 1)];
    const b = center[Math.min(n - 1, k + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / l;
    const ty = (b.y - a.y) / l;
    // 下向きに進むとき x が負の側が「左」
    const nx = -ty;
    const ny = tx;
    left.push({ x: center[k].x + (nx * w) / 2, y: center[k].y + (ny * w) / 2 });
    right.push({ x: center[k].x - (nx * w) / 2, y: center[k].y - (ny * w) / 2 });
  }
  return [...removeLoops(left), ...removeLoops(right).reverse()];
}

/** 急なカーブの内側で、ずらした壁が小さなループを作るので切り取る */
function removeLoops(pts: Pt[]): Pt[] {
  const out = pts.slice();
  const cross = (a: Pt, b: Pt, c: Pt, d: Pt): Pt | null => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const q = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * q.y - r.y * q.x;
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c.x - a.x) * q.y - (c.y - a.y) * q.x) / den;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + r.x * t, y: a.y + r.y * t } : null;
  };
  for (let i = 0; i < out.length - 3; i++) {
    for (let j = Math.min(out.length - 2, i + 60); j >= i + 2; j--) {
      const p = cross(out[i], out[i + 1], out[j], out[j + 1]);
      if (p) {
        out.splice(i + 1, j - i, p);
        break;
      }
    }
  }
  return out;
}

export const isTube = (kind: ShapeKind) => kind in TUBES;

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
    default:
      // 管の形は tubeWall で作る
      return rightHalf({ kind: 'fishbowl', variant: v });
  }
}

/** 形と目標容量から容器を作る（x=0 中心、上下の中央が y=0） */
export function buildContainer(spec: ShapeSpec, targetArea: number): Container {
  const tube = TUBES[spec.kind];
  let wall0: Pt[];
  if (tube) {
    wall0 = tubeWall(tube.center(), tube.w);
  } else {
    const right = rightHalf(spec);
    const left = right
      .slice(1)
      .reverse()
      .map((p) => ({ x: -p.x, y: p.y }));
    wall0 = [...left, ...right];
  }
  let A = 0;
  for (let k = 0; k < wall0.length; k++) {
    const p = wall0[k];
    const q = wall0[(k + 1) % wall0.length];
    A += p.x * q.y - q.x * p.y;
  }
  let s = Math.sqrt(targetArea / Math.abs(A / 2));
  // 管は猫が通り抜けられる太さに（容量よりも太さを優先）
  if (tube) s = Math.min(Math.max(s, TUBE_MIN_W / tube.w), TUBE_MAX_W / tube.w);
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

/**
 * ねこみつのクリア条件（充填率 = 猫の面積 ÷ 口までの容量）。
 * 猫どうしの隙間は数えないので、同じ「口から少し盛り上がるくらい」でも形によって値が違う。
 * 1匹ずつ落として山が落ち着くのを待つシミュレーションで、
 * 山のてっぺんが口の上 45px（猫の半分くらい）に届いたときの充填率を形ごとに測り、その中央値から決めた。
 */
export const FILL_GOALS: Record<ShapeKind, number> = {
  // 形: 中央値（口に届いたとき → 口の上45pxまで盛ったとき）から、盛った値の少し手前に設定
  fishbowl: 0.94, // 85 → 96
  wideBowl: 0.8, // 75 → 82（広く浅いので、薄く積むだけで口より上に出る）
  beaker: 0.97, // 89 → 99
  flask: 0.97, // 93 → 101
  roundFlask: 0.95, // 91 → 97
  hexagon: 0.94, // 90 → 96
  diamond: 0.93, // 84 → 95
  hourglass: 0.96, // 84 → 98
  vase: 0.95, // 91 → 97
  sCurve: 0.93, // 95 → 95（管は口が細く、盛っても量がほとんど増えない）
  crank: 0.93, // 92 → 95
  spiral: 0.94, // 94 → 96
};

/** 管の太さ（ワールド座標）。猫1匹より少し太い */
const TUBE_MIN_W = 175;
const TUBE_MAX_W = 215;

/** 金魚鉢 R=215 相当の容量 */
export const BASE_AREA = 2.45 * 215 * 215;

/**
 * ステージの容器。1面は金魚鉢、そのあとはフラスコやビーカー、幾何学形、
 * 現実にはない曲がりくねった管（S字・クランク・螺旋）…と毎回変わる。
 * 大きさ（容量）はだんだん大きくなる。
 */
export function stageShape(stage: number): { spec: ShapeSpec; area: number; goal: number } {
  // 金魚鉢は1面だけ。そのあとは毎回ちがう形
  const fixed: ShapeSpec[] = [
    { kind: 'fishbowl', variant: 0.5 },
    { kind: 'beaker' },
    { kind: 'flask' },
    { kind: 'wideBowl' },
    { kind: 'hexagon' },
    { kind: 'roundFlask' },
    { kind: 'hourglass' },
    { kind: 'diamond' },
    { kind: 'vase' },
    { kind: 'sCurve' },
    { kind: 'crank' },
    { kind: 'spiral' },
  ];
  // 容量はだんだん大きく（上限あり）。後半は少しランダムに揺らす
  const growth = Math.min(2.1, 1 + 0.13 * (stage - 1));
  if (stage <= fixed.length) return { spec: fixed[stage - 1], area: BASE_AREA * growth, goal: FILL_GOALS[fixed[stage - 1].kind] };
  // 全部見終わったら、金魚鉢（縦横比いろいろ）も含めて均等にランダム
  const kinds = Object.keys(SHAPE_NAMES) as ShapeKind[];
  const spec: ShapeSpec = { kind: kinds[Math.floor(Math.random() * kinds.length)], variant: Math.random() };
  return { spec, area: BASE_AREA * growth * (0.85 + Math.random() * 0.25), goal: FILL_GOALS[spec.kind] };
}
