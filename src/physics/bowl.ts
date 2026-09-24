/**
 * 金魚鉢の形状。中心 (0,0)、半径 R の円を上下でカットした典型的な金魚鉢。
 * 座標系は y 下向き。物理の内壁 = 描画上のガラス内面。
 */
export interface Contact {
  x: number;
  y: number;
  /** 押し戻し方向（内向き） */
  nx: number;
  ny: number;
  hit: boolean;
}

export class Bowl {
  readonly R: number;
  /** 口の高さ（これより上は開口部） */
  readonly openY: number;
  /** 平らな底の高さ */
  readonly bottomY: number;
  /** 口の半幅 */
  readonly openHalfW: number;

  constructor(R: number) {
    this.R = R;
    this.openY = -0.66 * R;
    this.bottomY = 0.84 * R;
    this.openHalfW = Math.sqrt(R * R - this.openY * this.openY);
  }

  /** 半径 r の粒子を内側へ押し戻す。out に結果を書き込む。 */
  collide(x: number, y: number, r: number, out: Contact): void {
    out.hit = false;
    out.nx = 0;
    out.ny = 0;
    if (y > this.openY) {
      const d = Math.hypot(x, y);
      const lim = this.R - r;
      if (d > lim) {
        const s = lim / d;
        x *= s;
        y *= s;
        out.nx = -x / lim;
        out.ny = -y / lim;
        out.hit = true;
      }
    } else {
      // 口より上: 見えない壁で溢れを防ぐ（失敗しないゲーム）
      const lim = this.openHalfW - r;
      if (x > lim) {
        x = lim;
        out.nx = -1;
        out.ny = 0;
        out.hit = true;
      } else if (x < -lim) {
        x = -lim;
        out.nx = 1;
        out.ny = 0;
        out.hit = true;
      }
    }
    if (y > this.bottomY - r) {
      y = this.bottomY - r;
      out.nx = 0;
      out.ny = -1;
      out.hit = true;
    }
    out.x = x;
    out.y = y;
  }
}
