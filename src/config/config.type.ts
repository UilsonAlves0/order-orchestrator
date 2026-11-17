export type AppConfig = {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  databaseUrl: string;
};

export type QueueConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: boolean;
  prefix: string;
};

export type AllConfigType = {
  app: AppConfig;
  queue: QueueConfig;
};
