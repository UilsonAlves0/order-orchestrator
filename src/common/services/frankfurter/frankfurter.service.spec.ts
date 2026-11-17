import {
  FrankfurterClient,
  FrankfurterService,
  FrankfurterUnavailableError,
  InvalidCurrencyError,
} from './frankfurter.service';

const rateBody = {
  date: '2026-11-16',
  base: 'USD',
  quote: 'BRL',
  rate: 5.6703,
};

function client(body: unknown, ok = true, status = 200) {
  const fetchFn = jest
    .fn<
      ReturnType<FrankfurterClient['fetch']>,
      Parameters<FrankfurterClient['fetch']>
    >()
    .mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    });

  return {
    http: { fetch: fetchFn } as FrankfurterClient,
    fetchFn,
  };
}

describe('FrankfurterService', () => {
  it('should fetch the exchange rate between two currencies', async () => {
    const { http, fetchFn } = client(rateBody);
    const service = new FrankfurterService(http);

    await expect(service.getRate('usd', 'brl')).resolves.toEqual({
      date: '2026-11-16',
      base: 'USD',
      quote: 'BRL',
      rate: 5.6703,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v2/rate/USD/BRL',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    );
  });

  it('should convert an amount using the fetched rate', async () => {
    const { http } = client(rateBody);
    const service = new FrankfurterService(http);

    await expect(service.convert(10, 'USD', 'BRL')).resolves.toEqual({
      amount: 10,
      from: 'USD',
      to: 'BRL',
      rate: 5.6703,
      converted_amount: 56.703,
      date: '2026-11-16',
    });
  });

  it('should skip the network call when currencies match', async () => {
    const { http, fetchFn } = client(rateBody);
    const service = new FrankfurterService(http);

    await expect(service.convert(10, 'BRL', 'brl')).resolves.toEqual({
      amount: 10,
      from: 'BRL',
      to: 'BRL',
      rate: 1,
      converted_amount: 10,
      date: null,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('should reject an invalid currency code before calling Frankfurter', async () => {
    const { http, fetchFn } = client(rateBody);
    const service = new FrankfurterService(http);

    await expect(service.getRate('US', 'BRL')).rejects.toBeInstanceOf(
      InvalidCurrencyError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('should reject when Frankfurter is unavailable', async () => {
    const { http } = client({}, false, 503);
    const service = new FrankfurterService(http);

    await expect(service.getRate('USD', 'BRL')).rejects.toBeInstanceOf(
      FrankfurterUnavailableError,
    );
  });

  it('should reject when the rate payload is incomplete', async () => {
    const { http } = client({ date: '2026-11-16', base: 'USD' });
    const service = new FrankfurterService(http);

    await expect(service.getRate('USD', 'BRL')).rejects.toBeInstanceOf(
      FrankfurterUnavailableError,
    );
  });
});
