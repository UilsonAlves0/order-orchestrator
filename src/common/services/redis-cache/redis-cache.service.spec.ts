import {
  CacheLockBusyError,
  RedisCacheClient,
  RedisCacheService,
} from './redis-cache.service';

function client(setResult: string | null = 'OK') {
  const get = jest
    .fn<Promise<string | null>, [string]>()
    .mockResolvedValue(null);
  const set = jest
    .fn<Promise<string | null>, [string, string, ...Array<string | number>]>()
    .mockResolvedValue(setResult);
  const evalCommand = jest.fn<
    Promise<number>,
    [string, number, string, string]
  >();
  const quit = jest.fn<Promise<string>, []>().mockResolvedValue('OK');

  return {
    redis: { get, set, eval: evalCommand, quit } as RedisCacheClient,
    get,
    set,
    evalCommand,
    quit,
  };
}

describe('RedisCacheService', () => {
  it('should read and write cache values under the cache prefix', async () => {
    const { redis, get, set } = client();
    get.mockResolvedValue('stored');
    const service = new RedisCacheService(redis);

    await expect(service.get('order:ext-123')).resolves.toBe('stored');
    await service.set('order:ext-123', 'stored', 5000);

    expect(get).toHaveBeenCalledWith('cache:order:ext-123');
    expect(set).toHaveBeenCalledWith(
      'cache:order:ext-123',
      'stored',
      'PX',
      5000,
    );
  });

  it('should set a value only when the key is absent', async () => {
    const { redis, set } = client('OK');
    const service = new RedisCacheService(redis);

    await expect(
      service.setIfAbsent('idempotency:key', 'ext-123', 1000),
    ).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(
      'cache:idempotency:key',
      'ext-123',
      'PX',
      1000,
      'NX',
    );
  });

  it('should acquire a lock only when the key is free', async () => {
    const { redis, set } = client('OK');
    const service = new RedisCacheService(redis);

    await expect(
      service.acquireLock('order-processor:ext-123', 1000),
    ).resolves.toEqual(expect.any(String));
    expect(set).toHaveBeenCalledWith(
      'lock:order-processor:ext-123',
      expect.any(String),
      'PX',
      1000,
      'NX',
    );
  });

  it('should report a busy lock when the key is already held', async () => {
    const { redis } = client(null);
    const service = new RedisCacheService(redis);

    await expect(
      service.acquireLock('order-processor:ext-123', 1000),
    ).resolves.toBeNull();
  });

  it('should run the critical section once and release the same token', async () => {
    const { redis, set, evalCommand } = client('OK');
    const service = new RedisCacheService(redis);
    const work = jest.fn<Promise<string>, []>().mockResolvedValue('done');

    await expect(
      service.withLock('order-processor:ext-123', 1000, work),
    ).resolves.toBe('done');

    const token = set.mock.calls[0]?.[1];
    expect(work).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("del", KEYS[1])'),
      1,
      'lock:order-processor:ext-123',
      token,
    );
  });

  it('should refuse the critical section when the lock is busy', async () => {
    const { redis, evalCommand } = client(null);
    const service = new RedisCacheService(redis);
    const work = jest.fn<Promise<string>, []>().mockResolvedValue('done');

    await expect(
      service.withLock('order-processor:ext-123', 1000, work),
    ).rejects.toBeInstanceOf(CacheLockBusyError);
    expect(work).not.toHaveBeenCalled();
    expect(evalCommand).not.toHaveBeenCalled();
  });
});
