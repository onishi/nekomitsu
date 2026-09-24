/**
 * 猫専用の soft-body ソルバ。
 *
 * - 位置ベース動力学（小ステップ XPBD）: 距離・面積（体積保存）制約
 * - シェイプマッチング（Müller 2005）: 「本来の猫の形」へ戻ろうとする力。
 *   部位ごとにクラスタと剛性を分け、胴体は affine 変形（β）を許して
 *   漫画的な squash & stretch をさせる。
 * - 衝突: 粒子 vs 他の猫の輪郭ポリゴン（カプセル状の厚み付き）、粒子 vs 金魚鉢。
 *
 * 物理と描画は分離しており、この層は猫の見た目について何も知らない。
 */
import { Bowl, type Contact } from './bowl';

export const CONTACT_BOWL = 1;
export const CONTACT_CAT = 2;

export interface Poly {
  id: number;
  body: SoftBody;
  idx: Int32Array;
  /** 輪郭の厚み（辺をカプセルとして扱う半径） */
  radius: number;
}

export interface AreaConstraint {
  idx: Int32Array;
  rest: number;
  /** rest に掛ける倍率（呼吸・圧縮演出用） */
  scale: number;
  compliance: number;
}

export class ShapeCluster {
  readonly idx: Int32Array;
  readonly wt: Float64Array;
  readonly stiff: Float64Array;
  readonly restX: Float64Array;
  readonly restY: Float64Array;
  readonly qx: Float64Array;
  readonly qy: Float64Array;
  readonly goalX: Float64Array;
  readonly goalY: Float64Array;
  /** affine 変形の混合率（0 = 剛体的, 1 = 完全 affine） */
  beta: number;
  /** 全体剛性倍率（猫がリラックスすると下がる） */
  stiffMul = 1;
  /** affine 変形の伸縮上限 */
  stretchMin = 0.6;
  stretchMax = 1.7;
  private iqa = 1;
  private iqb = 0;
  private iqc = 0;
  private iqd = 1;
  cx = 0;
  cy = 0;
  angle = 0;
  /** 最後の affine 変形の主伸縮（描画・表情用） */
  squash = 1;
  /** 抽出した回転角を補正するフック（首の可動域・起き上がり補助） */
  angleHook: ((a: number) => number) | null = null;

  constructor(idx: number[], restX: number[], restY: number[], wt: number[], stiff: number[], beta: number) {
    const n = idx.length;
    this.idx = Int32Array.from(idx);
    this.restX = Float64Array.from(restX);
    this.restY = Float64Array.from(restY);
    this.wt = Float64Array.from(wt);
    this.stiff = Float64Array.from(stiff);
    this.qx = new Float64Array(n);
    this.qy = new Float64Array(n);
    this.goalX = new Float64Array(n);
    this.goalY = new Float64Array(n);
    this.beta = beta;
    this.recompute();
  }

  /** rest 形状を変えたら呼ぶ */
  recompute(): void {
    const n = this.idx.length;
    let sw = 0;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < n; k++) {
      sw += this.wt[k];
      sx += this.wt[k] * this.restX[k];
      sy += this.wt[k] * this.restY[k];
    }
    sx /= sw;
    sy /= sw;
    let a = 0;
    let b = 0;
    let d = 0;
    for (let k = 0; k < n; k++) {
      const qx = this.restX[k] - sx;
      const qy = this.restY[k] - sy;
      this.qx[k] = qx;
      this.qy[k] = qy;
      a += this.wt[k] * qx * qx;
      b += this.wt[k] * qx * qy;
      d += this.wt[k] * qy * qy;
    }
    const det = a * d - b * b || 1e-9;
    this.iqa = d / det;
    this.iqb = -b / det;
    this.iqc = -b / det;
    this.iqd = a / det;
  }

  solve(world: World, frameToSub: (k: number) => number): void {
    const { x, y, w } = world;
    const n = this.idx.length;
    let sw = 0;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < n; k++) {
      const i = this.idx[k];
      sw += this.wt[k];
      cx += this.wt[k] * x[i];
      cy += this.wt[k] * y[i];
    }
    cx /= sw;
    cy /= sw;
    // Apq
    let p00 = 0;
    let p01 = 0;
    let p10 = 0;
    let p11 = 0;
    for (let k = 0; k < n; k++) {
      const i = this.idx[k];
      const px = (x[i] - cx) * this.wt[k];
      const py = (y[i] - cy) * this.wt[k];
      p00 += px * this.qx[k];
      p01 += px * this.qy[k];
      p10 += py * this.qx[k];
      p11 += py * this.qy[k];
    }
    let ang = Math.atan2(p10 - p01, p00 + p11);
    if (this.angleHook) ang = this.angleHook(ang);
    this.angle = ang;
    this.cx = cx;
    this.cy = cy;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    let m00 = cs;
    let m01 = -sn;
    let m10 = sn;
    let m11 = cs;
    this.squash = 1;
    if (this.beta > 0) {
      // A = Apq * Aqq^-1
      let a00 = p00 * this.iqa + p01 * this.iqc;
      let a01 = p00 * this.iqb + p01 * this.iqd;
      let a10 = p10 * this.iqa + p11 * this.iqc;
      let a11 = p10 * this.iqb + p11 * this.iqd;
      // 対称部分 S = R^T A を取り出して主伸縮をクランプ
      let s00 = cs * a00 + sn * a10;
      let s01 = cs * a01 + sn * a11;
      let s10 = -sn * a00 + cs * a10;
      let s11 = -sn * a01 + cs * a11;
      const so = 0.5 * (s01 + s10);
      s01 = so;
      s10 = so;
      // 固有分解（2x2 対称）
      const tr = 0.5 * (s00 + s11);
      const df = 0.5 * (s00 - s11);
      const rad = Math.sqrt(df * df + so * so);
      let l1 = tr + rad;
      let l2 = tr - rad;
      const th = 0.5 * Math.atan2(2 * so, s00 - s11);
      // 面積保存（det=1）
      const det = l1 * l2;
      if (det > 1e-6) {
        const sd = 1 / Math.sqrt(det);
        l1 *= sd;
        l2 *= sd;
      } else {
        l1 = 1;
        l2 = 1;
      }
      l1 = Math.min(this.stretchMax, Math.max(this.stretchMin, l1));
      l2 = Math.min(this.stretchMax, Math.max(this.stretchMin, l2));
      this.squash = l1 / l2;
      const ec = Math.cos(th);
      const es = Math.sin(th);
      // S' = E diag(l1,l2) E^T
      s00 = ec * ec * l1 + es * es * l2;
      s11 = es * es * l1 + ec * ec * l2;
      s01 = ec * es * (l1 - l2);
      // A' = R S'
      a00 = cs * s00 - sn * s01;
      a01 = cs * s01 - sn * s11;
      a10 = sn * s00 + cs * s01;
      a11 = sn * s01 + cs * s11;
      const b = this.beta;
      m00 = b * a00 + (1 - b) * cs;
      m01 = b * a01 + (1 - b) * -sn;
      m10 = b * a10 + (1 - b) * sn;
      m11 = b * a11 + (1 - b) * cs;
    }
    const mul = this.stiffMul;
    for (let k = 0; k < n; k++) {
      const i = this.idx[k];
      const gx = cx + m00 * this.qx[k] + m01 * this.qy[k];
      const gy = cy + m10 * this.qx[k] + m11 * this.qy[k];
      this.goalX[k] = gx;
      this.goalY[k] = gy;
      if (w[i] === 0) continue;
      const s = frameToSub(Math.min(0.999, this.stiff[k] * mul));
      x[i] += (gx - x[i]) * s;
      y[i] += (gy - y[i]) * s;
    }
  }
}

export class SoftBody {
  readonly id: number;
  start = 0;
  count = 0;
  dA: number[] = [];
  dB: number[] = [];
  dRest: number[] = [];
  dComp: number[] = [];
  clusters: ShapeCluster[] = [];
  areas: AreaConstraint[] = [];
  polys: Poly[] = [];
  kinematic = false;
  /** 内部振動の減衰（1/s）。重心運動は減衰させない */
  internalDamping = 3;
  friction = 0.3;
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;

  constructor(id: number) {
    this.id = id;
  }

  addDistance(a: number, b: number, compliance: number, world: World, rest?: number): void {
    this.dA.push(a);
    this.dB.push(b);
    this.dRest.push(rest ?? Math.hypot(world.x[a] - world.x[b], world.y[a] - world.y[b]));
    this.dComp.push(compliance);
  }
}

const tmpContact: Contact = { x: 0, y: 0, nx: 0, ny: 0, hit: false };

export class World {
  cap: number;
  n = 0;
  x: Float64Array;
  y: Float64Array;
  px: Float64Array;
  py: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  w: Float64Array;
  /** 質量（kinematic 化から戻すため保存） */
  mass: Float64Array;
  r: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  owner: Int32Array;
  contact: Uint8Array;
  /** 他の猫との接触回数（フレーム内累積、飽和） */
  catHits: Uint8Array;
  cnx: Float32Array;
  cny: Float32Array;
  bodies: SoftBody[] = [];
  polys: Poly[] = [];
  gravity = 1500;
  gravityScale = 1;
  substeps = 4;
  frameDt = 1 / 60;
  bowl: Bowl;
  glassFriction = 0.12;

  // edge grid
  private cell = 36;
  private gx0 = 0;
  private gy0 = 0;
  private cols = 1;
  private rows = 1;
  private cellStart = new Int32Array(1);
  private cellItems = new Int32Array(1024);
  private eA = new Int32Array(1024);
  private eB = new Int32Array(1024);
  private eBody = new Int32Array(1024);
  private ePoly = new Int32Array(1024);
  private eRad = new Float64Array(1024);
  private subK = new Map<number, number>();

  constructor(bowl: Bowl, cap = 4096) {
    this.cap = cap;
    this.x = new Float64Array(cap);
    this.y = new Float64Array(cap);
    this.px = new Float64Array(cap);
    this.py = new Float64Array(cap);
    this.vx = new Float64Array(cap);
    this.vy = new Float64Array(cap);
    this.w = new Float64Array(cap);
    this.mass = new Float64Array(cap);
    this.r = new Float64Array(cap);
    this.ax = new Float64Array(cap);
    this.ay = new Float64Array(cap);
    this.owner = new Int32Array(cap);
    this.contact = new Uint8Array(cap);
    this.catHits = new Uint8Array(cap);
    this.cnx = new Float32Array(cap);
    this.cny = new Float32Array(cap);
    this.bowl = bowl;
    this.setBowl(bowl);
  }

  setBowl(bowl: Bowl): void {
    this.bowl = bowl;
    const R = bowl.R;
    this.gx0 = -R * 1.2;
    this.gy0 = -R * 4;
    this.cols = Math.ceil((R * 2.4) / this.cell) + 1;
    this.rows = Math.ceil((R * 5.2) / this.cell) + 1;
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
  }

  clear(): void {
    this.n = 0;
    this.bodies = [];
    this.polys = [];
  }

  createBody(): SoftBody {
    const b = new SoftBody(this.bodies.length);
    b.start = this.n;
    this.bodies.push(b);
    return b;
  }

  addParticle(body: SoftBody, x: number, y: number, mass: number, r: number): number {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.mass[i] = mass;
    this.w[i] = 1 / mass;
    this.r[i] = r;
    this.ax[i] = 0;
    this.ay[i] = 0;
    this.owner[i] = body.id;
    this.contact[i] = 0;
    this.catHits[i] = 0;
    body.count = this.n - body.start;
    return i;
  }

  addPoly(body: SoftBody, idx: number[], radius: number): Poly {
    const p: Poly = { id: this.polys.length, body, idx: Int32Array.from(idx), radius };
    this.polys.push(p);
    body.polys.push(p);
    return p;
  }

  setKinematic(body: SoftBody, on: boolean): void {
    body.kinematic = on;
    for (let i = body.start; i < body.start + body.count; i++) {
      this.w[i] = on ? 0 : 1 / this.mass[i];
      if (on) {
        this.vx[i] = 0;
        this.vy[i] = 0;
      }
    }
  }

  private grow(): void {
    const nc = this.cap * 2;
    const f64 = (a: Float64Array) => {
      const b = new Float64Array(nc);
      b.set(a);
      return b;
    };
    const f32 = (a: Float32Array) => {
      const b = new Float32Array(nc);
      b.set(a);
      return b;
    };
    this.x = f64(this.x);
    this.y = f64(this.y);
    this.px = f64(this.px);
    this.py = f64(this.py);
    this.vx = f64(this.vx);
    this.vy = f64(this.vy);
    this.w = f64(this.w);
    this.mass = f64(this.mass);
    this.r = f64(this.r);
    this.ax = f64(this.ax);
    this.ay = f64(this.ay);
    const o = new Int32Array(nc);
    o.set(this.owner);
    this.owner = o;
    const c = new Uint8Array(nc);
    c.set(this.contact);
    this.contact = c;
    const h = new Uint8Array(nc);
    h.set(this.catHits);
    this.catHits = h;
    this.cnx = f32(this.cnx);
    this.cny = f32(this.cny);
    this.cap = nc;
  }

  /** フレーム開始時: 接触フラグをリセット */
  beginFrame(): void {
    this.contact.fill(0, 0, this.n);
    this.catHits.fill(0, 0, this.n);
  }

  private frameToSub = (k: number): number => {
    // 1 フレームあたりの剛性 k をサブステップあたりへ変換（量子化してキャッシュ）
    const key = Math.round(k * 2000);
    let v = this.subK.get(key);
    if (v === undefined) {
      v = 1 - Math.pow(1 - key / 2000, 1 / this.substeps);
      this.subK.set(key, v);
    }
    return v;
  };

  step(): void {
    const h = this.frameDt / this.substeps;
    for (let s = 0; s < this.substeps; s++) this.substep(h);
    this.updateAabbs();
  }

  private substep(h: number): void {
    const { x, y, px, py, vx, vy, w, ax, ay } = this;
    const n = this.n;
    const g = this.gravity * this.gravityScale;
    for (let i = 0; i < n; i++) {
      px[i] = x[i];
      py[i] = y[i];
      if (w[i] === 0) continue;
      vx[i] += ax[i] * h;
      vy[i] += (g + ay[i]) * h;
      x[i] += vx[i] * h;
      y[i] += vy[i] * h;
    }
    for (const b of this.bodies) {
      if (b.kinematic) continue;
      for (const c of b.clusters) c.solve(this, this.frameToSub);
      this.solveDistances(b, h);
      for (const a of b.areas) this.solveArea(a, h);
    }
    this.updateAabbs();
    this.collideCats();
    this.collideBowl();
    // 速度更新と減衰
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      vx[i] = (x[i] - px[i]) / h;
      vy[i] = (y[i] - py[i]) / h;
    }
    for (const b of this.bodies) {
      if (b.kinematic) continue;
      let mx = 0;
      let my = 0;
      let ms = 0;
      const e = b.start + b.count;
      for (let i = b.start; i < e; i++) {
        const m = this.mass[i];
        mx += vx[i] * m;
        my += vy[i] * m;
        ms += m;
      }
      mx /= ms;
      my /= ms;
      const f = Math.exp(-b.internalDamping * h);
      const air = Math.exp(-0.05 * h);
      for (let i = b.start; i < e; i++) {
        let nvx = (mx + (vx[i] - mx) * f) * air;
        let nvy = (my + (vy[i] - my) * f) * air;
        const sp = nvx * nvx + nvy * nvy;
        if (sp > 3000 * 3000) {
          const k = 3000 / Math.sqrt(sp);
          nvx *= k;
          nvy *= k;
        }
        vx[i] = nvx;
        vy[i] = nvy;
      }
    }
  }

  private solveDistances(b: SoftBody, h: number): void {
    const { x, y, w } = this;
    const ih2 = 1 / (h * h);
    const n = b.dA.length;
    for (let k = 0; k < n; k++) {
      const i = b.dA[k];
      const j = b.dB[k];
      const wi = w[i];
      const wj = w[j];
      const ws = wi + wj;
      if (ws === 0) continue;
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-9) continue;
      const C = d - b.dRest[k];
      const l = C / (ws + b.dComp[k] * ih2);
      const nx = dx / d;
      const ny = dy / d;
      x[i] += nx * l * wi;
      y[i] += ny * l * wi;
      x[j] -= nx * l * wj;
      y[j] -= ny * l * wj;
    }
  }

  private solveArea(a: AreaConstraint, h: number): void {
    const { x, y, w } = this;
    const idx = a.idx;
    const n = idx.length;
    let A = 0;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      const j = idx[(k + 1) % n];
      A += x[i] * y[j] - x[j] * y[i];
    }
    A *= 0.5;
    const C = A - a.rest * a.scale;
    let den = 0;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      const ip = idx[(k + n - 1) % n];
      const inx = idx[(k + 1) % n];
      const gx = 0.5 * (y[inx] - y[ip]);
      const gy = 0.5 * (x[ip] - x[inx]);
      den += w[i] * (gx * gx + gy * gy);
    }
    den += a.compliance / (h * h);
    if (den < 1e-12) return;
    const l = -C / den;
    // 勾配は更新前の座標で計算する
    let gxPrev = 0;
    let gyPrev = 0;
    const gxs = World.tmpGx;
    const gys = World.tmpGy;
    for (let k = 0; k < n; k++) {
      const ip = idx[(k + n - 1) % n];
      const inx = idx[(k + 1) % n];
      gxs[k] = 0.5 * (y[inx] - y[ip]);
      gys[k] = 0.5 * (x[ip] - x[inx]);
    }
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      gxPrev = gxs[k];
      gyPrev = gys[k];
      x[i] += w[i] * l * gxPrev;
      y[i] += w[i] * l * gyPrev;
    }
  }
  private static tmpGx = new Float64Array(256);
  private static tmpGy = new Float64Array(256);

  updateAabbs(): void {
    const { x, y, r } = this;
    for (const b of this.bodies) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const e = b.start + b.count;
      for (let i = b.start; i < e; i++) {
        const rr = r[i];
        if (x[i] - rr < x0) x0 = x[i] - rr;
        if (y[i] - rr < y0) y0 = y[i] - rr;
        if (x[i] + rr > x1) x1 = x[i] + rr;
        if (y[i] + rr > y1) y1 = y[i] + rr;
      }
      b.minX = x0;
      b.minY = y0;
      b.maxX = x1;
      b.maxY = y1;
    }
  }

  private cellOf(x: number, y: number): number {
    let cx = Math.floor((x - this.gx0) / this.cell);
    let cy = Math.floor((y - this.gy0) / this.cell);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  private buildEdgeGrid(): void {
    const { x, y } = this;
    // 辺の列挙
    let ne = 0;
    for (const p of this.polys) ne += p.idx.length;
    if (this.eA.length < ne) {
      const sz = ne * 2;
      this.eA = new Int32Array(sz);
      this.eB = new Int32Array(sz);
      this.eBody = new Int32Array(sz);
      this.ePoly = new Int32Array(sz);
      this.eRad = new Float64Array(sz);
    }
    let e = 0;
    for (const p of this.polys) {
      const m = p.idx.length;
      for (let k = 0; k < m; k++) {
        this.eA[e] = p.idx[k];
        this.eB[e] = p.idx[(k + 1) % m];
        this.eBody[e] = p.body.id;
        this.ePoly[e] = p.id;
        this.eRad[e] = p.radius;
        e++;
      }
    }
    const cs = this.cellStart;
    cs.fill(0);
    const margin = 16; // 粒子半径の上限目安 + 辺の厚み
    const cell = this.cell;
    const cols = this.cols;
    const rows = this.rows;
    const range = (a: number, b: number, rad: number, o: number, lim: number): [number, number] => {
      let lo = Math.floor((Math.min(a, b) - rad - margin - o) / cell);
      let hi = Math.floor((Math.max(a, b) + rad + margin - o) / cell);
      if (lo < 0) lo = 0;
      if (hi >= lim) hi = lim - 1;
      if (lo >= lim) lo = lim - 1;
      if (hi < 0) hi = 0;
      return [lo, hi];
    };
    let total = 0;
    for (let k = 0; k < e; k++) {
      const a = this.eA[k];
      const b = this.eB[k];
      const [cx0, cx1] = range(x[a], x[b], this.eRad[k], this.gx0, cols);
      const [cy0, cy1] = range(y[a], y[b], this.eRad[k], this.gy0, rows);
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          cs[cy * cols + cx + 1]++;
          total++;
        }
    }
    for (let c = 1; c < cs.length; c++) cs[c] += cs[c - 1];
    if (this.cellItems.length < total) this.cellItems = new Int32Array(total * 2);
    const fillPos = World.fillPos.length >= cs.length ? World.fillPos : (World.fillPos = new Int32Array(cs.length));
    fillPos.set(cs.subarray(0, cs.length));
    for (let k = 0; k < e; k++) {
      const a = this.eA[k];
      const b = this.eB[k];
      const [cx0, cx1] = range(x[a], x[b], this.eRad[k], this.gx0, cols);
      const [cy0, cy1] = range(y[a], y[b], this.eRad[k], this.gy0, rows);
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = cy * cols + cx;
          this.cellItems[fillPos[c]++] = k;
        }
    }
  }
  private static fillPos = new Int32Array(1);

  private pointInPoly(p: Poly, px: number, py: number): boolean {
    const { x, y } = this;
    const idx = p.idx;
    const m = idx.length;
    let inside = false;
    for (let k = 0, l = m - 1; k < m; l = k++) {
      const xi = x[idx[k]];
      const yi = y[idx[k]];
      const xj = x[idx[l]];
      const yj = y[idx[l]];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  private static candPoly = new Int32Array(16);
  private static candEdge = new Int32Array(16);
  private static candD = new Float64Array(16);

  private collideCats(): void {
    if (this.bodies.length < 2) return;
    this.buildEdgeGrid();
    const { x, y, px, py, w, r, owner } = this;
    const cs = this.cellStart;
    const items = this.cellItems;
    const candPoly = World.candPoly;
    const candEdge = World.candEdge;
    const candD = World.candD;
    for (let i = 0; i < this.n; i++) {
      const bi = owner[i];
      if (this.bodies[bi].kinematic) continue;
      const c = this.cellOf(x[i], y[i]);
      const s0 = cs[c];
      const s1 = cs[c + 1];
      if (s0 === s1) continue;
      let nc = 0;
      const pxi = x[i];
      const pyi = y[i];
      for (let s = s0; s < s1; s++) {
        const e = items[s];
        if (this.eBody[e] === bi) continue;
        const a = this.eA[e];
        const b = this.eB[e];
        const ex = x[b] - x[a];
        const ey = y[b] - y[a];
        const l2 = ex * ex + ey * ey;
        let t = l2 > 1e-12 ? ((pxi - x[a]) * ex + (pyi - y[a]) * ey) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const qx = x[a] + ex * t - pxi;
        const qy = y[a] + ey * t - pyi;
        const d2 = qx * qx + qy * qy;
        const lim = r[i] + this.eRad[e] + 30;
        if (d2 > lim * lim) continue;
        const pid = this.ePoly[e];
        let k = 0;
        for (; k < nc; k++) if (candPoly[k] === pid) break;
        if (k === nc) {
          if (nc >= 16) continue;
          candPoly[nc] = pid;
          candD[nc] = d2;
          candEdge[nc] = e;
          nc++;
        } else if (d2 < candD[k]) {
          candD[k] = d2;
          candEdge[k] = e;
        }
      }
      for (let k = 0; k < nc; k++) {
        const poly = this.polys[candPoly[k]];
        const e = candEdge[k];
        const a = this.eA[e];
        const b = this.eB[e];
        const rad = r[i] + this.eRad[e];
        // 前の候補の解決で位置が動いているので、最近点を取り直す
        const ex = x[b] - x[a];
        const ey = y[b] - y[a];
        const l2 = ex * ex + ey * ey;
        let t = l2 > 1e-12 ? ((x[i] - x[a]) * ex + (y[i] - y[a]) * ey) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const qx = x[a] + ex * t;
        const qy = y[a] + ey * t;
        const d = Math.hypot(x[i] - qx, y[i] - qy);
        const inside = this.pointInPoly(poly, x[i], y[i]);
        if (!inside && d >= rad) continue;
        let nx: number;
        let ny: number;
        let pen: number;
        if (d > 1e-6) {
          nx = (x[i] - qx) / d;
          ny = (y[i] - qy) / d;
        } else {
          // 辺の法線（外向きは不明なので向きは適当に）
          const el = Math.sqrt(l2) || 1;
          nx = -ey / el;
          ny = ex / el;
        }
        if (inside) {
          nx = -nx;
          ny = -ny;
          pen = d + rad;
        } else {
          pen = rad - d;
        }
        const wa = w[a] * (1 - t);
        const wb = w[b] * t;
        const wsum = w[i] + wa * (1 - t) + wb * t;
        if (wsum < 1e-12) continue;
        const l = pen / wsum;
        x[i] += nx * l * w[i];
        y[i] += ny * l * w[i];
        x[a] -= nx * l * wa;
        y[a] -= ny * l * wa;
        x[b] -= nx * l * wb;
        y[b] -= ny * l * wb;
        // 摩擦（毛並み）
        const mu = Math.min(this.bodies[bi].friction, poly.body.friction);
        const dpx = x[i] - px[i] - ((x[a] - px[a]) * (1 - t) + (x[b] - px[b]) * t);
        const dpy = y[i] - py[i] - ((y[a] - py[a]) * (1 - t) + (y[b] - py[b]) * t);
        const dn = dpx * nx + dpy * ny;
        const tx = (dpx - dn * nx) * mu;
        const ty = (dpy - dn * ny) * mu;
        const lf = 1 / wsum;
        x[i] -= tx * lf * w[i];
        y[i] -= ty * lf * w[i];
        x[a] += tx * lf * wa;
        y[a] += ty * lf * wa;
        x[b] += tx * lf * wb;
        y[b] += ty * lf * wb;
        this.contact[i] |= CONTACT_CAT;
        this.contact[a] |= CONTACT_CAT;
        this.contact[b] |= CONTACT_CAT;
        if (this.catHits[i] < 255) this.catHits[i]++;
      }
    }
  }

  private collideBowl(): void {
    const { x, y, px, py, w, r, bowl } = this;
    const mu = this.glassFriction;
    const c = tmpContact;
    for (let i = 0; i < this.n; i++) {
      if (w[i] === 0) continue;
      bowl.collide(x[i], y[i], r[i], c);
      if (!c.hit) continue;
      x[i] = c.x;
      y[i] = c.y;
      // 摩擦: 接線方向の移動を少し削る
      const dx = x[i] - px[i];
      const dy = y[i] - py[i];
      const dn = dx * c.nx + dy * c.ny;
      const tx = dx - dn * c.nx;
      const ty = dy - dn * c.ny;
      x[i] -= tx * mu;
      y[i] -= ty * mu;
      this.contact[i] |= CONTACT_BOWL;
      this.cnx[i] = c.nx;
      this.cny[i] = c.ny;
    }
  }
}
