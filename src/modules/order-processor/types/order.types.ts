import { OrderStatus } from '../../../common/constants/order-status';

export type OrderCustomerAddressView = {
  cep?: string;
  street?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  ibge?: string;
  ddd?: string;
};

export type OrderItemView = {
  sku: string;
  qty: number;
  unit_price: number;
  converted_unit_price?: number;
  converted_currency?: string;
};

export type CurrencyConversionView = {
  from: string;
  to: string;
  rate: number;
  amount: number;
  converted_amount: number;
  date: string;
};

export type OrderView = {
  id: string;
  order_id: string;
  customer: {
    email: string;
    name: string;
    cep?: string;
    address?: OrderCustomerAddressView;
  };
  items: OrderItemView[];
  currency: string;
  idempotency_key: string;
  status: OrderStatus | string | null;
  currency_conversion?: CurrencyConversionView;
  created_at: Date | null;
  updated_at: Date | null;
};

export type OrderInput = {
  order_id: string;
  customer: {
    email: string;
    name: string;
    cep?: string;
    address?: OrderCustomerAddressView;
  };
  items: OrderItemView[];
  currency: string;
  idempotency_key: string;
  status: OrderStatus | string;
  currency_conversion?: CurrencyConversionView;
};

export type OrderEnrichmentUpdate = {
  customer: OrderInput['customer'];
  items: OrderItemView[];
  status: OrderStatus | string;
  currency_conversion?: CurrencyConversionView;
};

export type StoredOrder = OrderInput & {
  _id: unknown;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export function toOrderView(order: StoredOrder): OrderView {
  return {
    id: String(order._id),
    order_id: order.order_id,
    customer: {
      email: order.customer.email,
      name: order.customer.name,
      ...(order.customer.cep ? { cep: order.customer.cep } : {}),
      ...(order.customer.address
        ? { address: { ...order.customer.address } }
        : {}),
    },
    items: order.items.map((item) => ({
      sku: item.sku,
      qty: item.qty,
      unit_price: item.unit_price,
      ...(item.converted_unit_price !== undefined
        ? { converted_unit_price: item.converted_unit_price }
        : {}),
      ...(item.converted_currency
        ? { converted_currency: item.converted_currency }
        : {}),
    })),
    currency: order.currency,
    idempotency_key: order.idempotency_key,
    status: order.status ?? null,
    ...(order.currency_conversion
      ? { currency_conversion: { ...order.currency_conversion } }
      : {}),
    created_at: order.createdAt ?? null,
    updated_at: order.updatedAt ?? null,
  };
}
