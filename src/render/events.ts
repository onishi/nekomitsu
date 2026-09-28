/**
 * 背景ごとの特別な出来事（ときどき起きる）。猫じゃらし・すずめ・流星群・雷・UFO・ジンベエザメ…。
 * 画面の座標で描く。focus を返す出来事は、猫たちがそれを目で追う。
 */
import type { View } from './scene';
import { mapleLeaf, type ThemeKey } from './themes';

type Pt = { x: number; y: number };

export interface SceneEvent {
  /** 名前（動作確認用） */
  name: string;
  /** 長さ（秒） */
  dur: number;
  /** 始まりに鳴らす音 */
  sound?: 'chime' | 'thunder' | 'kapon' | 'wind' | 'ufo';
  /** 猫がびくっとする（雷） */
  spook?: boolean;
  /** 手前にも花びら・紅葉を吹き付ける */
  gust?: 'petal' | 'leaf';
  /** 背景に描く（容器より奥）。p: 0..1 の進み具合 */
  draw?(ctx: CanvasRenderingContext2D, v: View, gy: number, p: number, t: number): void;
  /** 容器と猫より手前に描く（床を歩くもの・湯気・雷の光） */
  drawFront?(ctx: CanvasRenderingContext2D, v: View, gy: number, p: number, t: number): void;
  /** 猫たちが目で追う点（画面の座標） */
  focus?(v: View, gy: number, p: number, t: number): Pt | null;
}

const TAU = Math.PI * 2;
const rnd = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** 入って、しばらくいて、出ていく（0..1..0） */
const inOut = (p: number, a = 0.2) => (p < a ? p / a : p > 1 - a ? (1 - p) / a : 1);
const ease = (k: number) => k * k * (3 - 2 * k);

// --- 部屋: 猫じゃらし ---
const jarashiTip = (v: View, gy: number, p: number): Pt => ({
  x: v.w + 20 - ease(inOut(p)) * v.w * 0.45,
  y: gy * 0.5 + Math.sin(p * 26) * 26 + Math.cos(p * 11) * 16,
});
const jarashi: SceneEvent = {
  name: '猫じゃらし',
  dur: 8,
  draw(ctx, v, gy, p) {
    const tip = jarashiTip(v, gy, p);
    const hx = v.w + 40;
    const hy = gy * 0.3;
    ctx.strokeStyle = '#b08a5a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo((hx + tip.x) / 2, Math.min(hy, tip.y) - 30, tip.x, tip.y);
    ctx.stroke();
    // ふさふさの羽
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * 0.5 + (k - 3) * 0.28 + Math.sin(p * 30 + k) * 0.1;
      ctx.fillStyle = k % 2 ? '#f59ab0' : '#ffd166';
      ctx.beginPath();
      ctx.ellipse(tip.x + Math.cos(a) * 12, tip.y + Math.sin(a) * 12, 13, 4, a, 0, TAU);
      ctx.fill();
    }
  },
  focus: (v, gy, p) => jarashiTip(v, gy, p),
};

// --- 庭先: すずめが跳ねてくる ---
const suzumePos = (v: View, gy: number, p: number): Pt => {
  if (p < 0.45) {
    const k = p / 0.45;
    return { x: -20 + k * v.w * 0.3, y: gy - 12 - Math.abs(Math.sin(k * 18)) * 14 };
  }
  if (p < 0.75) return { x: v.w * 0.3 - 20, y: gy - 12 };
  const k = (p - 0.75) / 0.25;
  return { x: v.w * 0.3 - 20 - k * v.w * 0.4, y: gy - 8 - k * gy * 0.6 };
};
function sparrow(ctx: CanvasRenderingContext2D, x: number, y: number, flap: number, dir: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * 1.6, 1.6);
  ctx.fillStyle = '#a27a52';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 7, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f2e6d4';
  ctx.beginPath();
  ctx.ellipse(1, 3, 6, 4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#6f4a2c';
  ctx.beginPath();
  ctx.arc(7, -5, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(9, -6, 1.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e0b040';
  ctx.beginPath();
  ctx.moveTo(12, -5);
  ctx.lineTo(15, -4);
  ctx.lineTo(12, -3);
  ctx.fill();
  ctx.fillStyle = '#7a5634';
  ctx.beginPath();
  ctx.ellipse(-3, -3 - flap * 5, 7, 3, -0.6 - flap, 0, TAU);
  ctx.fill();
  ctx.fillRect(-15, -2, 6, 2);
  ctx.restore();
}
const suzume: SceneEvent = {
  name: 'すずめ',
  dur: 9,
  sound: 'chime',
  drawFront(ctx, v, gy, p, t) {
    const q = suzumePos(v, gy, p);
    const flying = p > 0.75;
    sparrow(ctx, q.x, q.y, flying ? Math.sin(t * 30) : 0, flying ? -1 : 1);
  },
  focus: (v, gy, p) => suzumePos(v, gy, p),
};

// --- 草原: たんぽぽの綿毛 ---
const seedPos = (v: View, gy: number, p: number, i: number): Pt => ({
  x: -40 + (v.w + 80) * (p * (0.8 + rnd(i, 1) * 0.4)) - rnd(i, 2) * 120,
  y: gy * (0.7 - p * 0.35) + (rnd(i, 3) - 0.5) * 120 + Math.sin(p * 12 + i) * 14,
});
const watage: SceneEvent = {
  name: 'たんぽぽの綿毛',
  dur: 10,
  sound: 'wind',
  draw(ctx, v, gy, p) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const q = seedPos(v, gy, p, i);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + Math.cos(a) * 6, q.y + Math.sin(a) * 6);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x, q.y + 9);
      ctx.stroke();
    }
  },
  focus: (v, gy, p) => seedPos(v, gy, p, 0),
};

// --- 屋根の上: 遠くの屋根を歩く猫 ---
const walkerPos = (v: View, gy: number, p: number): Pt => ({ x: -30 + (v.w + 60) * p, y: gy * 0.56 });
const nekoWalk: SceneEvent = {
  name: '屋根を歩く猫',
  dur: 12,
  draw(ctx, v, gy, p, t) {
    const q = walkerPos(v, gy, p);
    ctx.fillStyle = 'rgba(70,50,60,0.75)';
    ctx.beginPath();
    ctx.ellipse(q.x, q.y - 9, 14, 7, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(q.x + 14, q.y - 14, 6, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(q.x + 10, q.y - 18);
    ctx.lineTo(q.x + 11, q.y - 24);
    ctx.lineTo(q.x + 14, q.y - 19);
    ctx.moveTo(q.x + 15, q.y - 19);
    ctx.lineTo(q.x + 18, q.y - 24);
    ctx.lineTo(q.x + 19, q.y - 17);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,50,60,0.75)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const [dx, ph] of [
      [-9, 0],
      [9, Math.PI],
    ]) {
      const s = Math.sin(t * 9 + ph) * 3;
      ctx.beginPath();
      ctx.moveTo(q.x + dx, q.y - 5);
      ctx.lineTo(q.x + dx + s, q.y + 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(q.x - 13, q.y - 10);
    ctx.quadraticCurveTo(q.x - 24, q.y - 14, q.x - 22, q.y - 26 + Math.sin(t * 2) * 3);
    ctx.stroke();
  },
  focus: (v, gy, p) => walkerPos(v, gy, p),
};

// --- 夜の窓辺: 流星群 ---
const ryusei: SceneEvent = {
  name: '流星群',
  dur: 6,
  draw(ctx, v, gy, p) {
    const wx0 = v.w * 0.1;
    const wx1 = v.w * 0.9;
    const wy0 = Math.max(70, gy * 0.08);
    const wy1 = gy * 0.72;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    ctx.clip();
    for (let i = 0; i < 9; i++) {
      const s0 = rnd(i, 5) * 0.8;
      const k = (p - s0) / 0.12;
      if (k < 0 || k > 1) continue;
      const x = wx0 + (wx1 - wx0) * (0.95 - rnd(i, 6) * 0.4 - k * 0.45);
      const y = wy0 + (wy1 - wy0) * (0.05 + rnd(i, 7) * 0.3 + k * 0.3);
      const g = ctx.createLinearGradient(x, y, x + 60, y - 40);
      g.addColorStop(0, `rgba(255,255,230,${1 - k})`);
      g.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 60, y - 40);
      ctx.stroke();
    }
    ctx.restore();
  },
  focus: (v, gy) => ({ x: v.w * 0.55, y: gy * 0.3 }),
};

// --- こたつ: みかんがころころ ---
const mikanPos = (v: View, gy: number, p: number): Pt => {
  const k = Math.min(1, p / 0.5);
  const x = -20 + (1 - (1 - k) * (1 - k)) * v.w * 0.3;
  return { x, y: gy - 14 };
};
const mikan: SceneEvent = {
  name: 'みかんがころころ',
  dur: 8,
  drawFront(ctx, v, gy, p) {
    const q = mikanPos(v, gy, p);
    const a = p > 0.95 ? (1 - p) / 0.05 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(q.x, q.y);
    ctx.rotate(q.x / 10);
    ctx.fillStyle = '#f29a2e';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(-4, -5, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5c8a3a';
    ctx.fillRect(-2, -14, 4, 4);
    ctx.restore();
  },
  focus: (v, gy, p) => mikanPos(v, gy, p),
};

// --- 桜の公園・紅葉の山寺: 風に舞う花吹雪 ---
function flurry(kind: 'petal' | 'leaf'): SceneEvent {
  return {
    name: kind === 'petal' ? '花吹雪' : '紅葉の風',
    dur: 5,
    sound: 'wind',
    gust: kind,
    draw(ctx, v, gy, p, t) {
      const n = 70;
      for (let i = 0; i < n; i++) {
        const k = p * 1.6 - rnd(i, 8) * 0.6;
        if (k < 0 || k > 1) continue;
        const x = -30 + k * (v.w + 60);
        const y = gy * (0.1 + rnd(i, 9) * 0.8) + Math.sin(k * 8 + i) * 30 - k * 60;
        if (kind === 'leaf') mapleLeaf(ctx, x, y, 5 + rnd(i, 10) * 3, t * 3 + i, ['#e0572f', '#f0a030', '#d93e2c', '#e8b030'][i % 4]);
        else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 4 + i);
          ctx.fillStyle = 'rgba(246,183,202,0.95)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 4.5, 2.6, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    },
  };
}

// --- 海辺: カモメ・カニ ---
const gullPos = (v: View, gy: number, p: number): Pt => ({
  x: v.w + 40 - (v.w + 80) * p,
  y: gy * (0.25 + 0.15 * Math.sin(p * Math.PI)) + Math.sin(p * 10) * 8,
});
const kamome: SceneEvent = {
  name: 'カモメ',
  dur: 7,
  draw(ctx, v, gy, p, t) {
    const q = gullPos(v, gy, p);
    const f = Math.sin(t * 7) * 0.6;
    ctx.strokeStyle = '#5a6570';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(q.x - 22, q.y - 8 * f - 4);
    ctx.quadraticCurveTo(q.x - 10, q.y - 12 * (1 + f), q.x, q.y);
    ctx.quadraticCurveTo(q.x + 10, q.y - 12 * (1 + f), q.x + 22, q.y - 8 * f - 4);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(q.x, q.y + 1, 7, 3.5, 0, 0, TAU);
    ctx.fill();
  },
  focus: (v, gy, p) => gullPos(v, gy, p),
};
const kaniPos = (v: View, gy: number, p: number): Pt => ({ x: -20 + (v.w + 40) * p, y: gy + (v.h - gy) * 0.35 });
const kani: SceneEvent = {
  name: 'カニ',
  dur: 10,
  drawFront(ctx, v, gy, p, t) {
    const q = kaniPos(v, gy, p);
    ctx.fillStyle = '#e0553a';
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, 11, 7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#c8452c';
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const ph = Math.sin(t * 14 + k + s) * 2;
        ctx.beginPath();
        ctx.moveTo(q.x + s * 6, q.y + 2);
        ctx.lineTo(q.x + s * (13 + k * 2), q.y + 6 + k * 2 + ph);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(q.x + s * 13, q.y - 7, 4, 0, TAU);
      ctx.fillStyle = '#e0553a';
      ctx.fill();
    }
    ctx.fillStyle = '#222';
    ctx.fillRect(q.x - 4, q.y - 10, 2, 4);
    ctx.fillRect(q.x + 2, q.y - 10, 2, 4);
  },
  focus: (v, gy, p) => kaniPos(v, gy, p),
};

// --- 宇宙: UFO ---
const ufoPos = (v: View, gy: number, p: number): Pt => {
  const k = p < 0.4 ? ease(p / 0.4) * 0.5 : p < 0.65 ? 0.5 : 0.5 + ease((p - 0.65) / 0.35) * 0.5;
  return { x: -50 + (v.w + 100) * k, y: gy * 0.3 + Math.sin(p * 20) * 6 };
};
const ufo: SceneEvent = {
  name: 'UFO',
  dur: 8,
  sound: 'ufo',
  draw(ctx, v, gy, p, t) {
    const q = ufoPos(v, gy, p);
    if (p > 0.42 && p < 0.63) {
      const a = Math.sin(((p - 0.42) / 0.21) * Math.PI) * 0.35;
      const g = ctx.createLinearGradient(0, q.y, 0, gy);
      g.addColorStop(0, `rgba(200,255,200,${a})`);
      g.addColorStop(1, 'rgba(200,255,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(q.x - 12, q.y);
      ctx.lineTo(q.x + 12, q.y);
      ctx.lineTo(q.x + 70, gy);
      ctx.lineTo(q.x - 70, gy);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(190,230,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(q.x, q.y - 7, 12, 10, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#b8bfcc';
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, 30, 8, 0, 0, TAU);
    ctx.fill();
    for (let k = 0; k < 5; k++) {
      const on = Math.sin(t * 8 + k) > 0;
      ctx.fillStyle = on ? '#ffe066' : '#8a8f99';
      ctx.beginPath();
      ctx.arc(q.x - 20 + k * 10, q.y + 1, 2.2, 0, TAU);
      ctx.fill();
    }
  },
  focus: (v, gy, p) => ufoPos(v, gy, p),
};

// --- 雨の日の窓辺: 雷 ---
const kaminari: SceneEvent = {
  name: '雷',
  dur: 3,
  sound: 'thunder',
  spook: true,
  draw(ctx, v, gy, p) {
    const flash = p < 0.04 ? 0.75 : p < 0.08 ? 0.15 : p < 0.12 ? 0.55 : Math.max(0, 0.55 - (p - 0.12) * 3);
    if (p < 0.12) {
      // 稲妻（窓の中）
      ctx.strokeStyle = 'rgba(255,255,240,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      let x = v.w * 0.65;
      let y = Math.max(70, gy * 0.1);
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd(k, 11) - 0.5) * 50;
        y += gy * 0.1;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, v.w, v.h);
  },
  // 部屋ごと一瞬白く光る
  drawFront(ctx, v, _gy, p) {
    const flash = p < 0.04 ? 0.45 : p < 0.08 ? 0.05 : p < 0.12 ? 0.3 : Math.max(0, 0.3 - (p - 0.12) * 2);
    if (flash <= 0) return;
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, v.w, v.h);
  },
  focus: (v, gy) => ({ x: v.w * 0.65, y: gy * 0.3 }),
};

// --- 水族館: ジンベエザメ ---
const jinbePos = (v: View, gy: number, p: number): Pt => ({ x: v.w + v.w * 0.6 - (v.w * 2.2) * p, y: gy * 0.4 + Math.sin(p * 6) * 12 });
const jinbe: SceneEvent = {
  name: 'ジンベエザメ',
  dur: 14,
  draw(ctx, v, gy, p, t) {
    const q = jinbePos(v, gy, p);
    const L = v.w * 0.55;
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.fillStyle = 'rgba(40,70,110,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(L * 0.1, -L * 0.13, L * 0.45, -L * 0.1);
    ctx.quadraticCurveTo(L * 0.8, -L * 0.06, L * 0.95, 0);
    ctx.quadraticCurveTo(L * 0.8, L * 0.05, L * 0.45, L * 0.08);
    ctx.quadraticCurveTo(L * 0.1, L * 0.1, 0, 0);
    ctx.fill();
    // 尾びれ
    const wag = Math.sin(t * 2) * L * 0.04;
    ctx.beginPath();
    ctx.moveTo(L * 0.92, 0);
    ctx.lineTo(L * 1.1, -L * 0.14 + wag);
    ctx.lineTo(L * 1.04, wag * 0.5);
    ctx.lineTo(L * 1.08, L * 0.1 + wag);
    ctx.fill();
    // 背びれ・胸びれ
    ctx.beginPath();
    ctx.moveTo(L * 0.4, -L * 0.1);
    ctx.lineTo(L * 0.5, -L * 0.2);
    ctx.lineTo(L * 0.56, -L * 0.09);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(L * 0.22, L * 0.06);
    ctx.lineTo(L * 0.34, L * 0.2);
    ctx.lineTo(L * 0.36, L * 0.07);
    ctx.fill();
    // 白い水玉
    ctx.fillStyle = 'rgba(230,240,255,0.55)';
    for (let i = 0; i < 26; i++) {
      const x = L * (0.12 + rnd(i, 12) * 0.7);
      const y = (rnd(i, 13) - 0.6) * L * 0.14;
      ctx.beginPath();
      ctx.arc(x, y, 2 + rnd(i, 14) * 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
  focus: (v, gy, p) => jinbePos(v, gy, p),
};

// --- 銭湯: カポーン ---
const kapon: SceneEvent = {
  name: 'カポーン',
  dur: 4,
  sound: 'kapon',
  drawFront(ctx, v, gy, p) {
    const a = Math.sin(Math.PI * Math.min(1, p * 1.3)) * 0.8;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `bold ${Math.round(Math.min(48, v.w * 0.11))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(60,100,140,0.8)';
    ctx.strokeText('カポーン', v.w * 0.5, gy * 0.3 - p * 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('カポーン', v.w * 0.5, gy * 0.3 - p * 30);
    ctx.restore();
    // もわっと湯気
    for (let i = 0; i < 6; i++) {
      const x = v.w * (0.1 + i * 0.16);
      const y = gy - p * gy * 0.5 - rnd(i, 15) * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 80);
      g.addColorStop(0, `rgba(255,255,255,${0.35 * Math.sin(Math.PI * p)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 80, y - 80, 160, 160);
    }
  },
};

/** テーマごとに起きうる出来事 */
export const EVENTS: Record<ThemeKey, SceneEvent[]> = {
  room: [jarashi],
  garden: [suzume],
  meadow: [watage],
  rooftop: [nekoWalk],
  nightWindow: [ryusei],
  kotatsu: [mikan],
  sakura: [flurry('petal')],
  beach: [kamome, kani],
  space: [ufo],
  rain: [kaminari],
  autumn: [flurry('leaf')],
  aquarium: [jinbe],
  sento: [kapon],
};
