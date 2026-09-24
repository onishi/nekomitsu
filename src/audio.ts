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
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.02);
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
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

  /**
   * ニャー。のこぎり波の声帯音を、母音「イ」→「ア」→「ウ」っぽく動く
   * 2つのフォルマント（帯域通過フィルタ）に通して猫の声にする。
   * pitch: 1 が標準、大きいほど高い声
   */
  meow(pitch = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.5 + Math.random() * 0.15;
    const f0 = 560 * pitch;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0 * 0.85, t);
    src.frequency.exponentialRampToValueAtTime(f0 * 1.18, t + dur * 0.28);
    src.frequency.exponentialRampToValueAtTime(f0 * 0.78, t + dur);
    // 声の揺れ
    const vib = ctx.createOscillator();
    vib.frequency.value = 6.5;
    const vibG = ctx.createGain();
    vibG.gain.value = f0 * 0.018;
    vib.connect(vibG).connect(src.frequency);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    out.gain.setValueAtTime(0.5, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // フォルマント: ニ(i) → ャ(a) → ー(u 寄り)
    const formant = (freqs: [number, number, number], q: number, gain: number) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(freqs[0] * pitch, t);
      bp.frequency.linearRampToValueAtTime(freqs[1] * pitch, t + dur * 0.3);
      bp.frequency.linearRampToValueAtTime(freqs[2] * pitch, t + dur);
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(bp).connect(g).connect(out);
    };
    formant([450, 950, 700], 6, 1.2);
    formant([2300, 1500, 1100], 9, 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    out.connect(lp).connect(this.master!);
    src.start(t);
    vib.start(t);
    src.stop(t + dur + 0.02);
    vib.stop(t + dur + 0.02);
  }
}
