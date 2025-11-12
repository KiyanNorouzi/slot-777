//  GameConfig
// Central place for tuning game parameters.
// Change values here to experiment with math & volatility.

export type Sym = 'Seven' | 'Bar' | 'Bell' | 'Cherry' | 'Lemon';

export const GameConfig = {
  /*
    Starting balance for a new guest session.
    Value is in minor units (e.g. cents).
    Example: 100000 = 1000.00 if 100 = 1.00.
   */
  startBalanceMinor: 100000,

  /*
    Reel strips (one array per reel).
    The more times a symbol appears in a reel array, the higher its chance.
   
    How to tweak:
    - Increase 'Seven' entries to make big wins more frequent (higher RTP / higher variance).
    - Decrease premium symbols to make the game tighter.
   */
  reels: [
    [
      'Seven', 'Seven',
      'Bar', 'Bar', 'Bar',
      'Bell', 'Bell',
      'Cherry', 'Cherry', 'Cherry', 'Cherry',
      'Lemon', 'Lemon', 'Lemon', 'Lemon', 'Lemon',
    ],
    [
      'Seven',
      'Bar', 'Bar', 'Bar',
      'Bell', 'Bell',
      'Cherry', 'Cherry', 'Cherry', 'Cherry',
      'Lemon', 'Lemon', 'Lemon', 'Lemon',
      'Seven', 'Lemon',
    ],
    [
      'Seven',
      'Bar', 'Bar',
      'Bell', 'Bell',
      'Cherry', 'Cherry', 'Cherry',
      'Lemon', 'Lemon', 'Lemon',
      'Seven', 'Bar', 'Cherry', 'Lemon', 'Bell',
    ],
  ] as Sym[][],

  /*
    3-of-a-kind pays (exact same symbol on all 3 reels).
    Values are multipliers applied to the bet.
   
    Example:
      Seven Seven Seven => bet * 100
   */
  pay3: {
    Seven: 100,
    Bar: 40,
    Bell: 20,
    Cherry: 10,
    Lemon: 0,
  } as Record<Sym, number>,

  /*
    Additional payout rules:
    These apply when it's not a 3-of-a-kind.
    Adjust these to make the game looser/tighter.
   */
  anyTwoSevensMult: 5,    // Any 2 Sevens + any third symbol
  anyTwoCherriesMult: 3,  // Any 2 Cherries + any third symbol
  singleCherryMult: 1,    // At least 1 Cherry (if no stronger rule applies)

  /*
    Bet constraints (server authoritative).
   
    minBetMinor:
      Minimum allowed bet (in minor units).
    allowOverBalance:
      - false: bet cannot exceed current balance (recommended).
      - true: allow bets above balance (NOT recommended for real money).
   */
  minBetMinor: 100,
  allowOverBalance: false,
} as const;
