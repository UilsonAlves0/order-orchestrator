import { Inject, Injectable, Logger } from '@nestjs/common';

export const FRANKFURTER_CLIENT = Symbol('FRANKFURTER_CLIENT');

export type FrankfurterClient = {
  fetch(
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
};

export type ExchangeRate = {
  date: string;
  base: string;
  quote: string;
  rate: number;
};

export type CurrencyConversion = {
  amount: number;
  from: string;
  to: string;
  rate: number;
  converted_amount: number;
  date: string | null;
};

type FrankfurterRateResponse = {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
};

export class InvalidCurrencyError extends Error {
  constructor(readonly currency: string) {
    super(`Currency must be a 3-letter ISO code: ${currency}`);
    this.name = 'InvalidCurrencyError';
  }
}

export class FrankfurterUnavailableError extends Error {
  constructor(readonly status: number) {
    super(`Frankfurter is unavailable with status ${status}`);
    this.name = 'FrankfurterUnavailableError';
  }
}

@Injectable()
export class FrankfurterService {
  private readonly logger = new Logger(FrankfurterService.name);

  constructor(
    @Inject(FRANKFURTER_CLIENT)
    private readonly client: FrankfurterClient,
  ) {}

  async getRate(from: string, to: string): Promise<ExchangeRate> {
    const base = normalizeCurrency(from);
    const quote = normalizeCurrency(to);
    this.logger.log(`Frankfurter rate request ${base}->${quote}`);

    const response = await this.client.fetch(
      `https://api.frankfurter.dev/v2/rate/${base}/${quote}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    );

    if (!response.ok) {
      this.logger.error(`Frankfurter unavailable status=${response.status}`);
      throw new FrankfurterUnavailableError(response.status);
    }

    const body = (await response.json()) as FrankfurterRateResponse;

    if (
      typeof body.date !== 'string' ||
      typeof body.base !== 'string' ||
      typeof body.quote !== 'string' ||
      typeof body.rate !== 'number' ||
      !Number.isFinite(body.rate)
    ) {
      this.logger.error(
        `Frankfurter invalid response for ${base}->${quote} status=${response.status}`,
      );
      throw new FrankfurterUnavailableError(response.status);
    }

    this.logger.log(
      `Frankfurter rate ${body.base}->${body.quote} rate=${body.rate} date=${body.date}`,
    );

    return {
      date: body.date,
      base: body.base,
      quote: body.quote,
      rate: body.rate,
    };
  }

  async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<CurrencyConversion> {
    const base = normalizeCurrency(from);
    const quote = normalizeCurrency(to);
    this.logger.log(`Frankfurter convert amount=${amount} ${base}->${quote}`);

    if (!Number.isFinite(amount)) {
      this.logger.warn(
        `Frankfurter convert rejected non-finite amount=${amount}`,
      );
      throw new Error('Amount must be a finite number');
    }

    if (base === quote) {
      this.logger.log(
        `Frankfurter convert skipped same currency ${base}; rate=1`,
      );
      return {
        amount,
        from: base,
        to: quote,
        rate: 1,
        converted_amount: amount,
        date: null,
      };
    }

    const rate = await this.getRate(base, quote);
    const converted = {
      amount,
      from: rate.base,
      to: rate.quote,
      rate: rate.rate,
      converted_amount: amount * rate.rate,
      date: rate.date,
    };

    this.logger.log(
      `Frankfurter convert result ${converted.from}->${converted.to} amount=${converted.amount} converted=${converted.converted_amount}`,
    );
    return converted;
  }
}

function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new InvalidCurrencyError(currency);
  }

  return normalized;
}
