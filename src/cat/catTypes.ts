/** 猫の体型（物理パラメータ） */
export type SpeciesKey = 'standard' | 'long' | 'round' | 'kitten' | 'fluffy';

export interface Species {
  key: SpeciesKey;
  name: string;
  /** 胴体の半幅・半高（横向きに寝そべった「香箱」の形） */
  a: number;
  b: number;
  headR: number;
  ringN: number;
  headN: number;
  /** 胴体粒子1個あたりの質量 */
  mass: number;
  /** 胴体が本来の形に戻ろうとする強さ（1フレームあたり） */
  shapeStiff: number;
  /** squash & stretch の許容度 */
  beta: number;
  stretchMax: number;
  /** 胴体輪郭の伸びやすさ（XPBD compliance） */
  edgeCompliance: number;
  /** 面積の圧縮しやすさ（0 に近いほど液体のように体積保存） */
  areaCompliance: number;
  /** 十分リラックスしたときの剛性倍率 */
  relaxMin: number;
  tailLen: number;
  tailSegs: number;
  tailWidth: number;
  /** 毛のふわふわ量（輪郭の凹凸） */
  fluff: number;
  friction: number;
  /** 内部振動の減衰 */
  damping: number;
  weight: number;
}

const base = {
  headN: 10,
  mass: 1,
  shapeStiff: 0.13,
  beta: 0.5,
  stretchMax: 1.7,
  edgeCompliance: 4e-6,
  areaCompliance: 2e-4,
  relaxMin: 0.4,
  tailSegs: 7,
  tailWidth: 1,
  fluff: 0,
  friction: 0.25,
  damping: 3.2,
  weight: 1,
};

export const SPECIES: Record<SpeciesKey, Species> = {
  standard: {
    ...base,
    key: 'standard',
    name: 'ふつうの猫',
    a: 58,
    b: 36,
    headR: 27,
    ringN: 18,
    tailLen: 74,
    weight: 4,
  },
  long: {
    ...base,
    key: 'long',
    name: 'ながい猫',
    a: 88,
    b: 30,
    headR: 26,
    ringN: 24,
    shapeStiff: 0.075,
    beta: 0.65,
    stretchMax: 2.3,
    edgeCompliance: 4e-5,
    relaxMin: 0.35,
    tailLen: 84,
    weight: 1.6,
  },
  round: {
    ...base,
    key: 'round',
    name: 'まる猫',
    a: 60,
    b: 48,
    headR: 29,
    ringN: 20,
    mass: 1.9,
    shapeStiff: 0.15,
    beta: 0.45,
    tailLen: 62,
    tailWidth: 1.15,
    damping: 3.8,
    weight: 1.6,
  },
  kitten: {
    ...base,
    key: 'kitten',
    name: '子猫',
    a: 36,
    b: 24,
    headR: 22,
    ringN: 14,
    headN: 9,
    mass: 0.45,
    shapeStiff: 0.16,
    tailLen: 44,
    tailSegs: 6,
    tailWidth: 0.85,
    weight: 1.8,
  },
  fluffy: {
    ...base,
    key: 'fluffy',
    name: 'ふわふわ猫',
    a: 64,
    b: 43,
    headR: 30,
    ringN: 22,
    mass: 0.8,
    shapeStiff: 0.1,
    areaCompliance: 0.012,
    relaxMin: 0.4,
    tailLen: 78,
    tailWidth: 1.5,
    fluff: 1,
    weight: 1.4,
  },
};

/** 毛色 */
export interface Coat {
  key: string;
  name: string;
  base: string;
  /** 輪郭線 */
  line: string;
  belly: string;
  stripe?: string;
  /** 三毛などの斑（位置は輪郭粒子に相対） */
  patches?: { color: string; at: number; depth: number; size: number }[];
  /** ハチワレ: 顔の下半分と胸・足先が白 */
  tuxedo?: boolean;
  /** 足先の色 */
  paw: string;
  eye: string;
  nose: string;
  earInner: string;
  /** 尻尾先の色（未指定なら base） */
  tailTip?: string;
  /** 顔の縞 */
  faceStripes?: boolean;
}

export const COATS: Coat[] = [
  {
    key: 'kiji',
    name: 'キジトラ',
    base: '#8c6c4c',
    line: '#4c3828',
    belly: '#e9ddc9',
    stripe: '#4a3525',
    paw: '#8c6c4c',
    eye: '#b7c24a',
    nose: '#b86a5c',
    earInner: '#d9a08f',
    faceStripes: true,
  },
  {
    key: 'cha',
    name: '茶トラ',
    base: '#e39a52',
    line: '#9a5a24',
    belly: '#f8e6cc',
    stripe: '#c46e2e',
    paw: '#f3c996',
    eye: '#d9a53a',
    nose: '#d98377',
    earInner: '#f1b29c',
    faceStripes: true,
  },
  {
    key: 'kuro',
    name: '黒猫',
    base: '#2c2826',
    line: '#141211',
    belly: '#34302d',
    paw: '#2c2826',
    eye: '#e3c142',
    nose: '#3a3331',
    earInner: '#5a4644',
  },
  {
    key: 'shiro',
    name: '白猫',
    base: '#f7f3ec',
    line: '#b9ad9e',
    belly: '#ffffff',
    paw: '#f7f3ec',
    eye: '#7fb2d9',
    nose: '#eba3a0',
    earInner: '#f5bfb8',
  },
  {
    key: 'mike',
    name: '三毛',
    base: '#f8f3eb',
    line: '#a89684',
    belly: '#ffffff',
    paw: '#f8f3eb',
    eye: '#d8a33e',
    nose: '#e59a93',
    earInner: '#f2b9ad',
    patches: [
      { color: '#e0924a', at: 0.12, depth: 0.45, size: 0.55 },
      { color: '#2e2926', at: 0.3, depth: 0.5, size: 0.5 },
      { color: '#e0924a', at: 0.55, depth: 0.4, size: 0.45 },
    ],
  },
  {
    key: 'hachi',
    name: 'ハチワレ',
    base: '#2d2927',
    line: '#141211',
    belly: '#fbf8f3',
    paw: '#fbf8f3',
    eye: '#c9c14a',
    nose: '#e3a19b',
    earInner: '#5c4845',
    tuxedo: true,
  },
  {
    key: 'saba',
    name: 'サバトラ',
    base: '#8f9398',
    line: '#4b4f54',
    belly: '#e8e7e3',
    stripe: '#4c5156',
    paw: '#c9c9c6',
    eye: '#9ec25a',
    nose: '#b7837f',
    earInner: '#d2a8a3',
    faceStripes: true,
  },
];
