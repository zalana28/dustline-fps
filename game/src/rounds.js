// Rounds and the match: buy phase, live phase, end banner, next round. A
// round ends when one team is wiped out, when the clock runs out without a
// plant, when the spike detonates, or when it is defused. First to five round
// wins takes the match. Money flows here: win, loss, kill and plant bonuses.
import { PHASE, award } from './state.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;

export function createRounds(state, callbacks) {
  function startRound() {
    state.phase = PHASE.BUY;
    state.phaseLeft = BUY_SECONDS;
    state.timer = ROUND_SECONDS;
    callbacks.onRoundStart(state.round);
  }

  function startLive() {
    state.phase = PHASE.LIVE;
    state.timer = ROUND_SECONDS;
    callbacks.onLiveStart();
  }

  function endRound(winner, reason) {
    if (state.phase === PHASE.END || state.phase === PHASE.MATCH) return;
    state.phase = PHASE.END;
    state.phaseLeft = 5;
    state.winner = winner;
    state.wins[winner] += 1;
    if (winner === 'vanguard') {
      award(state, 325);
      callbacks.onRoundEnd(true, reason, state.wins.vanguard, state.wins.jackal);
    } else {
      award(state, 150);
      callbacks.onRoundEnd(false, reason, state.wins.vanguard, state.wins.jackal);
    }
    if (state.wins[winner] >= WIN_ROUNDS) {
      state.phase = PHASE.MATCH;
      state.matchOver = true;
      callbacks.onMatchEnd(winner === 'vanguard');
    }
  }

  function step(dt) {
    if (state.phase === PHASE.BUY) {
      state.phaseLeft -= dt;
      if (state.phaseLeft <= 0) startLive();
      return;
    }
    if (state.phase === PHASE.LIVE) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.timer = 0;
        endRound('jackal', 'Time expired — the spike never went down');
      }
      return;
    }
    if (state.phase === PHASE.END) {
      state.phaseLeft -= dt;
      if (state.phaseLeft <= 0 && !state.matchOver) {
        state.round += 1;
        startRound();
      }
    }
  }

  return { startRound, startLive, endRound, step };
}
