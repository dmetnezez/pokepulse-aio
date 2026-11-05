import type { DataSource, Product, RetailerId, StockStatus } from '../../types';

export interface CheckResult {
  status: StockStatus;
  price: number | null;
  currency: 'CAD';
  source: DataSource;
  latencyMs: number;
  title?: string;
  imageUrl?: string;
}

export type IntegrationErrorCode = 'NOT_CONFIGURED' | 'NOT_AVAILABLE' | 'BAD_INPUT' | 'UPSTREAM' | 'RATE_LIMITED' | 'TIMEOUT';

export class IntegrationError extends Error {
  constructor(
    public code: IntegrationErrorCode,
    message: string,
    /** retryable errors back off exponentially; non-retryable ones park the task in `error` */
    public retryable = true,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export interface RetailerAdapter {
  readonly id: string;
  readonly source: DataSource;
  readonly retailers: RetailerId[] | '*';
  isConfigured(): boolean;
  check(product: Product): Promise<CheckResult>;
}
