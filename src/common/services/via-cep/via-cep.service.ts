import { Inject, Injectable, Logger } from '@nestjs/common';

export const VIA_CEP_CLIENT = Symbol('VIA_CEP_CLIENT');

export type ViaCepClient = {
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

export type ViaCepAddress = {
  cep: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  ibge: string;
  ddd: string;
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  ddd?: string;
  erro?: boolean | string;
};

export class InvalidCepError extends Error {
  constructor(readonly cep: string) {
    super(`CEP must contain exactly 8 digits: ${cep}`);
    this.name = 'InvalidCepError';
  }
}

export class ViaCepNotFoundError extends Error {
  constructor(readonly cep: string) {
    super(`CEP not found: ${cep}`);
    this.name = 'ViaCepNotFoundError';
  }
}

export class ViaCepUnavailableError extends Error {
  constructor(readonly status: number) {
    super(`ViaCEP is unavailable with status ${status}`);
    this.name = 'ViaCepUnavailableError';
  }
}

@Injectable()
export class ViaCepService {
  private readonly logger = new Logger(ViaCepService.name);

  constructor(
    @Inject(VIA_CEP_CLIENT)
    private readonly client: ViaCepClient,
  ) {}

  async validate(cep: string): Promise<ViaCepAddress> {
    const digits = normalizeCep(cep);
    this.logger.log(`ViaCEP request cep=${digits}`);

    if (digits.length !== 8) {
      this.logger.warn(`ViaCEP invalid cep=${cep}`);
      throw new InvalidCepError(cep);
    }

    const response = await this.client.fetch(
      `https://viacep.com.br/ws/${digits}/json/`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    );

    if (!response.ok) {
      this.logger.error(`ViaCEP unavailable status=${response.status}`);
      throw new ViaCepUnavailableError(response.status);
    }

    const body = (await response.json()) as ViaCepResponse;

    if (body.erro === true || body.erro === 'true') {
      this.logger.warn(`ViaCEP not found cep=${digits}`);
      throw new ViaCepNotFoundError(digits);
    }

    const address = {
      cep: digits,
      street: body.logradouro ?? '',
      complement: body.complemento ?? '',
      neighborhood: body.bairro ?? '',
      city: body.localidade ?? '',
      state: body.uf ?? '',
      ibge: body.ibge ?? '',
      ddd: body.ddd ?? '',
    };

    this.logger.log(
      `ViaCEP success cep=${digits} city=${address.city} state=${address.state}`,
    );
    return address;
  }
}

function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, '');
}
