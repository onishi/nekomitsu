/**
 * 猫を入れる容器（金魚鉢・フラスコ・ビーカー・幾何学形…）。
 *
 * 形は「口の左端 → 底 → 口の右端」の内壁の折れ線で表す（左右対称、y 下向き）。
 * 物理の内壁 = 描画上のガラス内面。口より上は見えない垂直の壁で、はみ出した猫を支える。
 */
export interface Contact {
  x: number;
  y: number;
  /** 押し戻し方向（内向き） */
  nx: number;
  ny: number;
  hit: boolean;
}

export type Pt = { x: number; y: number };

export class Container {
  readonly kind: string;
  /** 内壁（口の左端 → 底 → 口の右端） */
  readonly wall: Pt[];
  /** 大きさの目安（同じ容量の金魚鉢の半径相当） */
  readonly R: number;
  /** 口の高さ */
  readonly openY: number;
  /** 口の半幅 */
  readonly openHalfW: number;
  /** 底（いちばん下） */
  readonly bottomY: number;
  /** 平らな底の半幅（丸底・尖った底なら小さい） */
  readonly bottomHalfW: number;
  /** 平らな底の中心 x（管の形では左右どちらかに寄る） */
  readonly bottomCX: number;
  /** いちばん広いところの半幅 */
  readonly halfW: number;
  /** 容量（口まで） */
  readonly area: number;

  // 衝突用: 口の上へ延長した壁
  private readonly segAx: Float64Array;
  private readonly segAy: Float64Array;
  private readonly segBx: Float64Array;
  private readonly segBy: Float64Array;
  /** 各辺の内向き法線 */
  private readonly segNx: Float64Array;
  private readonly segNy: Float64Array;
  private readonly polyX: Float64Array;
  private readonly polyY: Float64Array;
  // 「壁から十分離れた内側」を覚えておくグリッド（ほとんどの粒子は判定を省略できる）
  private readonly gCell = 14;
  private readonly gx0: number;
  private readonly gy0: number;
  private readonly gCols: number;
  private readonly gRows: number;
  private readonly safe: Float32Array;

  constructor(kind: string, wall: Pt[]) {
    this.kind = kind;
    this.wall = wall;
    this.openY = wall[0].y;
    this.openHalfW = Math.abs(wall[0].x);
    let by = -Infinity;
    let hw = 0;
    for (const p of wall) {
      by = Math.max(by, p.y);
      hw = Math.max(hw, Math.abs(p.x));
    }
    this.bottomY = by;
    this.halfW = hw;
    let bl = Infinity;
    let br = -Infinity;
    for (const p of wall) {
      if (by - p.y < 1.5) {
        bl = Math.min(bl, p.x);
        br = Math.max(br, p.x);
      }
    }
    this.bottomHalfW = (br - bl) / 2;
    this.bottomCX = (br + bl) / 2;
    let A = 0;
    for (let k = 0; k < wall.length; k++) {
      const p = wall[k];
      const q = wall[(k + 1) % wall.length];
      A += p.x * q.y - q.x * p.y;
    }
    this.area = Math.abs(A / 2);
    this.R = Math.sqrt(this.area / 2.45);

    // 口の上へ壁を延長して閉じた多角形にする
    const top = this.openY - this.R * 20;
    const ext: Pt[] = [{ x: wall[0].x, y: top }, ...wall, { x: wall[wall.length - 1].x, y: top }];
    const n = ext.length;
    this.polyX = Float64Array.from(ext.map((p) => p.x));
    this.polyY = Float64Array.from(ext.map((p) => p.y));
    // 閉じる辺（遠い上空）は壁ではないので除外
    const m = n - 1;
    this.segAx = new Float64Array(m);
    this.segAy = new Float64Array(m);
    this.segBx = new Float64Array(m);
    this.segBy = new Float64Array(m);
    this.segNx = new Float64Array(m);
    this.segNy = new Float64Array(m);
    let sA = 0;
    for (let k = 0; k < n; k++) {
      const p = ext[k];
      const q = ext[(k + 1) % n];
      sA += p.x * q.y - q.x * p.y;
    }
    const orient = sA > 0 ? 1 : -1;
    for (let k = 0; k < m; k++) {
      const a = ext[k];
      const b = ext[k + 1];
      this.segAx[k] = a.x;
      this.segAy[k] = a.y;
      this.segBx[k] = b.x;
      this.segBy[k] = b.y;
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // 符号付き面積が正なら内側は辺の左手（y 下向き座標での式どおり）
      this.segNx[k] = (-(b.y - a.y) / l) * orient;
      this.segNy[k] = ((b.x - a.x) / l) * orient;
    }

    const c = this.gCell;
    this.gx0 = -hw - c * 2;
    this.gy0 = this.openY - this.R * 1.4;
    this.gCols = Math.ceil((hw * 2 + c * 4) / c);
    this.gRows = Math.ceil((by - this.gy0 + c * 2) / c);
    this.safe = new Float32Array(this.gCols * this.gRows);
    for (let j = 0; j < this.gRows; j++) {
      for (let i = 0; i < this.gCols; i++) {
        const x = this.gx0 + (i + 0.5) * c;
        const y = this.gy0 + (j + 0.5) * c;
        this.safe[j * this.gCols + i] = this.insideExt(x, y) ? this.wallDist(x, y) - c * 0.71 : -1;
      }
    }
    // 各セルの近くにある壁の辺（管のように壁が長い形でも、近くの辺だけ調べれば済む）
    const reach = 34; // 粒子半径の上限（大きく融合した猫の足） + 余裕
    const lists: number[][] = Array.from({ length: this.gCols * this.gRows }, () => []);
    for (let k = 0; k < this.segAx.length; k++) {
      const x0 = Math.min(this.segAx[k], this.segBx[k]) - reach;
      const x1 = Math.max(this.segAx[k], this.segBx[k]) + reach;
      const y0 = Math.min(this.segAy[k], this.segBy[k]) - reach;
      const y1 = Math.max(this.segAy[k], this.segBy[k]) + reach;
      const i0 = Math.max(0, Math.floor((x0 - this.gx0) / c));
      const i1 = Math.min(this.gCols - 1, Math.floor((x1 - this.gx0) / c));
      const j0 = Math.max(0, Math.floor((y0 - this.gy0) / c));
      const j1 = Math.min(this.gRows - 1, Math.floor((y1 - this.gy0) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) lists[j * this.gCols + i].push(k);
    }
    this.cellSegStart = new Int32Array(lists.length + 1);
    for (let q = 0; q < lists.length; q++) this.cellSegStart[q + 1] = this.cellSegStart[q] + lists[q].length;
    this.cellSegs = new Int32Array(this.cellSegStart[lists.length]);
    for (let q = 0; q < lists.length; q++) this.cellSegs.set(lists[q], this.cellSegStart[q]);
  }
  private cellSegStart: Int32Array = new Int32Array(1);
  private cellSegs: Int32Array = new Int32Array(0);

  private insideExt(px: number, py: number): boolean {
    const xs = this.polyX;
    const ys = this.polyY;
    const n = xs.length;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if (ys[i] > py !== ys[j] > py && px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
    }
    return inside;
  }

  private wallDist(px: number, py: number): number {
    let best = Infinity;
    for (let k = 0; k < this.segAx.length; k++) {
      const ax = this.segAx[k];
      const ay = this.segAy[k];
      const ex = this.segBx[k] - ax;
      const ey = this.segBy[k] - ay;
      const l2 = ex * ex + ey * ey;
      let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = ax + ex * t - px;
      const dy = ay + ey * t - py;
      best = Math.min(best, dx * dx + dy * dy);
    }
    return Math.sqrt(best);
  }

  /** 点が容器の内側（口まで）にあるか */
  contains(x: number, y: number): boolean {
    return y >= this.openY && this.insideExt(x, y);
  }

  /** 半径 r の粒子を内側へ押し戻す。out に結果を書き込む。 */
  collide(x: number, y: number, r: number, out: Contact): void {
    out.hit = false;
    out.x = x;
    out.y = y;
    const gi = Math.floor((x - this.gx0) / this.gCell);
    const gj = Math.floor((y - this.gy0) / this.gCell);
    let s0 = 0;
    let s1 = 0;
    let useList = false;
    if (gi >= 0 && gj >= 0 && gi < this.gCols && gj < this.gRows) {
      const cell = gj * this.gCols + gi;
      if (this.safe[cell] > r) return;
      s0 = this.cellSegStart[cell];
      s1 = this.cellSegStart[cell + 1];
      // 近くに壁がなく、内側 = 何もしない。外側（めり込み過ぎ）なら全部の辺から探す
      if (s0 === s1 && this.safe[cell] >= 0) return;
      useList = s0 < s1;
    }

    let best = Infinity;
    let bk = 0;
    let bt = 0;
    let qx = 0;
    let qy = 0;
    const n = useList ? s1 - s0 : this.segAx.length;
    for (let q = 0; q < n; q++) {
      const k = useList ? this.cellSegs[s0 + q] : q;
      const ax = this.segAx[k];
      const ay = this.segAy[k];
      const ex = this.segBx[k] - ax;
      const ey = this.segBy[k] - ay;
      const l2 = ex * ex + ey * ey;
      let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + ex * t;
      const cy = ay + ey * t;
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < best) {
        best = d;
        bk = k;
        bt = t;
        qx = cx;
        qy = cy;
      }
    }
    const d = Math.sqrt(best);
    // 内外判定: 最近点が辺の途中なら辺の向きで分かる。角のときだけ厳密に
    const inside =
      bt > 0.001 && bt < 0.999
        ? (x - qx) * this.segNx[bk] + (y - qy) * this.segNy[bk] > 0
        : this.insideExt(x, y);
    if (inside && d >= r) return;
    let nx: number;
    let ny: number;
    if (d > 1e-6) {
      nx = (x - qx) / d;
      ny = (y - qy) / d;
      if (!inside) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      nx = this.segNx[bk];
      ny = this.segNy[bk];
    }
    out.x = qx + nx * r;
    out.y = qy + ny * r;
    // 口より上の見えない壁では、はみ出た分を一度に戻さず少しずつ押し戻す
    // （細い口に猫を落としたとき、頭や尻尾がパチンと跳ねないように）
    if (y < this.openY) {
      const dx = out.x - x;
      const dy = out.y - y;
      const d2 = Math.hypot(dx, dy);
      const maxStep = 2.5;
      if (d2 > maxStep) {
        out.x = x + (dx / d2) * maxStep;
        out.y = y + (dy / d2) * maxStep;
      }
    }
    out.nx = nx;
    out.ny = ny;
    out.hit = true;
  }
}
