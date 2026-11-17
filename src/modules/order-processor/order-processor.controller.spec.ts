jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  GetOrderUseCase,
  OrderNotFoundError,
} from './use-cases/get-order.use-case';
import { ListOrdersQueryDto } from './dto/list-orders.query';
import { ListOrdersUseCase } from './use-cases/list-orders.use-case';
import {
  InvalidOrderPayloadError,
  ReceiveOrderUseCase,
} from './use-cases/receive-order.use-case';
import { OrderProcessorController } from './order-processor.controller';

function controllerWith(receive: ReceiveOrderUseCase) {
  return new OrderProcessorController(
    receive,
    { execute: jest.fn() } as unknown as ListOrdersUseCase,
    { execute: jest.fn() } as unknown as GetOrderUseCase,
  );
}

describe('OrderProcessorController', () => {
  it('should pass the request body to the receive-order use case', async () => {
    const execute = jest
      .fn<
        ReturnType<ReceiveOrderUseCase['execute']>,
        Parameters<ReceiveOrderUseCase['execute']>
      >()
      .mockResolvedValue({
        accepted: true,
        duplicate: false,
        order_id: 'ext-123',
      });
    const controller = controllerWith({
      execute,
    } as unknown as ReceiveOrderUseCase);
    const payload = {
      order_id: 'ext-123',
      customer: { email: 'user@example.com', name: 'Ana' },
      items: [{ sku: 'ABC123', qty: 2, unit_price: 59.9 }],
      currency: 'USD',
      idempotency_key: 'uuid-or-hash',
    };

    await expect(controller.receive(payload as never)).resolves.toEqual({
      accepted: true,
      duplicate: false,
      order_id: 'ext-123',
    });
    expect(execute).toHaveBeenCalledWith({ payload });
  });

  it('should turn an invalid payload into a bad request', async () => {
    const execute = jest
      .fn<
        ReturnType<ReceiveOrderUseCase['execute']>,
        Parameters<ReceiveOrderUseCase['execute']>
      >()
      .mockRejectedValue(new InvalidOrderPayloadError());
    const controller = controllerWith({
      execute,
    } as unknown as ReceiveOrderUseCase);

    await expect(controller.receive({} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should list orders with the optional status filter', async () => {
    const execute = jest.fn().mockResolvedValue([]);
    const controller = new OrderProcessorController(
      { execute: jest.fn() } as unknown as ReceiveOrderUseCase,
      { execute } as unknown as ListOrdersUseCase,
      { execute: jest.fn() } as unknown as GetOrderUseCase,
    );

    await expect(
      controller.list({ status: 'paid' } as ListOrdersQueryDto),
    ).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledWith('paid');
  });

  it('should return one order by id', async () => {
    const execute = jest.fn().mockResolvedValue({ order_id: 'ext-123' });
    const controller = new OrderProcessorController(
      { execute: jest.fn() } as unknown as ReceiveOrderUseCase,
      { execute: jest.fn() } as unknown as ListOrdersUseCase,
      { execute } as unknown as GetOrderUseCase,
    );

    await expect(controller.getById('ext-123')).resolves.toEqual({
      order_id: 'ext-123',
    });
    expect(execute).toHaveBeenCalledWith('ext-123');
  });

  it('should map a missing order to not found', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new OrderNotFoundError('missing'));
    const controller = new OrderProcessorController(
      { execute: jest.fn() } as unknown as ReceiveOrderUseCase,
      { execute: jest.fn() } as unknown as ListOrdersUseCase,
      { execute } as unknown as GetOrderUseCase,
    );

    await expect(controller.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
