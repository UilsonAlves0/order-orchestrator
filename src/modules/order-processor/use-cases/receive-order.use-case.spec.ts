jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

import type { RedisCacheService } from '../../../common/services/redis-cache/redis-cache.service';
import type { OrderProcessorQueuePublisher } from '../publishers/order-processor-queue.publisher';
import {
  InvalidOrderPayloadError,
  ReceiveOrderUseCase,
} from './receive-order.use-case';

const payload = {
  order_id: 'ext-123',
  customer: { email: 'user@example.com', name: 'Ana' },
  items: [{ sku: 'ABC123', qty: 2, unit_price: 59.9 }],
  currency: 'USD',
  idempotency_key: 'uuid-or-hash',
};

describe('ReceiveOrderUseCase', () => {
  it('should claim idempotency and enqueue without touching Mongo', async () => {
    const setIfAbsent = jest.fn().mockResolvedValue(true);
    const publish = jest.fn().mockResolvedValue({ enqueued: true });
    const useCase = new ReceiveOrderUseCase(
      { setIfAbsent } as unknown as RedisCacheService,
      { publish } as unknown as OrderProcessorQueuePublisher,
    );

    await expect(useCase.execute({ payload })).resolves.toEqual({
      accepted: true,
      duplicate: false,
      order_id: 'ext-123',
    });
    expect(setIfAbsent).toHaveBeenCalledWith(
      'idempotency:uuid-or-hash',
      'ext-123',
      7 * 24 * 60 * 60 * 1000,
    );
    expect(publish).toHaveBeenCalledWith({
      order_id: 'ext-123',
      idempotency_key: 'uuid-or-hash',
      payload,
    });
  });

  it('should report a duplicate when the idempotency key was already claimed', async () => {
    const setIfAbsent = jest.fn().mockResolvedValue(false);
    const publish = jest.fn();
    const useCase = new ReceiveOrderUseCase(
      { setIfAbsent } as unknown as RedisCacheService,
      { publish } as unknown as OrderProcessorQueuePublisher,
    );

    await expect(useCase.execute({ payload })).resolves.toEqual({
      accepted: true,
      duplicate: true,
      order_id: 'ext-123',
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('should reject an invalid payload before enqueueing', async () => {
    const setIfAbsent = jest.fn();
    const publish = jest.fn();
    const useCase = new ReceiveOrderUseCase(
      { setIfAbsent } as unknown as RedisCacheService,
      { publish } as unknown as OrderProcessorQueuePublisher,
    );

    await expect(
      useCase.execute({
        payload: ['event'] as unknown as Record<string, unknown>,
      }),
    ).rejects.toBeInstanceOf(InvalidOrderPayloadError);
    expect(setIfAbsent).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
