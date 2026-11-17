import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export const REDIS_CACHE_CLIENT = Symbol('REDIS_CACHE_CLIENT');

export interface RedisCacheClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    expiryMode?: 'PX',
    ttlMs?: number,
    condition?: 'NX',
  ): Promise<string | null>;
  eval(
    script: string,
    numkeys: number,
    key: string,
    token: string,
  ): Promise<number>;
  quit(): Promise<unknown>;
}

export class CacheLockBusyError extends Error {
  constructor(readonly key: string) {
    super(`Cache lock is already held for ${key}`);
    this.name = 'CacheLockBusyError';
  }
}

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(
    @Inject(REDIS_CACHE_CLIENT)
    private readonly client: RedisCacheClient,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing Redis cache connection');
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    const value = await this.client.get(cacheKey(key));
    this.logger.debug(`Redis GET ${key} -> ${value === null ? 'miss' : 'hit'}`);
    return value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs === undefined) {
      await this.client.set(cacheKey(key), value);
      this.logger.debug(`Redis SET ${key}`);
      return;
    }

    await this.client.set(cacheKey(key), value, 'PX', ttlMs);
    this.logger.debug(`Redis SET ${key} ttlMs=${ttlMs}`);
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.client.set(
      cacheKey(key),
      value,
      'PX',
      ttlMs,
      'NX',
    );
    const claimed = result === 'OK';
    this.logger.debug(
      `Redis SET NX ${key} -> ${claimed ? 'claimed' : 'already-exists'}`,
    );
    return claimed;
  }

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(
      lockKey(key),
      token,
      'PX',
      ttlMs,
      'NX',
    );

    if (result === 'OK') {
      this.logger.debug(`Redis lock acquired key=${key}`);
      return token;
    }

    this.logger.debug(`Redis lock busy key=${key}`);
    return null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey(key), token);
    this.logger.debug(`Redis lock released key=${key}`);
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    work: () => Promise<T>,
  ): Promise<T> {
    const token = await this.acquireLock(key, ttlMs);

    if (!token) {
      this.logger.warn(`Redis lock busy for key=${key}`);
      throw new CacheLockBusyError(key);
    }

    try {
      this.logger.debug(`Redis withLock running key=${key}`);
      return await work();
    } finally {
      await this.releaseLock(key, token);
    }
  }
}

function cacheKey(key: string): string {
  return `cache:${key}`;
}

function lockKey(key: string): string {
  return `lock:${key}`;
}
