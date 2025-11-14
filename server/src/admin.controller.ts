import { Body, Controller, Get, Headers, HttpException, HttpStatus, Post, Put } from '@nestjs/common';
import { Config } from './config-store';

function assertAdmin(token?: string) {
  const expected = process.env.ADMIN_TOKEN || '';
  if (!expected || token !== expected) {
    throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }
}

@Controller('api/v1/admin')
export class AdminController {
  @Get('config')
  getConfig(@Headers('x-admin-token') token?: string) {
    assertAdmin(token);
    return Config.get();
  }

  @Put('config')
  updateConfig(
    @Headers('x-admin-token') token: string | undefined,
    @Body() body: any
  ) {
    assertAdmin(token);
    try {
      const updated = Config.set(body ?? {});
      return { ok: true, config: updated };
    } catch (e: any) {
      throw new HttpException(String(e?.message || e), HttpStatus.BAD_REQUEST);
    }
  }

  @Post('config/reset')
  resetConfig(@Headers('x-admin-token') token?: string) {
    assertAdmin(token);
    const cfg = Config.reset();
    return { ok: true, config: cfg };
  }
}
