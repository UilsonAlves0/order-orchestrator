import { ORDER_STATUS } from '../../../common/constants/order-status';
import { FrankfurterService } from '../../../common/services/frankfurter/frankfurter.service';
import {
  CacheLockBusyError,
  RedisCacheService,
} from '../../../common/services/redis-cache/redis-cache.service';
import { ViaCepService } from '../../../common/services/via-cep/via-cep.service';
import { OrdersService } from '../services/orders.service';
import { StoredOrder } from '../types/order.types';
import { ProcessOrderUseCase } from './process-order.use-case';

const payload = {
  order_id: 'ext-123',
  currency: 'USD',
  idempotency_key: 'idem-1',
  customer: {
    email: 'ada@example.com',
    name: 'Ada',
    cep: '01001-000',
  },
  items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
};

const receivedOrder: StoredOrder = {
  _id: '1',
  order_id: 'ext-123',
  customer: {
    email: 'ada@example.com',
    name: 'Ada',
    cep: '01001-000',
  },
  items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
  currency: 'USD',
  idempotency_key: 'idem-1',
  status: ORDER_STATUS.RECEIVED,
};

const address = {
  cep: '01001000',
  street: 'Praça da Sé',
  complement: 'lado ímpar',
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
  ibge: '3550308',
  ddd: '11',
};

const conversion = {
  amount: 20,
  from: 'USD',
  to: 'BRL',
  rate: 5,
  converted_amount: 100,
  date: '2026-11-16',
};

function processing(existing: StoredOrder | null = receivedOrder) {
  const findByOrderId = jest
    .fn<Promise<StoredOrder | null>, [string]>()
    .mockResolvedValue(existing);
  const findByIdempotencyKey = jest
    .fn<Promise<StoredOrder | null>, [string]>()
    .mockResolvedValue(null);
  const create = jest.fn().mockResolvedValue(receivedOrder);
  const withLock = jest.fn(
    <T>(_key: string, _ttlMs: number, work: () => Promise<T>) => work(),
  );
  const validate = jest.fn().mockResolvedValue(address);
  const convert = jest.fn().mockResolvedValue(conversion);
  const updateEnrichment = jest.fn().mockResolvedValue({
    ...receivedOrder,
    status: ORDER_STATUS.RECEIVED,
    currency_conversion: conversion,
  });
  const useCase = new ProcessOrderUseCase(
    {
      findByOrderId,
      findByIdempotencyKey,
      create,
      updateEnrichment,
    } as unknown as OrdersService,
    { withLock } as unknown as RedisCacheService,
    { validate } as unknown as ViaCepService,
    { convert } as unknown as FrankfurterService,
  );

  return {
    useCase,
    findByOrderId,
    findByIdempotencyKey,
    create,
    withLock,
    validate,
    convert,
    updateEnrichment,
  };
}

describe('ProcessOrderUseCase', () => {
  it('should create RECEIVED when missing, then enrich keeping RECEIVED', async () => {
    const {
      useCase,
      findByOrderId,
      create,
      withLock,
      validate,
      convert,
      updateEnrichment,
    } = processing(null);

    await expect(useCase.execute({ payload })).resolves.toEqual({
      order_id: 'ext-123',
      status: ORDER_STATUS.RECEIVED,
    });
    expect(withLock).toHaveBeenCalledWith(
      'order-processor:ext-123',
      30_000,
      expect.any(Function),
    );
    expect(findByOrderId).toHaveBeenCalledWith('ext-123');
    expect(create).toHaveBeenCalledWith({
      order_id: 'ext-123',
      customer: {
        email: 'ada@example.com',
        name: 'Ada',
        cep: '01001-000',
      },
      items: [{ sku: 'sku-1', qty: 2, unit_price: 10 }],
      currency: 'USD',
      idempotency_key: 'idem-1',
      status: ORDER_STATUS.RECEIVED,
    });
    expect(validate).toHaveBeenCalledWith('01001-000');
    expect(convert).toHaveBeenCalledWith(20, 'USD', 'BRL');
    expect(updateEnrichment).toHaveBeenCalledWith(
      'ext-123',
      expect.objectContaining({ status: ORDER_STATUS.RECEIVED }),
    );
  });

  it('should enrich an already RECEIVED order without creating again', async () => {
    const { useCase, create, updateEnrichment } = processing();

    await useCase.execute({ payload });

    expect(create).not.toHaveBeenCalled();
    expect(updateEnrichment).toHaveBeenCalledWith('ext-123', {
      customer: {
        email: 'ada@example.com',
        name: 'Ada',
        cep: '01001-000',
        address,
      },
      items: [
        {
          sku: 'sku-1',
          qty: 2,
          unit_price: 10,
          converted_unit_price: 50,
          converted_currency: 'BRL',
        },
      ],
      status: ORDER_STATUS.RECEIVED,
      currency_conversion: {
        from: 'USD',
        to: 'BRL',
        rate: 5,
        amount: 20,
        converted_amount: 100,
        date: '2026-11-16',
      },
    });
  });

  it('should convert currency without ViaCEP when cep is absent', async () => {
    const orderWithoutCep: StoredOrder = {
      ...receivedOrder,
      customer: { email: 'ada@example.com', name: 'Ada' },
    };
    const { useCase, validate, updateEnrichment } = processing(orderWithoutCep);

    await useCase.execute({
      payload: {
        ...payload,
        customer: { email: 'ada@example.com', name: 'Ada' },
      },
    });

    expect(validate).not.toHaveBeenCalled();
    expect(updateEnrichment).toHaveBeenCalledWith(
      'ext-123',
      expect.objectContaining({
        customer: { email: 'ada@example.com', name: 'Ada' },
        status: ORDER_STATUS.RECEIVED,
      }),
    );
  });

  it('should skip enrichment when currency conversion already exists', async () => {
    const { useCase, create, validate, convert, updateEnrichment } = processing(
      {
        ...receivedOrder,
        status: ORDER_STATUS.RECEIVED,
        currency_conversion: {
          from: 'USD',
          to: 'BRL',
          rate: 5,
          amount: 20,
          converted_amount: 100,
          date: '2026-11-16',
        },
      },
    );

    await expect(useCase.execute({ payload })).resolves.toEqual({
      order_id: 'ext-123',
      status: ORDER_STATUS.RECEIVED,
    });
    expect(create).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
    expect(updateEnrichment).not.toHaveBeenCalled();
  });

  it('should reject processing when the lock is already held', async () => {
    const findByOrderId = jest.fn<Promise<null>, [string]>();
    const withLock = jest
      .fn()
      .mockRejectedValue(new CacheLockBusyError('order-processor:ext-123'));
    const useCase = new ProcessOrderUseCase(
      { findByOrderId } as unknown as OrdersService,
      { withLock } as unknown as RedisCacheService,
      { validate: jest.fn() } as unknown as ViaCepService,
      { convert: jest.fn() } as unknown as FrankfurterService,
    );

    await expect(useCase.execute({ payload })).rejects.toBeInstanceOf(
      CacheLockBusyError,
    );
    expect(findByOrderId).not.toHaveBeenCalled();
  });

  it('should reject a payload without an order id before taking the lock', async () => {
    const { useCase, withLock } = processing();

    await expect(useCase.execute({ payload: {} })).rejects.toThrow(
      'Order payload requires a order_id',
    );
    expect(withLock).not.toHaveBeenCalled();
  });
});
