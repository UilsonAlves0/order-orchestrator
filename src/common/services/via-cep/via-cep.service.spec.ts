import {
  InvalidCepError,
  ViaCepClient,
  ViaCepNotFoundError,
  ViaCepService,
  ViaCepUnavailableError,
} from './via-cep.service';

const address = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  unidade: '',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
  estado: 'São Paulo',
  regiao: 'Sudeste',
  ibge: '3550308',
  gia: '1004',
  ddd: '11',
  siafi: '7107',
};

function client(body: unknown, ok = true, status = 200) {
  const fetchFn = jest
    .fn<ReturnType<ViaCepClient['fetch']>, Parameters<ViaCepClient['fetch']>>()
    .mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    });

  return {
    http: { fetch: fetchFn } as ViaCepClient,
    fetchFn,
  };
}

describe('ViaCepService', () => {
  it('should validate a cep and return the address', async () => {
    const { http, fetchFn } = client(address);
    const service = new ViaCepService(http);

    await expect(service.validate('01001-000')).resolves.toEqual({
      cep: '01001000',
      street: 'Praça da Sé',
      complement: 'lado ímpar',
      neighborhood: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      ibge: '3550308',
      ddd: '11',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://viacep.com.br/ws/01001000/json/',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    );
  });

  it('should strip non-digits before calling ViaCEP', async () => {
    const { http, fetchFn } = client(address);
    const service = new ViaCepService(http);

    await service.validate('01.001-000');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://viacep.com.br/ws/01001000/json/',
      expect.any(Object),
    );
  });

  it('should reject a cep that is not eight digits', async () => {
    const { http, fetchFn } = client(address);
    const service = new ViaCepService(http);

    await expect(service.validate('123')).rejects.toBeInstanceOf(
      InvalidCepError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('should reject a cep that ViaCEP marks as missing', async () => {
    const { http } = client({ erro: true });
    const service = new ViaCepService(http);

    await expect(service.validate('99999999')).rejects.toBeInstanceOf(
      ViaCepNotFoundError,
    );
  });

  it('should reject when ViaCEP is unavailable', async () => {
    const { http } = client({}, false, 503);
    const service = new ViaCepService(http);

    await expect(service.validate('01001000')).rejects.toBeInstanceOf(
      ViaCepUnavailableError,
    );
  });
});
