/**
 * 背景の情景（ねこみつの周ごとのテーマ）。どれも画像を使わず図形で描き、雲・花びら・雪・星などがゆっくり動く。
 * 画面の座標（CSS ピクセル）で描く。gy は容器を置く地面（テーブル・縁側・草の上…）の上端。
 */
import type { View } from './scene';

export type ThemeKey =
  | 'room'
  | 'garden'
  | 'meadow'
  | 'rooftop'
  | 'nightWindow'
  | 'kotatsu'
  | 'sakura'
  | 'beach'
  | 'space'
  | 'rain'
  | 'autumn'
  | 'aquarium'
  | 'sento';

export interface Theme {
  key: ThemeKey;
  name: string;
  /** 暗い背景（タイトルの文字を明るくする） */
  dark: boolean;
  /** ブラウザの上のバーの色 */
  top: string;
  draw(ctx: CanvasRenderingContext2D, v: View, gy: number, t: number): void;
}

const TAU = Math.PI * 2;
/** 決まった乱数（同じ i なら毎回同じ位置） */
const rnd = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function vgrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a = 0.92): void {
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  for (const [dx, dy, r] of [
    [0, 0, 1],
    [0.9, 0.15, 0.75],
    [-0.9, 0.2, 0.7],
    [0.4, -0.45, 0.72],
    [-0.35, -0.35, 0.6],
  ]) {
    ctx.moveTo(x + dx * s + r * s, y + dy * s);
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
  }
  ctx.fill();
}

/** 横に流れていくものの位置（画面の外から入って外へ出る） */
const drift = (base: number, speed: number, t: number, w: number, margin = 120) => ((base + t * speed) % (w + margin * 2) + (w + margin * 2)) % (w + margin * 2) - margin;

function bird(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number, col: string): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, s * 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const f = Math.sin(flap) * 0.5;
  ctx.moveTo(x - s, y - s * (0.2 + f));
  ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.5 * (1 + f), x, y);
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.5 * (1 + f), x + s, y - s * (0.2 + f));
  ctx.stroke();
}

function woodGrain(ctx: CanvasRenderingContext2D, w: number, gy: number, h: number, col: string): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 5; k++) {
    const y = gy + (h - gy) * (k / 5) + Math.sin(k * 7) * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.01 + k) * 3);
    ctx.stroke();
  }
}

// --- 1周目: いつもの部屋 ---
const room: Theme = {
  key: 'room',
  name: '部屋',
  dark: false,
  top: '#f4ead9',
  draw(ctx, v, gy) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#f4ead9'],
      [1, '#ecdcc4'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    const lg = ctx.createRadialGradient(w * 0.2, h * 0.12, 0, w * 0.2, h * 0.12, Math.max(w, h) * 0.6);
    lg.addColorStop(0, 'rgba(255,248,230,0.75)');
    lg.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, gy);
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#c89a6c'],
      [0.08, '#b98a5c'],
      [1, '#8e6440'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = 'rgba(255,240,215,0.35)';
    ctx.fillRect(0, gy, w, 2);
    woodGrain(ctx, w, gy, h, 'rgba(90,55,30,0.12)');
  },
};

// --- 庭先（縁側） ---
const garden: Theme = {
  key: 'garden',
  name: '庭先',
  dark: false,
  top: '#d7ecf7',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    // 空
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#cfe8f7'],
      [0.6, '#e8f4f2'],
      [1, '#eef5e6'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    cloud(ctx, drift(w * 0.2, 6, t, w), gy * 0.2, 26, 0.8);
    cloud(ctx, drift(w * 0.75, 4, t, w), gy * 0.12, 18, 0.7);
    // 奥の庭（苔）と植え込み
    const hedgeY = gy * 0.62;
    ctx.fillStyle = '#c3dcae';
    ctx.fillRect(0, hedgeY, w, gy - hedgeY);
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? '#9fc69a' : '#88b782';
      ctx.beginPath();
      const n = Math.ceil(w / 40) + 2;
      for (let k = 0; k < n; k++) {
        const x = k * 40 - 20 + layer * 20;
        const r = 26 + rnd(k, layer) * 16;
        const sway = Math.sin(t * 0.8 + k) * 1.5;
        const y = hedgeY + layer * 14 - r * 0.2;
        ctx.moveTo(x + r + sway, y);
        ctx.arc(x + sway, y, r, 0, TAU);
      }
      ctx.fill();
    }
    // 飛び石
    ctx.fillStyle = 'rgba(150,150,140,0.55)';
    for (let k = 0; k < 4; k++) {
      const x = w * (0.12 + k * 0.26);
      const y = hedgeY + (gy - hedgeY) * (0.55 + (k % 2) * 0.2);
      ctx.beginPath();
      ctx.ellipse(x, y, 18, 6, 0, 0, TAU);
      ctx.fill();
    }
    // 蝶（ときどき横切る）
    const bx = drift(0, 38, t, w, 200);
    const by = gy * 0.5 + Math.sin(t * 1.3) * 30;
    const fl = Math.abs(Math.sin(t * 12));
    ctx.fillStyle = '#f6e27a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(bx + s * 4 * fl, by, 5 * fl + 1, 6, s * 0.4, 0, TAU);
      ctx.fill();
    }
    // 軒と風鈴
    ctx.fillStyle = '#6e5440';
    ctx.fillRect(0, 0, w, Math.max(10, h * 0.018));
    const fx = w * 0.82;
    const sw = Math.sin(t * 1.7) * 0.18;
    ctx.save();
    ctx.translate(fx, Math.max(10, h * 0.018));
    ctx.rotate(sw);
    ctx.strokeStyle = 'rgba(80,60,50,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 30);
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,225,240,0.9)';
    ctx.beginPath();
    ctx.arc(0, 38, 9, Math.PI, 0);
    ctx.lineTo(9, 40);
    ctx.lineTo(-9, 40);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,60,50,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(0, 56);
    ctx.stroke();
    ctx.fillStyle = '#f7f2e6';
    ctx.fillRect(-4, 56, 8, 14);
    ctx.restore();
    // 縁側の板
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#d2aa7c'],
      [0.1, '#c39a6c'],
      [1, '#94693f'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = 'rgba(255,240,215,0.4)';
    ctx.fillRect(0, gy, w, 2);
    ctx.strokeStyle = 'rgba(90,55,30,0.18)';
    ctx.lineWidth = 1;
    const rows = 4;
    for (let k = 1; k <= rows; k++) {
      const y = gy + ((h - gy) * k) / (rows + 1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      for (let x = (k * 97) % 160; x < w; x += 160) {
        ctx.beginPath();
        ctx.moveTo(x, y - (h - gy) / (rows + 1));
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  },
};

// --- 草原 ---
const meadow: Theme = {
  key: 'meadow',
  name: '草原',
  dark: false,
  top: '#c2e4fa',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#bfe3fa'],
      [1, '#eef8ff'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    for (let k = 0; k < 4; k++) cloud(ctx, drift(rnd(k, 1) * w, 5 + k * 2, t, w, 160), gy * (0.1 + rnd(k, 2) * 0.3), 20 + rnd(k, 3) * 18);
    // 遠くの丘
    const hill = (base: number, amp: number, col: string, ph: number) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, base - Math.sin(x * 0.006 + ph) * amp - Math.sin(x * 0.013 + ph * 2) * amp * 0.4);
      ctx.lineTo(w, gy);
      ctx.fill();
    };
    hill(gy * 0.72, 22, '#b5dca2', 0.5);
    hill(gy * 0.84, 16, '#9ccf88', 2.1);
    ctx.fillStyle = '#8cc477';
    ctx.fillRect(0, gy * 0.9, w, gy * 0.1 + 1);
    // 草の地面
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#8cc477'],
      [1, '#5f9e4a'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    // 揺れる草と小さな花
    ctx.strokeStyle = 'rgba(70,120,50,0.55)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let k = 0; k < w / 7; k++) {
      const x = k * 7 + rnd(k, 4) * 5;
      const y = gy + 2 + rnd(k, 5) * (h - gy) * 0.9;
      const len = 6 + rnd(k, 6) * 7;
      const sway = Math.sin(t * 1.6 + x * 0.05) * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway * 0.4, y - len * 0.6, x + sway, y - len);
      ctx.stroke();
    }
    for (let k = 0; k < w / 30; k++) {
      const x = rnd(k, 7) * w;
      const y = gy + 6 + rnd(k, 8) * (h - gy) * 0.85;
      ctx.fillStyle = ['#fff7c2', '#ffffff', '#ffd1dc'][k % 3];
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, TAU);
      ctx.fill();
    }
  },
};

// --- 屋根の上（夕焼け） ---
const rooftop: Theme = {
  key: 'rooftop',
  name: '屋根の上',
  dark: false,
  top: '#f4b48c',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#f2a98a'],
      [0.45, '#f8c796'],
      [0.85, '#fbe0b4'],
      [1, '#f6c8a8'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    // 夕日
    const sx = w * 0.72;
    const sy = gy * 0.78;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.5);
    sg.addColorStop(0, 'rgba(255,236,190,0.9)');
    sg.addColorStop(0.12, 'rgba(255,214,150,0.6)');
    sg.addColorStop(1, 'rgba(255,200,150,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, gy);
    ctx.fillStyle = '#ffd98f';
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, TAU);
    ctx.fill();
    // 遠くの町並み
    ctx.fillStyle = 'rgba(160,100,110,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, gy);
    let x = 0;
    let k = 0;
    while (x < w + 30) {
      const bw = 18 + rnd(k, 9) * 30;
      const bh = 14 + rnd(k, 10) * 40;
      const base = gy * 0.9;
      ctx.lineTo(x, base - bh);
      if (rnd(k, 11) < 0.4) ctx.lineTo(x + bw / 2, base - bh - 10);
      ctx.lineTo(x + bw, base - bh);
      x += bw;
      k++;
    }
    ctx.lineTo(w, gy);
    ctx.fill();
    // 灯りのともった窓
    ctx.fillStyle = 'rgba(255,230,160,0.8)';
    for (let i = 0; i < w / 25; i++) {
      if (rnd(i, 12) < 0.5) continue;
      ctx.fillRect(rnd(i, 13) * w, gy * (0.84 + rnd(i, 14) * 0.05), 2.5, 3);
    }
    // 飛んでいく鳥
    for (let i = 0; i < 3; i++) bird(ctx, drift(i * 60, 22, t, w, 100), gy * (0.3 + i * 0.05), 7, t * 7 + i, 'rgba(110,70,70,0.6)');
    // 瓦屋根
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#7d8190'],
      [1, '#565a68'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    ctx.strokeStyle = 'rgba(40,42,52,0.45)';
    ctx.lineWidth = 1.2;
    const rowH = 12;
    for (let r = 0; gy + r * rowH < h; r++) {
      const y = gy + r * rowH + rowH;
      const off = (r % 2) * 11;
      ctx.beginPath();
      for (let xx = -22 + off; xx < w + 22; xx += 22) {
        ctx.moveTo(xx, y);
        ctx.arc(xx + 11, y, 11, Math.PI, 0);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,200,160,0.35)';
    ctx.fillRect(0, gy, w, 2);
  },
};

// --- 夜の窓辺 ---
const nightWindow: Theme = {
  key: 'nightWindow',
  name: '夜の窓辺',
  dark: true,
  top: '#2e2942',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#332c47'],
      [1, '#3f3552'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    // 窓
    const wx0 = w * 0.1;
    const wx1 = w * 0.9;
    const wy0 = Math.max(70, gy * 0.08);
    const wy1 = gy * 0.72;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    ctx.clip();
    ctx.fillStyle = vgrad(ctx, wy0, wy1, [
      [0, '#18204a'],
      [1, '#34427e'],
    ]);
    ctx.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    for (let i = 0; i < 70; i++) {
      const x = wx0 + rnd(i, 20) * (wx1 - wx0);
      const y = wy0 + rnd(i, 21) * (wy1 - wy0);
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + rnd(i, 22)) + i));
      ctx.fillStyle = `rgba(255,250,230,${a})`;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    // 月
    const mx = wx0 + (wx1 - wx0) * 0.72;
    const my = wy0 + (wy1 - wy0) * 0.28;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
    mg.addColorStop(0, 'rgba(255,245,210,0.5)');
    mg.addColorStop(1, 'rgba(255,245,210,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mx - 80, my - 80, 160, 160);
    ctx.fillStyle = '#fff4cf';
    ctx.beginPath();
    ctx.arc(mx, my, 20, 0, TAU);
    ctx.fill();
    // 流れ星（ときどき）
    const cyc = t % 9;
    if (cyc < 0.8) {
      const k = cyc / 0.8;
      const px = wx0 + (wx1 - wx0) * (0.2 + k * 0.4);
      const py = wy0 + (wy1 - wy0) * (0.1 + k * 0.25);
      ctx.strokeStyle = `rgba(255,255,240,${1 - k})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - 30, py - 14);
      ctx.stroke();
    }
    ctx.restore();
    // 窓枠
    ctx.strokeStyle = '#6b5645';
    ctx.lineWidth = 8;
    ctx.strokeRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo((wx0 + wx1) / 2, wy0);
    ctx.lineTo((wx0 + wx1) / 2, wy1);
    ctx.moveTo(wx0, (wy0 + wy1) / 2);
    ctx.lineTo(wx1, (wy0 + wy1) / 2);
    ctx.stroke();
    // ランプの明かり
    const lg = ctx.createRadialGradient(w * 0.95, gy * 0.9, 0, w * 0.95, gy * 0.9, Math.max(w, h) * 0.7);
    lg.addColorStop(0, 'rgba(255,200,130,0.28)');
    lg.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
    // 窓辺の棚
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#8a6a4d'],
      [0.1, '#76583e'],
      [1, '#4a3526'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = 'rgba(255,215,170,0.3)';
    ctx.fillRect(0, gy, w, 2);
    woodGrain(ctx, w, gy, h, 'rgba(30,18,10,0.2)');
  },
};

// --- こたつの和室（冬） ---
const kotatsu: Theme = {
  key: 'kotatsu',
  name: 'こたつの和室',
  dark: false,
  top: '#efe9dc',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    // 障子
    ctx.fillStyle = '#f4efe3';
    ctx.fillRect(0, 0, w, gy);
    // 雪見障子のガラス（外は雪景色）
    const gy0 = gy * 0.42;
    const gy1 = gy * 0.82;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gy0, w, gy1 - gy0);
    ctx.clip();
    ctx.fillStyle = vgrad(ctx, gy0, gy1, [
      [0, '#dfe7ef'],
      [0.7, '#eef2f5'],
      [1, '#ffffff'],
    ]);
    ctx.fillRect(0, gy0, w, gy1 - gy0);
    // 雪をかぶった木
    for (let k = 0; k < 5; k++) {
      const x = w * (0.08 + k * 0.22);
      ctx.fillStyle = 'rgba(120,140,130,0.35)';
      ctx.beginPath();
      ctx.moveTo(x, gy1 - 50 - rnd(k, 30) * 30);
      ctx.lineTo(x + 22, gy1);
      ctx.lineTo(x - 22, gy1);
      ctx.fill();
    }
    // しんしんと降る雪
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 60; i++) {
      const sp = 14 + rnd(i, 31) * 14;
      const y = gy0 + (((rnd(i, 32) * (gy1 - gy0) + t * sp) % (gy1 - gy0)) + (gy1 - gy0)) % (gy1 - gy0);
      const x = rnd(i, 33) * w + Math.sin(t * 0.8 + i) * 6;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + rnd(i, 34) * 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // 障子の桟
    ctx.strokeStyle = '#b89a74';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, gy);
      ctx.stroke();
    }
    for (let y = 0; y <= gy; y += 58) {
      if (y > gy0 && y < gy1) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    ctx.strokeRect(-2, gy0, w + 4, gy1 - gy0);
    // こたつの天板
    const top = 12;
    ctx.fillStyle = vgrad(ctx, gy, gy + top, [
      [0, '#c89664'],
      [1, '#a27447'],
    ]);
    ctx.fillRect(0, gy, w, top);
    // こたつ布団（柄入り）
    ctx.fillStyle = vgrad(ctx, gy + top, h, [
      [0, '#cf6f5c'],
      [1, '#a9503f'],
    ]);
    ctx.fillRect(0, gy + top, w, h - gy - top);
    ctx.fillStyle = 'rgba(255,225,190,0.35)';
    for (let y = gy + top + 14; y < h; y += 26) {
      for (let x = ((y / 26) % 2) * 20; x < w; x += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
      }
    }
    // みかん（天板の端）
    for (const [mx, r] of [
      [w * 0.07, 11],
      [w * 0.07 + 20, 10],
    ] as [number, number][]) {
      ctx.fillStyle = '#f29a2e';
      ctx.beginPath();
      ctx.arc(mx, gy - r + 2, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5c8a3a';
      ctx.fillRect(mx - 1, gy - r * 2 + 1, 3, 3);
    }
  },
};

// --- 桜の公園 ---
const sakura: Theme = {
  key: 'sakura',
  name: '桜の公園',
  dark: false,
  top: '#fbeaf0',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#dff0fb'],
      [1, '#fdf2f6'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    // 桜の木（左右の端）
    for (const side of [0, 1]) {
      const tx = side === 0 ? w * 0.06 : w * 0.94;
      ctx.fillStyle = '#7a5a4a';
      ctx.fillRect(tx - 7, gy * 0.3, 14, gy * 0.7);
      for (let k = 0; k < 14; k++) {
        const a = rnd(k, 40 + side) * TAU;
        const r = 40 + rnd(k, 42 + side) * 60;
        ctx.fillStyle = k % 2 ? '#f7c9d6' : '#f3b5c7';
        ctx.beginPath();
        ctx.arc(tx + Math.cos(a) * r * 0.9, gy * 0.22 + Math.sin(a) * r * 0.5, 34 + rnd(k, 44) * 20, 0, TAU);
        ctx.fill();
      }
    }
    // 芝生
    ctx.fillStyle = '#c8e3ad';
    ctx.fillRect(0, gy * 0.86, w, gy * 0.14 + 1);
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#a8d58c'],
      [1, '#7fb466'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    // 舞い散る花びら
    for (let i = 0; i < 40; i++) {
      const sp = 18 + rnd(i, 45) * 16;
      const yy = ((rnd(i, 46) * h + t * sp) % (h + 40)) - 20;
      const xx = ((rnd(i, 47) * w + t * sp * 0.6 + Math.sin(t + i) * 20) % (w + 40)) - 20;
      ctx.save();
      ctx.translate(xx, yy);
      ctx.rotate(t * (1 + rnd(i, 48)) + i);
      ctx.fillStyle = 'rgba(246,183,202,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2.4, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  },
};

// --- 海辺 ---
const beach: Theme = {
  key: 'beach',
  name: '海辺',
  dark: false,
  top: '#bfe6fb',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#bde6fb'],
      [1, '#e9f7ff'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    cloud(ctx, drift(w * 0.3, 5, t, w), gy * 0.16, 22, 0.85);
    cloud(ctx, drift(w * 0.8, 3.5, t, w), gy * 0.3, 16, 0.75);
    // 海
    const hz = gy * 0.62;
    const shore = gy + Math.sin(t * 0.7) * 5;
    ctx.fillStyle = vgrad(ctx, hz, shore, [
      [0, '#5fb6d8'],
      [1, '#a6dcec'],
    ]);
    ctx.fillRect(0, hz, w, shore - hz + 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    for (let r = 0; r < 5; r++) {
      const y = hz + (shore - hz) * (0.15 + r * 0.18);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.05 + t * 1.2 + r) * 1.5);
      ctx.stroke();
    }
    // カモメ
    for (let i = 0; i < 2; i++) bird(ctx, drift(i * 150, 18, t, w, 80), gy * (0.35 + i * 0.08), 8, t * 5 + i * 2, 'rgba(90,110,130,0.6)');
    // 砂浜
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#f1dcb0'],
      [1, '#dcbd88'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    // 寄せては返す波の泡
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, gy);
    for (let x = 0; x <= w; x += 10) ctx.lineTo(x, shore + 3 + Math.sin(x * 0.04 + t * 1.5) * 2);
    ctx.lineTo(w, gy - 2);
    ctx.lineTo(0, gy - 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,120,70,0.25)';
    for (let i = 0; i < w / 6; i++) ctx.fillRect(rnd(i, 50) * w, gy + 4 + rnd(i, 51) * (h - gy), 1.5, 1.5);
  },
};

// --- 宇宙 ---
const space: Theme = {
  key: 'space',
  name: '宇宙',
  dark: true,
  top: '#141433',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, h, [
      [0, '#10112e'],
      [1, '#2a1b4d'],
    ]);
    ctx.fillRect(0, 0, w, h);
    // 星雲
    for (const [x, y, r, c] of [
      [0.25, 0.3, 0.5, '220,120,200'],
      [0.8, 0.55, 0.45, '110,150,240'],
    ] as [number, number, number, string][]) {
      const g = ctx.createRadialGradient(w * x, gy * y, 0, w * x, gy * y, w * r);
      g.addColorStop(0, `rgba(${c},0.22)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, gy);
    }
    for (let i = 0; i < 110; i++) {
      const a = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.5 + rnd(i, 60)) + i));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      const s = rnd(i, 61) < 0.1 ? 2.2 : 1.3;
      ctx.fillRect(rnd(i, 62) * w, rnd(i, 63) * gy, s, s);
    }
    // 輪のある惑星（ゆっくり回る）
    const px = w * 0.2;
    const py = gy * 0.2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.35 + Math.sin(t * 0.1) * 0.05);
    ctx.fillStyle = '#e6b57a';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,130,80,0.5)';
    ctx.fillRect(-22, -4, 44, 5);
    ctx.strokeStyle = 'rgba(240,215,170,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 38, 10, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    // 流れ星
    const cyc = t % 7;
    if (cyc < 0.7) {
      const k = cyc / 0.7;
      const x = w * (0.9 - k * 0.5);
      const y = gy * (0.1 + k * 0.2);
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 36, y - 16);
      ctx.stroke();
    }
    // 小さな星の地面（大きな円の上）
    const R = Math.max(w, h) * 1.4;
    const cx = w / 2;
    const cy = gy + R;
    const pg = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.6, cx, cy, R);
    pg.addColorStop(0, '#5d5690');
    pg.addColorStop(1, '#948cc2');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,54,100,0.35)';
    for (let i = 0; i < 8; i++) {
      const x = rnd(i, 64) * w;
      const y = gy + 10 + rnd(i, 65) * (h - gy) * 0.8;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + rnd(i, 66) * 14, 4 + rnd(i, 67) * 4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(220,210,255,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 1.3, Math.PI * 1.7);
    ctx.arc(cx, cy, R - 2, Math.PI * 1.7, Math.PI * 1.3, true);
    ctx.fill();
  },
};

// --- 雨の日の窓辺 ---
const rain: Theme = {
  key: 'rain',
  name: '雨の日の窓辺',
  dark: false,
  top: '#aeb6c0',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    // 壁
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#b7bec7'],
      [1, '#c9ced4'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    // 窓（外は雨にけむる街）
    const wx0 = w * 0.08;
    const wx1 = w * 0.92;
    const wy0 = Math.max(70, gy * 0.1);
    const wy1 = gy * 0.8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    ctx.clip();
    ctx.fillStyle = vgrad(ctx, wy0, wy1, [
      [0, '#7f8b99'],
      [1, '#a9b3bd'],
    ]);
    ctx.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    // 遠くのビル（ぼんやり）
    for (let k = 0; k < 9; k++) {
      const bw = 30 + rnd(k, 70) * 50;
      const bh = (wy1 - wy0) * (0.2 + rnd(k, 71) * 0.4);
      const bx = wx0 + ((k + rnd(k, 72) * 0.5) / 9) * (wx1 - wx0);
      ctx.fillStyle = `rgba(95,108,122,${0.35 + rnd(k, 73) * 0.2})`;
      ctx.fillRect(bx, wy1 - bh, bw, bh);
    }
    // 降る雨（斜めの線）
    ctx.strokeStyle = 'rgba(230,238,245,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const sp = 500 + rnd(i, 74) * 300;
      const y = wy0 + ((((rnd(i, 75) * (wy1 - wy0) + t * sp) % (wy1 - wy0)) + (wy1 - wy0)) % (wy1 - wy0));
      const x = wx0 + rnd(i, 76) * (wx1 - wx0) - (y - wy0) * 0.12;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 14);
    }
    ctx.stroke();
    // ガラスをつたう雨粒
    for (let i = 0; i < 26; i++) {
      const sp = 8 + rnd(i, 77) * 30;
      const y = wy0 + ((((rnd(i, 78) * (wy1 - wy0) + t * sp) % (wy1 - wy0)) + (wy1 - wy0)) % (wy1 - wy0));
      const x = wx0 + rnd(i, 79) * (wx1 - wx0);
      const r = 2 + rnd(i, 80) * 2.5;
      ctx.fillStyle = 'rgba(235,242,248,0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235,242,248,0.25)';
      ctx.lineWidth = r * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y - r - sp * 0.8);
      ctx.stroke();
    }
    ctx.restore();
    // 窓枠
    ctx.strokeStyle = '#f2efe8';
    ctx.lineWidth = 8;
    ctx.strokeRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo((wx0 + wx1) / 2, wy0);
    ctx.lineTo((wx0 + wx1) / 2, wy1);
    ctx.stroke();
    // 窓台と床
    ctx.fillStyle = '#e8e2d6';
    ctx.fillRect(0, gy - 6, w, 8);
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#9c8a76'],
      [1, '#75634f'],
    ]);
    ctx.fillRect(0, gy + 2, w, h - gy);
    woodGrain(ctx, w, gy, h, 'rgba(60,40,20,0.12)');
  },
};

// --- 紅葉の山寺 ---
const autumn: Theme = {
  key: 'autumn',
  name: '紅葉の山寺',
  dark: false,
  top: '#f6e2c8',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    ctx.fillStyle = vgrad(ctx, 0, gy, [
      [0, '#cfe4f0'],
      [0.7, '#f6e6cf'],
      [1, '#f3dcc0'],
    ]);
    ctx.fillRect(0, 0, w, gy);
    // 遠くの山（紅葉）
    for (let layer = 0; layer < 2; layer++) {
      const base = gy * (0.55 + layer * 0.15);
      ctx.fillStyle = layer === 0 ? '#d9a27a' : '#c9754f';
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, base - Math.sin(x * 0.012 + layer * 2) * 30 - Math.sin(x * 0.031 + layer) * 12);
      ctx.lineTo(w, gy);
      ctx.fill();
      // 木々のこんもり
      for (let k = 0; k < 16; k++) {
        const x = rnd(k, 90 + layer) * w;
        const y = base - Math.sin(x * 0.012 + layer * 2) * 30 + 8;
        ctx.fillStyle = ['#e0572f', '#f0a030', '#d93e2c', '#e8c040'][k % 4];
        ctx.globalAlpha = layer === 0 ? 0.55 : 0.85;
        ctx.beginPath();
        ctx.arc(x, y, 14 + rnd(k, 92) * 12, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // お寺の屋根（右奥）
    const rx = w * 0.8;
    const ry = gy * 0.62;
    ctx.fillStyle = '#5a4a44';
    ctx.beginPath();
    ctx.moveTo(rx - 90, ry + 18);
    ctx.quadraticCurveTo(rx - 40, ry + 6, rx, ry - 26);
    ctx.quadraticCurveTo(rx + 40, ry + 6, rx + 90, ry + 18);
    ctx.lineTo(rx + 70, ry + 22);
    ctx.lineTo(rx - 70, ry + 22);
    ctx.fill();
    ctx.fillStyle = '#b4453a';
    ctx.fillRect(rx - 55, ry + 22, 110, gy * 0.12);
    ctx.fillStyle = '#e9dcc4';
    for (let k = 0; k < 4; k++) ctx.fillRect(rx - 46 + k * 26, ry + 28, 16, gy * 0.12 - 10);
    // 石灯籠（左）
    const lx = w * 0.12;
    ctx.fillStyle = '#a8a39a';
    ctx.fillRect(lx - 5, gy - 60, 10, 50);
    ctx.fillRect(lx - 16, gy - 12, 32, 12);
    ctx.fillRect(lx - 14, gy - 78, 28, 20);
    ctx.fillStyle = 'rgba(255,220,150,0.8)';
    ctx.fillRect(lx - 6, gy - 73, 12, 10);
    ctx.fillStyle = '#8f8a82';
    ctx.beginPath();
    ctx.moveTo(lx - 22, gy - 78);
    ctx.lineTo(lx, gy - 94);
    ctx.lineTo(lx + 22, gy - 78);
    ctx.fill();
    // 石畳の地面
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#cdbfa8'],
      [1, '#a89880'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    ctx.strokeStyle = 'rgba(110,90,70,0.2)';
    ctx.lineWidth = 1.5;
    for (let y = gy + 18; y < h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      for (let x = ((y / 26) % 2) * 30; x < w; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 26);
        ctx.stroke();
      }
    }
    // 舞い落ちる紅葉
    for (let i = 0; i < 26; i++) {
      const sp = 16 + rnd(i, 95) * 16;
      const yy = ((rnd(i, 96) * h + t * sp) % (h + 40)) - 20;
      const xx = ((rnd(i, 97) * w + Math.sin(t * 0.7 + i) * 30) % (w + 40)) - 20;
      mapleLeaf(ctx, xx, yy, 5 + rnd(i, 98) * 3, t * (0.8 + rnd(i, 99)) + i, ['#e0572f', '#f0a030', '#d93e2c', '#e8b030'][i % 4]);
    }
  },
};

/** もみじの葉（5つのとがり） */
export function mapleLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, col: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * TAU;
    const r = k % 2 === 0 ? s : s * 0.45;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,40,20,0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s * 1.2);
  ctx.stroke();
  ctx.restore();
}

/** 横向きの魚のシルエット */
function fish(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, col: string, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const wag = Math.sin(t * 8) * 0.25;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, 0);
  ctx.lineTo(-s * 1.5, -s * (0.45 + wag));
  ctx.lineTo(-s * 1.5, s * (0.45 - wag));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(s * 0.55, -s * 0.08, s * 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- 水族館の大水槽 ---
const aquarium: Theme = {
  key: 'aquarium',
  name: '水族館',
  dark: true,
  top: '#0c2d4f',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    const ty1 = gy * 0.92;
    ctx.fillStyle = vgrad(ctx, 0, ty1, [
      [0, '#2a7fb8'],
      [0.5, '#155a8e'],
      [1, '#0b3a63'],
    ]);
    ctx.fillRect(0, 0, w, ty1);
    // 上から差し込む光
    ctx.save();
    for (let k = 0; k < 5; k++) {
      const x = w * (0.1 + k * 0.2) + Math.sin(t * 0.3 + k) * 20;
      const g = ctx.createLinearGradient(0, 0, 0, ty1);
      g.addColorStop(0, 'rgba(200,240,255,0.18)');
      g.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 12, 0);
      ctx.lineTo(x + 12, 0);
      ctx.lineTo(x + 70, ty1);
      ctx.lineTo(x - 10, ty1);
      ctx.fill();
    }
    ctx.restore();
    // 群れで泳ぐ小魚
    for (let s = 0; s < 3; s++) {
      const dir = s % 2 ? -1 : 1;
      const sp = 22 + s * 9;
      const cx = drift(w * (0.3 + s * 0.3), sp * dir, t, w, 160);
      const cy = ty1 * (0.25 + s * 0.2) + Math.sin(t * 0.4 + s) * 20;
      for (let i = 0; i < 9; i++) {
        const fx = cx + (rnd(i, 100 + s) - 0.5) * 90;
        const fy = cy + (rnd(i, 103 + s) - 0.5) * 40 + Math.sin(t * 1.3 + i) * 4;
        fish(ctx, fx, fy, 6 + rnd(i, 106) * 2, dir, s === 1 ? 'rgba(250,200,90,0.8)' : 'rgba(180,220,245,0.7)', t + i);
      }
    }
    // 泡
    ctx.strokeStyle = 'rgba(220,245,255,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const sp = 20 + rnd(i, 108) * 30;
      const y = ty1 - ((rnd(i, 109) * ty1 + t * sp) % ty1);
      const x = w * (0.15 + 0.7 * rnd(i, 110)) + Math.sin(t * 2 + i) * 4;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + rnd(i, 111) * 2.5, 0, TAU);
      ctx.stroke();
    }
    // 水槽の底（砂と岩・海藻）
    ctx.fillStyle = '#c8b58a';
    ctx.beginPath();
    ctx.moveTo(0, ty1);
    for (let x = 0; x <= w; x += 30) ctx.lineTo(x, ty1 - 18 - Math.sin(x * 0.02) * 8);
    ctx.lineTo(w, ty1);
    ctx.fill();
    for (let k = 0; k < 7; k++) {
      const x = rnd(k, 112) * w;
      ctx.strokeStyle = '#3f8f5a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, ty1 - 10);
      for (let j = 1; j <= 6; j++) ctx.lineTo(x + Math.sin(t * 1.2 + j * 0.8 + k) * 6, ty1 - 10 - j * 12);
      ctx.stroke();
    }
    // 水槽の枠と、手前の床
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(0, ty1, w, gy - ty1);
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#2c3440'],
      [1, '#161c24'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = 'rgba(120,190,230,0.12)';
    ctx.fillRect(0, gy, w, 3);
  },
};

// --- 銭湯 ---
const sento: Theme = {
  key: 'sento',
  name: '銭湯',
  dark: false,
  top: '#bfe2f3',
  draw(ctx, v, gy, t) {
    const { w, h } = v;
    // 富士山のペンキ絵
    const my = gy * 0.62;
    ctx.fillStyle = vgrad(ctx, 0, my, [
      [0, '#8fcdee'],
      [1, '#d8eef8'],
    ]);
    ctx.fillRect(0, 0, w, my);
    cloud(ctx, w * 0.18, my * 0.25, 20, 0.9);
    cloud(ctx, w * 0.82, my * 0.18, 16, 0.9);
    const fx = w * 0.5;
    const top = my * 0.28;
    ctx.fillStyle = '#4f7fb5';
    ctx.beginPath();
    ctx.moveTo(fx - w * 0.55, my);
    ctx.lineTo(fx - 36, top);
    ctx.lineTo(fx + 36, top);
    ctx.lineTo(fx + w * 0.55, my);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(fx - 36, top);
    ctx.lineTo(fx + 36, top);
    ctx.lineTo(fx + 70, top + 40);
    for (let k = 0; k <= 6; k++) ctx.lineTo(fx + 70 - (140 * k) / 6, top + 40 + (k % 2 ? 14 : 0));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6f9f7c';
    ctx.beginPath();
    ctx.moveTo(0, my);
    for (let x = 0; x <= w; x += 30) ctx.lineTo(x, my - 20 - Math.sin(x * 0.02) * 12);
    ctx.lineTo(w, my);
    ctx.fill();
    // タイルの壁
    ctx.fillStyle = '#e6f2f6';
    ctx.fillRect(0, my, w, gy - my);
    ctx.strokeStyle = 'rgba(120,170,190,0.45)';
    ctx.lineWidth = 1;
    for (let y = my; y < gy; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 0; x < w; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, my);
      ctx.lineTo(x, gy);
      ctx.stroke();
    }
    // 湯船のふち（手前の床）
    ctx.fillStyle = vgrad(ctx, gy, h, [
      [0, '#a9c7d2'],
      [1, '#8aaebb'],
    ]);
    ctx.fillRect(0, gy, w, h - gy);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let y = gy + 26; y < h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 13; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // ゆらゆら立ちのぼる湯気
    for (let i = 0; i < 8; i++) {
      const sp = 14 + rnd(i, 120) * 10;
      const life = gy * 0.9;
      const k = ((rnd(i, 121) * life + t * sp) % life) / life;
      const x = w * rnd(i, 122) + Math.sin(t * 0.6 + i) * 18;
      const y = gy - k * life;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 50);
      const a = 0.22 * Math.sin(Math.PI * k);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 50, y - 50, 100, 100);
    }
  },
};

export const THEMES: Record<ThemeKey, Theme> = { room, garden, meadow, rooftop, nightWindow, kotatsu, sakura, beach, space, rain, autumn, aquarium, sento };

/** 5周目から巡るテーマ */
const LATER: ThemeKey[] = ['nightWindow', 'autumn', 'kotatsu', 'rain', 'sakura', 'sento', 'beach', 'aquarium', 'space'];

/** ねこみつの周（0 始まり）のテーマ: 部屋 → 庭先 → 草原 → 屋根の上 → そのあとは夜の窓辺・紅葉の山寺・こたつ・雨の窓辺・桜・銭湯・海辺・水族館・宇宙を巡る */
export function themeForCycle(cycle: number): Theme {
  const first: ThemeKey[] = ['room', 'garden', 'meadow', 'rooftop'];
  if (cycle < first.length) return THEMES[first[cycle]];
  return THEMES[LATER[(cycle - first.length) % LATER.length]];
}
