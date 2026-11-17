export type OrderProcessorJobData = {
  order_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
};

export type OrderProcessorDeadLetterData = {
  jobId: string;
  jobName: string;
  order_id?: string;
  idempotency_key?: string;
  payload?: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
};
