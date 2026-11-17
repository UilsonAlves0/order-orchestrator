import queueConfig, {
  createQueueRootOptions,
  toRedisOptions,
} from './queue.config';
import { ConfigService } from '@nestjs/config';
import { QueueConfig } from './config.type';

const ENV_KEYS = ['WORKER_HOST', 'QUEUE_PREFIX'] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();

  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  }
}

const baseConfig: QueueConfig = {
  host: 'redis',
  port: 6379,
  db: 1,
  tls: false,
  prefix: 'bull',
};

describe('queueConfig', () => {
  it('should default to a local Redis database when WORKER_HOST is unset', () => {
    withEnv({}, () => {
      expect(queueConfig()).toEqual({
        host: 'localhost',
        port: 6379,
        db: 0,
        tls: false,
        prefix: 'bull',
      });
    });
  });

  it('should read host, credentials, TLS, and prefix from env', () => {
    withEnv(
      {
        WORKER_HOST: 'rediss://alice:s3cret@localhost:6380/2',
        QUEUE_PREFIX: 'orders',
      },
      () => {
        expect(queueConfig()).toEqual({
          host: 'localhost',
          port: 6380,
          username: 'alice',
          password: 's3cret',
          db: 2,
          tls: true,
          prefix: 'orders',
        });
      },
    );
  });

  it('should decode a percent-encoded password once', () => {
    withEnv({ WORKER_HOST: 'redis://alice:p%25ss@redis:6379/1' }, () => {
      expect(queueConfig()).toEqual(
        expect.objectContaining({
          password: 'p%ss',
        }),
      );
    });
  });

  it('should strip brackets from an IPv6 host', () => {
    withEnv({ WORKER_HOST: 'redis://[::1]:6379/0' }, () => {
      expect(queueConfig()).toEqual(
        expect.objectContaining({
          host: '::1',
        }),
      );
    });
  });

  it('should reject invalid Redis URLs without leaking secrets', () => {
    withEnv({ WORKER_HOST: 'redis://alice:s3cret@redis:6379/nope' }, () => {
      expect(() => queueConfig()).toThrow(
        'WORKER_HOST database index must be a non-negative integer',
      );
      expect(() => queueConfig()).toThrow(
        expect.not.stringContaining('s3cret'),
      );
    });
  });
});

describe('createQueueRootOptions', () => {
  it('should map queue config into Bull connection options', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue({
        ...baseConfig,
        username: 'alice',
        password: 's3cret',
        tls: true,
      }),
    } as unknown as ConfigService;

    expect(createQueueRootOptions(configService)).toEqual({
      prefix: 'bull',
      connection: toRedisOptions({
        ...baseConfig,
        username: 'alice',
        password: 's3cret',
        tls: true,
      }),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  });
});
