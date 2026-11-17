import { OrdersService } from '../services/orders.service';
import { GetOrderUseCase, OrderNotFoundError } from './get-order.use-case';

const storedOrder = {
  _id: '507f1f77bcf86cd799439011',
  order_id: 'ext-123',
  customer: { email: 'ada@example.com', name: 'Ada' },
  items: [{ sku: 'sku-1', qty: 1, unit_price: 5 }],
  currency: 'USD',
  idempotency_key: 'idem-1',
  status: 'RECEIVED',
  createdAt: new Date('2026-11-16T12:00:00.000Z'),
  updatedAt: new Date('2026-11-16T12:00:00.000Z'),
};

describe('GetOrderUseCase', () => {
  it('should return the order loaded by order_id', async () => {
    const findByOrderId = jest.fn().mockResolvedValue(storedOrder);
    const useCase = new GetOrderUseCase({
      findByOrderId,
    } as unknown as OrdersService);

    await expect(useCase.execute('ext-123')).resolves.toMatchObject({
      id: storedOrder._id,
      order_id: 'ext-123',
      status: 'RECEIVED',
    });
    expect(findByOrderId).toHaveBeenCalledWith('ext-123');
  });

  it('should reject an unknown order id', async () => {
    const findByOrderId = jest.fn().mockResolvedValue(null);
    const useCase = new GetOrderUseCase({
      findByOrderId,
    } as unknown as OrdersService);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});
