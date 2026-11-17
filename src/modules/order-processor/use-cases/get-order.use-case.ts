import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import { OrderView, toOrderView } from '../types/order.types';

export class OrderNotFoundError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} not found`);
    this.name = 'OrderNotFoundError';
  }
}

@Injectable()
export class GetOrderUseCase {
  private readonly logger = new Logger(GetOrderUseCase.name);

  constructor(private readonly orders: OrdersService) {}

  async execute(orderId: string): Promise<OrderView> {
    this.logger.log(`Loading order ${orderId}`);
    const found = await this.orders.findByOrderId(orderId);

    if (!found) {
      this.logger.warn(`Order ${orderId} not found`);
      throw new OrderNotFoundError(orderId);
    }

    this.logger.log(`Loaded order ${orderId} status=${found.status ?? 'n/a'}`);
    return toOrderView(found);
  }
}
