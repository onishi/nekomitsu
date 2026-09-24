/**
 * 「ニャー」の合成（音声ファイルなし）。
 *
 * 猫の鳴き声は「ミ → ア → ウ」と口を開いて閉じる母音の変化と、
 * 上がって下がる声の高さでできている。それを
 *   声帯っぽい倍音の音源（+ 揺らぎ・息の音）→ 3つのフォルマント（共鳴）
 * で近似する。口の開き具合に合わせて音量と明るさも変える。
 */

/** 0..1 の時間に対する折れ線を、滑らかな値の列にする */
function curve(points: [number, number][], n = 48): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let k = 0;
    while (k < points.length - 2 && points[k + 1][0] < u) k++;
    const [u0, v0] = points[k];
    const [u1, v1] = points[k + 1];
    let t = u1 > u0 ? (u - u0) / (u1 - u0) : 0;
    t = Math.min(1, Math.max(0, t));
    t = t * t * (3 - 2 * t);
    out[i] = v0 + (v1 - v0) * t;
  }
  return out;
}

const scaled = (c: Float32Array, s: number) => c.map((v) => v * s);

let glottal: PeriodicWave | null = null;
let glottalCtx: BaseAudioContext | null = null;
/** 声帯の振動っぽい音源: 倍音が 1/n^1.3 で減る（のこぎり波より少し柔らかい） */
function glottalWave(ctx: BaseAudioContext): PeriodicWave {
  if (glottal && glottalCtx === ctx) return glottal;
  const N = 48;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let n = 1; n < N; n++) im[n] = 1 / Math.pow(n, 1.3);
  glottal = ctx.createPeriodicWave(re, im);
  glottalCtx = ctx;
  return glottal;
}

let noiseBuf: AudioBuffer | null = null;
let noiseCtx: BaseAudioContext | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseCtx === ctx) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseCtx = ctx;
  return noiseBuf;
}

/**
 * dest へ「ニャー」を鳴らす。
 * pitch: 1 が標準（大人の猫）、大きいほど高い（子猫）。
 * 戻り値は長さ（秒）。
 */
export function synthMeow(ctx: BaseAudioContext, dest: AudioNode, t: number, pitch = 1, rnd: () => number = Math.random): number {
  // 毎回少しずつ違う鳴き方: 短い「ニャッ」〜 長い「ニャ〜オ」
  const kind = rnd();
  const dur = kind < 0.2 ? 0.32 + rnd() * 0.08 : 0.6 + rnd() * 0.35;
  const peak = 0.25 + rnd() * 0.12; // 声がいちばん高くなる位置
  const lift = 1.25 + rnd() * 0.2; // 上がり幅
  const tract = Math.sqrt(pitch); // 小さい猫は声道も短い = フォルマントが高い

  // --- 声の高さ ---
  const f0 = 560 * pitch;
  const src = ctx.createOscillator();
  src.setPeriodicWave(glottalWave(ctx));
  src.frequency.setValueCurveAtTime(
    scaled(
      curve([
        [0, 0.85],
        [peak, lift],
        [0.6, lift * 0.93],
        [1, 0.72],
      ]),
      f0,
    ),
    t,
    dur,
  );
  // 揺らぎ: ビブラート + 不規則な揺れ（2つの LFO の和）
  const mods: OscillatorNode[] = [];
  for (const [fq, depth] of [
    [5.5 + rnd() * 1.5, 0.012],
    [11.3 + rnd() * 3, 0.008],
    [23 + rnd() * 5, 0.005],
  ]) {
    const o = ctx.createOscillator();
    o.frequency.value = fq;
    const g = ctx.createGain();
    g.gain.value = f0 * depth;
    o.connect(g).connect(src.frequency);
    mods.push(o);
  }

  // --- 口の開き（0 = 閉じた「ン/ミ」, 1 = 開いた「ア」）---
  const open: [number, number][] = [
    [0, 0.05],
    [0.08, 0.2],
    [peak + 0.02, 1],
    [0.62, 0.85],
    [1, 0.15],
  ];

  // フォルマント: ミ(i) → ア(a) → ウ(u)
  const bus = ctx.createGain();
  const formant = (traj: [number, number][], q: number, gain: number) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueCurveAtTime(scaled(curve(traj), tract), t, dur);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(bus);
  };
  formant(
    [
      [0, 450],
      [peak, 1150],
      [0.6, 1000],
      [1, 600],
    ],
    4.5,
    1.1,
  );
  formant(
    [
      [0, 2500],
      [peak, 1900],
      [0.6, 1600],
      [1, 1050],
    ],
    7,
    0.65,
  );
  formant(
    [
      [0, 3700],
      [peak, 3300],
      [1, 3000],
    ],
    9,
    0.3,
  );
  // 倍音をそのまま少し通す（口の開きに合わせて明るさが変わる）
  const mouth = ctx.createBiquadFilter();
  mouth.type = 'lowpass';
  mouth.Q.value = 0.7;
  mouth.frequency.setValueCurveAtTime(
    curve(open.map(([u, v]) => [u, (700 + 4200 * v) * tract])),
    t,
    dur,
  );
  const direct = ctx.createGain();
  direct.gain.value = 0.22;
  src.connect(mouth).connect(direct).connect(bus);

  // 息の音（語尾ほど息っぽく）
  const breath = ctx.createBufferSource();
  breath.buffer = noise(ctx);
  const bbp = ctx.createBiquadFilter();
  bbp.type = 'bandpass';
  bbp.frequency.value = 3200 * tract;
  bbp.Q.value = 0.8;
  const bg = ctx.createGain();
  bg.gain.setValueCurveAtTime(
    curve([
      [0, 0],
      [0.2, 0.015],
      [0.7, 0.03],
      [1, 0],
    ]),
    t,
    dur,
  );
  breath.connect(bbp).connect(bg).connect(bus);

  // 音量: 鼻にかかった小さい出だし → ふくらむ → 語尾で消える
  const amp = ctx.createGain();
  amp.gain.setValueCurveAtTime(
    curve([
      [0, 0],
      [0.06, 0.25],
      [peak + 0.05, 1],
      [0.65, 0.8],
      [0.9, 0.25],
      [1, 0],
    ]),
    t,
    dur,
  );
  bus.connect(amp).connect(dest);

  src.start(t);
  src.stop(t + dur + 0.02);
  for (const o of mods) {
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  breath.start(t, rnd() * 0.3);
  breath.stop(t + dur + 0.02);
  return dur;
}
