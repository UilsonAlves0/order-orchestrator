import { OrdersService } from '../services/orders.service';
import { ListOrdersUseCase } from './list-orders.use-case';

const storedOrder = {
  _id: '507f1f77bcf86cd799439011',
  order_id: 'ext-123',
  customer: { email: 'ada@example.com', name: 'Ada' },
  items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
  currency: 'USD',
  idempotency_key: 'idem-1',
  status: 'paid',
  createdAt: new Date('2026-11-16T12:00:00.000Z'),
  updatedAt: new Date('2026-11-16T12:05:00.000Z'),
};

describe('ListOrdersUseCase', () => {
  it('should map the orders returned by the service', async () => {
    const findAll = jest.fn().mockResolvedValue([storedOrder]);
    const useCase = new ListOrdersUseCase({
      findAll,
    } as unknown as OrdersService);

    await expect(useCase.execute('paid')).resolves.toEqual([
      {
        id: storedOrder._id,
        order_id: 'ext-123',
        customer: { email: 'ada@example.com', name: 'Ada' },
        items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
        currency: 'USD',
        idempotency_key: 'idem-1',
        status: 'paid',
        created_at: storedOrder.createdAt,
        updated_at: storedOrder.updatedAt,
      },
    ]);
    expect(findAll).toHaveBeenCalledWith('paid');
  });
});
