import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { AppService } from './app.service';
import { randomInt, randomUUID, createHmac } from 'crypto';
import type { Response } from 'express';
import { GameConfig, Sym } from './game-config';

const SESSIONS = new Map<string, { balanceMinor: number; spinning: boolean }>();

// Pick a random stop index on a reel
const pick = (reel: Sym[]) => randomInt(reel.length);


function payout(symbols: Sym[]) {
  // 3 of a kind (exact match)
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const mult = GameConfig.pay3[symbols[0]];
    return { mult, reason: `${symbols[0]} x3` };
  }

  const cherryCount = symbols.filter((s) => s === 'Cherry').length;
  const sevenCount = symbols.filter((s) => s === 'Seven').length;

  // Any 2 Sevens
  if (sevenCount === 2) {
    return {
      mult: GameConfig.anyTwoSevensMult,
      reason: 'Any 2 Sevens',
    };
  }

  // Any 2 Cherries
  if (cherryCount === 2) {
    return {
      mult: GameConfig.anyTwoCherriesMult,
      reason: 'Any 2 Cherries',
    };
  }

  // Single Cherry (if nothing stronger applied)
  if (cherryCount >= 1) {
    return {
      mult: GameConfig.singleCherryMult,
      reason: 'Single Cherry',
    };
  }

  // No win
  return { mult: 0, reason: 'No win' };
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }


  @Post('api/v1/auth/guest')
  guest() {
    const id = randomUUID();
    SESSIONS.set(id, {
      balanceMinor: GameConfig.startBalanceMinor,
      spinning: false,
    });
    return { sessionId: id };
  }

  
   // Get current wallet balance for a session.
 
  @Get('api/v1/wallet/balance')
  balance(@Headers('x-session-id') sid?: string) {
    const s = sid && SESSIONS.get(sid);
    if (!s) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return { balanceMinor: s.balanceMinor };
  }

  /**
    Main spin endpoint.
    - Validates bet against GameConfig.
    - Draws stops using GameConfig.reels.
    - Computes payout using payout().
    - Updates in-memory balance.
    - Returns result + HMAC signature.
   */
  @Post('api/v1/slot/spin')
  spin(
    @Headers('x-session-id') sid: string,
    @Body('betMinor') betMinor: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = sid && SESSIONS.get(sid);
    if (!s) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const bet = Number(betMinor) | 0;

    // Enforce minimum bet
    if (bet < GameConfig.minBetMinor) {
      throw new HttpException('Bad bet', HttpStatus.BAD_REQUEST);
    }

    // Enforce balance constraint if configured
    if (!GameConfig.allowOverBalance && bet > s.balanceMinor) {
      throw new HttpException('Bad bet', HttpStatus.BAD_REQUEST);
    }

    // Prevent overlapping spins per session
    if (s.spinning) {
      throw new HttpException(
        'Spin in progress',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    s.spinning = true;
    try {
      // Draw stops from configured reel strips
      const stops = [
        pick(GameConfig.reels[0]),
        pick(GameConfig.reels[1]),
        pick(GameConfig.reels[2]),
      ];

      const symbols: Sym[] = [
        GameConfig.reels[0][stops[0]],
        GameConfig.reels[1][stops[1]],
        GameConfig.reels[2][stops[2]],
      ];

      const { mult, reason } = payout(symbols);

      // Debit bet
      s.balanceMinor -= bet;

      // Compute win
      const winMinor = bet * mult;

      // Credit win
      s.balanceMinor += winMinor;

      const spinId = randomUUID();

      // HMAC for integrity: spinId|stops|win
      const msg = `${spinId}|${stops.join(',')}|${winMinor}`;
      const sig = createHmac(
        'sha256',
        process.env.HMAC_SECRET || 'dev-secret',
      )
        .update(msg)
        .digest('hex');

      // Expose signature via header (client validates)
      res.setHeader('x-spin-sig', sig);

      return {
        spinId,
        reelStops: stops,
        winMinor,
        breakdown: { symbols, mult, reason },
        sig, // kept for debugging; can be removed if you want header-only
      };
    } finally {
      s.spinning = false;
    }
  }
}
