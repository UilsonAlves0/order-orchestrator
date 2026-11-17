import { Injectable, Logger } from '@nestjs/common';
import { ORDER_STATUS } from '../../../common/constants/order-status';
import { FrankfurterService } from '../../../common/services/frankfurter/frankfurter.service';
import { RedisCacheService } from '../../../common/services/redis-cache/redis-cache.service';
import { ViaCepService } from '../../../common/services/via-cep/via-cep.service';
import { OrdersService } from '../services/orders.service';
import {
  CurrencyConversionView,
  OrderCustomerAddressView,
  OrderInput,
  OrderItemView,
  StoredOrder,
} from '../types/order.types';
import { parseOrderInput } from '../utils/order-payload';

export type ProcessOrderInput = {
  order_id?: string;
  payload: Record<string, unknown>;
};

export type ProcessOrderResult = {
  order_id: string;
  status: string;
};

const PROCESS_LOCK_TTL_MS = 30_000;
const LOCAL_CURRENCY = 'BRL';

@Injectable()
export class ProcessOrderUseCase {
  private readonly logger = new Logger(ProcessOrderUseCase.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly cache: RedisCacheService,
    private readonly viaCep: ViaCepService,
    private readonly frankfurter: FrankfurterService,
  ) {}

  async execute(input: ProcessOrderInput): Promise<ProcessOrderResult> {
    const draft = parseOrderInput(input.payload);
    const orderId =
      (typeof input.order_id === 'string' && input.order_id.trim()) ||
      draft.order_id;

    this.logger.log(`Processing order ${orderId}`);

    return await this.cache.withLock(
      `order-processor:${orderId}`,
      PROCESS_LOCK_TTL_MS,
      () => this.processOrder(orderId, draft),
    );
  }

  private async processOrder(
    orderId: string,
    draft: OrderInput,
  ): Promise<ProcessOrderResult> {
    const existing = await this.ensureReceived(orderId, draft);

    if (existing.status === ORDER_STATUS.FAILED_ENRICHMENT) {
      this.logger.warn(
        `Skipping order ${orderId}: status is ${ORDER_STATUS.FAILED_ENRICHMENT}`,
      );
      return { order_id: orderId, status: existing.status };
    }

    if (existing.currency_conversion) {
      this.logger.log(`Skipping order ${orderId}: enrichment already present`);
      return { order_id: orderId, status: existing.status };
    }

    this.logger.log(`Enriching order ${orderId}`);
    const address = await this.resolveAddress(existing);
    const conversion = await this.convertOrderCurrency(existing);
    const items = withConvertedPrices(existing.items, conversion);
    const customer = {
      email: existing.customer.email,
      name: existing.customer.name,
      ...(existing.customer.cep ? { cep: existing.customer.cep } : {}),
      ...(address ? { address } : {}),
    };

    const updated = await this.orders.updateEnrichment(orderId, {
      customer,
      items,
      status: ORDER_STATUS.RECEIVED,
      currency_conversion: conversion,
    });

    this.logger.log(
      `Order ${orderId} enriched (${conversion.from}->${conversion.to} rate=${conversion.rate}) status=${updated?.status ?? ORDER_STATUS.RECEIVED}`,
    );

    return {
      order_id: orderId,
      status: updated?.status ?? ORDER_STATUS.RECEIVED,
    };
  }

  private async ensureReceived(
    orderId: string,
    draft: OrderInput,
  ): Promise<StoredOrder> {
    const found =
      (await this.orders.findByOrderId(orderId)) ??
      (await this.orders.findByIdempotencyKey(draft.idempotency_key));

    if (found) {
      this.logger.debug(
        `Order ${orderId} already persisted with status=${found.status}`,
      );
      return found;
    }

    try {
      const created = await this.orders.create({
        ...draft,
        order_id: orderId,
        status: ORDER_STATUS.RECEIVED,
      });
      this.logger.log(
        `Persisted order ${orderId} with status ${ORDER_STATUS.RECEIVED}`,
      );
      return created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        this.logger.error(
          `Failed to persist order ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }

      const raced =
        (await this.orders.findByOrderId(orderId)) ??
        (await this.orders.findByIdempotencyKey(draft.idempotency_key));

      if (!raced) {
        throw error;
      }

      this.logger.warn(
        `Concurrent create for order ${orderId}; using existing document`,
      );
      return raced;
    }
  }

  private async resolveAddress(
    order: StoredOrder,
  ): Promise<OrderCustomerAddressView | undefined> {
    if (!order.customer.cep) {
      this.logger.debug(`Order ${order.order_id} has no CEP; skipping ViaCEP`);
      return undefined;
    }

    this.logger.log(
      `Validating CEP ${order.customer.cep} for order ${order.order_id}`,
    );
    const address = await this.viaCep.validate(order.customer.cep);
    this.logger.log(
      `ViaCEP resolved ${address.city}/${address.state} for order ${order.order_id}`,
    );
    return address;
  }

  private async convertOrderCurrency(
    order: StoredOrder,
  ): Promise<CurrencyConversionView> {
    this.logger.log(
      `Converting order ${order.order_id} total from ${order.currency} to ${LOCAL_CURRENCY}`,
    );
    const conversion = await this.frankfurter.convert(
      totalAmount(order.items),
      order.currency,
      LOCAL_CURRENCY,
    );

    return {
      from: conversion.from,
      to: conversion.to,
      rate: conversion.rate,
      amount: conversion.amount,
      converted_amount: conversion.converted_amount,
      date: conversion.date ?? new Date().toISOString().slice(0, 10),
    };
  }
}

function withConvertedPrices(
  items: OrderItemView[],
  conversion: CurrencyConversionView,
): OrderItemView[] {
  return items.map((item) => ({
    sku: item.sku,
    qty: item.qty,
    unit_price: item.unit_price,
    converted_unit_price: item.unit_price * conversion.rate,
    converted_currency: conversion.to,
  }));
}

function totalAmount(items: OrderItemView[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
