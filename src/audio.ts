import { synthMeow } from './meow';

/**
 * 効果音（WebAudio で合成。音声ファイル不要）。
 * AudioContext はユーザー操作後に生成する。音が出なくてもゲームは成立する。
 */
export class Sound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastMunyu = 0;
  private lastPurr = 0;
  private lastPosu = 0;
  private lastPop = 0;
  private createdAt = 0;
  private lastSupo = 0;

  /** ユーザー操作のハンドラ内で呼ぶ */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.createdAt = performance.now();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 作った直後は一時停止中のことがある（特に iOS）。操作の中で再開させ、無音を一度鳴らして解放する
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const silent = this.ctx.createBufferSource();
    silent.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    silent.connect(this.ctx.destination);
    silent.start();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.02);
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state === 'closed') return null;
    // 再開待ち（最初のタップ直後など）でも音は予約しておく。時間が止まっているので、再開と同時に鳴る
    // （作った直後だけ。それ以外で止まっているときは鳴らさない＝あとでまとめて鳴らない）
    if (this.ctx.state !== 'running') {
      void this.ctx.resume();
      if (performance.now() - this.createdAt > 1500) return null;
    }
    return this.ctx;
  }

  private noiseSrc(ctx: AudioContext): AudioBufferSourceNode {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  /** ぽすっ（着地） */
  posu(v: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastPosu < 0.05) return;
    this.lastPosu = t;
    const vol = 0.25 + 0.55 * v;
    // 柔らかい布団に落ちたような低いノイズ
    const n = this.noiseSrc(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(lp).connect(g).connect(this.master!);
    n.start(t, Math.random());
    n.stop(t + 0.2);
    // ぽ（低い胴鳴り）
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(vol * 0.9, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(og).connect(this.master!);
    o.start(t);
    o.stop(t + 0.18);
  }

  /** むにゅ（押し込まれる） */
  munyu(v: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastMunyu < 0.22) return;
    this.lastMunyu = t;
    const base = 230 + Math.random() * 80;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.9, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.24);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    f.Q.value = 6;
    const g = ctx.createGain();
    const vol = 0.12 + 0.2 * v;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    // ぷるっとしたビブラート
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lg = ctx.createGain();
    lg.gain.value = base * 0.06;
    lfo.connect(lg).connect(o.frequency);
    o.connect(f).connect(g).connect(this.master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.3);
    lfo.stop(t + 0.3);
  }

  /** すぽっ（隙間に収まる） */
  supo(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastSupo < 0.3) return;
    this.lastSupo = t;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.15);
  }

  /** 小さなゴロゴロ */
  purr(vol = 0.5): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastPurr < 1.2) return;
    this.lastPurr = t;
    const dur = 1.8;
    const n = this.noiseSrc(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    // 25Hz 前後の振幅変調でゴロゴロ感
    const am = ctx.createGain();
    am.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.setValueAtTime(24, t);
    lfo.frequency.linearRampToValueAtTime(27, t + dur * 0.5);
    lfo.frequency.linearRampToValueAtTime(23, t + dur);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(am.gain);
    const g = ctx.createGain();
    const v = 0.35 * vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.35);
    g.gain.setValueAtTime(v, t + dur - 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(am).connect(g).connect(this.master!);
    n.start(t, Math.random());
    lfo.start(t);
    n.stop(t + dur);
    lfo.stop(t + dur);
  }

  /** ステージクリア */
  clear(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [659.25, 783.99, 987.77, 1318.5, 1567.98];
    notes.forEach((fq, k) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fq;
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = fq * 2.01;
      const g = ctx.createGain();
      const s = t + k * 0.085;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.22, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.9);
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(this.master!);
      o.start(s);
      o2.start(s);
      o.stop(s + 1);
      o2.stop(s + 1);
    });
    setTimeout(() => this.purr(0.9), 500);
  }

  /** 不機嫌な猫の「ウゥ…」（低いうなり） */
  grumble(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastGrumble < 0.8) return;
    this.lastGrumble = t;
    const dur = 0.55;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(175, t + dur * 0.4);
    o.frequency.linearRampToValueAtTime(140, t + dur);
    // ゴロゴロとは違う、ざらついた震え
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 32;
    const lg = ctx.createGain();
    lg.gain.value = 0.4;
    lfo.connect(lg).connect(am.gain);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 420;
    f1.Q.value = 3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.setValueAtTime(0.35, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1).connect(am).connect(lp).connect(g).connect(this.master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }
  private lastGrumble = 0;

  /** ぽんっ！（ねこけしで大きな猫が消える）。連鎖するほど高く、きらきらが増える */
  pop(chain = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    // 同時にたくさん消えても音を重ねすぎない
    if (t - this.lastPop < 0.06) return;
    this.lastPop = t;
    const up = Math.pow(1.12, Math.min(8, chain - 1));
    // ぽ: 泡がはじけるような上昇音
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(320 * up, t);
    o.frequency.exponentialRampToValueAtTime(1300 * up, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.18);
    // んっ: 短いノイズのはじけ
    const n = this.noiseSrc(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2500 * up;
    hp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.25, t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    n.connect(hp).connect(ng).connect(this.master!);
    n.start(t, Math.random());
    n.stop(t + 0.1);
    // 連鎖: きらきら
    const notes = [1046.5, 1318.5, 1568, 2093];
    for (let k = 0; k < Math.min(4, chain); k++) {
      const s = t + 0.06 + k * 0.06;
      const b = ctx.createOscillator();
      b.type = 'triangle';
      b.frequency.value = notes[k] * up;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, s);
      bg.gain.exponentialRampToValueAtTime(0.12, s + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0001, s + 0.4);
      b.connect(bg).connect(this.master!);
      b.start(s);
      b.stop(s + 0.42);
    }
  }

  /** ゲームオーバー（ねこけし）: ゆっくり下がる音 */
  gameOver(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [659.25, 523.25, 440, 349.23].forEach((fq, k) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fq;
      const g = ctx.createGain();
      const s = t + k * 0.18;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.18, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
      o.connect(g).connect(this.master!);
      o.start(s);
      o.stop(s + 0.55);
    });
  }

  /** ニャー（pitch: 1 が標準、大きいほど高い声） */
  meow(pitch = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    g.connect(this.master!);
    synthMeow(ctx, g, ctx.currentTime + 0.01, pitch);
  }
}
