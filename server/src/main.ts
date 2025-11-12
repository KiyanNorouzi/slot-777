import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [/^http:\/\/localhost:\d+$/],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-spin-sig', 'x-session-id'],
    exposedHeaders: ['x-spin-sig'],
    credentials: true,
  });

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT')) || 3001;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();
