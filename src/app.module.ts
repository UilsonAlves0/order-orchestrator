import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import appConfig from './config/app.config';
import { AllConfigType } from './config/config.type';
import queueConfig, { createQueueRootOptions } from './config/queue.config';
import { FrankfurterModule } from './common/services/frankfurter/frankfurter.module';
import { RedisCacheModule } from './common/services/redis-cache/redis-cache.module';
import { ViaCepModule } from './common/services/via-cep/via-cep.module';
import { OrderProcessorModule } from './modules/order-processor/order-processor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, queueConfig],
      envFilePath: ['.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        uri: configService.getOrThrow('app.databaseUrl', { infer: true }),
      }),
    }),
    RedisCacheModule,
    ViaCepModule,
    FrankfurterModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createQueueRootOptions,
    }),
    BullBoardModule.forRoot({
      route: '/queue/metrics',
      adapter: ExpressAdapter,
      boardOptions: {
        uiConfig: {
          boardTitle: 'Order Orchestrator Queues',
        },
      },
    }),
    OrderProcessorModule,
  ],
})
export class AppModule {}
