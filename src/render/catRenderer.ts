/**
 * 猫の描画。物理粒子の位置をそのまま使わず、
 *   - シェイプマッチングのゴール形状へ少し寄せる
 *   - 平滑化してから粒子半径ぶん外側へ膨らませる
 * ことで「中身は多少ぐちゃっとしても、見た目は猫らしい輪郭」に補正する。
 * 顔は頭クラスタの剛体フレームで描くので、体がどれだけ潰れても崩れない。
 */
import type { Cat } from '../cat/cat';
import { CONTACT_BOWL } from '../physics/world';

type Pt = { x: number; y: number };

const TAU = Math.PI * 2;

/** Catmull-Rom で閉曲線 */
export function closedSpline(ctx: CanvasRenderingContext2D, p: Pt[]): void {
  const n = p.length;
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = p[(i + n - 1) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
  ctx.closePath();
}

function openSpline(ctx: CanvasRenderingContext2D, p: Pt[], move = true): void {
  const n = p.length;
  if (move) ctx.moveTo(p[0].x, p[0].y);
  for (let i = 0; i < n - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(n - 1, i + 2)];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

/** 物理リング → 表示用輪郭 */
function displayRing(cat: Cat, idx: number[], goalX: Float64Array, goalY: Float64Array, goalBlend: number, inflate: number): Pt[] {
  const w = cat.world;
  const n = idx.length;
  const raw: Pt[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    const x = w.x[i] + (goalX[k] - w.x[i]) * goalBlend;
    const y = w.y[i] + (goalY[k] - w.y[i]) * goalBlend;
    raw[k] = { x, y };
  }
  // 平滑化
  const sm: Pt[] = new Array(n);
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < n; k++) {
    const a = raw[(k + n - 1) % n];
    const b = raw[k];
    const c = raw[(k + 1) % n];
    sm[k] = { x: b.x * 0.5 + (a.x + c.x) * 0.25, y: b.y * 0.5 + (a.y + c.y) * 0.25 };
    cx += sm[k].x;
    cy += sm[k].y;
  }
  cx /= n;
  cy /= n;
  // 外側へ膨らませる（衝突の厚みぶん）
  const out: Pt[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const a = sm[(k + n - 1) % n];
    const c = sm[(k + 1) % n];
    let nx = c.y - a.y;
    let ny = -(c.x - a.x);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    if (nx * (sm[k].x - cx) + ny * (sm[k].y - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    out[k] = { x: sm[k].x + nx * inflate, y: sm[k].y + ny * inflate };
  }
  return out;
}

function centroid(p: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const q of p) {
    x += q.x;
    y += q.y;
  }
  return { x: x / p.length, y: y / p.length };
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** ふわふわ猫: 輪郭点の間を外へふくらむ曲線でつなぐ（雲のような毛並み） */
function fluffPath(ctx: CanvasRenderingContext2D, p: Pt[], amp: number, c: Pt): void {
  const n = p.length;
  const m0 = lerp(p[n - 1], p[0], 0.5);
  ctx.moveTo(m0.x, m0.y);
  for (let k = 0; k < n; k++) {
    const a = p[k];
    const b = p[(k + 1) % n];
    const m = lerp(a, b, 0.5);
    // a を頂点として少し外側へ押し出した制御点
    const dx = a.x - c.x;
    const dy = a.y - c.y;
    const l = Math.hypot(dx, dy) || 1;
    ctx.quadraticCurveTo(a.x + (dx / l) * amp, a.y + (dy / l) * amp, m.x, m.y);
  }
  ctx.closePath();
}

/** 胴体の輪郭パス */
function bodyPath(ctx: CanvasRenderingContext2D, p: Pt[], fluff: number, c: Pt): void {
  if (fluff > 0) fluffPath(ctx, p, fluff, c);
  else closedSpline(ctx, p);
}

let gx = new Float64Array(64);
let gy = new Float64Array(64);

/**
 * 胴体の輪郭だけを太く描く（ねこけしで融合中の2匹用）。
 * 2匹ぶんの輪郭を先に描いてから、outline なしで2匹を描くと、重なった所の境目が消えて
 * 1つのかたまりの輪郭になる（境界がむにゅっと溶けて見える）。
 */
export function strokeCatSilhouette(ctx: CanvasRenderingContext2D, cat: Cat): void {
  if (gx.length < cat.ring.length) {
    gx = new Float64Array(64);
    gy = new Float64Array(64);
  }
  cat.ringGoals(gx, gy);
  const ring = displayRing(cat, cat.ring, gx, gy, cat.held ? 0 : 0.3, cat.ringR * 0.95);
  const c = centroid(ring);
  ctx.beginPath();
  bodyPath(ctx, ring, cat.species.fluff * 7, c);
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = cat.coat.line;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function drawCat(ctx: CanvasRenderingContext2D, cat: Cat, time: number, outline = true): void {
  const w = cat.world;
  const sp = cat.species;
  const coat = cat.coat;
  if (gx.length < cat.ring.length) {
    gx = new Float64Array(64);
    gy = new Float64Array(64);
  }
  cat.ringGoals(gx, gy);
  const N = cat.ring.length;
  const held = cat.held;
  // 吊るされている間はクラスタのゴールが古いので粒子位置そのまま
  const gb = held ? 0 : 0.3;
  const ring = displayRing(cat, cat.ring, gx, gy, gb, cat.ringR * 0.95);
  const c = centroid(ring);
  const lineW = 1.6;

  // 圧縮度（ふわふわ猫は押されると毛が寝る）
  let area = 0;
  for (let k = 0; k < N; k++) {
    const i = cat.ring[k];
    const j = cat.ring[(k + 1) % N];
    area += w.x[i] * w.y[j] - w.x[j] * w.y[i];
  }
  const compress = Math.min(1.1, (0.5 * area) / cat.bodyArea.rest);

  const tailFront = cat.tailPose > 0.55;
  if (!tailFront) drawTail(ctx, cat);

  // 脚（奥側は少し暗く）。胴体の下に描いて、輪郭からはみ出た部分だけ見せる
  drawLegs(ctx, cat, ring, time, 'far');
  drawLegs(ctx, cat, ring, time, 'near');

  // --- 胴体 ---
  // 押されると毛が寝て小さくなる
  const fl = sp.fluff * 7 * Math.max(0.15, Math.min(1, (compress - 0.7) / 0.25));
  ctx.beginPath();
  bodyPath(ctx, ring, fl, c);
  ctx.fillStyle = coat.base;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // 模様（輪郭粒子に張り付くので変形に追従する）
  const rl = cat.restLocal;
  const st = cat.body.start;
  const b = sp.b;
  // お腹・胸（下側の輪郭粒子に張り付いたやわらかい明るい部分）
  {
    let bx = 0;
    let by = 0;
    let bn = 0;
    let fx = 0;
    let fy = 0;
    let fn = 0;
    for (let k = 0; k < N; k++) {
      const l = rl[cat.ring[k] - st];
      if (l.y > b * 0.3) {
        bx += ring[k].x;
        by += ring[k].y;
        bn++;
        if (l.x * cat.facing > 0) {
          fx += ring[k].x;
          fy += ring[k].y;
          fn++;
        }
      }
    }
    if (bn > 0 && fn > 0) {
      const bot = { x: bx / bn, y: by / bn };
      const chest = lerp({ x: fx / fn, y: fy / fn }, c, 0.15);
      const scaleR = Math.sqrt(Math.max(0.4, compress));
      if (coat.tuxedo) {
        // ハチワレ: 胸からお腹にかけてくっきり白
        ctx.fillStyle = coat.belly;
        const belly: Pt[] = [];
        for (let k = 0; k < N; k++) if (rl[cat.ring[k] - st].y > b * 0.05) belly.push(ring[k]);
        const inner = belly.map((p) => lerp(p, c, 0.55)).reverse();
        ctx.beginPath();
        openSpline(ctx, belly);
        ctx.lineTo(inner[0].x, inner[0].y);
        openSpline(ctx, inner, false);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(chest.x, chest.y, b * 0.75 * scaleR, 0, TAU);
        ctx.fill();
      } else {
        const g1 = ctx.createRadialGradient(chest.x, chest.y, 0, chest.x, chest.y, b * 1.0 * scaleR);
        g1.addColorStop(0, coat.belly);
        g1.addColorStop(0.55, coat.belly);
        g1.addColorStop(1, hexA(coat.belly, 0));
        ctx.fillStyle = g1;
        ctx.fillRect(chest.x - b * 2, chest.y - b * 2, b * 4, b * 4);
        const g2 = ctx.createRadialGradient(bot.x, bot.y + b * 0.15, 0, bot.x, bot.y + b * 0.15, sp.a * 0.75 * scaleR);
        g2.addColorStop(0, hexA(coat.belly, 0.9));
        g2.addColorStop(0.5, hexA(coat.belly, 0.55));
        g2.addColorStop(1, hexA(coat.belly, 0));
        ctx.fillStyle = g2;
        ctx.fillRect(bot.x - sp.a * 2, bot.y - sp.a * 2, sp.a * 4, sp.a * 4);
      }
    }
  }
  // 縞
  if (coat.stripe) {
    ctx.strokeStyle = coat.stripe;
    ctx.lineCap = 'round';
    const spacing = (2 * Math.PI * Math.sqrt((sp.a * sp.a + sp.b * sp.b) / 2)) / N;
    ctx.lineWidth = spacing * 0.42;
    ctx.globalAlpha = 0.75;
    for (let k = 0; k < N; k++) {
      const l = rl[cat.ring[k] - st];
      if (l.y > -b * 0.2) continue;
      if (l.x * cat.facing > sp.a * 0.55) continue; // 頭の下は省略
      const p = ring[k];
      const q = lerp(p, c, 0.38 + 0.08 * Math.sin(k * 2.1));
      const m = lerp(p, q, 0.5);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(m.x + (q.y - p.y) * 0.15, m.y - (q.x - p.x) * 0.15, q.x, q.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 三毛の斑
  if (coat.patches) {
    const s = Math.sqrt(Math.max(0.3, compress));
    for (const pa of coat.patches) {
      const k = Math.floor(pa.at * N + (cat.facing < 0 ? N / 2 : 0)) % N;
      const p = lerp(ring[k], c, pa.depth);
      const p2 = lerp(ring[(k + 2) % N], c, pa.depth + 0.1);
      ctx.fillStyle = pa.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pa.size * b * s * 0.85, 0, TAU);
      ctx.moveTo(p2.x + pa.size * b * s * 0.7, p2.y);
      ctx.arc(p2.x, p2.y, pa.size * b * s * 0.7, 0, TAU);
      ctx.fill();
    }
  }
  // ガラスに押し付けられた部分: 毛が平たくなって少し明るく
  {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let k = 0; k < N; k++) {
      const i = cat.ring[k];
      const j = cat.ring[(k + 1) % N];
      if (w.contact[i] & CONTACT_BOWL && w.contact[j] & CONTACT_BOWL) {
        ctx.beginPath();
        ctx.moveTo(ring[k].x, ring[k].y);
        ctx.lineTo(ring[(k + 1) % N].x, ring[(k + 1) % N].y);
        ctx.stroke();
      }
    }
  }
  // 立体感: 縁を暗く、背中にハイライト
  ctx.beginPath();
  bodyPath(ctx, ring, fl, c);
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(40,20,10,0.10)';
  ctx.stroke();
  {
    let top = ring[0];
    for (const p of ring) if (p.y < top.y) top = p;
    const hl = lerp(top, c, 0.35);
    const g = ctx.createRadialGradient(hl.x, hl.y, 0, hl.x, hl.y, sp.a * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(c.x - sp.a * 3, c.y - sp.a * 3, sp.a * 6, sp.a * 6);
  }
  ctx.restore();
  if (outline) {
    ctx.beginPath();
    bodyPath(ctx, ring, fl, c);
    ctx.lineWidth = lineW;
    ctx.strokeStyle = coat.line;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  if (tailFront) drawTail(ctx, cat);
  drawHead(ctx, cat, time);
  // 毛繕い中は前脚を顔の手前に
  if (cat.groomPose > 0.3) drawLegs(ctx, cat, ring, time, 'top');
}

type LegLayer = 'far' | 'near' | 'top';

/**
 * 脚: 肩・腰（胴体の輪郭に固定した付け根）から肉球の粒子まで、関節で曲がる先細りの脚を描く。
 * 胴体より先に描くので、付け根は胴体に隠れ、輪郭からはみ出た部分だけが見える
 * （後ろ脚は付け根が太く、お尻の下に太もものふくらみとして出る）。
 * 吊るされている間は重力の向きにだらんと垂れ、動かすと振り子のように遅れて揺れる。
 */
function drawLegs(ctx: CanvasRenderingContext2D, cat: Cat, ring: Pt[], time: number, layer: LegLayer): void {
  const w = cat.world;
  const coat = cat.coat;
  const b = cat.species.b;
  const lp = cat.legPose;
  const far = layer === 'far';
  // 香箱座りでは奥の脚は隠れる: ぶら下がっているときだけ見せる
  if (far && lp < 0.05) return;
  const groom = cat.groomPose;
  const roots: Pt[] = [];
  const bellies: Pt[] = [];
  for (let k = 0; k < 2; k++) {
    const [kt, kb] = cat.legAnchor[k];
    const top = ring[kt];
    const bot = ring[kb];
    const dx = bot.x - top.x;
    const dy = bot.y - top.y;
    const l = Math.hypot(dx, dy) || 1;
    bellies.push({ x: dx / l, y: dy / l });
    roots.push(lerp(top, bot, k === 0 ? 0.6 : 0.56));
  }
  // 体の軸（頭 → お尻）
  let axX = roots[1].x - roots[0].x;
  let axY = roots[1].y - roots[0].y;
  const axL = Math.hypot(axX, axY) || 1;
  axX /= axL;
  axY /= axL;

  ctx.save();
  if (far) ctx.globalAlpha = Math.min(1, lp * 1.5);
  for (let k = 0; k < 2; k++) {
    const front = k === 0;
    if (layer === 'top' && !front) continue;
    const bell = bellies[k];
    const fi = cat.feet[k];
    let root = roots[k];
    let paw = { x: w.x[fi], y: w.y[fi] };
    const L1 = b * (front ? 0.82 : 0.9);
    const L2 = b * (front ? 0.78 : 0.82);
    // 吊るされている間: 重力の向きにだらんと垂らし、振り子の角度だけ振る（前後の脚で少し位相をずらす）
    const hang = cat.hang * lp;
    if (hang > 0.001) {
      const th = cat.legSwing * (front ? 1 : 1.15) + 0.05 * Math.sin(time * 2.3 + k * 1.3 + cat.legAnchor[0][0]);
      const reach = (L1 + L2) * 0.93;
      const hx = root.x + Math.sin(th) * reach;
      const hy = root.y + Math.cos(th) * reach;
      paw = { x: paw.x + (hx - paw.x) * hang, y: paw.y + (hy - paw.y) * hang };
    }
    // 着地後: 前脚は胸の下から手先を少しのぞかせ、後ろ脚はお腹の下にたたむ（粒子の位置と混ぜる）
    const rest = 1 - lp;
    if (rest > 0.001 && gw0(front, groom) < 1) {
      const fwd = front ? 0.42 : 0.3;
      const dn = front ? 0.95 : 0.78;
      const tx = root.x - axX * b * fwd + bell.x * b * dn;
      const ty = root.y - axY * b * fwd + bell.y * b * dn;
      const m = rest * 0.7 * (1 - gw0(front, groom));
      paw = { x: paw.x + (tx - paw.x) * m, y: paw.y + (ty - paw.y) * m };
    }
    // 手は胴体のお腹側だけ（転がって背中側へ回った粒子は、付け根の高さまで戻す）
    const gw = gw0(front, groom);
    if (gw > 0 && !far) {
      // 毛繕い: 手先を口元へ（粒子は隣の猫に押されて届かないことがあるので、描画で寄せる）
      const hf = cat.headFrame();
      const lx = cat.facing * cat.headRX * 0.3;
      const ly = cat.headRY * 0.55;
      const ca = Math.cos(hf.angle);
      const sa = Math.sin(hf.angle);
      const mx = hf.x + lx * ca - ly * sa;
      const my = hf.y + lx * sa + ly * ca;
      paw = { x: paw.x + (mx - paw.x) * gw, y: paw.y + (my - paw.y) * gw };
    }
    const u = (paw.x - root.x) * bell.x + (paw.y - root.y) * bell.y;
    const uMin = b * 0.1;
    if (u < uMin) {
      paw.x += bell.x * (uMin - u) * (1 - gw);
      paw.y += bell.y * (uMin - u) * (1 - gw);
    }
    // 伸びすぎない（液体なので少しは伸びる）
    let dx = paw.x - root.x;
    let dy = paw.y - root.y;
    let d = Math.hypot(dx, dy) || 1;
    const maxD = (L1 + L2) * 1.3;
    if (d > maxD) {
      paw = { x: root.x + (dx / d) * maxD, y: root.y + (dy / d) * maxD };
      dx = paw.x - root.x;
      dy = paw.y - root.y;
      d = maxD;
    }
    if (far) {
      // 奥の脚は少しお尻側・上にずらす
      const ox = axX * b * 0.26 - bell.x * b * 0.06;
      const oy = axY * b * 0.26 - bell.y * b * 0.06;
      root = { x: root.x + ox, y: root.y + oy };
      paw = { x: paw.x + ox, y: paw.y + oy };
    }
    // 2関節の IK: 肘・かかとはお尻側へ曲げる
    const s = Math.max(1, (d / (L1 + L2)) * 1.001);
    const l1 = L1 * s;
    const l2 = L2 * s;
    const ux = dx / d;
    const uy = dy / d;
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    let px = -uy;
    let py = ux;
    if (px * axX + py * axY < 0) {
      px = -px;
      py = -py;
    }
    const joint = { x: root.x + ux * along + px * h, y: root.y + uy * along + py * h };

    const legCol = coat.base;
    const pawCol = coat.paw;
    const dim = (c: string) => (far ? shade(c, -0.12) : c);
    const r0 = b * (front ? 0.27 : 0.44);
    const r1 = b * (front ? 0.15 : 0.13);
    const r2 = b * 0.12;
    let pts = [root, joint, paw];
    let rs = [r0, r1, r2];
    if (layer === 'top') {
      // 毛繕いで胴体の手前に出した前脚: 付け根の丸は見せず、上腕の途中から描く
      const mid = lerp(root, joint, 0.55);
      pts = [mid, joint, paw];
      rs = [r1 * 1.15, r1, r2];
    }
    // 脚（輪郭線 → 塗り の順に、関節の丸と先細りの台形をまとめて塗る）
    const lineW = far ? 1.1 : 1.3;
    ctx.fillStyle = coat.line;
    limbPath(ctx, pts, rs, lineW);
    ctx.fill();
    ctx.fillStyle = dim(legCol);
    limbPath(ctx, pts, rs, 0);
    ctx.fill();

    // 手（肉球の丸み）: 下腿の向きに沿って、つま先を頭の側へ
    const la = Math.atan2(paw.y - joint.y, paw.x - joint.x);
    const toe = -(Math.cos(la) * axX + Math.sin(la) * axY) >= 0 ? 1 : -1;
    const pr = b * 0.15;
    ctx.save();
    ctx.translate(paw.x, paw.y);
    ctx.rotate(la);
    ctx.beginPath();
    ctx.ellipse(pr * 0.15, toe * pr * 0.12, pr * 1.05, pr * 0.9, 0, 0, TAU);
    ctx.fillStyle = dim(pawCol);
    ctx.fill();
    ctx.strokeStyle = coat.line;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    if (!far) {
      const glass = w.contact[fi] & CONTACT_BOWL;
      if ((glass && lp < 0.5) || groom > 0.5) {
        // ガラスにむぎゅっと押し付けた肉球 / 毛繕いで口元に向けた肉球
        let na = Math.atan2(-w.cny[fi], -w.cnx[fi]);
        if (groom > 0.5) {
          const hf = cat.headFrame();
          na = Math.atan2(hf.y - paw.y, hf.x - paw.x);
        }
        ctx.rotate(na - la);
        ctx.fillStyle = '#f0a3a3';
        ctx.beginPath();
        ctx.ellipse(pr * 0.3, 0, pr * 0.34, pr * 0.42, 0, 0, TAU);
        ctx.fill();
        for (let t = -1; t <= 1; t++) {
          ctx.beginPath();
          ctx.ellipse(pr * 0.76, t * pr * 0.44, pr * 0.15, pr * 0.17, 0, 0, TAU);
          ctx.fill();
        }
      } else {
        // 指の割れ目（つま先側）
        ctx.strokeStyle = shade(pawCol, -0.3);
        ctx.lineWidth = 0.9;
        for (const t of [-0.28, 0.28]) {
          ctx.beginPath();
          ctx.moveTo(pr * (0.55 + t * 0.3), toe * pr * 0.25 + t * pr * 0.9);
          ctx.lineTo(pr * (0.95 + t * 0.1), toe * pr * 0.35 + t * pr * 0.75);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

/** 毛繕いで口元へ上げている前脚の度合い */
function gw0(front: boolean, groom: number): number {
  return front ? Math.min(1, groom * 1.5) : 0;
}

/** 丸（関節）を先細りの台形でつないだ形のパス。grow だけ太らせる（輪郭線用） */
function limbPath(ctx: CanvasRenderingContext2D, pts: Pt[], rs: number[], grow: number): void {
  ctx.beginPath();
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const r = rs[k] + grow;
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, TAU);
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const c = pts[k + 1];
    const ra = rs[k] + grow;
    const rc = rs[k + 1] + grow;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d <= Math.abs(ra - rc) + 1e-3) continue;
    // 2つの円の外接線
    const base = Math.atan2(dy, dx);
    const phi = Math.acos((ra - rc) / d);
    const a1 = base + phi;
    const a2 = base - phi;
    // 円（arc は時計回り = 正の向き）と同じ向きに回る四角形にする（nonzero で穴が開かないように）
    const q = [
      { x: a.x + Math.cos(a2) * ra, y: a.y + Math.sin(a2) * ra },
      { x: c.x + Math.cos(a2) * rc, y: c.y + Math.sin(a2) * rc },
      { x: c.x + Math.cos(a1) * rc, y: c.y + Math.sin(a1) * rc },
      { x: a.x + Math.cos(a1) * ra, y: a.y + Math.sin(a1) * ra },
    ];
    let area = 0;
    for (let i = 0; i < 4; i++) area += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
    if (area < 0) q.reverse();
    ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
  }
}

function drawTail(ctx: CanvasRenderingContext2D, cat: Cat): void {
  const w = cat.world;
  const coat = cat.coat;
  const sp = cat.species;
  const pts: Pt[] = [];
  const base = cat.tailBase;
  // 付け根は胴体の少し内側から
  pts.push(lerp({ x: w.x[base], y: w.y[base] }, { x: cat.cx, y: cat.cy }, 0.15));
  for (const i of cat.tail) pts.push({ x: w.x[i], y: w.y[i] });
  const n = pts.length;
  const w0 = sp.b * 0.3 * sp.tailWidth;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const t = k / (n - 1);
    const hw = w0 * (1 - 0.45 * t) * 0.5 * (sp.fluff > 0 ? 1.1 : 1);
    left.push({ x: pts[k].x + nx * hw, y: pts[k].y + ny * hw });
    right.push({ x: pts[k].x - nx * hw, y: pts[k].y - ny * hw });
  }
  const tip = pts[n - 1];
  const prev = pts[n - 2];
  const ta = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const tr = Math.hypot(left[n - 1].x - tip.x, left[n - 1].y - tip.y);
  ctx.beginPath();
  openSpline(ctx, left);
  ctx.arc(tip.x, tip.y, tr, ta - Math.PI / 2, ta + Math.PI / 2);
  openSpline(ctx, right.slice().reverse(), false);
  ctx.closePath();
  ctx.fillStyle = coat.base;
  ctx.fill();
  if (coat.stripe) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = coat.stripe;
    ctx.lineWidth = w0 * 0.42;
    ctx.globalAlpha = 0.8;
    for (let k = 2; k < n; k += 1) {
      ctx.beginPath();
      ctx.moveTo(left[k].x, left[k].y);
      ctx.lineTo(right[k].x, right[k].y);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (coat.patches) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = coat.patches[0].color;
    ctx.beginPath();
    for (let k = Math.floor(n / 2); k < n; k++) ctx.arc(pts[k].x, pts[k].y, w0 * 0.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  openSpline(ctx, left);
  ctx.arc(tip.x, tip.y, tr, ta - Math.PI / 2, ta + Math.PI / 2);
  openSpline(ctx, right.slice().reverse(), false);
  ctx.strokeStyle = coat.line;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function drawHead(ctx: CanvasRenderingContext2D, cat: Cat, time: number): void {
  const w = cat.world;
  const sp = cat.species;
  const coat = cat.coat;
  const hc = cat.headCluster;
  const held = cat.held;
  const head = displayRing(cat, cat.head, hc.goalX, hc.goalY, held ? 0 : 0.55, 3);
  const hf = cat.headFrame();
  const r = sp.headR;
  const f = cat.facing;
  const cs = Math.cos(hf.angle);
  const sn = Math.sin(hf.angle);
  // 頭ローカル → ワールド
  const L = (lx: number, ly: number): Pt => ({ x: hf.x + cs * lx - sn * ly, y: hf.y + sn * lx + cs * ly });

  // 耳
  // 不機嫌なときは耳を横に倒す（イカ耳）
  const ef = cat.earFlat;
  for (const side of [-1, 1]) {
    const baseAng = -Math.PI / 2 + side * (0.72 + 0.22 * ef);
    const bx = Math.cos(baseAng) * r * 0.82;
    const by = Math.sin(baseAng) * r * 0.82;
    const tipX = bx + side * r * (0.28 + 0.5 * ef);
    const tipY = by - r * (0.72 - 0.45 * ef);
    const e1 = L(bx - Math.sin(baseAng) * r * 0.4, by + Math.cos(baseAng) * r * 0.4);
    const e2 = L(bx + Math.sin(baseAng) * r * 0.4, by - Math.cos(baseAng) * r * 0.4);
    const tp = L(tipX, tipY);
    ctx.beginPath();
    ctx.moveTo(e1.x, e1.y);
    ctx.quadraticCurveTo((e1.x + tp.x) / 2 + (tp.x - e1.x) * 0.05, (e1.y + tp.y) / 2, tp.x, tp.y);
    ctx.quadraticCurveTo((e2.x + tp.x) / 2, (e2.y + tp.y) / 2, e2.x, e2.y);
    ctx.closePath();
    const earColor = coat.tuxedo ? coat.base : coat.patches ? (side * f > 0 ? coat.patches[1].color : coat.patches[0].color) : coat.base;
    ctx.fillStyle = earColor;
    ctx.fill();
    ctx.strokeStyle = coat.line;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // 内側
    const i1 = lerp(e1, tp, 0.2);
    const i2 = lerp(e2, tp, 0.2);
    const it = lerp(tp, lerp(e1, e2, 0.5), 0.22);
    ctx.beginPath();
    ctx.moveTo(i1.x, i1.y);
    ctx.quadraticCurveTo((i1.x + it.x) / 2, (i1.y + it.y) / 2, it.x, it.y);
    ctx.quadraticCurveTo((i2.x + it.x) / 2, (i2.y + it.y) / 2, i2.x, i2.y);
    ctx.closePath();
    ctx.fillStyle = coat.earInner;
    ctx.fill();
  }

  // 頭の輪郭
  ctx.beginPath();
  closedSpline(ctx, head);
  ctx.fillStyle = coat.base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const fx = 0.1 * r * f; // 3/4 顔: 顔のパーツを向いている方へ少し寄せる
  if (coat.tuxedo) {
    // ハチワレ
    ctx.beginPath();
    const p = [L(-1.3 * r, 1.4 * r), L(-0.9 * r, 0.5 * r), L(fx - 0.12 * r, -0.05 * r), L(fx, -0.3 * r), L(fx + 0.12 * r, -0.05 * r), L(0.9 * r, 0.5 * r), L(1.3 * r, 1.4 * r)];
    ctx.moveTo(p[0].x, p[0].y);
    ctx.lineTo(p[1].x, p[1].y);
    ctx.quadraticCurveTo(L(fx - 0.35 * r, 0.3 * r).x, L(fx - 0.35 * r, 0.3 * r).y, p[2].x, p[2].y);
    ctx.quadraticCurveTo(p[3].x, p[3].y, p[4].x, p[4].y);
    ctx.quadraticCurveTo(L(fx + 0.35 * r, 0.3 * r).x, L(fx + 0.35 * r, 0.3 * r).y, p[5].x, p[5].y);
    ctx.lineTo(p[6].x, p[6].y);
    ctx.closePath();
    ctx.fillStyle = coat.belly;
    ctx.fill();
  }
  if (coat.patches) {
    const a = L(-0.75 * r * f, -0.55 * r);
    const bpt = L(0.8 * r * f, -0.65 * r);
    ctx.fillStyle = coat.patches[0].color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillStyle = coat.patches[1].color;
    ctx.beginPath();
    ctx.arc(bpt.x, bpt.y, r * 0.55, 0, TAU);
    ctx.fill();
  }
  if (coat.faceStripes && coat.stripe) {
    ctx.strokeStyle = coat.stripe;
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.09;
    ctx.globalAlpha = 0.8;
    for (const dx of [-0.2, 0, 0.2]) {
      const a = L(fx + dx * r, -0.92 * r);
      const bb = L(fx + dx * r * 0.8, -0.55 * r);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bb.x, bb.y);
      ctx.stroke();
    }
    for (const side of [-1, 1]) {
      for (const dy of [0.05, 0.25]) {
        const a = L(side * 1.05 * r, dy * r);
        const bb = L(side * 0.72 * r, dy * r + 0.04 * r);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bb.x, bb.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  // マズル（ω のふくらみ）
  if (!coat.tuxedo) {
    ctx.fillStyle = coat.belly;
    ctx.globalAlpha = coat.key === 'kuro' ? 0.25 : 0.75;
    for (const side of [-1, 1]) {
      const m = L(fx + side * 0.17 * r, 0.36 * r);
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, r * 0.24, r * 0.19, hf.angle, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 立体感
  ctx.beginPath();
  closedSpline(ctx, head);
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(40,20,10,0.09)';
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  closedSpline(ctx, head);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = coat.line;
  ctx.stroke();

  drawFace(ctx, cat, L, hf.angle, fx, r, time);
  void w;
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  cat: Cat,
  L: (x: number, y: number) => Pt,
  angle: number,
  fx: number,
  r: number,
  time: number,
): void {
  const coat = cat.coat;
  const e = cat.expression;
  const dark = coat.key === 'kuro' || (coat.tuxedo && false);
  const lineCol = dark ? '#0d0b0a' : '#3a2a22';
  const open = Math.max(0, Math.min(1.2, cat.eyeOpen * (1 - cat.blink)));
  const eyeY = -0.04 * r;
  const eyeDX = 0.4 * r;
  const erx = 0.17 * r;
  const ery = 0.16 * r;

  // 頬の赤み
  if (cat.blush > 0.02) {
    ctx.fillStyle = `rgba(240,120,120,${0.35 * cat.blush})`;
    for (const side of [-1, 1]) {
      const p = L(fx + side * 0.55 * r, 0.26 * r);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 0.17, r * 0.1, angle, 0, TAU);
      ctx.fill();
    }
  }

  for (const side of [-1, 1]) {
    const p = L(fx + side * eyeDX, eyeY);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    if (e === 'sleep' || e === 'bliss' || e === 'happy' || e === 'groom' || e === 'yawn' || open < 0.12) {
      // 閉じた目
      ctx.beginPath();
      if (e === 'bliss' || e === 'happy' || e === 'groom') {
        // ^ ^ 気持ちよさそう
        ctx.moveTo(-erx, ery * 0.3);
        ctx.quadraticCurveTo(0, -ery * 1.0, erx, ery * 0.3);
      } else {
        // すやすや
        ctx.moveTo(-erx, -ery * 0.1);
        ctx.quadraticCurveTo(0, ery * 0.9, erx, -ery * 0.1);
      }
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = r * 0.07;
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      const surprised = e === 'surprised' || e === 'startled';
      const h = ery * Math.min(open, 1.15);
      const wdt = erx * (surprised ? 1.05 : 1);
      // 不機嫌: 上瞼がまっすぐ下りたジト目。怒っているときは目頭側が下がる
      const lid = e === 'grumpy' || e === 'annoyed';
      let lidL = 0;
      let lidR = 0;
      if (lid) {
        const inner = e === 'annoyed' ? h * 0.2 : -h * 0.12;
        const outer = e === 'annoyed' ? -h * 0.55 : -h * 0.12;
        // 目頭は顔の中心側
        lidL = side < 0 ? outer : inner;
        lidR = side < 0 ? inner : outer;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-wdt * 1.5, lidL - (lidR - lidL) * 0.25);
        ctx.lineTo(wdt * 1.5, lidR + (lidR - lidL) * 0.25);
        ctx.lineTo(wdt * 1.5, h * 2);
        ctx.lineTo(-wdt * 1.5, h * 2);
        ctx.closePath();
        ctx.clip();
      }
      // 目の形（アーモンド型、上瞼は少し水平）
      ctx.beginPath();
      if (surprised) {
        ctx.ellipse(0, 0, wdt, Math.max(h, 0.1), 0, 0, TAU);
      } else {
        ctx.moveTo(-wdt, 0);
        ctx.bezierCurveTo(-wdt * 0.6, -h * 1.25, wdt * 0.6, -h * 1.25, wdt, 0);
        ctx.bezierCurveTo(wdt * 0.6, h * 1.25, -wdt * 0.6, h * 1.25, -wdt, 0);
      }
      ctx.closePath();
      ctx.fillStyle = coat.eye;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // 瞳孔
      const look = e === 'curious' ? ery * 0.35 : 0;
      const pw = surprised ? wdt * 0.62 : e === 'sleepy' ? wdt * 0.45 : wdt * 0.36;
      ctx.fillStyle = '#15100d';
      ctx.beginPath();
      ctx.ellipse(side * wdt * 0.05 + fx * 0.04, look, pw, ery * 1.1, 0, 0, TAU);
      ctx.fill();
      // 上瞼の影
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-wdt, -h * 1.3, wdt * 2, h * 0.45);
      ctx.restore();
      // ハイライト
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(-wdt * 0.28, -h * 0.35, r * 0.045, 0, TAU);
      ctx.fill();
      // 輪郭
      ctx.beginPath();
      if (surprised) ctx.ellipse(0, 0, wdt, Math.max(h, 0.1), 0, 0, TAU);
      else {
        ctx.moveTo(-wdt, 0);
        ctx.bezierCurveTo(-wdt * 0.6, -h * 1.25, wdt * 0.6, -h * 1.25, wdt, 0);
        ctx.bezierCurveTo(wdt * 0.6, h * 1.25, -wdt * 0.6, h * 1.25, -wdt, 0);
      }
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = r * 0.05;
      ctx.stroke();
      if (lid) {
        ctx.restore();
        // 瞼の線
        ctx.beginPath();
        ctx.moveTo(-wdt * 1.05, lidL - (lidR - lidL) * 0.02);
        ctx.lineTo(wdt * 1.05, lidR + (lidR - lidL) * 0.02);
        ctx.strokeStyle = lineCol;
        ctx.lineWidth = r * 0.065;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 鼻
  const np = L(fx, 0.2 * r);
  ctx.save();
  ctx.translate(np.x, np.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, -r * 0.035);
  ctx.quadraticCurveTo(0, -r * 0.07, r * 0.08, -r * 0.035);
  ctx.quadraticCurveTo(r * 0.02, r * 0.06, 0, r * 0.065);
  ctx.quadraticCurveTo(-r * 0.02, r * 0.06, -r * 0.08, -r * 0.035);
  ctx.fillStyle = coat.nose;
  ctx.fill();
  // 口
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = r * 0.045;
  ctx.lineCap = 'round';
  if (e === 'surprised' || e === 'startled') {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.06);
    ctx.lineTo(0, r * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, r * 0.2, r * 0.07, r * (e === 'startled' ? 0.09 : 0.07), 0, 0, TAU);
    ctx.fillStyle = '#8a3c3c';
    ctx.fill();
  } else if (cat.yawnOpen > 0.05) {
    // あくび: ふわぁ…と大きく開いた口
    const yo = cat.yawnOpen;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.06);
    ctx.lineTo(0, r * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, r * (0.12 + 0.13 * yo), r * (0.1 + 0.06 * yo), r * 0.2 * yo + r * 0.02, 0, 0, TAU);
    ctx.fillStyle = '#7a2f35';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ef8f98';
    ctx.beginPath();
    ctx.ellipse(0, r * (0.14 + 0.26 * yo), r * 0.12, r * 0.1 * yo + r * 0.01, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.stroke();
  } else if (e === 'grumpy' || e === 'annoyed') {
    // へ の字口
    ctx.beginPath();
    ctx.moveTo(0, r * 0.06);
    ctx.lineTo(0, r * 0.12);
    ctx.moveTo(-r * 0.15, r * 0.22);
    ctx.quadraticCurveTo(-r * 0.07, r * 0.12, 0, r * 0.13);
    ctx.quadraticCurveTo(r * 0.07, r * 0.12, r * 0.15, r * 0.22);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.06);
    ctx.lineTo(0, r * 0.11);
    ctx.moveTo(-r * 0.16, r * 0.12);
    ctx.quadraticCurveTo(-r * 0.08, r * 0.22, 0, r * 0.11);
    ctx.quadraticCurveTo(r * 0.08, r * 0.22, r * 0.16, r * 0.12);
    ctx.stroke();
    if (cat.tongue > 0.05) {
      // ペロッ: 舌を出す（舐める相手の方へ少し向ける）
      ctx.save();
      ctx.translate(0, r * 0.14);
      ctx.rotate(-cat.tongueSide * 0.45);
      const tl = r * 0.24 * cat.tongue;
      const tw = r * 0.085;
      ctx.beginPath();
      ctx.moveTo(-tw, 0);
      ctx.lineTo(-tw, tl * 0.6);
      ctx.quadraticCurveTo(-tw, tl + tw * 0.4, 0, tl + tw * 0.4);
      ctx.quadraticCurveTo(tw, tl + tw * 0.4, tw, tl * 0.6);
      ctx.lineTo(tw, 0);
      ctx.closePath();
      ctx.fillStyle = '#ef8f98';
      ctx.fill();
      ctx.strokeStyle = '#b8565f';
      ctx.lineWidth = r * 0.025;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, tl * 0.15);
      ctx.lineTo(0, tl * 0.75);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  // ヒゲ
  ctx.strokeStyle = dark || coat.key === 'hachi' ? 'rgba(255,255,255,0.55)' : 'rgba(90,70,60,0.45)';
  if (coat.tuxedo) ctx.strokeStyle = 'rgba(120,110,105,0.55)';
  ctx.lineWidth = 0.9;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = L(fx + side * 0.28 * r, (0.28 + k * 0.06) * r);
      const bb = L(fx + side * 1.2 * r, (0.12 + k * 0.17) * r);
      const m = L(fx + side * 0.75 * r, (0.16 + k * 0.1) * r);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(m.x, m.y, bb.x, bb.y);
      ctx.stroke();
    }
  }

  // すやすや Zz
  if (e === 'sleep') {
    const t = (time * 0.5 + cat.phase) % 1;
    const p = L(fx + 0.9 * r, -1.1 * r - t * r * 0.8);
    ctx.fillStyle = `rgba(90,110,140,${0.55 * Math.sin(t * Math.PI)})`;
    ctx.font = `bold ${r * (0.35 + t * 0.2)}px sans-serif`;
    ctx.fillText('z', p.x, p.y);
  }
}

/** #rrggbb → rgba */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 色を明るく/暗く */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt < 0) {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  } else {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
