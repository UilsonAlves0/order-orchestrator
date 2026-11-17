import { ConfigService, registerAs } from '@nestjs/config';
import { QueueOptions } from 'bullmq';
import { AllConfigType, QueueConfig } from './config.type';

const DEFAULT_WORKER_HOST = 'redis://localhost:6379/0';
const DEFAULT_PREFIX = 'bull';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export default registerAs<QueueConfig>('queue', () => ({
  ...parseWorkerHost(process.env.WORKER_HOST?.trim() || DEFAULT_WORKER_HOST),
  prefix: process.env.QUEUE_PREFIX?.trim() || DEFAULT_PREFIX,
}));

export function toRedisOptions(config: QueueConfig) {
  return {
    host: config.host,
    port: config.port,
    db: config.db,
    ...(config.username ? { username: config.username } : {}),
    ...(config.password ? { password: config.password } : {}),
    ...(config.tls ? { tls: {} } : {}),
  };
}

export function createQueueRootOptions(
  configService: ConfigService<AllConfigType>,
): QueueOptions {
  const config = configService.getOrThrow('queue', { infer: true });

  return {
    prefix: config.prefix,
    connection: toRedisOptions(config),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  };
}

function parseWorkerHost(raw: string): Omit<QueueConfig, 'prefix'> {
  const url = parseRedisUrl(raw);
  const port = url.port === '' ? 6379 : Number(url.port);
  const dbPath = url.pathname.replace(/^\//, '');
  const db = dbPath === '' ? 0 : Number(dbPath);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('WORKER_HOST port must be between 1 and 65535');
  }

  if (!Number.isInteger(db) || db < 0) {
    throw new Error(
      'WORKER_HOST database index must be a non-negative integer',
    );
  }

  const username = url.username ? decodeURIComponent(url.username) : undefined;
  const password = url.password ? decodeURIComponent(url.password) : undefined;

  return {
    host: stripIpv6Brackets(url.hostname),
    port,
    db,
    tls: url.protocol === 'rediss:',
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
  };
}

function parseRedisUrl(raw: string): URL {
  try {
    const url = new URL(raw);

    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
      throw new Error('WORKER_HOST must be a redis:// or rediss:// URL');
    }

    if (!url.hostname) {
      throw new Error('WORKER_HOST must be a redis:// or rediss:// URL');
    }

    return url;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WORKER_HOST')) {
      throw error;
    }

    if (hasOutOfRangePort(raw)) {
      throw new Error('WORKER_HOST port must be between 1 and 65535');
    }

    throw new Error('WORKER_HOST must be a redis:// or rediss:// URL');
  }
}

function hasOutOfRangePort(raw: string): boolean {
  const host =
    raw
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .split('@')
      .pop() ?? '';
  const match = host.match(/^[^/]*:(\d+)/);
  if (!match) {
    return false;
  }

  const port = Number(match[1]);
  return port < 1 || port > 65535;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}
