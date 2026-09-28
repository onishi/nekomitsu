/**
 * 季節の小物（テーマごと）: 花かんむり・麦わら帽子・マフラー・宇宙ヘルメット。
 * 頭の座標系（上が -y）で描くので、頭の傾きや動きにそのままついていく。見た目だけ。
 */
import type { Cat } from '../cat/cat';

const TAU = Math.PI * 2;

type Pt = { x: number; y: number };

function headSpace(cat: Cat): { L: (lx: number, ly: number) => Pt; r: number; a: number; f: number } {
  const hf = cat.headFrame();
  const cs = Math.cos(hf.angle);
  const sn = Math.sin(hf.angle);
  return {
    L: (lx, ly) => ({ x: hf.x + cs * lx - sn * ly, y: hf.y + sn * lx + cs * ly }),
    r: cat.species.headR,
    a: hf.angle,
    f: cat.facing,
  };
}

/** 頭より奥（胴体の上）に描くもの: マフラー */
export function drawAccessoryUnder(ctx: CanvasRenderingContext2D, cat: Cat): void {
  if (cat.accessory !== 'scarf') return;
  const { L, r, a, f } = headSpace(cat);
  ctx.save();
  const c = L(0, r * 0.78);
  ctx.translate(c.x, c.y);
  ctx.rotate(a);
  // 首に巻いた帯
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 0.3, 0, 0, TAU);
  ctx.fillStyle = '#d9534f';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#f4efe4';
  for (let x = -r; x < r; x += r * 0.42) ctx.fillRect(x, -r, r * 0.14, r * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(110,30,30,0.6)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // 垂れた端（体の側）
  const s = -f;
  ctx.beginPath();
  ctx.moveTo(s * r * 0.35, r * 0.1);
  ctx.lineTo(s * r * 0.75, r * 0.95);
  ctx.lineTo(s * r * 0.35, r * 1.05);
  ctx.lineTo(s * r * 0.1, r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#d9534f';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(Math.min(s * r * 0.35, s * r * 0.8), r * 0.82, r * 0.42, r * 0.08);
  ctx.restore();
}

/** 頭より手前に描くもの: 花かんむり・麦わら帽子・ヘルメット */
export function drawAccessoryOver(ctx: CanvasRenderingContext2D, cat: Cat, time: number): void {
  const acc = cat.accessory;
  if (!acc || acc === 'scarf') return;
  const { L, r, a } = headSpace(cat);
  ctx.save();
  const o = L(0, 0);
  ctx.translate(o.x, o.y);
  ctx.rotate(a);
  if (acc === 'flower') {
    // 頭のてっぺんに沿って、桜の花をいくつか
    for (const t of [-0.55, -0.18, 0.18, 0.55]) {
      const ang = -Math.PI / 2 + t;
      const x = Math.cos(ang) * r * 0.9;
      const y = Math.sin(ang) * r * 0.9;
      const s = r * (Math.abs(t) < 0.3 ? 0.32 : 0.27);
      for (let k = 0; k < 5; k++) {
        const pa = (k / 5) * TAU + t;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(pa) * s * 0.55, y + Math.sin(pa) * s * 0.55, s * 0.5, s * 0.36, pa, 0, TAU);
        ctx.fillStyle = '#f8c3d2';
        ctx.fill();
        ctx.strokeStyle = 'rgba(210,120,150,0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, s * 0.2, 0, TAU);
      ctx.fillStyle = '#f2a33a';
      ctx.fill();
    }
  } else if (acc === 'straw') {
    // 麦わら帽子（つば・山・赤いリボン）
    const y0 = -r * 0.72;
    ctx.beginPath();
    ctx.ellipse(0, y0, r * 1.3, r * 0.28, 0, 0, TAU);
    ctx.fillStyle = '#ecc97a';
    ctx.fill();
    ctx.strokeStyle = '#a9823d';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, y0 - r * 0.05, r * 0.68, r * 0.55, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = '#f0d188';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9534f';
    ctx.fillRect(-r * 0.68, y0 - r * 0.2, r * 1.36, r * 0.16);
    // 編み目
    ctx.strokeStyle = 'rgba(160,120,50,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, y0, r * 1.05, r * 0.2, 0, 0, TAU);
    ctx.stroke();
  } else if (acc === 'helmet') {
    // 宇宙ヘルメット（透明な泡）
    const R = r * 1.5;
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, R, 0, TAU);
    ctx.fillStyle = 'rgba(200,230,255,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,250,255,0.8)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, R * 0.82, Math.PI * 1.1, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = R * 0.08;
    ctx.lineCap = 'round';
    ctx.stroke();
    // 首のリング
    ctx.beginPath();
    ctx.ellipse(0, R * 0.85, R * 0.55, R * 0.14, 0, 0, TAU);
    ctx.fillStyle = '#c9ced8';
    ctx.fill();
    ctx.strokeStyle = '#7d8594';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // アンテナの光
    const blink = 0.5 + 0.5 * Math.sin(time * 4 + cat.phase);
    ctx.beginPath();
    ctx.arc(R * 0.55, -R * 0.95, r * 0.09, 0, TAU);
    ctx.fillStyle = `rgba(255,120,120,${0.4 + 0.6 * blink})`;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(R * 0.45, -R * 0.8);
    ctx.lineTo(R * 0.55, -R * 0.95);
    ctx.strokeStyle = '#7d8594';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}
