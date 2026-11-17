jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

import { Job, Queue } from 'bullmq';
import { ORDER_PROCESSOR_RECEIVED_JOB } from '../constants/order-processor-queue.constants';
import { OrderProcessorJobData } from '../types/order-processor-job.types';
import { OrderProcessorQueuePublisher } from './order-processor-queue.publisher';

describe('OrderProcessorQueuePublisher', () => {
  it('should enqueue with a stable job id from the idempotency key', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' } as Job);
    const publisher = new OrderProcessorQueuePublisher({
      add,
    } as unknown as Queue<OrderProcessorJobData>);
    const payload = { order_id: 'ext-123', event: 'order.created' };

    await expect(
      publisher.publish({
        order_id: 'ext-123',
        idempotency_key: 'uuid-or-hash',
        payload,
      }),
    ).resolves.toEqual({ enqueued: true });

    const queued = add.mock.calls[0][1] as OrderProcessorJobData;
    payload.event = 'changed';

    expect(add).toHaveBeenCalledWith(
      ORDER_PROCESSOR_RECEIVED_JOB,
      expect.objectContaining({
        order_id: 'ext-123',
        idempotency_key: 'uuid-or-hash',
        payload: { order_id: 'ext-123', event: 'order.created' },
      }),
      {
        jobId: 'order-processor-uuid-or-hash',
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    expect(queued.payload).not.toBe(payload);
  });

  it('should report a duplicate when the job id already exists', async () => {
    const add = jest
      .fn()
      .mockRejectedValue(
        new Error('Job order-processor-uuid-or-hash already exists'),
      );
    const publisher = new OrderProcessorQueuePublisher({
      add,
    } as unknown as Queue<OrderProcessorJobData>);

    await expect(
      publisher.publish({
        order_id: 'ext-123',
        idempotency_key: 'uuid-or-hash',
        payload: { order_id: 'ext-123' },
      }),
    ).resolves.toEqual({ enqueued: false });
  });
});
