import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminController } from './admin.controller';

@Module({
  // Bring back ConfigModule and make it global so ConfigService is available everywhere
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, AdminController],
  providers: [AppService],
})
export class AppModule {}
