import { Model } from 'mongoose';
import { OrderDocument } from '../../../common/schemas/order.schema';
import { OrdersService } from './orders.service';

const storedOrder = {
  _id: '507f1f77bcf86cd799439011',
  order_id: 'ext-123',
  customer: { email: 'ada@example.com', name: 'Ada' },
  items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
  currency: 'USD',
  idempotency_key: 'idem-1',
  status: 'paid',
};

function listModel(rows: unknown[]) {
  const exec = jest.fn().mockResolvedValue(rows);
  const lean = jest.fn().mockReturnValue({ exec });
  const sort = jest.fn().mockReturnValue({ lean });
  const find = jest.fn().mockReturnValue({ sort });

  return {
    model: { find } as unknown as Model<OrderDocument>,
    find,
    sort,
  };
}

function detailModel(row: unknown) {
  const exec = jest.fn().mockResolvedValue(row);
  const lean = jest.fn().mockReturnValue({ exec });
  const findOne = jest.fn().mockReturnValue({ lean });

  return {
    model: { findOne } as unknown as Model<OrderDocument>,
    findOne,
  };
}

describe('OrdersService', () => {
  it('should list orders newest first when no status is given', async () => {
    const { model, find, sort } = listModel([storedOrder]);
    const service = new OrdersService(model);

    await expect(service.findAll()).resolves.toEqual([storedOrder]);
    expect(find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('should filter by a trimmed status', async () => {
    const { model, find } = listModel([]);
    const service = new OrdersService(model);

    await expect(service.findAll('  paid  ')).resolves.toEqual([]);
    expect(find).toHaveBeenCalledWith({ status: 'paid' });
  });

  it('should ignore a blank status filter', async () => {
    const { model, find } = listModel([]);
    const service = new OrdersService(model);

    await service.findAll('   ');
    expect(find).toHaveBeenCalledWith({});
  });

  it('should load one order by order_id', async () => {
    const { model, findOne } = detailModel(storedOrder);
    const service = new OrdersService(model);

    await expect(service.findByOrderId('ext-123')).resolves.toEqual(
      storedOrder,
    );
    expect(findOne).toHaveBeenCalledWith({ order_id: 'ext-123' });
  });

  it('should return null when the order id does not exist', async () => {
    const { model } = detailModel(null);
    const service = new OrdersService(model);

    await expect(service.findByOrderId('missing')).resolves.toBeNull();
  });

  it('should create an order and return the stored document', async () => {
    const input = {
      order_id: 'ext-123',
      customer: { email: 'ada@example.com', name: 'Ada' },
      items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
      currency: 'USD',
      idempotency_key: 'idem-1',
      status: 'RECEIVED',
    };
    const create = jest.fn().mockResolvedValue({
      toObject: () => storedOrder,
    });
    const service = new OrdersService({
      create,
    } as unknown as Model<OrderDocument>);

    await expect(service.create(input)).resolves.toEqual(storedOrder);
    expect(create).toHaveBeenCalledWith(input);
  });

  it('should load one order by idempotency key', async () => {
    const { model, findOne } = detailModel(storedOrder);
    const service = new OrdersService(model);

    await expect(service.findByIdempotencyKey('idem-1')).resolves.toEqual(
      storedOrder,
    );
    expect(findOne).toHaveBeenCalledWith({ idempotency_key: 'idem-1' });
  });

  it('should update enrichment fields by order_id', async () => {
    const exec = jest.fn().mockResolvedValue(storedOrder);
    const lean = jest.fn().mockReturnValue({ exec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const service = new OrdersService({
      findOneAndUpdate,
    } as unknown as Model<OrderDocument>);
    const update = {
      customer: { email: 'ada@example.com', name: 'Ada' },
      items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
      status: 'RECEIVED',
      currency_conversion: {
        from: 'USD',
        to: 'BRL',
        rate: 5,
        amount: 20,
        converted_amount: 100,
        date: '2026-11-16',
      },
    };

    await expect(service.updateEnrichment('ext-123', update)).resolves.toEqual(
      storedOrder,
    );
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { order_id: 'ext-123' },
      {
        $set: {
          customer: update.customer,
          items: update.items,
          status: 'RECEIVED',
          currency_conversion: update.currency_conversion,
        },
      },
      { new: true },
    );
  });

  it('should update only the status by order_id', async () => {
    const exec = jest.fn().mockResolvedValue(storedOrder);
    const lean = jest.fn().mockReturnValue({ exec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const service = new OrdersService({
      findOneAndUpdate,
    } as unknown as Model<OrderDocument>);

    await expect(
      service.updateStatus('ext-123', 'FAILED_ENRICHMENT'),
    ).resolves.toEqual(storedOrder);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { order_id: 'ext-123' },
      { $set: { status: 'FAILED_ENRICHMENT' } },
      { new: true },
    );
  });
});
