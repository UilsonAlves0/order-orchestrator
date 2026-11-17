import { ORDER_STATUS } from '../../../common/constants/order-status';
import { OrderInput } from '../types/order.types';

export class InvalidOrderPayloadError extends Error {
  constructor(message = 'Order payload is invalid') {
    super(message);
    this.name = 'InvalidOrderPayloadError';
  }
}

export function parseOrderInput(payload: unknown): OrderInput {
  if (!isPlainObject(payload)) {
    throw new InvalidOrderPayloadError('Order payload must be an object');
  }

  const orderId = readRequiredString(payload.order_id, 'order_id');
  const idempotencyKey = readRequiredString(
    payload.idempotency_key,
    'idempotency_key',
  );
  const currency = readRequiredString(payload.currency, 'currency');
  const customer = readCustomer(payload.customer);
  const items = readItems(payload.items);

  return {
    order_id: orderId,
    customer,
    items,
    currency,
    idempotency_key: idempotencyKey,
    status: ORDER_STATUS.RECEIVED,
  };
}

function readCustomer(value: unknown): OrderInput['customer'] {
  if (!isPlainObject(value)) {
    throw new InvalidOrderPayloadError(
      'Order payload requires a customer object',
    );
  }

  const email = readRequiredString(value.email, 'customer.email');
  const name = readRequiredString(value.name, 'customer.name');
  const cep =
    typeof value.cep === 'string' && value.cep.trim() !== ''
      ? value.cep.trim()
      : undefined;

  return {
    email,
    name,
    ...(cep ? { cep } : {}),
  };
}

function readItems(value: unknown): OrderInput['items'] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidOrderPayloadError('Order payload requires items');
  }

  return value.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new InvalidOrderPayloadError(
        `Order payload item at index ${index} is invalid`,
      );
    }

    const sku = readRequiredString(item.sku, `items[${index}].sku`);
    const qty = item.qty;
    const unitPrice = item.unit_price;

    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1) {
      throw new InvalidOrderPayloadError(
        `Order payload item at index ${index} requires a qty`,
      );
    }

    if (
      typeof unitPrice !== 'number' ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new InvalidOrderPayloadError(
        `Order payload item at index ${index} requires a unit_price`,
      );
    }

    return {
      sku,
      qty,
      unit_price: unitPrice,
    };
  });
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidOrderPayloadError(`Order payload requires a ${field}`);
  }

  return value.trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
