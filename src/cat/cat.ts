/**
 * 猫1匹の soft-body 構成と、ふるまい（表情・居心地補助）。
 *
 * 構成（右向きローカル座標、y 下向き）:
 *   - 胴体リング: 香箱座りの輪郭。柔らかいシェイプマッチング + 面積保存 = 液体っぽさ
 *   - 頭リング + 頭中心: 硬いシェイプマッチング。顔は潰れない
 *   - 足（前・後）: 胴体クラスタに中程度の剛性でぶら下がる
 *   - 尻尾: 距離制約のチェーン + 弱い姿勢ゴール（ピンと立つ ↔ 体に巻き付く）
 */
import { CONTACT_BOWL, CONTACT_CAT, ShapeCluster, type AreaConstraint, type SoftBody, type World } from '../physics/world';
import type { Coat, Species } from './catTypes';

export type Expression =
  | 'curious' // 吊るされている
  | 'surprised' // 落下中
  | 'startled' // 着地の瞬間
  | 'normal'
  | 'squint' // 押されている
  | 'sleepy'
  | 'sleep'
  | 'bliss' // 顔が隣の猫に埋まる・舐められている
  | 'groom' // 毛繕い・隣の猫を舐める
  | 'yawn' // あくび
  | 'happy' // クリア
  | 'grumpy' // 不機嫌な猫のふだんの顔（ジト目・へ の字口）
  | 'annoyed' // 不機嫌な猫が触られた・押された（イカ耳）
  | 'blank' // 無表情（スン…）。動じない猫は押されてもこの顔
  | 'stretch'; // のびー: 目をつぶって横線だけ（- -）

/** 落ち着いた猫が自分からするアクション */
export type CatAction = 'none' | 'groom' | 'lick' | 'yawn' | 'stretch';

export type CatEvent = 'posu' | 'munyu' | 'supo' | 'lick';

export interface CatEnv {
  time: number;
  /** 容器の口の高さ（細くして落とした猫は、ここを通り抜けてから元の体型に戻る） */
  rimY: number;
  /** 金魚鉢の中の猫（舐める相手を探す） */
  cats: readonly Cat[];
  event(kind: CatEvent, cat: Cat, strength: number): void;
  /** クリア演出のむにゅっ度 0..1 */
  squeeze: number;
  cleared: boolean;
  sound: {
    posu(v: number): void;
    munyu(v: number): void;
    supo(): void;
    purr(): void;
  };
  /** みんなが目で追うもの（落ちている猫・吊るされている猫の頭）。なければ null */
  focus?: { x: number; y: number } | null;
  /** focus が落ちている最中の猫か（動くものを見ると瞳が大きくなる） */
  focusMoving?: boolean;
}

const TAU = Math.PI * 2;
/** 角度を -π..π に。ループを使わない（極端な値でも止まらない） */
const wrapAngle = (a: number) => {
  if (!Number.isFinite(a)) return 0;
  return a - TAU * Math.round(a / TAU);
};
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

let catSerial = 0;

export class Cat {
  readonly serial = catSerial++;
  readonly species: Species;
  readonly coat: Coat;
  readonly facing: 1 | -1;
  readonly world: World;
  readonly body: SoftBody;
  readonly ring: number[] = [];
  readonly head: number[] = [];
  headC = -1;
  readonly feet: number[] = [];
  readonly tail: number[] = [];
  readonly bodyCluster: ShapeCluster;
  /** 前半身・後半身（腰の関節） */
  readonly frontCluster!: ShapeCluster;
  readonly rearCluster!: ShapeCluster;
  private frontSlot: number[] = [];
  private rearSlot: number[] = [];
  readonly headCluster: ShapeCluster;
  readonly bodyArea: AreaConstraint;
  /** ローカル rest 座標（向き反映済み） */
  readonly restLocal: { x: number; y: number }[] = [];
  private readonly footTuck: { x: number; y: number }[] = [];
  private readonly footDangle: { x: number; y: number }[] = [];
  private readonly tailUp: { x: number; y: number }[] = [];
  private readonly tailTuck: { x: number; y: number }[] = [];
  /** クラスタ内の足・尻尾のインデックス */
  private footSlots: number[] = [];
  private tailSlots: number[] = [];
  readonly ringR: number;
  readonly headRX: number;
  readonly headRY: number;
  readonly phase = Math.random() * TAU;

  // --- 状態 ---
  held = true;
  landed = false;
  calm = 0;
  avgSpeed = 0;
  private prevVX = 0;
  private prevVY = 0;
  impactTimer = 0;
  pressTimer = 0;
  private munyuCooldown = 0;
  private purred = false;
  firmness = 1;
  legPose = 1; // 1 = ぶらーん, 0 = たたむ
  tailPose = 0; // 0 = ピン, 1 = 巻き付け
  expression: Expression = 'curious';
  /** 目の開き具合（アニメーション） */
  eyeOpen = 1;
  blink = 0;
  private blinkTimer = 2 + Math.random() * 3;
  blush = 0;
  headBuried = 0;
  cx = 0;
  cy = 0;
  // --- アクション ---
  action: CatAction = 'none';
  private actionTime = 0;
  private actionDur = 0;
  private actionCooldown = 2 + Math.random() * 4;
  /** 舐めている相手 */
  lickTarget: Cat | null = null;
  /** 舐められている（相手が気持ちよさそうにする） */
  licked = 0;
  /** 舌の出具合 0..1 */
  tongue = 0;
  /** 舌を向ける方向（頭ローカル、-1 左 / 1 右） */
  tongueSide = 0;
  /** 毛繕いで前足を口元へ上げる 0..1 */
  groomPose = 0;
  /** あくびの口の開き 0..1 */
  yawnOpen = 0;
  /** 頭の向きの目標（前半身に対する角度）。null なら自由 */
  private headAim: number | null = null;
  private wakeTimer = 10 + Math.random() * 15;
  private slide = 0;
  private slideArmed = false;
  /** 落としてからの経過時間 */
  age = 0;
  /** 尻尾の付け根の胴体粒子 */
  tailBase = -1;

  // --- ねこけし ---
  /** 何匹ぶんの大きさか（融合すると足し算） */
  units = 1;
  /** 融合中の相手 */
  fusing: Cat | null = null;
  /** 大きくなりすぎて消えるまでの時間（-1 = 消えない） */
  popTimer = -1;
  /** 消える直前にふくらむ量 */
  inflate = 0;

  /** シェイプマッチングのゴールを今の粒子位置にそろえる（物理を1度も解いていない猫を描くため） */
  syncGoals(): void {
    const w = this.world;
    for (const cl of this.body.clusters) {
      for (let k = 0; k < cl.idx.length; k++) {
        cl.goalX[k] = w.x[cl.idx[k]];
        cl.goalY[k] = w.y[cl.idx[k]];
      }
    }
  }

  /** world.removeBody で前の粒子が詰められたとき、番号をずらす */
  shiftIndices(removedStart: number, count: number): void {
    const sh = (i: number) => (i >= removedStart + count ? i - count : i);
    for (const arr of [this.ring, this.head, this.feet, this.tail]) for (let k = 0; k < arr.length; k++) arr[k] = sh(arr[k]);
    this.headC = sh(this.headC);
    this.tailBase = sh(this.tailBase);
  }

  /** 少し不機嫌な猫（出現率は低め）。ジト目で、触られるとイカ耳になり、他の猫を舐めない */
  readonly grumpy: boolean;
  /** 吊るした姿勢での、中心からの左端・右端（左端は負） */
  readonly extentL: number;
  readonly extentR: number;
  /** 耳を倒す度合い 0..1（イカ耳） */
  earFlat = 0;

  constructor(world: World, species: Species, coat: Coat, facing: 1 | -1, x: number, y: number, grumpy = false) {
    this.grumpy = grumpy;
    this.world = world;
    this.species = species;
    this.coat = coat;
    this.facing = facing;
    const sp = species;
    const { a, b } = sp;
    const body = world.createBody();
    this.body = body;
    body.internalDamping = sp.damping;
    body.friction = sp.friction;

    // --- 胴体リング（香箱の輪郭） ---
    const N = sp.ringN;
    const ringPts: { x: number; y: number }[] = [];
    for (let k = 0; k < N; k++) {
      const th = (TAU * k) / N;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const nTop = 2.5;
      const nBot = 3.4;
      const n = s > 0 ? nBot : nTop;
      const px = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const py = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      ringPts.push({ x: px, y: py });
    }
    // 楕円に近い輪郭を猫らしく: 首の方は細く、腰（お尻）は高く、後ろ脚の前のお腹は少しくびれる。
    // 形を整えても面積（= 猫の量）は変えない
    {
      const area = (p: { x: number; y: number }[]) => {
        let A = 0;
        for (let k = 0; k < p.length; k++) {
          const q = p[(k + 1) % p.length];
          A += p[k].x * q.y - q.x * p[k].y;
        }
        return Math.abs(A / 2);
      };
      const A0 = area(ringPts);
      for (const p of ringPts) p.y *= bodyProfile(p.x / a, p.y > 0, b / a);
      const k = A0 / area(ringPts);
      for (const p of ringPts) p.y *= k;
    }
    let per = 0;
    for (let k = 0; k < N; k++) {
      const p = ringPts[k];
      const q = ringPts[(k + 1) % N];
      per += Math.hypot(q.x - p.x, q.y - p.y);
    }
    // 描画用: 肩と腰（前後の脚の付け根）を挟む背中側・お腹側の輪郭点
    const nearest = (x: number, belly: boolean) => {
      let bk = 0;
      let bd = Infinity;
      for (let k = 0; k < N; k++) {
        if (ringPts[k].y > 0 !== belly) continue;
        const d = Math.abs(ringPts[k].x - x);
        if (d < bd) {
          bd = d;
          bk = k;
        }
      }
      return bk;
    };
    this.legAnchor = [
      [nearest(a * 0.5, false), nearest(a * 0.5, true)],
      [nearest(-a * 0.52, false), nearest(-a * 0.52, true)],
    ];
    const spacing = per / N;
    this.ringR = Math.max(4, spacing * 0.34);

    const hr = sp.headR;
    this.headRX = hr * 1.07;
    this.headRY = hr * 0.95;
    const hcx = a * 0.8;
    const hcy = -b * 0.52 - hr * 0.35;

    const f = facing;
    const place = (lx: number, ly: number) => ({ x: x + lx * f, y: y + ly });
    const addP = (lx: number, ly: number, m: number, r: number) => {
      const p = place(lx, ly);
      const i = world.addParticle(body, p.x, p.y, m, r);
      this.restLocal.push({ x: lx * f, y: ly });
      return i;
    };

    for (const p of ringPts) this.ring.push(addP(p.x, p.y, sp.mass, this.ringR));
    const HN = sp.headN;
    const headR = Math.max(4, ((TAU * hr) / HN) * 0.3);
    for (let j = 0; j < HN; j++) {
      const ph = (TAU * j) / HN;
      this.head.push(addP(hcx + this.headRX * Math.cos(ph), hcy + this.headRY * Math.sin(ph), sp.mass * 0.45, headR));
    }
    this.headC = addP(hcx, hcy, sp.mass * 1.2, 3);

    // 足
    const footR = b * 0.2;
    this.footTuck.push({ x: a * 0.5 * f, y: b * 0.86 }, { x: -a * 0.5 * f, y: b * 0.88 });
    this.footDangle.push({ x: a * 0.56 * f, y: b * 1.42 }, { x: -a * 0.52 * f, y: b * 1.36 });
    for (let k = 0; k < 2; k++) {
      const d = this.footDangle[k];
      this.feet.push(addP(d.x * f, d.y, sp.mass * 0.5, footR));
    }

    // 尻尾
    const T = sp.tailSegs;
    const seg = sp.tailLen / T;
    let baseK = 0;
    let best = Infinity;
    for (let k = 0; k < N; k++) {
      const d = Math.hypot(ringPts[k].x + a, ringPts[k].y - b * 0.3);
      if (d < best) {
        best = d;
        baseK = k;
      }
    }
    const base0 = ringPts[baseK];
    this.tailBase = this.ring[baseK];
    {
      // 立てた尻尾（落下中・起きている時）
      let tx = base0.x;
      let ty = base0.y;
      let ang = Math.PI - 0.15;
      for (let k = 0; k < T; k++) {
        tx += Math.cos(ang) * seg;
        ty += Math.sin(ang) * seg;
        ang += 0.27;
        this.tailUp.push({ x: tx * f, y: ty });
      }
      // 体に巻き付けた尻尾（寝るとき）
      const ea = a * 1.08;
      const eb = b * 1.12;
      let th = Math.atan2(base0.y / eb, base0.x / ea);
      for (let k = 0; k < T; k++) {
        const rr = 0.5 * (ea + eb);
        th -= seg / rr;
        this.tailTuck.push({ x: ea * Math.cos(th) * f, y: eb * Math.sin(th) });
      }
    }
    const tailR0 = b * 0.15 * sp.tailWidth;
    for (let k = 0; k < T; k++) {
      const p = this.tailUp[k];
      this.tail.push(addP(p.x * f, p.y, sp.mass * 0.12, Math.max(3, tailR0 * (1 - (0.35 * k) / T))));
    }

    // --- 制約 ---
    for (let k = 0; k < N; k++) {
      // 腰（胴体の中央付近）の背中側・お腹側は伸び縮みしやすく = 曲がりやすい
      const mx = (ringPts[k].x + ringPts[(k + 1) % N].x) / 2;
      const waist = Math.max(0, 1 - Math.abs(mx) / (a * 0.45));
      body.addDistance(this.ring[k], this.ring[(k + 1) % N], sp.edgeCompliance * (1 + 25 * waist), world);
    }
    // 首: 頭中心と近い胴体粒子3つ
    const byDist = this.ring
      .map((i) => ({ i, d: Math.hypot(world.x[i] - world.x[this.headC], world.y[i] - world.y[this.headC]) }))
      .sort((p, q) => p.d - q.d);
    for (let k = 0; k < 3; k++) body.addDistance(this.headC, byDist[k].i, 2e-5, world);
    // 尻尾チェーン
    body.addDistance(this.ring[baseK], this.tail[0], 1e-6, world, seg);
    for (let k = 0; k + 1 < T; k++) body.addDistance(this.tail[k], this.tail[k + 1], 1e-6, world, seg);
    for (let k = 0; k + 2 < T; k++) body.addDistance(this.tail[k], this.tail[k + 2], 6e-4, world, seg * 1.9);

    let restArea = 0;
    for (let k = 0; k < N; k++) {
      const i = this.ring[k];
      const j = this.ring[(k + 1) % N];
      restArea += world.x[i] * world.y[j] - world.x[j] * world.y[i];
    }
    restArea *= 0.5;
    this.bodyArea = { idx: Int32Array.from(this.ring), rest: restArea, scale: 1, compliance: sp.areaCompliance };
    body.areas.push(this.bodyArea);

    // --- シェイプマッチング ---
    const loc = (i: number) => this.restLocal[i - body.start];
    {
      const idx: number[] = [];
      const wt: number[] = [];
      const st: number[] = [];
      // 全身クラスタは弱め（全体の猫らしさだけ保つ）。形の大部分は前半身・後半身が受け持つ
      for (const i of this.ring) {
        idx.push(i);
        wt.push(1);
        st.push(sp.shapeStiff * 0.1);
      }
      idx.push(this.headC);
      wt.push(2);
      st.push(0.4);
      for (const i of this.feet) {
        this.footSlots.push(idx.length);
        idx.push(i);
        wt.push(0.2);
        st.push(0.35);
      }
      for (let k = 0; k < T; k++) {
        this.tailSlots.push(idx.length);
        idx.push(this.tail[k]);
        wt.push(0.02);
        st.push(0.22 * (1 - k / T) + 0.03);
      }
      this.bodyCluster = new ShapeCluster(
        idx,
        idx.map((i) => loc(i).x),
        idx.map((i) => loc(i).y),
        wt,
        st,
        sp.beta,
      );
      this.bodyCluster.stretchMax = sp.stretchMax;
      this.bodyCluster.stretchMin = 1 / sp.stretchMax;
      body.clusters.push(this.bodyCluster);
    }
    // --- 腰の関節: 胴体を前半身・後半身の2クラスタに分け、腰で曲がれるようにする ---
    {
      const half = (front: boolean): ShapeCluster => {
        const idx: number[] = [];
        const st: number[] = [];
        for (const i of this.ring) {
          const lx = loc(i).x * facing;
          // 腰（中央付近）は両方に属して、つなぎ目になる
          if (front ? lx > -a * 0.1 : lx < a * 0.1) {
            idx.push(i);
            st.push(sp.shapeStiff);
          }
        }
        if (front) {
          idx.push(this.headC);
          st.push(0.3);
        }
        const c = new ShapeCluster(
          idx,
          idx.map((i) => loc(i).x),
          idx.map((i) => loc(i).y),
          idx.map((i) => (i === this.headC ? 1.5 : 1)),
          st,
          sp.beta,
        );
        c.stretchMax = sp.stretchMax;
        c.stretchMin = 1 / sp.stretchMax;
        return c;
      };
      this.frontCluster = half(true);
      this.rearCluster = half(false);
      body.clusters.push(this.frontCluster, this.rearCluster);
      // 表示用: 輪郭粒子ごとに、属する半身クラスタのスロット
      const slotOf = (c: ShapeCluster, i: number) => c.idx.indexOf(i);
      this.frontSlot = this.ring.map((i) => slotOf(this.frontCluster, i));
      this.rearSlot = this.ring.map((i) => slotOf(this.rearCluster, i));
    }
    {
      const idx = [...this.head, this.headC];
      this.headCluster = new ShapeCluster(
        idx,
        idx.map((i) => loc(i).x),
        idx.map((i) => loc(i).y),
        idx.map(() => 1),
        idx.map(() => 0.85),
        0,
      );
      body.clusters.push(this.headCluster);
    }
    world.addPoly(body, this.ring, this.ringR);
    world.addPoly(body, this.head, headR);

    // 体型を細くする（restSx）ときの基準の rest 形状
    const copy = (c: ShapeCluster) => ({ x: Float64Array.from(c.restX), y: Float64Array.from(c.restY) });
    this.baseRest = [copy(this.bodyCluster), copy(this.frontCluster), copy(this.rearCluster)];

    // 吊るした姿勢（足ぶらーん・尻尾ピン）での左右の広がり（粒子の半径込み）
    let el = Infinity;
    let er = -Infinity;
    for (let i = body.start; i < body.start + body.count; i++) {
      const l = this.restLocal[i - body.start];
      el = Math.min(el, l.x - world.r[i]);
      er = Math.max(er, l.x + world.r[i]);
    }
    this.extentL = el;
    this.extentR = er;

    this.installHooks();
    world.setKinematic(body, true);
  }

  private headGoal = 0;
  private headGoalInit = false;
  private uprightBody = 0;
  private uprightHead = 0;

  private installHooks(): void {
    // 胴体: 落ち着くと、ほんの少し自分で起き上がろうとする
    this.bodyCluster.angleHook = (ang) => ang - wrapAngle(ang) * this.uprightBody;
    // 腰: 後半身は前半身に対して ±75° まで曲がる
    this.rearCluster.angleHook = (ang) => {
      const fa = this.frontCluster.angle;
      return fa + clamp(wrapAngle(ang - fa), -1.3, 1.3);
    };
    // 頭: 首の可動域を制限しつつ、顔を上に向けようとする
    this.headCluster.angleHook = (ang) => {
      const ba = this.frontCluster.angle;
      let rel = clamp(wrapAngle(ang - ba), -0.8, 0.8);
      let out = ba + rel;
      if (this.headAim !== null) {
        // アクション中: 頭をゆっくり目標の向きへ
        out += wrapAngle(ba + this.headAim - out) * 0.12;
      } else {
        const up = wrapAngle(out);
        out -= up * this.uprightHead;
      }
      rel = clamp(wrapAngle(out - ba), -0.8, 0.8);
      out = ba + rel;
      // 頭の向きの目標は急に変えない（押し合いで目標が行ったり来たりしても顔が震えない）
      if (this.headGoalInit) out = this.headGoal + clamp(wrapAngle(out - this.headGoal), -0.03, 0.03);
      this.headGoal = out;
      this.headGoalInit = true;
      return out;
    };
  }

  /** 吊るされている間: rest 形状を指定位置・角度に配置 */
  /**
   * 吊るされている間: rest 形状を指定位置・角度に配置。
   * sx < 1 なら、細い口に合わせて体を横に細く（そのぶん少し縦長に）する。顔は潰さない。
   */
  placeHeld(x: number, y: number, angle: number, sx = 1): void {
    const w = this.world;
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    const sy = 1 / Math.sqrt(sx);
    this.updatePoseRest();
    const cl = this.bodyCluster;
    const set = (i: number, lx: number, ly: number) => {
      const nx = x + cs * lx - sn * ly;
      const ny = y + sn * lx + cs * ly;
      w.x[i] = nx;
      w.y[i] = ny;
      w.px[i] = nx;
      w.py[i] = ny;
      w.vx[i] = 0;
      w.vy[i] = 0;
    };
    // 胴体クラスタの rest を使う（足・尻尾のポーズ込み）
    for (let k = 0; k < cl.idx.length; k++) set(cl.idx[k], cl.restX[k] * sx, cl.restY[k] * sy);
    // 頭は形を保ったまま、頭の中心だけ移す
    const h = this.restLocal[this.headC - this.body.start];
    for (const i of this.head) {
      const l = this.restLocal[i - this.body.start];
      set(i, h.x * sx + (l.x - h.x), h.y * sy + (l.y - h.y));
    }
    this.heldSqueeze = sx;
    this.cx = x;
    this.cy = y;
    w.updateAabbs();
  }
  heldSqueeze = 1;
  /**
   * 本来の形（rest）の横幅の倍率。細い口に合わせて細くして落とした猫は 1 未満で始まり、
   * 口を通り抜けてから（着地してから）ゆっくり 1 に戻る
   */
  private restSx = 1;
  private appliedSx = 1;
  private baseRest: { x: Float64Array; y: Float64Array }[] = [];

  /** 吊るした姿勢を横に sx 倍したときの左右の広がり（粒子の半径込み） */
  extentsAt(sx: number): [number, number] {
    const w = this.world;
    const h = this.restLocal[this.headC - this.body.start];
    let el = Infinity;
    let er = -Infinity;
    for (let i = this.body.start; i < this.body.start + this.body.count; i++) {
      const l = this.restLocal[i - this.body.start];
      const x = this.head.includes(i) ? h.x * sx + (l.x - h.x) : l.x * sx;
      el = Math.min(el, x - w.r[i]);
      er = Math.max(er, x + w.r[i]);
    }
    return [el, er];
  }

  release(vx: number, vy: number): void {
    this.held = false;
    // 吊るしていたときの細さのまま落とす（落とした瞬間に形が跳ねないように）
    this.restSx = this.heldSqueeze;
    this.world.setKinematic(this.body, false);
    const w = this.world;
    for (let i = this.body.start; i < this.body.start + this.body.count; i++) {
      w.vx[i] = vx;
      w.vy[i] = vy;
    }
  }

  /** 距離制約（輪郭・首・尻尾）の本来の長さも、細くした体型に合わせる */
  private scaleDistanceRest(sx: number, sy: number): void {
    const b = this.body;
    if (!this.dRestBase) this.dRestBase = b.dRest.slice();
    const h = this.restLocal[this.headC - b.start];
    const pos = (i: number) => {
      const l = this.restLocal[i - b.start];
      return this.head.includes(i) ? { x: h.x * sx + (l.x - h.x), y: h.y * sy + (l.y - h.y) } : { x: l.x * sx, y: l.y * sy };
    };
    for (let k = 0; k < b.dA.length; k++) {
      const i = b.dA[k];
      const j = b.dB[k];
      const li = this.restLocal[i - b.start];
      const lj = this.restLocal[j - b.start];
      const d0 = Math.hypot(li.x - lj.x, li.y - lj.y);
      const p = pos(i);
      const q = pos(j);
      const d1 = Math.hypot(p.x - q.x, p.y - q.y);
      b.dRest[k] = d0 > 1e-6 ? this.dRestBase[k] * (d1 / d0) : this.dRestBase[k];
    }
  }
  private dRestBase: number[] | null = null;

  private updatePoseRest(): void {
    const cl = this.bodyCluster;
    const lp = this.legPose;
    // のびーの間は胴体を少し長く（面積は保つ）
    const sx = this.restSx * (1 + 0.2 * this.stretchPose);
    const sy = 1 / Math.sqrt(sx);
    // 胴体クラスタの rest（足・尻尾以外）と、前後の半身クラスタを細さに合わせる
    const b0 = this.baseRest[0];
    for (let k = 0; k < cl.idx.length; k++) {
      cl.restX[k] = b0.x[k] * sx;
      cl.restY[k] = b0.y[k] * sy;
    }
    if (this.appliedSx !== sx) {
      this.appliedSx = sx;
      this.scaleDistanceRest(sx, sy);
      [this.frontCluster, this.rearCluster].forEach((c, n) => {
        const b = this.baseRest[n + 1];
        for (let k = 0; k < c.idx.length; k++) {
          c.restX[k] = b.x[k] * sx;
          c.restY[k] = b.y[k] * sy;
        }
        c.recompute();
      });
    }
    for (let k = 0; k < 2; k++) {
      const s = this.footSlots[k];
      cl.restX[s] = this.footTuck[k].x + (this.footDangle[k].x - this.footTuck[k].x) * lp;
      cl.restY[s] = this.footTuck[k].y + (this.footDangle[k].y - this.footTuck[k].y) * lp;
    }
    // 毛繕い: 前足を口元へ
    if (this.groomPose > 0.001) {
      const s = this.footSlots[0];
      const h = this.restLocal[this.headC - this.body.start];
      const r = this.species.headR;
      const g = this.groomPose;
      cl.restX[s] += (h.x - r * 0.15 * this.facing - cl.restX[s]) * g;
      cl.restY[s] += (h.y + r * 1.0 - cl.restY[s]) * g;
    }
    const tp = this.tailPose;
    for (let k = 0; k < this.tailSlots.length; k++) {
      const s = this.tailSlots[k];
      // 尻尾の先ほど遅れて巻き付く
      const kk = clamp(tp * 1.6 - (k / this.tailSlots.length) * 0.6, 0, 1);
      cl.restX[s] = this.tailUp[k].x + (this.tailTuck[k].x - this.tailUp[k].x) * kk;
      cl.restY[s] = this.tailUp[k].y + (this.tailTuck[k].y - this.tailUp[k].y) * kk;
    }
    if (sx !== 1) {
      for (const s of [...this.footSlots, ...this.tailSlots]) {
        cl.restX[s] *= sx;
        cl.restY[s] *= sy;
      }
    }
    cl.recompute();
  }

  /** 物理ステップ前に毎フレーム呼ぶ */
  update(dt: number, env: CatEnv): void {
    const w = this.world;
    this.age += dt;
    // --- 統計 ---
    let cx = 0;
    let cy = 0;
    let vx = 0;
    let vy = 0;
    let sp = 0;
    let ringHits = 0;
    let bowlHits = 0;
    for (const i of this.ring) {
      cx += w.x[i];
      cy += w.y[i];
      vx += w.vx[i];
      vy += w.vy[i];
      sp += Math.hypot(w.vx[i], w.vy[i]);
      if (w.contact[i] & CONTACT_CAT) ringHits++;
      if (w.contact[i] & CONTACT_BOWL) bowlHits++;
    }
    const N = this.ring.length;
    cx /= N;
    cy /= N;
    vx /= N;
    vy /= N;
    sp /= N;
    this.cx = cx;
    this.cy = cy;
    this.ringContact = ringHits / N;
    let headHits = 0;
    for (const i of this.head) if (w.contact[i] & CONTACT_CAT) headHits++;
    for (const i of this.feet) if (w.contact[i]) bowlHits++;
    this.updateSwing(dt, cx);

    if (this.held) {
      this.expression = 'curious';
      this.legPose = 1;
      this.tailPose = 0;
      this.animateEyes(dt);
      this.updateLooks(dt, env);
      return;
    }

    this.avgSpeed = this.avgSpeed * 0.85 + sp * 0.15;

    // 着地
    if (!this.landed && (ringHits + bowlHits > 0 || headHits > 0)) {
      this.landed = true;
      const impact = Math.hypot(this.prevVX, this.prevVY);
      this.impactTimer = 0.5;
      // 着地の瞬間だけ体をぐっと柔らかく → 潰れてから反動で戻る
      this.firmness = clamp(0.62 - impact / 3000, 0.32, 0.6);
      env.sound.posu(clamp(impact / 1100, 0.15, 1));
      env.event('posu', this, clamp(impact / 1100, 0.15, 1));
      if (ringHits > 0) this.munyuCooldown = 0;
    }
    // 急な速度変化 = 押された・ぶつけられた
    const dv = Math.hypot(vx - this.prevVX, vy - this.prevVY);
    this.prevVX = vx;
    this.prevVY = vy;
    this.munyuCooldown -= dt;
    const squash = Math.max(this.frontCluster.squash, this.rearCluster.squash);
    if (this.landed && this.age > 0.2 && dv > 150) {
      this.pressTimer = Math.max(this.pressTimer, 0.9);
      if (this.munyuCooldown <= 0 && ringHits > 0) {
        env.sound.munyu(clamp(dv / 500, 0.2, 0.8));
        env.event('munyu', this, clamp(dv / 500, 0.2, 0.8));
        this.munyuCooldown = 1.4;
      }
      this.calm = Math.min(this.calm, 1.2);
    }
    this.impactTimer -= dt;
    this.pressTimer -= dt;
    this.pokeTimer -= dt;

    // すぽっ: 落ち着きかけた猫が隙間へ滑り込んで、ぴたっと止まる
    if (this.landed && this.impactTimer <= 0 && !env.cleared) {
      if (vy > 60) {
        // 一度落ち着いていた猫が動き出したときだけ数える
        if (this.slide === 0) this.slideArmed = this.impactTimer < -0.6 && this.pressTimer <= 0;
        this.slide += vy * dt;
      } else if (vy < 12) {
        if (this.slideArmed && this.slide > this.species.b * 0.65 && ringHits > 0) {
          env.sound.supo();
          env.event('supo', this, 1);
          this.calm = Math.max(this.calm, 1);
        }
        this.slide = 0;
      }
    }

    // 「ぽすっ」は跳ねない: 着地後の上向きの重心運動と回転を吸収する
    if (this.landed && vy < -20) {
      const k = this.impactTimer > 0 ? 0.55 : 0.12;
      const cut = vy * k;
      for (let i = this.body.start; i < this.body.start + this.body.count; i++) w.vy[i] -= cut;
    }
    if (this.landed && this.impactTimer > 0) {
      // 角速度を少し減衰
      let L = 0;
      let I = 0;
      for (const i of this.ring) {
        const rx = w.x[i] - cx;
        const ry = w.y[i] - cy;
        L += rx * (w.vy[i] - vy) - ry * (w.vx[i] - vx);
        I += rx * rx + ry * ry;
      }
      const om = (L / (I || 1)) * 0.25;
      for (let i = this.body.start; i < this.body.start + this.body.count; i++) {
        const rx = w.x[i] - cx;
        const ry = w.y[i] - cy;
        w.vx[i] += ry * om;
        w.vy[i] -= rx * om;
      }
    }

    if (this.landed && this.avgSpeed < 24) this.calm += dt;
    else this.calm = Math.max(0, this.calm - dt * 4);

    // --- 硬さ（落ち着くほど液体に） ---
    const relax = this.landed ? smooth(0.3, 5, this.calm) : 0;
    const targetFirm = this.landed ? 0.85 + (this.species.relaxMin - 0.85) * relax : 1;
    this.firmness += (targetFirm - this.firmness) * Math.min(1, dt * 1.6);
    // 着地直後は内部振動を強めに減衰（跳ね返りすぎない）
    this.body.internalDamping = this.species.damping * (this.impactTimer > 0 ? 2.2 : 1);
    this.bodyCluster.stiffMul = this.firmness;
    this.frontCluster.stiffMul = this.firmness;
    this.rearCluster.stiffMul = this.firmness;

    // 起き上がり補助・首
    this.uprightBody = this.landed ? 0.0025 * smooth(0.5, 3, this.calm) : 0;
    this.uprightHead = this.landed ? 0.01 + 0.03 * relax : 0.004;

    // ポーズ
    const legTarget = this.landed ? 0 : 1;
    this.legPose += (legTarget - this.legPose) * Math.min(1, dt * (this.landed ? 10 : 6));
    // 細くして落とした猫: 口を通り抜けたら（着地したら）ゆっくり本来の体型へ
    if (this.restSx < 1 && (this.landed || this.cy > env.rimY + this.species.b)) {
      this.restSx = Math.min(1, this.restSx + dt * 1.2);
    } else if (this.restSx > 1) {
      // ねこけし: 融合直後の横長の体が、むにゅっと本来の猫の形へ
      this.restSx = Math.max(1, this.restSx - dt * 1.4);
    }
    // 着地したら足はふにゃっと（足がバネになって跳ねないように）
    for (const s of this.footSlots) this.bodyCluster.stiff[s] = this.landed ? 0.1 : 0.35;
    this.bodyCluster.stiff[this.footSlots[0]] += 0.35 * this.groomPose;
    const tailTarget = this.landed ? smooth(1.5, 4, this.calm) : 0;
    this.tailPose += (tailTarget - this.tailPose) * Math.min(1, dt * 1.5);
    this.updatePoseRest();

    // --- 居心地のいい隙間へ: 何にも触れていない輪郭を少し外へ膨らませる ---
    // 面積は保存されるので、結果として体が空いている方向へ流れ込む。
    for (let k = 0; k < N; k++) {
      const i = this.ring[k];
      w.ax[i] = 0;
      w.ay[i] = 0;
    }
    if (this.landed && !env.cleared) {
      const ooze = 340 * smooth(0.2, 2.5, this.calm);
      if (ooze > 0) {
        for (let k = 0; k < N; k++) {
          const i = this.ring[k];
          if (w.contact[i]) continue;
          const ip = this.ring[(k + N - 1) % N];
          const inx = this.ring[(k + 1) % N];
          let nx = w.y[inx] - w.y[ip];
          let ny = -(w.x[inx] - w.x[ip]);
          const l = Math.hypot(nx, ny) || 1;
          nx /= l;
          ny /= l;
          if (nx * (w.x[i] - cx) + ny * (w.y[i] - cy) < 0) {
            nx = -nx;
            ny = -ny;
          }
          if (ny < -0.3) continue; // 上には膨らまない
          w.ax[i] = nx * ooze;
          w.ay[i] = ny * ooze;
        }
      }
    }

    // --- 呼吸・クリア時のむにゅっ ---
    const sleeping = this.expression === 'sleep' || this.expression === 'happy';
    const breath = sleeping ? 0.02 * Math.sin(env.time * 2.3 + this.phase) : 0;
    this.bodyArea.scale = (1 + breath) * (1 - 0.05 * env.squeeze) * Math.sqrt(Math.min(1, this.restSx)) * (1 + this.inflate);

    this.updateAction(dt, env);

    // --- 表情 ---
    this.headBuried += ((headHits >= 3 ? 1 : 0) - this.headBuried) * Math.min(1, dt * 2);
    let e: Expression;
    if (!this.landed) e = 'surprised';
    else if (env.cleared) e = 'happy';
    else if (this.impactTimer > 0) e = 'startled';
    else if (this.pressTimer > 0 || squash > 1.9) e = this.stoic ? 'blank' : 'squint';
    else if (this.action === 'yawn') e = 'yawn';
    else if (this.action === 'groom' || this.action === 'lick') e = 'groom';
    else if (this.action === 'stretch') e = 'stretch';
    else if (this.licked > 0 || (this.headBuried > 0.6 && this.calm > 1.5)) e = 'bliss';
    else if (this.calm > this.sleepAt) e = 'sleep';
    else if (this.calm > this.sleepAt / 2) e = 'sleepy';
    else e = this.stoic || this.blankTimer > 0 ? 'blank' : 'normal';
    this.blankTimer -= dt;
    if (this.grumpy && this.landed) {
      // 不機嫌な猫: 触られたり舐められたりするとイカ耳、ふだんはジト目。クリアしても機嫌は直らない
      if (e === 'squint' || this.licked > 0) e = 'annoyed';
      else if (e === 'normal' || e === 'bliss' || e === 'happy') e = 'grumpy';
    }
    const earTarget = e === 'annoyed' ? 1 : e === 'grumpy' ? 0.25 : 0;
    this.earFlat += (earTarget - this.earFlat) * Math.min(1, dt * 10);
    if (e === 'sleep' && !this.purred) {
      this.purred = true;
      env.sound.purr();
    }
    if (e !== 'sleep' && e !== 'bliss' && this.calm < 2) this.purred = false;
    this.expression = e;
    this.blush += ((e === 'bliss' || e === 'happy' || this.action === 'lick' ? 1 : 0) - this.blush) * Math.min(1, dt * 2);
    if (this.grumpy) this.blush = 0;
    this.animateEyes(dt);
    this.updateLooks(dt, env);
  }

  private animateEyes(dt: number): void {
    const e = this.expression;
    const target =
      e === 'surprised' || e === 'startled'
        ? 1.15
        : e === 'sleepy'
          ? 0.45
          : e === 'sleep' || e === 'bliss' || e === 'happy' || e === 'groom' || e === 'yawn' || e === 'stretch'
            ? 0
            : e === 'squint'
              ? 0.25
              : e === 'annoyed'
                ? 0.85
                : 1;
    const rate = e === 'startled' ? 30 : e === 'sleep' ? 1.2 : 8;
    this.eyeOpen += (target - this.eyeOpen) * Math.min(1, dt * rate);
    this.blinkTimer -= dt;
    if (this.blinkTimer < 0) {
      this.blink = 1;
      this.blinkTimer = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
  }

  /**
   * 落ち着いた猫のアクション（毛繕い・隣の猫を舐める・あくび）。
   * 頭の向きと前足のポーズの目標を少し変えるだけで、動き自体は soft-body に任せる。
   */
  private updateAction(dt: number, env: CatEnv): void {
    const w = this.world;
    for (const i of this.head) {
      w.ax[i] = 0;
      w.ay[i] = 0;
    }
    this.licked = Math.max(0, this.licked - dt);
    const canAct = this.landed && !env.cleared && this.impactTimer <= 0 && this.pressTimer <= 0;
    if (this.action !== 'none') {
      this.actionTime += dt;
      // 強く押されたり、クリアしたら中断
      if (!canAct || this.actionTime > this.actionDur || (this.action === 'lick' && !this.lickTarget)) this.endAction();
    } else if (canAct) {
      const asleep = this.calm > this.sleepAt;
      this.actionCooldown -= dt;
      if (asleep) {
        // 寝ていても、たまに起きて毛繕いする
        this.wakeTimer -= dt;
        if (this.wakeTimer <= 0) {
          this.wakeTimer = 12 + Math.random() * 18;
          if (Math.random() < 0.4) {
            this.calm = 3;
            this.actionCooldown = 0;
            // 起きたら、のびー
            if (Math.random() < 0.7 && this.canStretch()) {
              this.startAction('stretch', 3, null);
              this.actionCooldown = 2;
            }
          }
        }
      } else if (this.calm > 1.5 && this.actionCooldown <= 0) {
        this.actionCooldown = 3 + Math.random() * 6;
        const r0 = Math.random();
        if (r0 < 0.1) {
          // スン…（しばらく無表情）
          this.blankTimer = 3 + Math.random() * 3;
        } else if (r0 < 0.2 && this.canStretch()) {
          this.startAction('stretch', 3, null);
        } else {
          const target = this.findLickTarget(env);
          const r = Math.random();
          // 不機嫌な猫は他の猫を舐めない
          if (target && r < 0.45 && !this.grumpy) this.startAction('lick', 2.5 + Math.random() * 2, target);
          else if (r < 0.8) this.startAction('groom', 2.5 + Math.random() * 2.5, null);
          else this.startAction('yawn', 1.6, null);
        }
      }
    }

    // アクションごとの目標
    const t = this.actionTime;
    const f = this.facing;
    let tongue = 0;
    let groom = 0;
    let yawn = 0;
    let stretch = 0;
    this.headAim = null;
    if (this.action === 'groom') {
      // 頭を前足の方へ下げて、ペロペロ
      groom = 1;
      this.headAim = 0.3 * f + Math.sin(t * 9) * 0.1;
      tongue = t > 0.4 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 9)) : 0;
      this.tongueSide = 0;
    } else if (this.action === 'lick' && this.lickTarget) {
      const o = this.lickTarget;
      const hf = this.headFrame();
      // 相手の左右は舐め始めに決めて固定する（毎フレーム決め直すと、真横にいるとき顔が左右に震える）
      if (this.lickSide === 0) this.lickSide = o.cx - hf.x >= 0 ? 1 : -1;
      if (this.lickUp === 0) this.lickUp = o.cy - hf.y > 0 ? 1 : -1;
      const side = this.lickSide;
      this.headAim = 0.35 * side + Math.sin(t * 10) * 0.12;
      tongue = t > 0.3 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 10)) : 0;
      this.tongueSide = side;
      // 相手の方へ頭を少し寄せる
      for (const i of this.head) {
        w.ax[i] = side * 160;
        w.ay[i] = this.lickUp * 60;
      }
      if (t > 0.3) {
        if (o.licked <= 0) env.event('lick', o, 1);
        o.licked = 0.6;
      }
    } else if (this.action === 'yawn') {
      // ふわぁ… 顔を上げて大きく口を開ける
      const k = t / this.actionDur;
      yawn = Math.sin(Math.min(1, k * 1.15) * Math.PI);
      this.headAim = -0.25 * f * yawn;
    } else if (this.action === 'stretch') {
      // のびー: 前脚を前へ伸ばして、胴体をにゅーっと伸ばす。頭は少し前に下げる
      const k = t / this.actionDur;
      stretch = Math.sin(Math.min(1, k) * Math.PI) ** 0.5;
      this.headAim = 0.24 * f * stretch;
      // いちばん伸びたところで、ふわぁ…とあくび
      yawn = Math.max(0, Math.sin(Math.min(1, Math.max(0, (k - 0.3) / 0.5)) * Math.PI)) * 0.8;
    }
    this.stretchPose += (stretch - this.stretchPose) * Math.min(1, dt * 5);
    if (stretch === 0 && this.stretchPose < 1e-3) this.stretchPose = 0;
    this.tongue += (tongue - this.tongue) * Math.min(1, dt * 18);
    this.groomPose += (groom - this.groomPose) * Math.min(1, dt * 4);
    this.yawnOpen += (yawn - this.yawnOpen) * Math.min(1, dt * 10);
  }

  /**
   * 指でつつかれた・かき混ぜられた。目を細めて、寝ていたら起きる。
   * 触られ始めなら true（鳴き声の合図）。
   */
  /**
   * 外から気まぐれを起こす（図鑑用）。落ち着いて床にいる猫だけ。
   * nap: 寝る / wake: 起きる（ときどき、のびー）/ blank: スン… / slowBlink: ゆっくりまばたき / それ以外はアクション
   */
  whim(kind: 'groom' | 'yawn' | 'stretch' | 'nap' | 'wake' | 'blank' | 'slowBlink'): void {
    if (!this.landed || this.held) return;
    if (kind === 'nap') {
      if (this.action !== 'none') this.endAction();
      this.calm = Math.max(this.calm, this.sleepAt - 0.5);
    } else if (kind === 'wake') {
      this.calm = Math.min(this.calm, 2);
      if (Math.random() < 0.6 && this.action === 'none') this.startAction('stretch', 3, null);
    } else if (kind === 'blank') {
      this.blankTimer = 3 + Math.random() * 3;
    } else if (kind === 'slowBlink') {
      this.slowBlinkT = 1e-4;
    } else if (this.action === 'none') {
      this.calm = Math.min(Math.max(this.calm, 1.6), this.sleepAt / 2 - 0.1);
      this.startAction(kind, kind === 'yawn' ? 1.6 : kind === 'stretch' ? 3 : 2.5 + Math.random() * 2.5, null);
    }
  }

  poke(): boolean {
    if (!this.landed) return false;
    const fresh = this.pokeTimer <= 0;
    this.pressTimer = Math.max(this.pressTimer, 0.5);
    this.pokeTimer = 0.8;
    this.calm = Math.min(this.calm, 0.6);
    if (this.action !== 'none') this.endAction();
    return fresh;
  }
  private pokeTimer = 0;

  /** 寝つくまでの落ち着き時間（不機嫌な猫はなかなか寝ない） */
  private get sleepAt(): number {
    return this.grumpy ? 12 : 8;
  }
  private lickSide = 0;
  private lickUp = 0;

  /** のびーは周りが空いているときだけ（ぎゅうぎゅうの中で伸びると、まわりを押してしまう） */
  private canStretch(): boolean {
    return this.ringContact < 0.35;
  }

  private startAction(a: CatAction, dur: number, target: Cat | null): void {
    this.lickSide = 0;
    this.lickUp = 0;
    this.action = a;
    this.actionTime = 0;
    this.actionDur = dur;
    this.lickTarget = target;
  }

  private endAction(): void {
    this.action = 'none';
    this.lickTarget = null;
  }

  /** 頭のすぐそばに体がある猫 */
  private findLickTarget(env: CatEnv): Cat | null {
    const w = this.world;
    const hf = this.headFrame();
    const reach = this.species.headR * 1.7;
    let best: Cat | null = null;
    let bestD = reach * reach;
    for (const o of env.cats) {
      if (o === this || !o.landed) continue;
      if (o.body.maxX < hf.x - reach || o.body.minX > hf.x + reach || o.body.maxY < hf.y - reach || o.body.minY > hf.y + reach) continue;
      for (const i of o.ring) {
        const d = (w.x[i] - hf.x) ** 2 + (w.y[i] - hf.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
    }
    return best;
  }

  /** 描画用: 輪郭粒子のゴール位置（前後の半身クラスタのゴールの平均） */
  ringGoals(outX: Float64Array, outY: Float64Array): void {
    const f = this.frontCluster;
    const r = this.rearCluster;
    for (let k = 0; k < this.ring.length; k++) {
      const a = this.frontSlot[k];
      const b = this.rearSlot[k];
      if (a >= 0 && b >= 0) {
        outX[k] = (f.goalX[a] + r.goalX[b]) / 2;
        outY[k] = (f.goalY[a] + r.goalY[b]) / 2;
      } else if (a >= 0) {
        outX[k] = f.goalX[a];
        outY[k] = f.goalY[a];
      } else {
        outX[k] = r.goalX[b];
        outY[k] = r.goalY[b];
      }
    }
  }

  /** 描画用: 頭中心と角度 */
  headFrame(): { x: number; y: number; angle: number } {
    const w = this.world;
    let hx = 0;
    let hy = 0;
    for (const i of this.head) {
      hx += w.x[i];
      hy += w.y[i];
    }
    hx /= this.head.length;
    hy /= this.head.length;
    return { x: hx, y: hy, angle: this.held ? this.heldAngle : this.headCluster.angle };
  }
  heldAngle = 0;

  /** 動じない性格（押されても潰されても無表情） */
  stoic = false;
  /** たまに「スン…」と無表情になる残り時間 */
  private blankTimer = 0;
  /** 描画用: 目で追っている点（ワールド座標）と、追っている度合い 0..1 */
  lookX = 0;
  lookY = 0;
  lookAmt = 0;
  private lookInterest = true;
  private lookTimer = 0;
  /** 描画用: 瞳の大きさ 0（細い）..1（まん丸） */
  pupil = 0.3;
  /** 描画用: ゆっくりまばたきで閉じている度合い 0..1 */
  slowBlink = 0;
  private slowBlinkT = 0;
  private slowBlinkCooldown = 4 + Math.random() * 8;
  /** 描画用: しっぽの揺れ（振れ幅・位相）と、寝ているときの先っぽのぴくっ */
  wagAmp = 0;
  wagPhase = Math.random() * 10;
  private wagFreq = 1.5;
  tailTwitch = 0;
  private twitchTimer = 3 + Math.random() * 5;
  /** のびー 0..1（前脚を前へ伸ばし、胴体がにゅーっと伸びる） */
  stretchPose = 0;
  /** 輪郭のうち他の猫に触れている割合（のびーは周りが空いているときだけ） */
  private ringContact = 0;

  /** 目・しっぽなど、表情が決まったあとの細かい動き（吊るされている間も） */
  private updateLooks(dt: number, env: CatEnv): void {
    const e = this.expression;
    // --- 目で追う ---
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 1.5 + Math.random() * 4;
      // いつも見ているわけではない
      this.lookInterest = Math.random() < 0.75;
    }
    const f = env.focus;
    const awake = e === 'normal' || e === 'grumpy' || e === 'blank' || e === 'sleepy' || e === 'annoyed';
    const want = !!f && !this.held && this.landed && this.lookInterest && awake && this.slowBlink < 0.5;
    if (f && want) {
      if (this.lookAmt < 0.05) {
        this.lookX = f.x;
        this.lookY = f.y;
      }
      const k = Math.min(1, dt * 9);
      this.lookX += (f.x - this.lookX) * k;
      this.lookY += (f.y - this.lookY) * k;
    }
    this.lookAmt += ((want ? 1 : 0) - this.lookAmt) * Math.min(1, dt * 6);
    // --- 瞳の大きさ: 驚くとまん丸、落ち着くと細く、動くものを見ていると大きく ---
    let pt =
      e === 'surprised' || e === 'startled'
        ? 0.9
        : e === 'curious'
          ? 0.6
          : e === 'grumpy' || e === 'annoyed'
            ? 0.12
            : e === 'blank'
              ? 0.1
              : e === 'sleepy'
                ? 0.4
                : 0.28;
    if (env.focusMoving && e !== 'blank') pt = Math.max(pt, 0.28 + 0.4 * this.lookAmt);
    this.pupil += (pt - this.pupil) * Math.min(1, dt * 5);
    // --- ゆっくりまばたき（猫の「好き」のサイン） ---
    const canBlink = e === 'normal' || e === 'curious' || e === 'sleepy';
    if (this.slowBlinkT > 0) {
      this.slowBlinkT += dt;
      const t = this.slowBlinkT;
      const ease = (x: number) => x * x * (3 - 2 * x);
      this.slowBlink = t < 0.8 ? ease(t / 0.8) : t < 1.25 ? 1 : t < 2.2 ? 1 - ease((t - 1.25) / 0.95) : 0;
      if (t >= 2.2 || !canBlink) {
        this.slowBlinkT = 0;
        this.slowBlink = 0;
      }
    } else {
      this.slowBlinkCooldown -= dt;
      if (this.slowBlinkCooldown <= 0) {
        this.slowBlinkCooldown = 6 + Math.random() * 14;
        if (canBlink && Math.random() < 0.4) this.slowBlinkT = 1e-4;
      }
    }
    // --- しっぽ: ごきげんはゆったり、不機嫌はパタパタ、寝ていても先だけぴくっ ---
    let amp = 0;
    let freq = this.wagFreq;
    if (this.held) {
      amp = 0.05;
      freq = 1.4;
    } else if (!this.landed || e === 'sleep' || e === 'blank' || e === 'surprised' || e === 'startled') {
      amp = 0;
    } else if (e === 'grumpy' || e === 'annoyed') {
      amp = 0.18;
      freq = 7;
    } else if (e === 'happy' || e === 'bliss') {
      amp = 0.09;
      freq = 2.2;
    } else {
      amp = 0.06;
      freq = 1.5;
    }
    this.wagAmp += (amp - this.wagAmp) * Math.min(1, dt * 2);
    this.wagFreq += (freq - this.wagFreq) * Math.min(1, dt * 2);
    this.wagPhase += dt * this.wagFreq;
    this.tailTwitch *= Math.exp(-dt * 2.5);
    if (e === 'sleep') {
      this.twitchTimer -= dt;
      if (this.twitchTimer <= 0) {
        this.twitchTimer = 3 + Math.random() * 7;
        this.tailTwitch = 1;
      }
    }
  }

  /** 描画用: 前脚・後ろ脚の付け根を挟む輪郭点（ring 配列の位置: [背中側, お腹側]） */
  readonly legAnchor: [number, number][];
  /** 描画用: ぶら下がった脚の振れ角（振り子。吊るしたまま動かすと遅れて揺れる） */
  legSwing = 0;
  private legSwingV = 0;
  /** 描画用: 吊るされている度合い（離すとなめらかに 0 へ） */
  hang = 1;
  private swingX = NaN;
  private swingVx = 0;

  private updateSwing(dt: number, cx: number): void {
    if (dt <= 0) return;
    const vx = Number.isNaN(this.swingX) ? 0 : (cx - this.swingX) / dt;
    this.swingX = cx;
    const ax = Math.max(-30000, Math.min(30000, (vx - this.swingVx) / dt));
    this.swingVx += (vx - this.swingVx) * 0.6;
    // 動く支点から吊るした振り子: θ'' = -(g/L) sinθ - (a/L) cosθ - 減衰
    const L = this.species.b * 1.6;
    const th = this.legSwing;
    const acc = -(1500 / L) * Math.sin(th) - (ax / L) * Math.cos(th) - 3.5 * this.legSwingV;
    this.legSwingV += acc * dt;
    this.legSwing = Math.max(-1, Math.min(1, th + this.legSwingV * dt));
    this.hang += ((this.held ? 1 : 0) - this.hang) * Math.min(1, dt * (this.held ? 20 : 7));
  }
}

/**
 * 胴体の高さの倍率（u: -1 = お尻 … +1 = 首の側、belly: お腹側か、aspect: b / a）。
 * 背中: お尻（腰）が高く盛り上がる。
 *   首の側の背中は下げない: 下げると胴体の前の上端が頭と深く重なり、頭と胴体が内側で押し合い続けて
 *   猫がガラスの壁を自分でよじ登ってしまう（首の側はどうせ頭に隠れる）。
 * お腹: 太もものところは深く、その前でくびれる（縦長の猫ほど控えめ）。胸から首の下へ細くなる。
 */
function bodyProfile(u: number, belly: boolean, aspect: number): number {
  const bump = (h: number, c: number, w: number) => h * Math.exp(-(((u - c) / w) ** 2));
  const ss = (h: number, e0: number, e1: number) => {
    const t = Math.max(0, Math.min(1, (u - e0) / (e1 - e0)));
    return h * t * t * (3 - 2 * t);
  };
  if (!belly) return 1 + bump(0.2, -0.45, 0.4);
  const tuck = Math.min(1, 0.55 / aspect);
  return 1 + bump(0.08, -0.62, 0.25) + bump(-0.26 * tuck, -0.15, 0.25) + bump(0.04, 0.4, 0.3) + ss(-0.18, 0.5, 1);
}
