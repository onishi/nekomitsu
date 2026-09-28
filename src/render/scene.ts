/** 背景・容器（金魚鉢・フラスコ…）の描画 */
import type { Theme } from './themes';
import type { Container, Pt } from '../physics/container';
import type { Tint, Vessel } from '../cycle';
import { hexA, shade } from './catRenderer';

const TAU = Math.PI * 2;

export interface View {
  scale: number;
  ox: number;
  oy: number;
  dpr: number;
  w: number;
  h: number;
}

/** 画面いっぱいの背景（スクリーン座標） */
/**
 * 背景（テーマの情景）と容器の影。layers は下から順に描くテーマ（切り替え中は前のテーマの上に次のテーマを重ねて、じわっと移る）
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  v: View,
  bowl: Container,
  layers: { theme: Theme; alpha: number }[],
  t: number,
  vessel: Vessel = 'glass',
  tint: Tint = [255, 255, 255, 0],
  rainbow = 0,
): void {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  const tableY = v.oy + tableWorldY(bowl, vessel) * v.scale;
  for (const { theme, alpha } of layers) {
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    theme.draw(ctx, v, tableY, t);
    ctx.restore();
  }
  if (rainbow > 0) drawRainbow(ctx, v, tableY, rainbow);
  // 時間帯の色（朝・夕方・夜）
  if (tint[3] > 0.002) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0},${tint[3]})`;
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.restore();
  }
  // 容器の影
  ctx.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.ox * v.dpr, v.oy * v.dpr);
  const sy = tableWorldY(bowl, vessel);
  const sw = Math.max(bowl.bottomHalfW * 1.6, Math.min(bowl.halfW * 0.6, bowl.R * 0.9));
  const scx = bowl.bottomCX;
  const sg = ctx.createRadialGradient(scx, sy, 0, scx, sy, sw);
  sg.addColorStop(0, 'rgba(70,40,20,0.28)');
  sg.addColorStop(1, 'rgba(70,40,20,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(scx, sy, sw, bowl.R * 0.1, 0, 0, TAU);
  ctx.fill();
}

const glassThickness = (b: Container) => Math.max(6, b.R * 0.028);
/** 底が平らでない容器（丸底・ひし形）はコルクの台に載せる */
const needsStand = (b: Container) => b.bottomHalfW < b.R * 0.15;

/** テーブルの高さ（ワールド座標） */
export function tableWorldY(b: Container, vessel: Vessel = 'glass'): number {
  if (needsStand(b)) return b.bottomY + b.R * 0.1;
  return b.bottomY + (vessel === 'glass' ? glassThickness(b) * 1.6 : matThickness(b, vessel));
}

/** 虹（クリアのあとにときどき）。空の高いところに大きな弧 */
function drawRainbow(ctx: CanvasRenderingContext2D, v: View, gy: number, a: number): void {
  const cx = v.w * 0.5;
  const r = Math.max(v.w * 0.62, gy * 0.9);
  const cy = gy * 0.95 + r * 0.25;
  const band = Math.max(5, r * 0.022);
  const cols = ['#ff6f6f', '#ffa65c', '#ffe066', '#7fd87f', '#6fb7ff', '#8f7fe8'];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, v.w, gy);
  ctx.clip();
  ctx.globalAlpha = 0.42 * a;
  ctx.lineWidth = band + 0.8;
  cols.forEach((c, k) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r - k * band, Math.PI, TAU);
    ctx.strokeStyle = c;
    ctx.stroke();
  });
  ctx.restore();
}

/** 内壁を外側（ガラス側）へ d だけずらした折れ線 */
function offsetWall(b: Container, d: number): Pt[] {
  const w = b.wall;
  const n = w.length;
  // 口の左端 → 底 → 口の右端 の順なので、進行方向の右手が外側
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = w[Math.max(0, k - 1)];
    const c = w[Math.min(n - 1, k + 1)];
    let nx = -(c.y - a.y);
    let ny = c.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    out.push({ x: w[k].x + nx * d, y: w[k].y + ny * d });
  }
  return out;
}

/** 折れ線の一部（長さの割合 t0..t1）を取り出す */
function subPath(pts: Pt[], t0: number, t1: number): Pt[] {
  let total = 0;
  const acc = [0];
  for (let k = 1; k < pts.length; k++) {
    total += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    acc.push(total);
  }
  const at = (t: number): Pt => {
    const L = t * total;
    let k = 1;
    while (k < pts.length - 1 && acc[k] < L) k++;
    const seg = acc[k] - acc[k - 1] || 1;
    const u = (L - acc[k - 1]) / seg;
    return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * u, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * u };
  };
  const out: Pt[] = [at(t0)];
  for (let k = 0; k < pts.length; k++) if (acc[k] > t0 * total && acc[k] < t1 * total) out.push(pts[k]);
  out.push(at(t1));
  return out;
}

function polyline(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
}

function interiorPath(ctx: CanvasRenderingContext2D, b: Container): void {
  ctx.beginPath();
  polyline(ctx, b.wall);
  ctx.closePath();
}

/** 猫より奥に描く部分 */
export function drawBowlBack(ctx: CanvasRenderingContext2D, bowl: Container, vessel: Vessel = 'glass'): void {
  if (vessel !== 'glass') return matBack(ctx, bowl, vessel);
  const R = bowl.R;
  const mid = (bowl.openY + bowl.bottomY) / 2;
  interiorPath(ctx, bowl);
  const g = ctx.createRadialGradient(-R * 0.2, mid - R * 0.1, R * 0.2, 0, mid, Math.max(R, bowl.halfW));
  g.addColorStop(0, 'rgba(225,242,246,0.10)');
  g.addColorStop(1, 'rgba(170,215,228,0.28)');
  ctx.fillStyle = g;
  ctx.fill();
  // 口の奥側の縁
  const ry = Math.max(6, bowl.openHalfW * 0.13);
  ctx.beginPath();
  ctx.ellipse(0, bowl.openY, bowl.openHalfW + 4, ry, 0, Math.PI, TAU);
  ctx.strokeStyle = 'rgba(150,200,215,0.55)';
  ctx.lineWidth = 5;
  ctx.stroke();
  // 底のガラス（奥側）
  if (!needsStand(bowl)) {
    ctx.beginPath();
    ctx.ellipse(bowl.bottomCX, bowl.bottomY, bowl.bottomHalfW, Math.max(4, bowl.bottomHalfW * 0.1), 0, Math.PI, TAU);
    ctx.strokeStyle = 'rgba(150,200,215,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** 猫より手前に描く部分（ガラスの輪郭・反射・屈折っぽい縁） */
export function drawBowlFront(ctx: CanvasRenderingContext2D, bowl: Container, vessel: Vessel = 'glass'): void {
  if (vessel !== 'glass') return matFront(ctx, bowl, vessel);
  const R = bowl.R;
  const gt = glassThickness(bowl);
  const yo = bowl.openY;
  const yb = bowl.bottomY;
  const mid = (yo + yb) / 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 屈折っぽい縁: 内面付近をほんのり色付け（壁を太い半透明線で重ね塗り）
  ctx.save();
  interiorPath(ctx, bowl);
  ctx.clip();
  for (const [wd, a] of [
    [R * 0.34, 0.05],
    [R * 0.16, 0.07],
    [R * 0.06, 0.1],
  ] as [number, number][]) {
    ctx.beginPath();
    polyline(ctx, bowl.wall);
    ctx.strokeStyle = `rgba(130,190,208,${a})`;
    ctx.lineWidth = wd;
    ctx.stroke();
  }
  // 窓の映り込み（大きく淡い）
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-bowl.halfW * 0.42, mid - R * 0.18, R * 0.16, R * 0.42, 0.35, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-bowl.halfW * 0.17, mid - R * 0.36, R * 0.06, R * 0.24, 0.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ガラス本体
  const side = (d: number, style: string, width: number) => {
    ctx.beginPath();
    polyline(ctx, offsetWall(bowl, d));
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  side(gt / 2, 'rgba(190,228,238,0.42)', gt);
  side(gt, 'rgba(95,150,170,0.55)', 1.6);
  side(0, 'rgba(255,255,255,0.55)', 1.2);

  if (needsStand(bowl)) {
    drawStand(ctx, bowl);
  } else {
    // 底（厚いガラス）
    const xb = bowl.bottomHalfW;
    const bx = bowl.bottomCX;
    ctx.beginPath();
    ctx.moveTo(bx - xb, yb);
    ctx.lineTo(bx + xb, yb);
    ctx.lineTo(bx + xb * 0.98, yb + gt * 1.6);
    ctx.lineTo(bx - xb * 0.98, yb + gt * 1.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(185,225,235,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(95,150,170,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // ハイライト（内壁に沿った白い反射）
  const inner = offsetWall(bowl, -R * 0.07);
  const hl = (t0: number, t1: number, style: string, width: number) => {
    ctx.beginPath();
    polyline(ctx, subPath(inner, t0, t1));
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  hl(0.07, 0.2, 'rgba(255,255,255,0.7)', R * 0.035);
  hl(0.23, 0.26, 'rgba(255,255,255,0.7)', R * 0.02);
  hl(0.7, 0.78, 'rgba(255,255,255,0.45)', R * 0.018);
  hl(0.86, 0.9, 'rgba(255,255,255,0.35)', R * 0.012);

  // 口の縁（手前側）
  const ry = Math.max(6, bowl.openHalfW * 0.13);
  ctx.beginPath();
  ctx.ellipse(0, yo, bowl.openHalfW + gt * 0.6, ry, 0, 0, Math.PI);
  ctx.strokeStyle = 'rgba(200,235,244,0.75)';
  ctx.lineWidth = gt * 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, yo, bowl.openHalfW + gt * 0.6, ry, 0, 0, TAU);
  ctx.strokeStyle = 'rgba(95,150,170,0.55)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, yo - 1.5, bowl.openHalfW, ry * 0.8, 0, Math.PI * 0.15, Math.PI * 0.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 丸底・ひし形の容器を載せるコルクの台 */
function drawStand(ctx: CanvasRenderingContext2D, bowl: Container): void {
  const R = bowl.R;
  const yb = bowl.bottomY;
  const sy = yb + R * 0.02;
  const sw = R * 0.32;
  ctx.beginPath();
  ctx.ellipse(bowl.bottomCX, sy + R * 0.03, sw, R * 0.07, 0, 0, TAU);
  ctx.fillStyle = '#b98a58';
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,55,30,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(bowl.bottomCX, sy, sw * 0.62, R * 0.035, 0, 0, TAU);
  ctx.fillStyle = 'rgba(90,55,30,0.35)';
  ctx.fill();
}

// --- ガラス以外の容器（木の桶・かご・段ボール・土鍋）---
// 中の猫が見えるように、手前の壁は取り払った断面のように描く（奥の内壁・左右と底の壁の厚み・口の縁）

interface Mat {
  /** 壁の厚み（R に対する割合） */
  t: number;
  /** 壁の断面 */
  outer: string;
  /** 奥の内壁 */
  inner: string;
  /** 輪郭 */
  edge: string;
}

const MAT: Record<Exclude<Vessel, 'glass'>, Mat> = {
  oke: { t: 0.055, outer: '#c4925c', inner: '#e2bf8a', edge: '#7a5230' },
  kago: { t: 0.05, outer: '#c9a066', inner: '#e0c08a', edge: '#86602f' },
  danbo: { t: 0.034, outer: '#c99d63', inner: '#dcb680', edge: '#8a643a' },
  donabe: { t: 0.06, outer: '#5e3d2c', inner: '#efe3cb', edge: '#2e1c13' },
};

function matThickness(b: Container, vessel: Vessel): number {
  return vessel === 'glass' ? glassThickness(b) : Math.max(8, b.R * MAT[vessel].t);
}

/** 決まった乱数（同じ i なら毎回同じ） */
const hash = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 折れ線に沿って step ごとの点と外向きの法線 */
function walk(pts: Pt[], step: number): { x: number; y: number; nx: number; ny: number }[] {
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const c = pts[k];
    const L = Math.hypot(c.x - a.x, c.y - a.y);
    if (L < 1e-6) continue;
    const nx = -(c.y - a.y) / L;
    const ny = (c.x - a.x) / L;
    let d = carry;
    while (d < L) {
      out.push({ x: a.x + ((c.x - a.x) * d) / L, y: a.y + ((c.y - a.y) * d) / L, nx, ny });
      d += step;
    }
    carry = d - L;
  }
  return out;
}

function matBack(ctx: CanvasRenderingContext2D, b: Container, vessel: Exclude<Vessel, 'glass'>): void {
  const m = MAT[vessel];
  const R = b.R;
  const T = matThickness(b, vessel);
  const yo = b.openY;
  const yb = b.bottomY;
  const hw = b.halfW;
  interiorPath(ctx, b);
  ctx.fillStyle = m.inner;
  ctx.fill();
  ctx.save();
  interiorPath(ctx, b);
  ctx.clip();
  if (vessel === 'oke') {
    // 板（縦の継ぎ目）とタガ
    const st = Math.max(16, R * 0.17);
    ctx.strokeStyle = 'rgba(120,78,40,0.3)';
    ctx.lineWidth = 1.5;
    for (let x = -Math.floor(hw / st) * st; x <= hw; x += st) {
      ctx.beginPath();
      ctx.moveTo(x, yo - 10);
      ctx.lineTo(x, yb + 10);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(150,135,110,0.45)';
    const hh = Math.max(4, R * 0.035);
    for (const f of [0.2, 0.8]) ctx.fillRect(-hw - 10, yo + (yb - yo) * f - hh / 2, hw * 2 + 20, hh);
  } else if (vessel === 'kago') {
    // 編み目
    const rh = Math.max(9, R * 0.075);
    const cw = rh * 1.7;
    let row = 0;
    for (let y = yo - rh; y < yb + rh; y += rh, row++) {
      const off = (row % 2) * cw * 0.5;
      for (let x = -hw - cw + off; x < hw + cw; x += cw) {
        ctx.beginPath();
        ctx.ellipse(x, y + rh / 2, cw * 0.44, rh * 0.4, 0, 0, TAU);
        ctx.fillStyle = 'rgba(245,215,160,0.4)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125,85,40,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  } else if (vessel === 'danbo') {
    // 波板の筋（ほんのり）と奥の角の影
    const st = Math.max(6, R * 0.05);
    ctx.strokeStyle = 'rgba(120,85,45,0.08)';
    ctx.lineWidth = st * 0.45;
    for (let x = -Math.floor(hw / st) * st; x <= hw; x += st) {
      ctx.beginPath();
      ctx.moveTo(x, yo - 10);
      ctx.lineTo(x, yb + 10);
      ctx.stroke();
    }
  } else {
    // 土鍋の内側: 土の粒
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = hash(i, 3) < 0.5 ? 'rgba(120,90,60,0.22)' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(-hw + hash(i, 1) * hw * 2, yo + hash(i, 2) * (yb - yo), 0.8 + hash(i, 4) * 1.4, 0, TAU);
      ctx.fill();
    }
  }
  // 奥行き: 口の縁の下の影と、壁ぎわの陰り
  const dg = ctx.createLinearGradient(0, yo, 0, yo + (yb - yo) * 0.35);
  dg.addColorStop(0, 'rgba(70,40,20,0.3)');
  dg.addColorStop(1, 'rgba(70,40,20,0)');
  ctx.fillStyle = dg;
  ctx.fillRect(-hw - 20, yo - 20, hw * 2 + 40, (yb - yo) * 0.4 + 20);
  ctx.beginPath();
  polyline(ctx, b.wall);
  ctx.strokeStyle = 'rgba(70,40,20,0.12)';
  ctx.lineWidth = R * 0.2;
  ctx.stroke();
  ctx.restore();
  // 口の奥側の縁
  const ry = Math.max(6, b.openHalfW * 0.13);
  ctx.beginPath();
  ctx.ellipse(0, yo, b.openHalfW + T / 2, ry, 0, Math.PI, TAU);
  ctx.strokeStyle = m.outer;
  ctx.lineWidth = T * 0.8;
  ctx.stroke();
  ctx.strokeStyle = m.edge;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function matFront(ctx: CanvasRenderingContext2D, b: Container, vessel: Exclude<Vessel, 'glass'>): void {
  const m = MAT[vessel];
  const R = b.R;
  const T = matThickness(b, vessel);
  const yo = b.openY;
  const yb = b.bottomY;
  const hw = b.halfW;
  const outerWall = offsetWall(b, T);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const bandPath = () => {
    ctx.beginPath();
    polyline(ctx, b.wall);
    for (let k = outerWall.length - 1; k >= 0; k--) ctx.lineTo(outerWall[k].x, outerWall[k].y);
    ctx.closePath();
  };
  const along = (d: number, style: string, width: number) => {
    ctx.beginPath();
    polyline(ctx, offsetWall(b, d));
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  // 段ボールのふた（外へ開いた左右のフラップ）: 壁より奥に見えるので先に描く
  const ry = Math.max(6, b.openHalfW * 0.13);
  if (vessel === 'danbo') {
    const L = Math.min(R * 0.42, b.openHalfW * 0.75);
    for (const s of [-1, 1]) {
      const x0 = s * (b.openHalfW + T * 0.3);
      ctx.beginPath();
      ctx.moveTo(x0, yo + ry * 0.3);
      ctx.lineTo(x0 + s * L * 0.85, yo - L * 0.3);
      ctx.lineTo(x0 + s * L * 0.78, yo - L * 0.3 - ry * 1.6);
      ctx.lineTo(x0 - s * T * 0.2, yo - ry * 1.1);
      ctx.closePath();
      ctx.fillStyle = '#d4aa70';
      ctx.fill();
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  bandPath();
  ctx.fillStyle = m.outer;
  ctx.fill();
  ctx.save();
  bandPath();
  ctx.clip();
  if (vessel === 'oke') {
    along(T * 0.35, 'rgba(110,70,35,0.28)', 1);
    along(T * 0.7, 'rgba(110,70,35,0.22)', 1);
    // タガ（竹の輪）
    const hh = Math.max(5, R * 0.045);
    ctx.fillStyle = '#8d7a45';
    for (const f of [0.2, 0.8]) ctx.fillRect(-hw - T * 2, yo + (yb - yo) * f - hh / 2, hw * 2 + T * 4, hh);
  } else if (vessel === 'kago') {
    const st = Math.max(5, T * 0.55);
    ctx.lineWidth = 1.3;
    for (const dir of [1, -1]) {
      ctx.strokeStyle = dir > 0 ? 'rgba(110,72,32,0.35)' : 'rgba(255,235,190,0.35)';
      for (let x = -hw - (yb - yo) - T * 2; x < hw + (yb - yo) + T * 2; x += st) {
        ctx.beginPath();
        ctx.moveTo(x, yo - T * 2);
        ctx.lineTo(x + dir * (yb - yo + T * 4), yb + T * 2);
        ctx.stroke();
      }
    }
  } else if (vessel === 'danbo') {
    // 断面の波（中しん）
    along(T * 0.14, 'rgba(120,85,45,0.55)', 1);
    along(T * 0.86, 'rgba(120,85,45,0.55)', 1);
    const pts = walk(offsetWall(b, T / 2), Math.max(3, T * 0.55));
    ctx.beginPath();
    pts.forEach((p, k) => {
      const o = (k % 2 ? 1 : -1) * T * 0.32;
      if (k) ctx.lineTo(p.x + p.nx * o, p.y + p.ny * o);
      else ctx.moveTo(p.x + p.nx * o, p.y + p.ny * o);
    });
    ctx.strokeStyle = 'rgba(120,85,45,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    // 釉薬のつや
    along(T * 0.62, 'rgba(255,230,200,0.14)', T * 0.3);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = 'rgba(255,240,220,0.25)';
      ctx.beginPath();
      ctx.arc(-hw - T + hash(i, 5) * (hw + T) * 2, yo + hash(i, 6) * (yb - yo + T), 0.6 + hash(i, 7), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  // 輪郭
  along(0, m.edge, 1.4);
  along(T, m.edge, 1.4);

  // 土鍋の取っ手
  if (vessel === 'donabe') {
    const hy = yo + Math.min(R * 0.14, (yb - yo) * 0.2);
    for (const s of [-1, 1]) {
      let p = outerWall[s < 0 ? 0 : outerWall.length - 1];
      for (const q of outerWall) if (Math.sign(q.x) === s && Math.abs(q.y - hy) < Math.abs(p.y - hy)) p = q;
      ctx.beginPath();
      ctx.ellipse(p.x + s * R * 0.05, p.y, R * 0.085, R * 0.04, 0, 0, TAU);
      ctx.fillStyle = m.outer;
      ctx.fill();
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(p.x + s * R * 0.06, p.y - R * 0.012, R * 0.05, R * 0.012, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,230,200,0.22)';
      ctx.fill();
    }
  }

  // 口の縁の厚み（左右の切り口）と手前側の縁
  const a = b.wall[0];
  const z = b.wall[b.wall.length - 1];
  const oa = outerWall[0];
  const oz = outerWall[outerWall.length - 1];
  ctx.fillStyle = vessel === 'donabe' ? '#8a5f45' : shade(m.outer, 0.12);
  for (const [p, q] of [
    [a, oa],
    [z, oz],
  ]) {
    ctx.beginPath();
    ctx.ellipse((p.x + q.x) / 2, (p.y + q.y) / 2, Math.hypot(q.x - p.x, q.y - p.y) / 2 + 1, Math.max(2.5, ry * 0.35), 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = m.edge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, yo, b.openHalfW + T / 2, ry, 0, 0.04, Math.PI - 0.04);
  ctx.strokeStyle = hexA(m.edge, 0.45);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (needsStand(b)) drawStand(ctx, b);
}

