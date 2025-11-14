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
import { createHmac, createHash, randomInt, randomUUID } from 'crypto';
import type { Response } from 'express';
import { Config } from './config-store';
import type { Sym } from './game-config';


const SESSIONS = new Map<string, { balanceMinor: number; spinning: boolean }>();


const pick = (reel: Sym[]) => randomInt(reel.length);


function payout(symbols: Sym[]) {
  const cfg = Config.get();


  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const mult = cfg.pay3[symbols[0]];
    return { mult, reason: `${symbols[0]} x3` };
  }

  const cherryCount = symbols.filter((s) => s === 'Cherry').length;
  const sevenCount = symbols.filter((s) => s === 'Seven').length;

  // Any 2 Sevens
  if (sevenCount === 2) {
    return { mult: cfg.anyTwoSevensMult, reason: 'Any 2 Sevens' };
  }
  // Any 2 Cherries
  if (cherryCount === 2) {
    return { mult: cfg.anyTwoCherriesMult, reason: 'Any 2 Cherries' };
  }
  // Single Cherry (fallback)
  if (cherryCount >= 1) {
    return { mult: cfg.singleCherryMult, reason: 'Single Cherry' };
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


  @Get('api/v1/health')
  health() {
    const cfg = Config.get();
    const cfgStr = JSON.stringify(cfg);
    const cfgHash = createHash('sha1').update(cfgStr).digest('hex').slice(0, 12);
    return {
      ok: true,
      now: Date.now(),
      uptimeSec: Number(process.uptime().toFixed(2)),
      node: process.version,
      configHash: cfgHash,
    };
  }


  @Post('api/v1/auth/guest')
  guest() {
    const cfg = Config.get();
    const id = randomUUID();
    SESSIONS.set(id, {
      balanceMinor: cfg.startBalanceMinor,
      spinning: false,
    });
    return { sessionId: id };
  }


  @Get('api/v1/wallet/balance')
  balance(@Headers('x-session-id') sid?: string) {
    const s = sid && SESSIONS.get(sid);
    if (!s) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return { balanceMinor: s.balanceMinor };
  }


  @Post('api/v1/slot/spin')
  spin(
    @Headers('x-session-id') sid: string,
    @Body('betMinor') betMinor: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cfg = Config.get();
    const s = sid && SESSIONS.get(sid);
    if (!s) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // Normalize & validate bet
    const bet = Math.floor(Number(betMinor));
    if (!Number.isFinite(bet) || bet <= 0) {
      throw new HttpException('Bad bet', HttpStatus.BAD_REQUEST);
    }

    // Enforce minimum bet
    if (bet < cfg.minBetMinor) {
      throw new HttpException('Bad bet', HttpStatus.BAD_REQUEST);
    }

    // Enforce balance constraint if configured
    if (!cfg.allowOverBalance && bet > s.balanceMinor) {
      throw new HttpException('Bad bet', HttpStatus.BAD_REQUEST);
    }

    // Prevent overlapping spins per session
    if (s.spinning) {
      throw new HttpException('Spin in progress', HttpStatus.TOO_MANY_REQUESTS);
    }

    s.spinning = true;
    try {
      // Draw stops from configured reel strips
      const stops = [pick(cfg.reels[0]), pick(cfg.reels[1]), pick(cfg.reels[2])];

      // Resolve symbols
      const symbols: Sym[] = [
        cfg.reels[0][stops[0]],
        cfg.reels[1][stops[1]],
        cfg.reels[2][stops[2]],
      ];

      const { mult, reason } = payout(symbols);

      // Debit bet
      s.balanceMinor -= bet;

      // Compute & credit win
      const winMinor = bet * mult;
      s.balanceMinor += winMinor;

      // Prepare signed result
      const spinId = randomUUID();
      const msg = `${spinId}|${stops.join(',')}|${winMinor}`;
      const sig = createHmac('sha256', process.env.HMAC_SECRET || 'dev-secret')
        .update(msg)
        .digest('hex');

      // Expose signature via header (client validates)
      res.setHeader('x-spin-sig', sig);

      return {
        spinId,
        reelStops: stops,
        winMinor,
        breakdown: { symbols, mult, reason },
        sig,  
      };
    } finally {
      s.spinning = false;
    }
  }
}
