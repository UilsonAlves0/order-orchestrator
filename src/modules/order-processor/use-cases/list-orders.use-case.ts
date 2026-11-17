import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import { OrderView, toOrderView } from '../types/order.types';

@Injectable()
export class ListOrdersUseCase {
  private readonly logger = new Logger(ListOrdersUseCase.name);

  constructor(private readonly orders: OrdersService) {}

  async execute(status?: string): Promise<OrderView[]> {
    this.logger.log(
      `Listing orders${status?.trim() ? ` filtered by status=${status.trim()}` : ''}`,
    );
    const found = await this.orders.findAll(status);
    this.logger.log(`Listed ${found.length} order(s)`);
    return found.map((order) => toOrderView(order));
  }
}
