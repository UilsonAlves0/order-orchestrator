import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../../common/services/redis-cache/redis-cache.service';
import { OrderProcessorQueuePublisher } from '../publishers/order-processor-queue.publisher';
import {
  InvalidOrderPayloadError,
  parseOrderInput,
} from '../utils/order-payload';

export { InvalidOrderPayloadError };

export type ReceiveOrderInput = {
  payload: Record<string, unknown>;
};

export type ReceiveOrderResult = {
  accepted: true;
  duplicate: boolean;
  order_id: string;
};

const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReceiveOrderUseCase {
  private readonly logger = new Logger(ReceiveOrderUseCase.name);

  constructor(
    private readonly cache: RedisCacheService,
    private readonly orderProcessorQueue: OrderProcessorQueuePublisher,
  ) {}

  async execute(input: ReceiveOrderInput): Promise<ReceiveOrderResult> {
    const order = parseOrderInput(input.payload);
    this.logger.log(
      `Receiving order ${order.order_id} (idempotency_key=${order.idempotency_key})`,
    );

    const claimed = await this.cache.setIfAbsent(
      `idempotency:${order.idempotency_key}`,
      order.order_id,
      IDEMPOTENCY_TTL_MS,
    );

    if (!claimed) {
      this.logger.warn(
        `Duplicate webhook ignored for order ${order.order_id} (idempotency_key=${order.idempotency_key})`,
      );
      return {
        accepted: true,
        duplicate: true,
        order_id: order.order_id,
      };
    }

    await this.orderProcessorQueue.publish({
      order_id: order.order_id,
      idempotency_key: order.idempotency_key,
      payload: { ...input.payload },
    });

    this.logger.log(`Order ${order.order_id} accepted and enqueued`);
    return {
      accepted: true,
      duplicate: false,
      order_id: order.order_id,
    };
  }
}
