/** 背景・金魚鉢の描画 */
import type { Bowl } from '../physics/bowl';

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
export function drawBackground(ctx: CanvasRenderingContext2D, v: View, bowl: Bowl): void {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  const tableY = v.oy + (bowl.bottomY + bowl.R * 0.06) * v.scale;
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
  // 鉢の影
  ctx.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.ox * v.dpr, v.oy * v.dpr);
  const sy = bowl.bottomY + bowl.R * 0.06;
  const sg = ctx.createRadialGradient(0, sy, 0, 0, sy, bowl.R * 0.95);
  sg.addColorStop(0, 'rgba(70,40,20,0.28)');
  sg.addColorStop(1, 'rgba(70,40,20,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(0, sy, bowl.R * 0.95, bowl.R * 0.1, 0, 0, TAU);
  ctx.fill();
}

/** 猫より奥に描く部分 */
export function drawBowlBack(ctx: CanvasRenderingContext2D, bowl: Bowl): void {
  const R = bowl.R;
  ctx.save();
  bowlOutlinePath(ctx, bowl, R);
  const g = ctx.createRadialGradient(-R * 0.2, -R * 0.1, R * 0.2, 0, 0, R);
  g.addColorStop(0, 'rgba(225,242,246,0.10)');
  g.addColorStop(1, 'rgba(170,215,228,0.28)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // 口の奥側の縁
  const ry = bowl.openHalfW * 0.13;
  ctx.beginPath();
  ctx.ellipse(0, bowl.openY, bowl.openHalfW + 4, ry, 0, Math.PI, TAU);
  ctx.strokeStyle = 'rgba(150,200,215,0.55)';
  ctx.lineWidth = 5;
  ctx.stroke();
  // 底のガラス
  const xb = Math.sqrt(R * R - bowl.bottomY * bowl.bottomY);
  ctx.beginPath();
  ctx.ellipse(0, bowl.bottomY, xb, ry * 0.7, 0, Math.PI, TAU);
  ctx.strokeStyle = 'rgba(150,200,215,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** ガラスの外形（内面 R） */
function bowlOutlinePath(ctx: CanvasRenderingContext2D, bowl: Bowl, R: number): void {
  const yo = bowl.openY;
  const yb = bowl.bottomY;
  const aTop = Math.asin(Math.max(-1, Math.min(1, yo / R))); // 負
  const aBot = Math.asin(Math.max(-1, Math.min(1, yb / R)));
  ctx.beginPath();
  // 右上 → 右側を下へ → 底 → 左側を上へ
  ctx.arc(0, 0, R, aTop, aBot, false);
  ctx.arc(0, 0, R, Math.PI - aBot, Math.PI - aTop, false);
  ctx.closePath();
}

/** 猫より手前に描く部分（ガラスの輪郭・反射・屈折っぽい縁） */
export function drawBowlFront(ctx: CanvasRenderingContext2D, bowl: Bowl): void {
  const R = bowl.R;
  const gt = Math.max(6, R * 0.028); // ガラスの厚み
  const yo = bowl.openY;
  const yb = bowl.bottomY;
  const aTop = Math.asin(yo / R);

  // 屈折っぽい縁: 内面付近をほんのり色付け
  ctx.save();
  bowlOutlinePath(ctx, bowl, R);
  ctx.clip();
  const rg = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R);
  rg.addColorStop(0, 'rgba(160,210,225,0)');
  rg.addColorStop(0.8, 'rgba(160,210,225,0.08)');
  rg.addColorStop(1, 'rgba(120,180,200,0.26)');
  ctx.fillStyle = rg;
  ctx.fillRect(-R, yo, R * 2, yb - yo);
  // 窓の映り込み（大きく淡い）
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-R * 0.42, -R * 0.12, R * 0.16, R * 0.42, 0.35, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-R * 0.18, -R * 0.3, R * 0.06, R * 0.24, 0.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ガラス本体（側面）
  const glassSide = (rad: number, style: string, width: number) => {
    ctx.beginPath();
    ctx.arc(0, 0, rad, aTop, Math.asin(Math.min(1, yb / rad)), false);
    ctx.moveTo(-Math.sqrt(Math.max(0, rad * rad - yb * yb)), yb);
    ctx.arc(0, 0, rad, Math.PI - Math.asin(Math.min(1, yb / rad)), Math.PI - aTop, false);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  glassSide(R + gt / 2, 'rgba(190,228,238,0.42)', gt);
  glassSide(R + gt, 'rgba(95,150,170,0.55)', 1.6);
  glassSide(R, 'rgba(255,255,255,0.55)', 1.2);

  // 底（厚いガラス）
  const xb = Math.sqrt(R * R - yb * yb);
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

  // ハイライト
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = R * 0.035;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.9, Math.PI + 0.35, Math.PI + 0.75);
  ctx.stroke();
  ctx.lineWidth = R * 0.02;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.9, Math.PI + 0.85, Math.PI + 0.95);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = R * 0.018;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.93, 0.25, 0.65);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = R * 0.012;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.93, -0.45, -0.25);
  ctx.stroke();

  // 口の縁（手前側）
  const ry = bowl.openHalfW * 0.13;
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

