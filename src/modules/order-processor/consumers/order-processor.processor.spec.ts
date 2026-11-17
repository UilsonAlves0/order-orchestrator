jest.mock('@nestjs/bullmq', () => ({
  Processor: () => (target: unknown) => target,
  WorkerHost: class WorkerHost {},
  OnWorkerEvent: () => () => undefined,
  InjectQueue: () => () => undefined,
}));

import { Job, Queue, UnrecoverableError } from 'bullmq';
import { ORDER_STATUS } from '../../../common/constants/order-status';
import {
  ORDER_PROCESSOR_DEAD_LETTER_JOB,
  ORDER_PROCESSOR_RECEIVED_JOB,
} from '../constants/order-processor-queue.constants';
import { OrdersService } from '../services/orders.service';
import {
  OrderProcessorDeadLetterData,
  OrderProcessorJobData,
} from '../types/order-processor-job.types';
import { ProcessOrderUseCase } from '../use-cases/process-order.use-case';
import { OrderProcessorWorker } from './order-processor.processor';

function receivedJob(
  data: Partial<OrderProcessorJobData> | undefined,
  name = ORDER_PROCESSOR_RECEIVED_JOB,
): Job<OrderProcessorJobData> {
  return { name, data } as Job<OrderProcessorJobData>;
}

function failedJob(
  overrides: Partial<Job<OrderProcessorJobData>> = {},
): Job<OrderProcessorJobData> {
  return {
    id: 'job-1',
    name: ORDER_PROCESSOR_RECEIVED_JOB,
    data: {
      order_id: 'ext-123',
      idempotency_key: 'uuid-or-hash',
      payload: { order_id: 'ext-123', event: 'order.created' },
    },
    attemptsMade: 1,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<OrderProcessorJobData>;
}

describe('OrderProcessorWorker', () => {
  const add = jest.fn().mockResolvedValue({ id: 'dlq-1' });
  const updateStatus = jest.fn().mockResolvedValue({
    order_id: 'ext-123',
    status: ORDER_STATUS.FAILED_ENRICHMENT,
  });
  const execute = jest
    .fn<
      ReturnType<ProcessOrderUseCase['execute']>,
      Parameters<ProcessOrderUseCase['execute']>
    >()
    .mockResolvedValue({
      order_id: 'ext-123',
      status: ORDER_STATUS.RECEIVED,
    });
  const processor = new OrderProcessorWorker(
    { execute } as unknown as ProcessOrderUseCase,
    { updateStatus } as unknown as OrdersService,
    { add } as unknown as Queue<OrderProcessorDeadLetterData>,
  );

  beforeEach(() => {
    add.mockClear();
    execute.mockClear();
    updateStatus.mockClear();
  });

  it('should pass the payload to the process-order use case', async () => {
    const payload = { order_id: 'ext-123' };

    await expect(
      processor.process(
        receivedJob({
          order_id: 'ext-123',
          idempotency_key: 'uuid-or-hash',
          payload,
        }),
      ),
    ).resolves.toEqual({
      order_id: 'ext-123',
      status: ORDER_STATUS.RECEIVED,
    });
    expect(execute).toHaveBeenCalledWith({
      order_id: 'ext-123',
      payload,
    });
  });

  it('should reject a received job without an object payload', async () => {
    await expect(
      processor.process(receivedJob(undefined)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('should reject an unsupported job name', async () => {
    await expect(
      processor.process(
        receivedJob(
          {
            order_id: 'ext-123',
            idempotency_key: 'uuid-or-hash',
            payload: { order_id: 'ext-123' },
          },
          'other',
        ),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('should mark FAILED_ENRICHMENT and publish an unrecoverable failure to the DLQ', async () => {
    const payload = { order_id: 'ext-123', event: 'order.created' };
    const job = failedJob({
      data: {
        order_id: 'ext-123',
        idempotency_key: 'uuid-or-hash',
        payload,
      },
    });

    await processor.onFailed(job, new UnrecoverableError('bad payload'));
    payload.event = 'changed';

    expect(updateStatus).toHaveBeenCalledWith(
      'ext-123',
      ORDER_STATUS.FAILED_ENRICHMENT,
    );
    expect(add).toHaveBeenCalledWith(ORDER_PROCESSOR_DEAD_LETTER_JOB, {
      jobId: 'job-1',
      jobName: ORDER_PROCESSOR_RECEIVED_JOB,
      order_id: 'ext-123',
      idempotency_key: 'uuid-or-hash',
      payload: { order_id: 'ext-123', event: 'order.created' },
      failedReason: 'bad payload',
      attemptsMade: 1,
    });
  });

  it('should wait for the last attempt before marking failure', async () => {
    await processor.onFailed(failedJob(), new Error('redis down'));

    expect(updateStatus).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('should mark FAILED_ENRICHMENT after the last attempt', async () => {
    await processor.onFailed(
      failedJob({ attemptsMade: 3 }),
      new Error('redis down'),
    );

    expect(updateStatus).toHaveBeenCalledWith(
      'ext-123',
      ORDER_STATUS.FAILED_ENRICHMENT,
    );
    expect(add).toHaveBeenCalledWith(
      ORDER_PROCESSOR_DEAD_LETTER_JOB,
      expect.objectContaining({
        failedReason: 'redis down',
        attemptsMade: 3,
      }),
    );
  });
});
