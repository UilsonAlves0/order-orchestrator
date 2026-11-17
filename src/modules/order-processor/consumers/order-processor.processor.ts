import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { ORDER_STATUS } from '../../../common/constants/order-status';
import {
  ORDER_PROCESSOR_DEAD_LETTER_JOB,
  ORDER_PROCESSOR_DLQ_NAME,
  ORDER_PROCESSOR_QUEUE_NAME,
  ORDER_PROCESSOR_RECEIVED_JOB,
} from '../constants/order-processor-queue.constants';
import { OrdersService } from '../services/orders.service';
import { ProcessOrderUseCase } from '../use-cases/process-order.use-case';
import {
  OrderProcessorDeadLetterData,
  OrderProcessorJobData,
} from '../types/order-processor-job.types';

@Processor(ORDER_PROCESSOR_QUEUE_NAME)
export class OrderProcessorWorker extends WorkerHost {
  private readonly logger = new Logger(OrderProcessorWorker.name);

  constructor(
    private readonly processOrder: ProcessOrderUseCase,
    private readonly orders: OrdersService,
    @InjectQueue(ORDER_PROCESSOR_DLQ_NAME)
    private readonly deadLetterQueue: Queue<OrderProcessorDeadLetterData>,
  ) {
    super();
  }

  async process(job: Job<OrderProcessorJobData>) {
    const orderId = readOrderId(job.data) ?? 'unknown';
    const attempt = (job.attemptsMade ?? 0) + 1;
    const maxAttempts = job.opts?.attempts ?? 1;
    this.logger.log(
      `Job ${job.id ?? 'n/a'} started (${job.name}) for order ${orderId} attempt=${attempt}/${maxAttempts}`,
    );

    if (job.name !== ORDER_PROCESSOR_RECEIVED_JOB) {
      throw new UnrecoverableError(
        `Unsupported order-processor job: ${job.name}`,
      );
    }

    const payload = readPayload(job.data);

    if (!payload) {
      throw new UnrecoverableError(
        'Order-processor job requires a payload object',
      );
    }

    const result = await this.processOrder.execute({
      ...(job.data.order_id ? { order_id: job.data.order_id } : {}),
      payload,
    });

    this.logger.log(
      `Job ${job.id} completed for order ${result.order_id} status=${result.status}`,
    );
    return result;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<OrderProcessorJobData>, error: Error): Promise<void> {
    const orderId = readOrderId(job.data) ?? 'unknown';
    const attempts = job.opts?.attempts ?? 1;

    if (!isFinalFailure(job, error)) {
      this.logger.warn(
        `Job ${job.id} failed for order ${orderId} attempt=${job.attemptsMade}/${attempts}: ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `Job ${job.id} finally failed for order ${orderId} after ${job.attemptsMade} attempt(s): ${error.message}`,
    );

    if (orderId !== 'unknown') {
      await this.orders.updateStatus(orderId, ORDER_STATUS.FAILED_ENRICHMENT);
      this.logger.warn(
        `Order ${orderId} marked as ${ORDER_STATUS.FAILED_ENRICHMENT}`,
      );
    }

    await this.deadLetterQueue.add(
      ORDER_PROCESSOR_DEAD_LETTER_JOB,
      toDeadLetter(job, error),
    );
    this.logger.warn(
      `Job ${job.id} moved to ${ORDER_PROCESSOR_DLQ_NAME} for order ${orderId}`,
    );
  }
}

function readPayload(
  data: OrderProcessorJobData | undefined,
): Record<string, unknown> | undefined {
  const payload = data?.payload;

  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return undefined;
  }

  return payload;
}

function readOrderId(
  data: OrderProcessorJobData | undefined,
): string | undefined {
  if (typeof data?.order_id === 'string' && data.order_id.trim() !== '') {
    return data.order_id.trim();
  }

  const payload = readPayload(data);
  const orderId = payload?.order_id;

  if (typeof orderId === 'string' && orderId.trim() !== '') {
    return orderId.trim();
  }

  return undefined;
}

function isFinalFailure(
  job: Job<OrderProcessorJobData>,
  error: Error,
): boolean {
  if (error instanceof UnrecoverableError) {
    return true;
  }

  const attempts = job.opts?.attempts ?? 1;
  return job.attemptsMade >= attempts;
}

function toDeadLetter(
  job: Job<OrderProcessorJobData>,
  error: Error,
): OrderProcessorDeadLetterData {
  const payload = readPayload(job.data);
  const orderId = readOrderId(job.data);

  const idempotencyKey =
    typeof job.data?.idempotency_key === 'string' &&
    job.data.idempotency_key.trim() !== ''
      ? job.data.idempotency_key.trim()
      : undefined;

  return {
    jobId: job.id ?? '',
    jobName: job.name,
    ...(orderId ? { order_id: orderId } : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    ...(payload ? { payload: { ...payload } } : {}),
    failedReason: error.message,
    attemptsMade: job.attemptsMade,
  };
}
