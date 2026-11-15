// The one state store: every module reads and writes this object, so a round's
// truth lives in one place and no module keeps its own copy of it. Bots,
// weapons and the HUD all take this store and mutate it through small,
// named helpers.
export const PHASE = {
  BUY: 'buy',
  LIVE: 'live',
  END: 'end',
  MATCH: 'match',
};

export function createState() {
  return {
    phase: PHASE.BUY,
    phaseLeft: 12,
    round: 1,
    wins: { vanguard: 0, jackal: 0 },
    money: 800,
    timer: 100,
    elapsed: 0,
    spike: {
      state: 'carried', // carried | planted | detonated | defused
      site: null,
      position: null,
      plantLeft: 0,
      fuseLeft: 0,
      planter: null,
    },
    player: {
      health: 100,
      armor: 0,
      alive: true,
      kills: 0,
      deaths: 0,
    },
    feed: [],
    banner: null,
    winner: null,
    matchOver: false,
    muted: false,
  };
}

// Small helpers so callers name what they do instead of reaching into fields.
export function addFeed(state, text) {
  state.feed.push(text);
  if (state.feed.length > 4) state.feed.shift();
}

export function award(state, amount) {
  state.money = Math.max(0, state.money + amount);
}
