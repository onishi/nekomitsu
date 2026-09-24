/** 背景・容器（金魚鉢・フラスコ…）の描画 */
import type { Container, Pt } from '../physics/container';

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
export function drawBackground(ctx: CanvasRenderingContext2D, v: View, bowl: Container): void {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  const tableY = v.oy + tableWorldY(bowl) * v.scale;
  const g = ctx.createLinearGradient(0, 0, 0, tableY);
  g.addColorStop(0, '#f4ead9');
  g.addColorStop(1, '#ecdcc4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, tableY);
  // 窓からの柔らかい光
  const lg = ctx.createRadialGradient(v.w * 0.2, v.h * 0.12, 0, v.w * 0.2, v.h * 0.12, Math.max(v.w, v.h) * 0.6);
  lg.addColorStop(0, 'rgba(255,248,230,0.75)');
  lg.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, v.w, tableY);
  // テーブル
  const tg = ctx.createLinearGradient(0, tableY, 0, v.h);
  tg.addColorStop(0, '#c89a6c');
  tg.addColorStop(0.08, '#b98a5c');
  tg.addColorStop(1, '#8e6440');
  ctx.fillStyle = tg;
  ctx.fillRect(0, tableY, v.w, v.h - tableY);
  ctx.fillStyle = 'rgba(255,240,215,0.35)';
  ctx.fillRect(0, tableY, v.w, 2);
  // 木目
  ctx.strokeStyle = 'rgba(90,55,30,0.12)';
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 5; k++) {
    const y = tableY + (v.h - tableY) * (k / 5) + Math.sin(k * 7) * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= v.w; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.01 + k) * 3);
    ctx.stroke();
  }
  // 容器の影
  ctx.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.ox * v.dpr, v.oy * v.dpr);
  const sy = tableWorldY(bowl);
  const sw = Math.max(bowl.bottomHalfW, bowl.halfW * 0.6) * 1.15;
  const sg = ctx.createRadialGradient(0, sy, 0, 0, sy, sw);
  sg.addColorStop(0, 'rgba(70,40,20,0.28)');
  sg.addColorStop(1, 'rgba(70,40,20,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(0, sy, sw, bowl.R * 0.1, 0, 0, TAU);
  ctx.fill();
}

const glassThickness = (b: Container) => Math.max(6, b.R * 0.028);
/** 底が平らでない容器（丸底・ひし形）はコルクの台に載せる */
const needsStand = (b: Container) => b.bottomHalfW < b.R * 0.15;

/** テーブルの高さ（ワールド座標） */
export function tableWorldY(b: Container): number {
  return b.bottomY + (needsStand(b) ? b.R * 0.1 : glassThickness(b) * 1.6);
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
export function drawBowlBack(ctx: CanvasRenderingContext2D, bowl: Container): void {
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
    ctx.ellipse(0, bowl.bottomY, bowl.bottomHalfW, Math.max(4, bowl.bottomHalfW * 0.1), 0, Math.PI, TAU);
    ctx.strokeStyle = 'rgba(150,200,215,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** 猫より手前に描く部分（ガラスの輪郭・反射・屈折っぽい縁） */
export function drawBowlFront(ctx: CanvasRenderingContext2D, bowl: Container): void {
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
    // コルクの台
    const sy = yb + R * 0.02;
    const sw = R * 0.32;
    ctx.beginPath();
    ctx.ellipse(0, sy + R * 0.03, sw, R * 0.07, 0, 0, TAU);
    ctx.fillStyle = '#b98a58';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,55,30,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, sy, sw * 0.62, R * 0.035, 0, 0, TAU);
    ctx.fillStyle = 'rgba(90,55,30,0.35)';
    ctx.fill();
  } else {
    // 底（厚いガラス）
    const xb = bowl.bottomHalfW;
    ctx.beginPath();
    ctx.moveTo(-xb, yb);
    ctx.lineTo(xb, yb);
    ctx.lineTo(xb * 0.98, yb + gt * 1.6);
    ctx.lineTo(-xb * 0.98, yb + gt * 1.6);
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
