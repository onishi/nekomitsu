/** 演出（ワールド座標）: クリア時のハート、ねこけしの「ぽんっ！」・連鎖・毛玉のはじけ */

type Kind = 'heart' | 'text' | 'puff' | 'ring';

interface Floater {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  color: string;
  text: string;
  /** 文字の縁取りの色 */
  edge: string;
}

export class Effects {
  private items: Floater[] = [];

  clear(): void {
    this.items = [];
  }

  private add(f: Partial<Floater> & { kind: Kind; x: number; y: number }): void {
    if (this.items.length > 220) return;
    this.items.push({ vx: 0, vy: 0, age: 0, life: 1, size: 10, rot: 0, color: '#fff', text: '', edge: '#fff', ...f });
  }

  heart(x: number, y: number, size: number): void {
    if (this.items.length > 80) return;
    this.add({
      kind: 'heart',
      x,
      y,
      vx: (Math.random() - 0.5) * 50,
      vy: -60 - Math.random() * 50,
      life: 1.6 + Math.random() * 0.6,
      size,
      rot: (Math.random() - 0.5) * 0.6,
      color: Math.random() < 0.5 ? '#f08a8a' : '#f3a6b8',
    });
  }

  /** 大きな文字（ぽんっ！・れんさ） */
  text(text: string, x: number, y: number, size: number, color: string, life = 1.1): void {
    this.add({ kind: 'text', x, y, vy: -40, life, size, text, color, edge: '#fffaf2', rot: (Math.random() - 0.5) * 0.2 });
  }

  /** ぽんっ: 毛色の毛玉がはじけ飛び、輪が広がる */
  burst(x: number, y: number, radius: number, colors: string[]): void {
    this.add({ kind: 'ring', x, y, life: 0.45, size: radius, color: colors[0] });
    const n = 18;
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n + Math.random() * 0.3;
      const sp = 180 + Math.random() * 260;
      this.add({
        kind: 'puff',
        x: x + Math.cos(a) * radius * 0.4,
        y: y + Math.sin(a) * radius * 0.4,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        life: 0.5 + Math.random() * 0.35,
        size: 6 + Math.random() * 9,
        color: colors[k % colors.length],
      });
    }
  }

  /** 融合したときの小さなきらめきの輪 */
  ripple(x: number, y: number, radius: number, color: string): void {
    this.add({ kind: 'ring', x, y, life: 0.35, size: radius, color });
  }

  update(dt: number): void {
    for (const f of this.items) {
      f.age += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.kind === 'puff') {
        f.vy += 900 * dt;
        f.vx *= 1 - dt * 2;
      } else {
        f.vy *= 1 - dt * 1.2;
      }
      if (f.kind === 'heart') f.x += Math.sin(f.age * 5 + f.rot * 10) * 12 * dt;
    }
    this.items = this.items.filter((f) => f.age < f.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const f of this.items) {
      const t = f.age / f.life;
      ctx.save();
      if (f.kind === 'ring') {
        // 広がって消える輪
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * (0.6 + t * 0.9), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (f.kind === 'puff') {
        ctx.globalAlpha = Math.max(0, 1 - t * t);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,55,40,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      // ぽんっと出て、ふわっと消える
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 0.6);
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.scale(pop, pop);
      const s = f.size;
      if (f.kind === 'text') {
        ctx.font = `800 ${s}px 'Hiragino Maru Gothic ProN', 'Rounded Mplus 1c', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = s * 0.3;
        ctx.strokeStyle = f.edge;
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
      } else {
        ctx.beginPath();
        ctx.moveTo(0, s * 0.35);
        ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.45, -s * 0.85, 0, -s * 0.38);
        ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.2, 0, s * 0.35);
        ctx.fillStyle = f.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = s * 0.08;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
