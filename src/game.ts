/** ゲーム進行: ステージ・猫の投下・充填率・クリア演出 */
import { Sound } from './audio';
import { Cat, type CatEnv, type CatEvent } from './cat/cat';
import { COATS, SPECIES, withGirth, type Coat, type Species, type SpeciesKey } from './cat/catTypes';
import type { Container } from './physics/container';
import { buildContainer, SHAPE_NAMES, stageShape, type ShapeKind, type ShapeSpec } from './physics/shapes';
import { World } from './physics/world';

/** 充填率がこれを超えたらクリア（猫の量が金魚鉢の容量を超える = はみ出す） */
export const FILL_GOAL = 1.0;

/** 落とす猫の体型（全ステージ共通。出やすさは SPECIES の weight） */
const KINDS: SpeciesKey[] = ['standard', 'slim', 'kitten', 'long', 'round', 'fluffy'];

/** URL の ?grumpy=1 で全員不機嫌、?grumpy=0 で不機嫌な猫なし（動作確認用） */
const forcedGrumpy = (() => {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get('grumpy');
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
})();

/** URL の ?shape=flask などで容器の形を固定できる（動作確認用） */
const forcedShape = (() => {
  try {
    const k = new URLSearchParams(globalThis.location?.search ?? '').get('shape');
    return k && k in SHAPE_NAMES ? (k as ShapeKind) : null;
  } catch {
    return null;
  }
})();

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
  /** 容器（金魚鉢・フラスコ…） */
  bowl: Container;
  /** 現在のステージの形（リスタートで同じ形を使う） */
  private shape: { spec: ShapeSpec; area: number } = stageShape(1);
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
  fill = 0;
  private fillTimer = 0;
  phase: Phase = 'playing';
  private judgeTimer = 0;
  clearTime = 0;
  clearFill = 0;
  clearReason: 'fill' | 'overflow' = 'fill';
  squeeze = 0;
  dropsThisStage = 0;
  private lastCoats: string[] = [];
  private fillCells: Float64Array = new Float64Array(0);
  private env: CatEnv;
  onClear: (() => void) | null = null;
  onFirstDrop: (() => void) | null = null;
  onCatEvent: ((kind: CatEvent, cat: Cat, strength: number) => void) | null = null;

  /** 鉢の中をかき混ぜている指（ワールド座標） */
  readonly stir = { active: false, x: 0, y: 0, vx: 0, vy: 0, lastT: 0 };
  /** 指の半径と、動きが伝わる範囲 */
  static readonly STIR_R = 24;
  static readonly STIR_REACH = 75;

  constructor() {
    this.bowl = buildContainer(this.shape.spec, this.shape.area);
    this.world = new World(this.bowl);
    const game = this;
    this.env = {
      time: 0,
      get cats() {
        return game.cats;
      },
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

  /** 吊るす位置の高さ */
  get dropY(): number {
    return this.bowl.openY - this.bowl.R * 0.72;
  }

  /** keepShape: リスタート時は同じ形・大きさのまま */
  startStage(n: number, keepShape = false): void {
    if (!keepShape || n !== this.stage) {
      this.shape = stageShape(n);
      if (forcedShape) this.shape = { spec: { kind: forcedShape, variant: 0.5 }, area: this.shape.area };
    }
    // 表示していた猫は消さずに次へ持ち越す（必ず落とせる）
    const carry = this.held
      ? { species: this.held.species, coat: this.held.coat, facing: this.held.facing, grumpy: this.held.grumpy }
      : null;
    this.stage = n;
    this.bowl = buildContainer(this.shape.spec, this.shape.area);
    this.world.clear();
    this.world.setBowl(this.bowl);
    this.world.gravityScale = 1;
    this.cats = [];
    this.held = null;
    this.stir.active = false;
    this.phase = 'playing';
    this.fill = 0;
    this.squeeze = 0;
    this.judgeTimer = 0;
    this.dropsThisStage = 0;
    this.env.cleared = false;
    this.buildFillCells();
    this.spawnHeld(carry);
    this.heldIntro = 1;
  }

  /** 最初から（ステージ1、新しい猫で） */
  reset(): void {
    this.held = null;
    this.startStage(1);
  }

  nextStage(): void {
    this.startStage(this.stage + 1);
  }

  private pickSpecies(): Species {
    if (forcedSpecies) return SPECIES[forcedSpecies];
    const kinds = KINDS;
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

  private spawnHeld(carry: { species: Species; coat: Coat; facing: 1 | -1; grumpy: boolean } | null = null): void {
    const sp = carry ? carry.species : withGirth(this.pickSpecies());
    const coat = carry ? carry.coat : this.pickCoat();
    const facing: 1 | -1 = carry ? carry.facing : Math.random() < 0.5 ? 1 : -1;
    // 少し不機嫌な猫はたまに（約12%）
    const grumpy = carry ? carry.grumpy : forcedGrumpy ?? Math.random() < 0.12;
    this.dropX = this.clampX(this.targetX, sp);
    const c = new Cat(this.world, sp, coat, facing, this.dropX, this.dropY, grumpy);
    this.held = c;
    this.heldIntro = 0;
    c.placeHeld(this.dropX, this.dropY - 200, 0);
  }

  clampX(x: number, sp: Species): number {
    // 口が猫より狭い容器（フラスコなど）では中央から落とす
    const lim = Math.max(0, this.bowl.openHalfW - sp.a * 0.95 - 6);
    return Math.max(-lim, Math.min(lim, x));
  }

  get canDrop(): boolean {
    // 表示している猫は判定中でもクリア後でも落とせる
    return this.held !== null && this.heldIntro > 0.6;
  }

  /** 容器の中（口より下）を触ったか */
  isInside(x: number, y: number): boolean {
    return this.bowl.contains(x, y);
  }

  stirStart(x: number, y: number, tMs: number): void {
    Object.assign(this.stir, { active: true, x, y, vx: 0, vy: 0, lastT: tMs });
  }

  stirMove(x: number, y: number, tMs: number): void {
    const st = this.stir;
    if (!st.active) return;
    const dt = Math.max(0.004, (tMs - st.lastT) / 1000);
    // 指の速さ（なめらかに）
    const k = 0.5;
    st.vx += ((x - st.x) / dt - st.vx) * k;
    st.vy += ((y - st.y) / dt - st.vy) * k;
    const sp = Math.hypot(st.vx, st.vy);
    if (sp > 1600) {
      st.vx *= 1600 / sp;
      st.vy *= 1600 / sp;
    }
    st.x = x;
    st.y = y;
    st.lastT = tMs;
  }

  stirEnd(): void {
    this.stir.active = false;
  }

  /**
   * かき混ぜ: 指のまわりの猫を指の動きに引きずり、指そのものは丸い物体として猫を押しのける。
   * 触られた猫は目を細め、寝ていても起きる。
   */
  private applyStir(): void {
    const st = this.stir;
    if (!st.active) return;
    const w = this.world;
    const R1 = Game.STIR_R;
    const R2 = Game.STIR_REACH;
    for (const c of this.cats) {
      const b = c.body;
      if (b.maxX < st.x - R2 || b.minX > st.x + R2 || b.maxY < st.y - R2 || b.minY > st.y + R2) continue;
      let touched = false;
      for (let i = b.start; i < b.start + b.count; i++) {
        const dx = w.x[i] - st.x;
        const dy = w.y[i] - st.y;
        const d = Math.hypot(dx, dy);
        if (d >= R2) continue;
        const f = 1 - d / R2;
        // 指の動きに引きずられる
        w.vx[i] += (st.vx - w.vx[i]) * 0.35 * f;
        w.vy[i] += (st.vy - w.vy[i]) * 0.35 * f;
        // 指の中からは押し出す
        const lim = R1 + w.r[i];
        if (d < lim) {
          const nx = d > 1e-6 ? dx / d : 0;
          const ny = d > 1e-6 ? dy / d : -1;
          w.x[i] = st.x + nx * lim;
          w.y[i] = st.y + ny * lim;
          w.vx[i] += nx * 60;
          w.vy[i] += ny * 60;
          touched = true;
        }
        if (f > 0.5) touched = true;
      }
      if (touched && c.poke()) {
        if (c.grumpy) this.sound.grumble();
        else this.sound.munyu(0.35);
      }
    }
    // 指が止まっていれば引きずる力は弱まる
    st.vx *= 0.8;
    st.vy *= 0.8;
  }

  /** snap: 指を離した位置へ合わせてから落とす（タップ操作用） */
  drop(snap = false): void {
    if (!this.canDrop || !this.held) return;
    const c = this.held;
    if (snap) {
      this.dropX = this.clampX(this.targetX, c.species);
      c.placeHeld(this.dropX, c.cy, c.heldAngle);
    }
    c.release(this.dropVX * 0.3, 60);
    this.cats.push(c);
    this.held = null;
    this.spawnTimer = 0.55;
    this.dropsThisStage++;
    // ニャー（小さい猫は高く、大きい猫は低く）
    const sp = c.species;
    this.sound.meow(Math.pow(58 * 36 / (sp.a * sp.b), 0.3) * (0.92 + Math.random() * 0.16));
    if (this.dropsThisStage === 1 && this.onFirstDrop) this.onFirstDrop();
  }

  update(dt: number): void {
    this.time += dt;
    this.env.time = this.time;

    // 吊るされた猫
    // クリアしたら次の猫は出さない（表示中の猫は落とせる）
    if (!this.held && this.phase !== 'cleared') {
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
      const y = this.dropY - (1 - e) * 200;
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

    this.applyStir();
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
          this.clearReason = this.fill >= FILL_GOAL ? 'fill' : 'overflow';
          this.phase = 'cleared';
          this.clearTime = this.time;
          this.clearFill = this.fill;
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
      this.world.gravityScale = 1 + 0.25 * this.squeeze;
    }
  }

  /** 吊るしている猫の近くまで積み上がって落ち着いている（念のための救済） */
  private overflowing(): boolean {
    for (const c of this.cats) {
      if (c.landed && c.calm > 1 && c.body.minY < this.dropY + this.bowl.R * 0.3) return true;
    }
    return false;
  }

  /**
   * 充填率の計測点。金魚鉢の内側（口まで）= 容量、
   * 口より上の「はみ出し」部分も猫がいれば数える。
   */
  private buildFillCells(): void {
    const b = this.bowl;
    const step = Math.max(7, b.R / 30);
    const pts: number[] = [];
    let cap = 0;
    for (let y = this.dropY + step / 2; y < b.bottomY; y += step) {
      for (let x = -b.halfW + step / 2; x < b.halfW; x += step) {
        if (y >= b.openY) {
          if (b.contains(x, y)) {
            pts.push(x, y);
            cap++;
          }
        } else if (Math.abs(x) < b.openHalfW) {
          pts.push(x, y);
        }
      }
    }
    this.fillCells = Float64Array.from(pts);
    this.fillCapacity = Math.max(1, cap);
  }
  private fillCapacity = 1;

  /**
   * 猫の量 ÷ 金魚鉢の容量。猫どうしの隙間は数えないので、
   * 100% を超えるには口からはみ出すまで詰める必要がある。
   */
  computeFill(): number {
    const w = this.world;
    const polys: { xs: Float64Array; ys: Float64Array; x0: number; y0: number; x1: number; y1: number }[] = [];
    // 描画の輪郭（粒子半径ぶん外側）に合わせる
    for (const c of this.cats) {
      for (const [ring, pad] of [
        [c.ring, c.ringR],
        [c.head, 3],
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
    let filled = 0;
    for (let k = 0; k < cells.length; k += 2) {
      const x = cells[k];
      const y = cells[k + 1];
      for (const p of polys) {
        if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
        if (inPoly(p.xs, p.ys, x, y)) {
          filled++;
          break;
        }
      }
    }
    return filled / this.fillCapacity;
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
