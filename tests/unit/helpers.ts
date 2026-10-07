import { Game } from '../../src/core/game';
import { SaveManager, MemoryStorage } from '../../src/core/save';
import { newGame } from '../../src/core/state';

export const T0 = new Date(2026, 9, 7, 12, 0, 0).getTime();

export function makeGame(seed = 42) {
  let t = T0;
  const storage = new MemoryStorage();
  const saver = new SaveManager(storage);
  const clock = () => t;
  const game = new Game(saver, clock, newGame(T0, seed));
  return {
    game,
    storage,
    saver,
    get s() { return game.state; },
    advance(ms: number) { t += ms; game.tick(); },
    now: () => t,
  };
}
