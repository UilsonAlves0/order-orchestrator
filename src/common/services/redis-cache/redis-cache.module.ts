import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AllConfigType } from '../../../config/config.type';
import { toRedisOptions } from '../../../config/queue.config';
import {
  REDIS_CACHE_CLIENT,
  RedisCacheClient,
  RedisCacheService,
} from './redis-cache.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CACHE_CLIENT,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<AllConfigType>,
      ): RedisCacheClient => {
        const queue = configService.getOrThrow('queue', { infer: true });
        const redis = new Redis(toRedisOptions(queue));

        return {
          get: (key) => redis.get(key),
          set: async (key, value, expiryMode, ttlMs, condition) => {
            if (
              expiryMode === 'PX' &&
              ttlMs !== undefined &&
              condition === 'NX'
            ) {
              return redis.set(key, value, 'PX', ttlMs, 'NX');
            }

            if (expiryMode === 'PX' && ttlMs !== undefined) {
              return redis.set(key, value, 'PX', ttlMs);
            }

            return redis.set(key, value);
          },
          eval: (script, numkeys, key, token) =>
            redis.eval(script, numkeys, key, token) as Promise<number>,
          quit: () => redis.quit(),
        };
      },
    },
    RedisCacheService,
  ],
  exports: [RedisCacheService],
})
export class RedisCacheModule {}
