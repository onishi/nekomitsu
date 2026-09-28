/**
 * 桜の公園の花びら・紅葉の山寺のもみじ（ワールド座標）。手前で舞い、猫の上に落ちると、しばらく乗ったまま一緒に動き、やがて消える。
 * 見た目だけで、物理には関わらない。
 */
import type { Cat } from '../cat/cat';
import type { Container } from '../physics/container';
import type { World } from '../physics/world';
import { mapleLeaf } from './themes';

export type PetalKind = 'petal' | 'leaf';
const LEAF_COLORS = ['#e0572f', '#f0a030', '#d93e2c', '#e8b030'];

interface Petal {
  kind: PetalKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sway: number;
  phase: number;
  rot: number;
  spin: number;
  size: number;
  age: number;
  /** 乗っている猫と、その輪郭の点（cat.ring の何番目か） */
  on: Cat | null;
  k: number;
  /** 乗ってからの時間 */
  rest: number;
}

const MAX = 26;
const REST = 5;

export class Petals {
  private items: Petal[] = [];
  private spawn = 0;

  clear(): void {
    this.items = [];
  }

  /** 風が吹いて、左から一度にたくさん吹き付ける */
  gust(kind: PetalKind, n: number, bowl: Container, topY: number): void {
    const R = bowl.R;
    const w = Math.max(bowl.halfW, 200);
    for (let k = 0; k < n && this.items.length < MAX * 2; k++) {
      this.items.push(this.make(kind, -w * (1.4 + Math.random() * 0.8), topY + Math.random() * (bowl.openY - topY + R * 0.5), R));
      const p = this.items[this.items.length - 1];
      p.vx = R * (1.2 + Math.random() * 0.8);
      p.age = 0.6;
    }
  }

  private make(kind: PetalKind, x: number, y: number, R: number): Petal {
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: R * (0.16 + Math.random() * 0.08),
      sway: 20 + Math.random() * 30,
      phase: Math.random() * 6.28,
      rot: Math.random() * 6.28,
      spin: (Math.random() - 0.5) * 3,
      size: (kind === 'leaf' ? 6 : 5) + Math.random() * 3,
      age: 0,
      on: null,
      k: 0,
      rest: 0,
    };
  }

  /** active: 降らせるもの（null なら止める。止めても、降っているものはそのまま最後まで見せる） */
  update(dt: number, active: PetalKind | null, bowl: Container, cats: readonly Cat[], world: World, topY: number): void {
    const R = bowl.R;
    if (active) {
      this.spawn -= dt;
      if (this.spawn <= 0 && this.items.length < MAX) {
        this.spawn = 0.35 + Math.random() * 0.5;
        const w = Math.max(bowl.halfW, 200) * 1.2;
        this.items.push(this.make(active, (Math.random() * 2 - 1) * w, topY - 40, R));
      }
    }
    const boxes = new Map<Cat, [number, number, number, number]>();
    const box = (c: Cat) => {
      let b = boxes.get(c);
      if (!b) {
        b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const i of c.ring) {
          b[0] = Math.min(b[0], world.x[i]);
          b[1] = Math.min(b[1], world.y[i]);
          b[2] = Math.max(b[2], world.x[i]);
          b[3] = Math.max(b[3], world.y[i]);
        }
        boxes.set(c, b);
      }
      return b;
    };
    const floor = bowl.bottomY + R * 0.15;
    this.items = this.items.filter((p) => {
      p.age += dt;
      if (p.on) {
        if (!cats.includes(p.on)) {
          p.on = null;
        } else {
          p.rest += dt;
          const i = p.on.ring[p.k];
          p.x = world.x[i];
          p.y = world.y[i];
          return p.rest < REST;
        }
      }
      p.y += p.vy * dt;
      const dx = Math.sin(p.age * 1.3 + p.phase) * p.sway * dt;
      p.x += dx + p.vx * dt;
      p.vx *= Math.exp(-dt * 0.9);
      p.rot += p.spin * dt;
      // 猫に当たったら乗る
      for (const c of cats) {
        if (!c.landed) continue;
        const b = box(c);
        if (p.x < b[0] || p.x > b[2] || p.y < b[1] || p.y > b[3]) continue;
        if (!inside(c.ring, world, p.x, p.y)) continue;
        let best = 0;
        let bd = Infinity;
        c.ring.forEach((i, k) => {
          const d = (world.x[i] - p.x) ** 2 + (world.y[i] - p.y) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        });
        p.on = c;
        p.k = best;
        p.rest = 0;
        break;
      }
      return p.y < floor && p.x < Math.max(bowl.halfW, 200) * 3;
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const a = p.on ? Math.min(1, (REST - p.rest) / 1.2) : Math.min(1, p.age / 0.6);
      if (a <= 0) continue;
      const s = p.size;
      if (p.kind === 'leaf') {
        ctx.save();
        ctx.globalAlpha = a;
        mapleLeaf(ctx, p.x, p.y, s * 1.2, p.rot, LEAF_COLORS[Math.floor(p.phase * 10) % 4]);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      // 先が少し割れた花びら
      ctx.beginPath();
      ctx.moveTo(0, s);
      ctx.bezierCurveTo(s * 0.9, s * 0.4, s * 0.7, -s * 0.8, s * 0.18, -s);
      ctx.lineTo(0, -s * 0.72);
      ctx.lineTo(-s * 0.18, -s);
      ctx.bezierCurveTo(-s * 0.7, -s * 0.8, -s * 0.9, s * 0.4, 0, s);
      ctx.fillStyle = '#f9c9d6';
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,130,160,0.55)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** 点が輪郭の内側か（偶奇判定） */
function inside(ring: readonly number[], w: World, x: number, y: number): boolean {
  let c = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const xa = w.x[ring[a]];
    const ya = w.y[ring[a]];
    const xb = w.x[ring[b]];
    const yb = w.y[ring[b]];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c;
  }
  return c;
}
