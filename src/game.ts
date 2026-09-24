/** ゲーム進行: ステージ・猫の投下・充填率・クリア演出 */
import { Sound } from './audio';
import { Cat, type CatEnv, type CatEvent } from './cat/cat';
import { COATS, SPECIES, type Coat, type Species, type SpeciesKey } from './cat/catTypes';
import { Bowl } from './physics/bowl';
import { World } from './physics/world';

export const FILL_GOAL = 0.9;

interface StageDef {
  R: number;
  kinds: SpeciesKey[];
}

const STAGES: StageDef[] = [
  { R: 215, kinds: ['standard', 'kitten', 'long', 'round', 'fluffy'] },
  { R: 245, kinds: ['standard', 'kitten', 'long', 'round', 'fluffy'] },
  { R: 270, kinds: ['standard', 'kitten', 'long', 'round', 'fluffy'] },
  { R: 295, kinds: ['standard', 'kitten', 'long', 'round', 'fluffy'] },
  { R: 315, kinds: ['standard', 'kitten', 'long', 'round', 'fluffy'] },
];

/** URL の ?cat=long などで体型を固定できる（動作確認用） */
const forcedSpecies = (() => {
  try {
    const k = new URLSearchParams(globalThis.location?.search ?? '').get('cat');
    return k && k in SPECIES ? (k as SpeciesKey) : null;
  } catch {
    return null;
  }
})();

export type Phase = 'playing' | 'judging' | 'cleared';

export class Game {
  stage = 1;
  bowl: Bowl;
  world: World;
  cats: Cat[] = [];
  held: Cat | null = null;
  readonly sound = new Sound();
  time = 0;
  targetX = 0;
  dropX = 0;
  private dropVX = 0;
  private spawnTimer = 0;
  /** 吊るされた猫の登場アニメ 0..1 */
  private heldIntro = 1;
  /** 判定中は吊るされた猫を上へ引っ込める 0..1 */
  private heldHide = 0;
  fill = 0;
  private fillTimer = 0;
  phase: Phase = 'playing';
  private judgeTimer = 0;
  clearTime = 0;
  clearFill = 0;
  squeeze = 0;
  dropsThisStage = 0;
  private lastCoats: string[] = [];
  private fillCells: Float64Array = new Float64Array(0);
  private env: CatEnv;
  onClear: (() => void) | null = null;
  onFirstDrop: (() => void) | null = null;
  onCatEvent: ((kind: CatEvent, cat: Cat, strength: number) => void) | null = null;

  constructor() {
    this.bowl = new Bowl(STAGES[0].R);
    this.world = new World(this.bowl);
    this.env = {
      time: 0,
      squeeze: 0,
      cleared: false,
      event: (kind, cat, strength) => this.onCatEvent?.(kind, cat, strength),
      sound: {
        posu: (v) => this.sound.posu(v),
        munyu: (v) => this.sound.munyu(v),
        supo: () => this.sound.supo(),
        purr: () => this.sound.purr(0.45),
      },
    };
    this.startStage(1);
  }

  get stageDef(): StageDef {
    return STAGES[Math.min(this.stage - 1, STAGES.length - 1)];
  }

  /** 吊るす位置の高さ */
  get dropY(): number {
    return this.bowl.openY - this.bowl.R * 0.55;
  }

  startStage(n: number): void {
    this.stage = n;
    this.bowl = new Bowl(this.stageDef.R);
    this.world.clear();
    this.world.setBowl(this.bowl);
    this.world.gravityScale = 1;
    this.cats = [];
    this.held = null;
    this.phase = 'playing';
    this.fill = 0;
    this.squeeze = 0;
    this.judgeTimer = 0;
    this.dropsThisStage = 0;
    this.env.cleared = false;
    this.heldHide = 0;
    this.buildFillCells();
    this.spawnHeld();
    this.heldIntro = 1;
  }

  restart(): void {
    this.startStage(this.stage);
  }

  nextStage(): void {
    this.startStage(this.stage + 1);
  }

  private pickSpecies(): Species {
    if (forcedSpecies) return SPECIES[forcedSpecies];
    const kinds = this.stageDef.kinds;
    // 最初の1匹は「ふつうの猫」で核の体験を確実に
    if (this.dropsThisStage === 0 && this.stage === 1) return SPECIES.standard;
    let tot = 0;
    for (const k of kinds) tot += SPECIES[k].weight;
    let r = Math.random() * tot;
    for (const k of kinds) {
      r -= SPECIES[k].weight;
      if (r <= 0) return SPECIES[k];
    }
    return SPECIES.standard;
  }

  private pickCoat(): Coat {
    for (let tries = 0; tries < 10; tries++) {
      const c = COATS[Math.floor(Math.random() * COATS.length)];
      if (!this.lastCoats.includes(c.key)) {
        this.lastCoats.push(c.key);
        if (this.lastCoats.length > 2) this.lastCoats.shift();
        return c;
      }
    }
    return COATS[0];
  }

  private spawnHeld(): void {
    const sp = this.pickSpecies();
    const coat = this.pickCoat();
    const facing: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    this.dropX = this.clampX(this.targetX, sp);
    const c = new Cat(this.world, sp, coat, facing, this.dropX, this.dropY);
    this.held = c;
    this.heldIntro = 0;
    c.placeHeld(this.dropX, this.dropY - 200, 0);
  }

  clampX(x: number, sp: Species): number {
    const lim = this.bowl.openHalfW - sp.a * 0.95 - 6;
    return Math.max(-lim, Math.min(lim, x));
  }

  get canDrop(): boolean {
    return this.phase === 'playing' && this.held !== null && this.heldIntro > 0.6 && this.heldHide < 0.3;
  }

  drop(): void {
    if (!this.canDrop || !this.held) return;
    const c = this.held;
    c.release(this.dropVX * 0.3, 60);
    this.cats.push(c);
    this.held = null;
    this.spawnTimer = 0.55;
    this.dropsThisStage++;
    this.sound.drop();
    if (this.dropsThisStage === 1 && this.onFirstDrop) this.onFirstDrop();
  }

  update(dt: number): void {
    this.time += dt;
    this.env.time = this.time;

    // 吊るされた猫
    if (!this.held && this.phase === 'playing') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) this.spawnHeld();
    }
    if (this.held) {
      const c = this.held;
      const prev = this.dropX;
      const tx = this.clampX(this.targetX, c.species);
      this.dropX += (tx - this.dropX) * Math.min(1, dt * 12);
      this.dropVX = (this.dropX - prev) / dt;
      this.heldIntro = Math.min(1, this.heldIntro + dt * 3.2);
      const e = 1 - Math.pow(1 - this.heldIntro, 3);
      const hideTarget = this.phase !== 'playing' ? 1 : 0;
      this.heldHide += (hideTarget - this.heldHide) * Math.min(1, dt * 5);
      const y = this.dropY - (1 - e) * 200 - this.heldHide * 420;
      // 移動に合わせてぶらーんと傾く
      const sway = Math.sin(this.time * 2.1) * 0.05;
      const ang = Math.max(-0.4, Math.min(0.4, -this.dropVX * 0.0007)) + sway;
      c.heldAngle = ang;
      c.placeHeld(this.dropX, y, ang);
    }

    // 猫のふるまい
    this.env.squeeze = this.squeeze;
    for (const c of this.cats) c.update(dt, this.env);
    if (this.held) this.held.update(dt, this.env);

    this.world.beginFrame();
    this.world.step();

    // 充填率
    this.fillTimer -= dt;
    if (this.fillTimer <= 0) {
      this.fillTimer = 0.2;
      this.fill = this.computeFill();
    }
    this.updatePhase(dt);
  }

  private updatePhase(dt: number): void {
    if (this.phase === 'playing') {
      const full = this.fill >= FILL_GOAL || this.overflowing();
      if (full && this.cats.length > 0) {
        this.phase = 'judging';
        this.judgeTimer = 0;
      }
    } else if (this.phase === 'judging') {
      this.judgeTimer += dt;
      // 物理が落ち着くのを待ってから判定
      let maxSpeed = 0;
      for (const c of this.cats) maxSpeed = Math.max(maxSpeed, c.avgSpeed);
      const settled = maxSpeed < 45 && this.judgeTimer > 1.0;
      if (settled || this.judgeTimer > 4) {
        if (this.fill >= FILL_GOAL || this.overflowing()) {
          this.phase = 'cleared';
          this.clearTime = this.time;
          this.clearFill = Math.max(this.fill, FILL_GOAL);
          this.env.cleared = true;
          this.sound.clear();
          if (this.onClear) this.onClear();
        } else {
          // 猫が隙間へ流れ込んで減った: 続行
          this.phase = 'playing';
        }
      }
    } else if (this.phase === 'cleared') {
      // 全員でむにゅっと押し合って収まる
      const t = this.time - this.clearTime;
      let s: number;
      if (t < 0.35) s = t / 0.35;
      else if (t < 0.8) s = 1;
      else s = Math.max(0.35, 1 - (t - 0.8) / 0.6);
      this.squeeze = s * s * (3 - 2 * s);
      this.world.gravityScale = 1 + 0.5 * this.squeeze;
    }
  }

  /** 口より上まで積み上がって落ち着いている */
  private overflowing(): boolean {
    for (const c of this.cats) {
      if (c.landed && c.calm > 1 && c.cy < this.bowl.openY - this.bowl.R * 0.12) return true;
    }
    return false;
  }

  private buildFillCells(): void {
    const b = this.bowl;
    const step = Math.max(7, b.R / 30);
    const top = this.fillTop;
    const pts: number[] = [];
    for (let y = top + step / 2; y < b.bottomY; y += step) {
      for (let x = -b.R + step / 2; x < b.R; x += step) {
        if (b.insideFillRegion(x, y, top)) pts.push(x, y);
      }
    }
    this.fillCells = Float64Array.from(pts);
  }

  /** 満たすべき領域の上端（口の少し下） */
  get fillTop(): number {
    return this.bowl.openY + this.bowl.R * 0.05;
  }

  /** 金魚鉢内部が猫で埋まっている割合（細い隙間は埋まっているとみなす） */
  computeFill(): number {
    const w = this.world;
    const polys: { xs: Float64Array; ys: Float64Array; x0: number; y0: number; x1: number; y1: number }[] = [];
    const dil = 7;
    for (const c of this.cats) {
      for (const [ring, pad] of [
        [c.ring, c.ringR + dil],
        [c.head, 4 + dil],
      ] as [number[], number][]) {
        const n = ring.length;
        let cx = 0;
        let cy = 0;
        for (const i of ring) {
          cx += w.x[i];
          cy += w.y[i];
        }
        cx /= n;
        cy /= n;
        const xs = new Float64Array(n);
        const ys = new Float64Array(n);
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (let k = 0; k < n; k++) {
          const i = ring[k];
          const dx = w.x[i] - cx;
          const dy = w.y[i] - cy;
          const l = Math.hypot(dx, dy) || 1;
          xs[k] = w.x[i] + (dx / l) * pad;
          ys[k] = w.y[i] + (dy / l) * pad;
          x0 = Math.min(x0, xs[k]);
          y0 = Math.min(y0, ys[k]);
          x1 = Math.max(x1, xs[k]);
          y1 = Math.max(y1, ys[k]);
        }
        polys.push({ xs, ys, x0, y0, x1, y1 });
      }
    }
    const cells = this.fillCells;
    const total = cells.length / 2;
    if (total === 0) return 0;
    const R = this.bowl.R;
    const edge = R - 9; // ガラス際の細い隙間は埋まっている扱い
    let filled = 0;
    for (let k = 0; k < cells.length; k += 2) {
      const x = cells[k];
      const y = cells[k + 1];
      let hit = false;
      for (const p of polys) {
        if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
        if (inPoly(p.xs, p.ys, x, y)) {
          hit = true;
          break;
        }
      }
      if (!hit && x * x + y * y > edge * edge) {
        // ガラス際: すぐ内側が猫なら埋まっている
        const s = (edge - 6) / Math.hypot(x, y);
        const ix = x * s;
        const iy = y * s;
        for (const p of polys) {
          if (ix < p.x0 || ix > p.x1 || iy < p.y0 || iy > p.y1) continue;
          if (inPoly(p.xs, p.ys, ix, iy)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) filled++;
    }
    return filled / total;
  }
}

function inPoly(xs: Float64Array, ys: Float64Array, px: number, py: number): boolean {
  let inside = false;
  const n = xs.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (ys[i] > py !== ys[j] > py && px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
  }
  return inside;
}
