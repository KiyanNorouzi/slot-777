import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS for local dev (client + admin UIs)
  app.enableCors({
    origin: [/^http:\/\/localhost:\d+$/],
    credentials: true,
    allowedHeaders: ['content-type', 'x-session-id', 'x-admin-token'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Reads PORT from .env via ConfigService
  const config = app.get(ConfigService);
  const port = Number(config.get('PORT')) || 3001;

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
}
bootstrap();
