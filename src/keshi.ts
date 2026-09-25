/**
 * ねこけし: 同じ色・柄の猫どうしがくっつくと、むにゅっと融合して1匹の大きな猫になる。
 * 大きくなりすぎると「ぽんっ！」と消え、空いた場所へ周りの猫が落ちて、また融合…と連鎖する。
 *
 * 融合は画像の切り替えではなく soft-body で行う:
 *   接触 → 2匹の当たり判定を切って引き寄せ合う（体が重なって溶ける。描画は輪郭を1つにまとめる）
 *   → 重なったら、2匹ぶんの大きさの猫1匹に置き換える（置き換えた瞬間は2匹の形に合わせて横長、
 *     そこからむにゅっと本来の猫の形へ戻る）
 */
import { Cat } from './cat/cat';
import { COATS, SPECIES, type Coat, type Species } from './cat/catTypes';
import type { Game } from './game';

/**
 * ねこけしで使う毛色（色だけでなく柄でも見分けられる）。この順に登場する。
 * 最初は4種類で、落とした数に応じて増えていく（種類が多いほど同じ猫が隣り合いにくく、難しい）
 */
// 後半の追加種類（牛柄・茶白）は、それまでの柄と見間違えにくいものだけ
export const KESHI_COATS: Coat[] = ['cha', 'kiji', 'kuro', 'shiro', 'hachi', 'saba', 'mike', 'ushi', 'chashiro'].map(
  (k) => COATS.find((c) => c.key === k)!,
);

/** 落とした数 → 登場する毛色の数。[何匹目から, 種類数] */
export const COAT_STEPS: [number, number][] = [
  [0, 4],
  [16, 5],
  [36, 6],
  [60, 7],
  [100, 8],
  [150, 9],
];

/** 4匹ぶんで消えるようになった後は、上限ラインを超えていられる時間が少しずつ短くなる（3秒 → 最短1.8秒） */
const OVER_SHRINK_FROM = 120;
function overLimitFor(drops: number): number {
  const extra = Math.max(0, drops - OVER_SHRINK_FROM);
  return Math.max(1.8, OVER_SECONDS - extra * 0.015);
}

/** この大きさ（何匹ぶん）に達したら、ぽんっと消える（80匹目からは4匹ぶん） */
export const POP_UNITS = 3;
const HARD_POP_UNITS = 4;
const HARD_POP_FROM = 80;
/** 上限ラインを超えたまま、この秒数たつとゲームオーバー */
export const OVER_SECONDS = 3;

const BEST_KEY = 'nekomitsu.keshi.best';

/** u 匹ぶんの大きさの猫の体型（ふつうの猫を拡大。頭は控えめに大きくする） */
export function keshiSpecies(u: number): Species {
  const s = SPECIES.standard;
  const k = Math.sqrt(u);
  const ringN = Math.min(28, Math.round(18 + 6 * (k - 1)));
  return {
    ...s,
    a: s.a * k,
    b: s.b * k,
    headR: s.headR * Math.pow(k, 0.7),
    ringN,
    mass: (s.mass * u * 18) / ringN,
    tailLen: s.tailLen * Math.pow(k, 0.8),
    tailWidth: s.tailWidth * Math.pow(k, 0.5),
    girth: [1, 1],
  };
}

export interface KeshiEvent {
  kind: 'merge' | 'pop' | 'gameover' | 'newcoat' | 'harder';
  x: number;
  y: number;
  /** 大きさ（何匹ぶん） */
  units: number;
  coat: Coat;
  points: number;
  /** 連鎖数（1 = 連鎖なし） */
  chain: number;
  /** 見た目の大きさ（ワールド座標） */
  size: number;
}

interface Fusion {
  a: Cat;
  b: Cat;
  t: number;
}

export class Keshi {
  score = 0;
  best = 0;
  newBest = false;
  /** 連鎖数（消えるたびに増え、静かになったら 0 に戻る） */
  chain = 0;
  private quiet = 0;
  /** 上限ラインを超えている時間 */
  overTime = 0;
  gameOver = false;
  readonly fusions: Fusion[] = [];
  private contact = new Map<string, number>();
  onEvent: ((e: KeshiEvent) => void) | null = null;
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      this.best = 0;
    }
  }

  /** 上限ライン（金魚鉢の口） */
  get lineY(): number {
    return this.game.bowl.openY + 4;
  }

  /** いま登場する毛色の数 */
  coatCount = COAT_STEPS[0][1];
  /** 上限ラインを超えていられる時間（だんだん短くなる） */
  overLimit = OVER_SECONDS;
  /** 消えるのに必要な大きさ（何匹ぶん） */
  popUnits = POP_UNITS;

  pickCoat(): Coat {
    const drops = this.game.dropsThisStage;
    let n = COAT_STEPS[0][1];
    for (const [from, count] of COAT_STEPS) if (drops >= from) n = count;
    if (n > this.coatCount) {
      // 新しい猫の登場。最初の1匹は必ずその猫にして、知らせる
      this.coatCount = n;
      const coat = KESHI_COATS[n - 1];
      const b = this.game.bowl;
      this.onEvent?.({ kind: 'newcoat', x: 0, y: b.openY, units: 1, coat, points: 0, chain: 0, size: 0 });
      return coat;
    }
    this.overLimit = overLimitFor(drops);
    if (drops >= HARD_POP_FROM && this.popUnits < HARD_POP_UNITS) {
      // 終盤: 消えるにはもっと大きく育てる必要がある
      this.popUnits = HARD_POP_UNITS;
      const b = this.game.bowl;
      this.onEvent?.({ kind: 'harder', x: 0, y: b.openY, units: HARD_POP_UNITS, coat: KESHI_COATS[0], points: 0, chain: 0, size: 0 });
    }
    return KESHI_COATS[Math.floor(Math.random() * n)];
  }

  /** 物理ステップの前: 融合中の2匹を引き寄せる */
  beforeStep(dt: number): void {
    const w = this.game.world;
    for (const f of this.fusions) {
      f.t += dt;
      const { a, b } = f;
      const ca = centroid(a);
      const cb = centroid(b);
      const ma = a.units;
      const mb = b.units;
      const mx = (ca.x * ma + cb.x * mb) / (ma + mb);
      const my = (ca.y * ma + cb.y * mb) / (ma + mb);
      // だんだん強く引き寄せる（最初はそっと、くっついたらむにゅっと）
      const k = Math.min(1, dt * (3 + 22 * f.t));
      for (const c of [a, b]) {
        const cc = c === a ? ca : cb;
        const dx = (mx - cc.x) * k * 3;
        const dy = (my - cc.y) * k * 3;
        for (let i = c.body.start; i < c.body.start + c.body.count; i++) {
          w.vx[i] += dx - w.vx[i] * k * 0.3;
          w.vy[i] += dy - w.vy[i] * k * 0.3;
        }
        c.licked = 0.6; // 気持ちよさそうな顔
      }
    }
  }

  /** 物理ステップの後: 融合の完了、新しい接触、消滅、ゲームオーバー */
  afterStep(dt: number): void {
    const game = this.game;
    // 融合の完了
    for (const f of this.fusions.slice()) {
      const ca = centroid(f.a);
      const cb = centroid(f.b);
      const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
      const reach = (f.a.species.a + f.b.species.a) * 0.42;
      if ((f.t > 0.15 && d < reach) || f.t > 0.6) this.merge(f);
    }

    // 同じ毛色どうしの接触 → 融合開始
    const cats = game.cats;
    const seen = new Set<string>();
    for (let i = 0; i < cats.length; i++) {
      const a = cats[i];
      if (a.fusing || a.popTimer >= 0 || a.age < 0.05) continue;
      for (let j = i + 1; j < cats.length; j++) {
        const b = cats[j];
        if (b.fusing || b.popTimer >= 0 || b.coat.key !== a.coat.key || b.age < 0.05) continue;
        const key = a.serial < b.serial ? `${a.serial}:${b.serial}` : `${b.serial}:${a.serial}`;
        if (touching(a, b)) {
          seen.add(key);
          const t = (this.contact.get(key) ?? 0) + dt;
          this.contact.set(key, t);
          // ちょんと触れただけでなく、少しくっついていたら融合
          if (t >= 0.1) this.startFusion(a, b);
        }
        if (a.fusing) break;
      }
    }
    for (const k of this.contact.keys()) if (!seen.has(k)) this.contact.delete(k);

    // 大きくなりすぎた猫: ふくらんで、ぽんっ
    for (const c of cats.slice()) {
      if (c.popTimer < 0) continue;
      c.popTimer -= dt;
      c.inflate = Math.min(0.35, c.inflate + dt * 0.9);
      c.licked = 0.6;
      if (c.popTimer <= 0) this.pop(c);
    }

    // 連鎖: 融合も消滅もない静かな時間が続いたら 0 に戻す
    const busy = this.fusions.length > 0 || cats.some((c) => c.popTimer >= 0);
    if (busy) this.quiet = 0;
    else {
      this.quiet += dt;
      if (this.quiet > 1.2) this.chain = 0;
    }

    // ゲームオーバー: 上限ラインを一定時間超えたら（一瞬なら OK）
    if (!this.gameOver) {
      let over = false;
      const lineY = this.lineY;
      const w = game.world;
      for (const c of cats) {
        if (c.age < 1.2 || c.fusing || c.popTimer >= 0) continue;
        for (const i of c.ring) {
          if (w.y[i] < lineY) {
            over = true;
            break;
          }
        }
        if (over) break;
      }
      this.overTime = over ? this.overTime + dt : Math.max(0, this.overTime - dt * 1.5);
      if (this.overTime > this.overLimit) this.endGame();
    }
  }

  private startFusion(a: Cat, b: Cat): void {
    a.fusing = b;
    b.fusing = a;
    a.body.ghostWith = b.body;
    b.body.ghostWith = a.body;
    this.fusions.push({ a, b, t: 0 });
    this.game.sound.munyu(0.6);
  }

  /** 2匹を、2匹ぶんの大きさの猫1匹に置き換える */
  private merge(f: Fusion): void {
    const game = this.game;
    const w = game.world;
    const { a, b } = f;
    this.fusions.splice(this.fusions.indexOf(f), 1);
    const u = a.units + b.units;
    // いまの2匹を合わせた形（胴と頭の粒子の範囲）と重心・速度
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let mx = 0;
    let my = 0;
    let mvx = 0;
    let mvy = 0;
    let ms = 0;
    for (const c of [a, b]) {
      for (const i of [...c.ring, ...c.head]) {
        x0 = Math.min(x0, w.x[i]);
        x1 = Math.max(x1, w.x[i]);
        y0 = Math.min(y0, w.y[i]);
        y1 = Math.max(y1, w.y[i]);
      }
      for (let i = c.body.start; i < c.body.start + c.body.count; i++) {
        const m = w.mass[i];
        mx += w.x[i] * m;
        my += w.y[i] * m;
        mvx += w.vx[i] * m;
        mvy += w.vy[i] * m;
        ms += m;
      }
    }
    mx /= ms;
    my /= ms;
    const big = a.units >= b.units ? a : b;
    const sp = keshiSpecies(u);
    const c = new Cat(w, sp, a.coat, big.facing, mx, my, a.grumpy && b.grumpy);
    c.units = u;
    // 寝そべった姿勢のまま（足はたたむ）
    c.legPose = 0;
    // 置き換えた瞬間は2匹を合わせた形（横長）に。そこからむにゅっと猫の形へ戻る
    const [el, er] = c.extentsAt(1);
    const sx = Math.max(0.8, Math.min(1.6, (x1 - x0 + c.ringR * 2) / (er - el)));
    const cx = (x0 + x1) / 2;
    c.placeHeld(cx, Math.min(my, y1 - sp.b * 0.9), 0, sx);
    c.release(mvx / ms, mvy / ms);
    // この直後に物理を解く前に描かれるので、形のゴールを今の形にそろえておく
    c.syncGoals();
    c.landed = true;
    c.firmness = 0.3;
    c.licked = 1;
    game.cats.push(c);
    game.removeCat(a);
    game.removeCat(b);

    const chainNow = Math.max(1, this.chain + 1);
    const points = 10 * u * chainNow;
    this.addScore(points);
    this.onEvent?.({ kind: 'merge', x: cx, y: my, units: u, coat: c.coat, points, chain: chainNow, size: sp.a });
    game.sound.munyu(0.9);
    if (u >= this.popUnits) c.popTimer = 0.45;
  }

  /** ぽんっ！ */
  private pop(c: Cat): void {
    const game = this.game;
    this.chain++;
    const chain = this.chain;
    // 連鎖ほど高得点（2連鎖で2倍、3連鎖で4倍…）
    const points = 100 * c.units * Math.pow(2, chain - 1);
    this.addScore(points);
    const hf = c.headFrame();
    this.onEvent?.({
      kind: 'pop',
      x: (c.cx + hf.x) / 2,
      y: (c.cy + hf.y) / 2,
      units: c.units,
      coat: c.coat,
      points,
      chain,
      size: c.species.a,
    });
    game.sound.pop(chain);
    game.removeCat(c);
  }

  private addScore(p: number): void {
    this.score += p;
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* ignore */
      }
    }
  }

  private endGame(): void {
    this.gameOver = true;
    this.game.phase = 'gameover';
    this.game.sound.gameOver();
    const b = this.game.bowl;
    this.onEvent?.({ kind: 'gameover', x: 0, y: b.openY, units: 0, coat: KESHI_COATS[0], points: 0, chain: 0, size: 0 });
  }

  /** 猫が取り除かれるとき（融合・消滅・リセット） */
  forget(c: Cat): void {
    for (const f of this.fusions.slice()) {
      if (f.a === c || f.b === c) {
        this.fusions.splice(this.fusions.indexOf(f), 1);
        const other = f.a === c ? f.b : f.a;
        other.fusing = null;
        other.body.ghostWith = null;
      }
    }
  }
}

function centroid(c: Cat): { x: number; y: number } {
  const w = c.world;
  let x = 0;
  let y = 0;
  for (const i of c.ring) {
    x += w.x[i];
    y += w.y[i];
  }
  return { x: x / c.ring.length, y: y / c.ring.length };
}

/** 2匹の輪郭（胴・頭）が触れ合っている点が十分あるか */
function touching(a: Cat, b: Cat): boolean {
  const ba = a.body;
  const bb = b.body;
  const m = 6;
  if (ba.maxX < bb.minX - m || bb.maxX < ba.minX - m || ba.maxY < bb.minY - m || bb.maxY < ba.minY - m) return false;
  const w = a.world;
  const pa = [...a.ring, ...a.head];
  const pb = [...b.ring, ...b.head];
  let n = 0;
  for (const i of pa) {
    for (const j of pb) {
      const lim = w.r[i] + w.r[j] + 5;
      const dx = w.x[i] - w.x[j];
      const dy = w.y[i] - w.y[j];
      if (dx * dx + dy * dy < lim * lim) {
        n++;
        break;
      }
    }
    if (n >= 3) return true;
  }
  return false;
}
