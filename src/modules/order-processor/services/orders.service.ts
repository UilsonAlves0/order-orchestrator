import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../../../common/schemas/order.schema';
import {
  OrderEnrichmentUpdate,
  OrderInput,
  StoredOrder,
} from '../types/order.types';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orders: Model<OrderDocument>,
  ) {}

  async findAll(status?: string): Promise<StoredOrder[]> {
    const normalized = status?.trim();
    const filter = normalized ? { status: normalized } : {};
    this.logger.debug(`Mongo find orders filter=${JSON.stringify(filter)}`);
    const found = await this.orders
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    this.logger.debug(`Mongo find orders returned ${found.length} document(s)`);
    return found as StoredOrder[];
  }

  async findByOrderId(orderId: string): Promise<StoredOrder | null> {
    this.logger.debug(`Mongo findOne order_id=${orderId}`);
    const found = await this.orders
      .findOne({ order_id: orderId })
      .lean()
      .exec();

    this.logger.debug(
      `Mongo findOne order_id=${orderId} -> ${found ? 'hit' : 'miss'}`,
    );
    return (found as StoredOrder | null) ?? null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredOrder | null> {
    this.logger.debug(`Mongo findOne idempotency_key=${idempotencyKey}`);
    const found = await this.orders
      .findOne({ idempotency_key: idempotencyKey })
      .lean()
      .exec();

    this.logger.debug(
      `Mongo findOne idempotency_key=${idempotencyKey} -> ${found ? 'hit' : 'miss'}`,
    );
    return (found as StoredOrder | null) ?? null;
  }

  async create(order: OrderInput): Promise<StoredOrder> {
    this.logger.log(
      `Mongo create order_id=${order.order_id} status=${order.status}`,
    );
    const created = await this.orders.create(order);
    this.logger.log(`Mongo created order_id=${order.order_id}`);
    return created.toObject() as StoredOrder;
  }

  async updateEnrichment(
    orderId: string,
    update: OrderEnrichmentUpdate,
  ): Promise<StoredOrder | null> {
    this.logger.log(
      `Mongo updateEnrichment order_id=${orderId} status=${update.status}`,
    );
    const updated = await this.orders
      .findOneAndUpdate(
        { order_id: orderId },
        {
          $set: {
            customer: update.customer,
            items: update.items,
            status: update.status,
            ...(update.currency_conversion
              ? { currency_conversion: update.currency_conversion }
              : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    this.logger.log(
      `Mongo updateEnrichment order_id=${orderId} -> ${updated ? 'updated' : 'missing'}`,
    );
    return (updated as StoredOrder | null) ?? null;
  }

  async updateStatus(
    orderId: string,
    status: string,
  ): Promise<StoredOrder | null> {
    this.logger.log(`Mongo updateStatus order_id=${orderId} status=${status}`);
    const updated = await this.orders
      .findOneAndUpdate(
        { order_id: orderId },
        { $set: { status } },
        { new: true },
      )
      .lean()
      .exec();

    this.logger.log(
      `Mongo updateStatus order_id=${orderId} -> ${updated ? 'updated' : 'missing'}`,
    );
    return (updated as StoredOrder | null) ?? null;
  }
}
