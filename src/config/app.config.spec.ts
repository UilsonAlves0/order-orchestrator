import appConfig from './app.config';

const ENV_KEYS = [
  'NODE_ENV',
  'APP_PORT',
  'PORT',
  'API_PREFIX',
  'APP_CORS_ORIGINS',
  'DATABASE_URL',
] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();

  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  }
}

describe('appConfig', () => {
  it('should use safe defaults when env is empty', () => {
    withEnv({}, () => {
      expect(appConfig()).toEqual({
        nodeEnv: 'development',
        port: 3000,
        apiPrefix: 'api',
        corsOrigins: ['*'],
        databaseUrl: 'mongodb://localhost:27017/api',
      });
    });
  });

  it('should read port, prefix, cors, and database url from env', () => {
    withEnv(
      {
        NODE_ENV: 'production',
        APP_PORT: '4000',
        API_PREFIX: 'v1-api',
        APP_CORS_ORIGINS: 'http://localhost:3000, https://app.example',
        DATABASE_URL: 'mongodb://mongo:27017/orders',
      },
      () => {
        expect(appConfig()).toEqual({
          nodeEnv: 'production',
          port: 4000,
          apiPrefix: 'v1-api',
          corsOrigins: ['http://localhost:3000', 'https://app.example'],
          databaseUrl: 'mongodb://mongo:27017/orders',
        });
      },
    );
  });
});
