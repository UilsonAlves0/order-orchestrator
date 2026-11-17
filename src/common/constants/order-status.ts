export const ORDER_STATUS = {
  RECEIVED: 'RECEIVED',
  FAILED_ENRICHMENT: 'FAILED_ENRICHMENT',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
