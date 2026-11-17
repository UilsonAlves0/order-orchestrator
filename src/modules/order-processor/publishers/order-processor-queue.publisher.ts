import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ORDER_PROCESSOR_QUEUE_NAME,
  ORDER_PROCESSOR_RECEIVED_JOB,
} from '../constants/order-processor-queue.constants';
import { OrderProcessorJobData } from '../types/order-processor-job.types';

export type PublishOrderProcessorResult = {
  enqueued: boolean;
};

@Injectable()
export class OrderProcessorQueuePublisher {
  private readonly logger = new Logger(OrderProcessorQueuePublisher.name);

  constructor(
    @InjectQueue(ORDER_PROCESSOR_QUEUE_NAME)
    private readonly orderProcessorQueue: Queue<OrderProcessorJobData>,
  ) {}

  async publish(
    data: OrderProcessorJobData,
  ): Promise<PublishOrderProcessorResult> {
    const orderId = data.order_id.trim();
    const idempotencyKey = data.idempotency_key.trim();
    const jobId = `order-processor-${idempotencyKey}`;
    const jobData: OrderProcessorJobData = {
      order_id: orderId,
      idempotency_key: idempotencyKey,
      payload: { ...data.payload },
    };

    try {
      await this.orderProcessorQueue.add(
        ORDER_PROCESSOR_RECEIVED_JOB,
        jobData,
        {
          jobId,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
      this.logger.log(
        `Enqueued job ${jobId} for order ${orderId} on ${ORDER_PROCESSOR_QUEUE_NAME}`,
      );
      return { enqueued: true };
    } catch (error) {
      if (isDuplicateJobError(error)) {
        this.logger.warn(
          `Job ${jobId} already exists for order ${orderId}; skipping enqueue`,
        );
        return { enqueued: false };
      }

      this.logger.error(
        `Failed to enqueue order ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

function isDuplicateJobError(error: unknown): boolean {
  return (
    error instanceof Error && /already (exists|present)/i.test(error.message)
  );
}
