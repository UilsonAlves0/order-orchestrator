import { registerAs } from '@nestjs/config';
import { AppConfig } from './config.type';

export default registerAs<AppConfig>('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.APP_PORT || process.env.PORT || 3000),
  apiPrefix: process.env.API_PREFIX || 'api',
  corsOrigins: (process.env.APP_CORS_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  databaseUrl: process.env.DATABASE_URL || 'mongodb://localhost:27017/api',
}));
