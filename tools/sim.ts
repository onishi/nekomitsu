/**
 * 物理だけをヘッドレスで回して、安定性・充填率・処理時間を確認する。
 *   npm run sim -- [猫の数] [投下間隔(フレーム)]
 */
import { Game } from '../src/game';

const drops = Number(process.argv[2] ?? 14);
const interval = Number(process.argv[3] ?? 75);
const game = new Game();
let stepMs = 0;
let worst = 0;
const dt = 1 / 60;
const frames = drops * interval + 60 * 8;
for (let f = 0; f < frames; f++) {
  if (f % interval === 0 && game.dropsThisStage < drops) {
    game.targetX = (Math.random() - 0.5) * game.bowl.openHalfW * 2;
  }
  if (f % interval === 20) game.drop();
  const t0 = performance.now();
  game.update(dt);
  const ms = performance.now() - t0;
  stepMs += ms;
  worst = Math.max(worst, ms);
  if (f % 120 === 0 || f === frames - 1) {
    let nan = false;
    const w = game.world;
    for (let i = 0; i < w.n; i++) if (!Number.isFinite(w.x[i]) || !Number.isFinite(w.y[i])) nan = true;
    const ex = game.cats.map((c) => c.expression[0] + c.expression[1]).join(' ');
    console.log(`t=${(f * dt).toFixed(1).padStart(5)} cats=${String(game.cats.length).padStart(2)} fill=${(game.fill * 100).toFixed(1).padStart(5)}% ${game.phase}${nan ? ' NaN!!' : ''}  ${ex}`);
  }
  if (game.phase === 'cleared' && game.time - game.clearTime > 3) break;
}
console.log(`avg update ${(stepMs / frames).toFixed(2)}ms, worst ${worst.toFixed(1)}ms, particles=${game.world.n}`);
