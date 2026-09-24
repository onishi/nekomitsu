/** 擬音の文字とハートの演出（ワールド座標） */

interface Floater {
  kind: 'text' | 'heart';
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  color: string;
}

export class Effects {
  private items: Floater[] = [];

  clear(): void {
    this.items = [];
  }

  text(text: string, x: number, y: number, size: number, color = '#b5704a'): void {
    if (this.items.length > 40) return;
    this.items.push({
      kind: 'text',
      text,
      x,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: -38,
      age: 0,
      life: 1.1,
      size,
      rot: (Math.random() - 0.5) * 0.35,
      color,
    });
  }

  heart(x: number, y: number, size: number): void {
    if (this.items.length > 80) return;
    this.items.push({
      kind: 'heart',
      text: '',
      x,
      y,
      vx: (Math.random() - 0.5) * 50,
      vy: -60 - Math.random() * 50,
      age: 0,
      life: 1.6 + Math.random() * 0.6,
      size,
      rot: (Math.random() - 0.5) * 0.6,
      color: Math.random() < 0.5 ? '#f08a8a' : '#f3a6b8',
    });
  }

  update(dt: number): void {
    for (const f of this.items) {
      f.age += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy *= 1 - dt * 1.2;
      if (f.kind === 'heart') f.x += Math.sin(f.age * 5 + f.rot * 10) * 12 * dt;
    }
    this.items = this.items.filter((f) => f.age < f.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const f of this.items) {
      const t = f.age / f.life;
      // ぽんっと出て、ふわっと消える
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.5 : 1.1 - Math.min(0.1, (t - 0.12) * 0.5);
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.scale(pop, pop);
      if (f.kind === 'text') {
        ctx.font = `800 ${f.size}px 'Hiragino Maru Gothic ProN', 'Rounded Mplus 1c', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = f.size * 0.28;
        ctx.strokeStyle = 'rgba(255,252,246,0.95)';
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
      } else {
        const s = f.size;
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
