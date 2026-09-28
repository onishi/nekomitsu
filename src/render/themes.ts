/**
 * 背景の情景（ねこみつの周ごとのテーマ）。どれも画像を使わず図形で描き、雲・花びら・雪・星などがゆっくり動く。
 * 画面の座標（CSS ピクセル）で描く。gy は容器を置く地面（テーブル・縁側・草の上…）の上端。
 */
import type { View } from './scene';

export type ThemeKey = 'room' | 'garden' | 'meadow' | 'rooftop' | 'nightWindow' | 'kotatsu' | 'sakura' | 'beach' | 'space';

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

export const THEMES: Record<ThemeKey, Theme> = { room, garden, meadow, rooftop, nightWindow, kotatsu, sakura, beach, space };

/** 5周目から巡るテーマ */
const LATER: ThemeKey[] = ['nightWindow', 'kotatsu', 'sakura', 'beach', 'space'];

/** ねこみつの周（0 始まり）のテーマ: 部屋 → 庭先 → 草原 → 屋根の上 → そのあとは夜の窓辺・こたつ・桜・海辺・宇宙を巡る */
export function themeForCycle(cycle: number): Theme {
  const first: ThemeKey[] = ['room', 'garden', 'meadow', 'rooftop'];
  if (cycle < first.length) return THEMES[first[cycle]];
  return THEMES[LATER[(cycle - first.length) % LATER.length]];
}
