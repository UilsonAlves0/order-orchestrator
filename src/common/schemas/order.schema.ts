import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ORDER_STATUS } from '../constants/order-status';

@Schema({ _id: false })
export class OrderCustomerAddress {
  @Prop({ type: String })
  cep?: string;

  @Prop({ type: String })
  street?: string;

  @Prop({ type: String })
  complement?: string;

  @Prop({ type: String })
  neighborhood?: string;

  @Prop({ type: String })
  city?: string;

  @Prop({ type: String })
  state?: string;

  @Prop({ type: String })
  ibge?: string;

  @Prop({ type: String })
  ddd?: string;
}

export const OrderCustomerAddressSchema =
  SchemaFactory.createForClass(OrderCustomerAddress);

@Schema({ _id: false })
export class OrderCustomer {
  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  cep?: string;

  @Prop({ type: OrderCustomerAddressSchema })
  address?: OrderCustomerAddress;
}

export const OrderCustomerSchema = SchemaFactory.createForClass(OrderCustomer);

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: String, required: true })
  sku: string;

  @Prop({ type: Number, required: true })
  qty: number;

  @Prop({ type: Number, required: true })
  unit_price: number;

  @Prop({ type: Number })
  converted_unit_price?: number;

  @Prop({ type: String })
  converted_currency?: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderCurrencyConversion {
  @Prop({ type: String, required: true })
  from: string;

  @Prop({ type: String, required: true })
  to: string;

  @Prop({ type: Number, required: true })
  rate: number;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: Number, required: true })
  converted_amount: number;

  @Prop({ type: String, required: true })
  date: string;
}

export const OrderCurrencyConversionSchema = SchemaFactory.createForClass(
  OrderCurrencyConversion,
);

@Schema({ collection: 'orders', versionKey: false, timestamps: true })
export class Order {
  @Prop({ type: String, required: true, unique: true })
  order_id: string;

  @Prop({ type: OrderCustomerSchema, required: true })
  customer: OrderCustomer;

  @Prop({ type: [OrderItemSchema], required: true, default: undefined })
  items: OrderItem[];

  @Prop({ type: String, required: true })
  currency: string;

  @Prop({ type: String, required: true, unique: true })
  idempotency_key: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.RECEIVED,
  })
  status: string;

  @Prop({ type: OrderCurrencyConversionSchema })
  currency_conversion?: OrderCurrencyConversion;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
