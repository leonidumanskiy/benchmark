// Gameplay tuning. Everything the simulation depends on lives here, so visual layers can never change combat results.

export const CFG = {
  tickRate: 60,
  arenaHalf: 16, // playable square half-size (inner face of perimeter walls)
  navHalf: 23, // nav grid half-size (includes spawn lairs outside the arena)
  navCell: 0.5,

  player: {
    radius: 0.45,
    speed: 5.4,
    hp: 100,
    start: { x: 0, z: 2 },
  },

  weapon: {
    fireInterval: 0.11, // s between shots (~9 shots/s)
    damage: 20,
    range: 24,
    muzzleForward: 0.95, // muzzle offset from player centre along aim (visual + shot origin height)
    muzzleHeight: 1.25,
  },

  monster: {
    radius: 0.55,
    speed: 3.1,
    hp: 60,
    emergeTime: 0.7,
    attackRange: 1.35, // centre distance minus radii
    windup: 0.42,
    recover: 0.55,
    damage: 12,
    hurtTime: 0.2,
    hurtSpeedMul: 0.25,
    knockback: 0.18,
    corpseTime: 2.6,
    repathInterval: 0.35,
  },

  vision: {
    nearRadius: 3.2, // circular awareness: visible regardless of facing / cover
    sectorHalfAngleDeg: 32, // half-angle of aim cone
    range: 21,
  },

  waves: [
    { count: 4, interval: 1.0 },
    { count: 6, interval: 0.85 },
    { count: 8, interval: 0.7 },
  ],
  intermission: 3.0,
  firstWaveDelay: 2.0,
};

export type Config = typeof CFG;
