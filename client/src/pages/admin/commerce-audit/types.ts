export interface AuditSummary {
  period: { from: string | null; to: string | null };
  payments: {
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
    refunded: number;
    revenueKopecks: number;
    revenueFormatted: string;
  };
  orders: { total: number; paid: number; pending: number; cancelled: number; failed: number };
  ledger: {
    total: number;
    readerEarningsKopecks: number;
    platformFeeKopecks: number;
    acquiringFeeKopecks: number;
  };
  entitlements: { active: number; revoked: number; expired: number };
  discrepancies: { total: number; byType: Record<string, number> };
  byProvider: Array<{ provider: string; count: number; revenueKopecks: number }>;
  byProductType: Array<{ productType: string; count: number; revenueKopecks: number }>;
}

export interface AuditPayment {
  id: string;
  status: string;
  amountRub: number;
  amountKopecks: number;
  amountFormatted: string;
  providerPaymentId: string | null;
  createdAt: string;
  order: { id: string; status: string; userId: string; productId: string } | null;
  provider: { code: string; name: string } | null;
  product: { id: string; title: string; type: string; scopeType: string; scopeId: string | null } | null;
  user: { id: string; username: string; email: string } | null;
}

export interface AuditListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditOrder {
  id: string;
  paymentId: string | null;
  status: string;
  amountRub: number;
  amountKopecks: number;
  amountFormatted: string;
  userId: string;
  createdAt: string;
  product: { id: string; title: string; type: string } | null;
  user: { id: string; username: string; email: string } | null;
}

export interface AuditLedgerEntry {
  id: string;
  status: string;
  entryType: string;
  amountKopecks: number;
  amountFormatted: string;
  paymentId: string;
  orderId: string;
  clubId: string | null;
  readerUserId: string | null;
  createdAt: string;
  product: { id: string; title: string } | null;
}

export interface AuditEntitlement {
  id: string;
  status: string;
  featureKey: string;
  sourceType: string;
  sourceId: string | null;
  userId: string;
  scopeType: string;
  scopeId: string | null;
  createdAt: string;
  user: { id: string; username: string; email: string } | null;
}

export interface AuditEvent {
  id: string;
  paymentId: string | null;
  status: string;
  eventType: string;
  providerCode: string;
  providerPaymentId: string | null;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
}

export interface Discrepancy {
  type: string;
  severity: "critical" | "warning";
  entityType: string;
  entityId: string;
  description: string;
  details?: unknown;
}

export interface DiscrepancyListResult extends AuditListResult<Discrepancy> {
  byType: Record<string, number>;
}

export interface FinancialResetPreview {
  canExecute: boolean;
  alreadyExecuted: boolean;
  executed: { executedAt: string; executedBy: string; summary: unknown } | null;
  executorRequired: { id: string; email: string; username: string; createdAt: string } | null;
  isCurrentUserExecutor: boolean;
  confirmationPhrase: string;
  counts: Record<string, number>;
  warnings: string[];
}

export interface FinancialResetResult {
  executed: boolean;
  summary: Record<string, number>;
}

export interface PaymentDetails {
  payment: AuditPayment & { fiscalReceiptId: string | null; fiscalReceiptUrl: string | null };
  provider: { id: string; code: string; name: string; status: string } | null;
  order: (AuditOrder & { productId: string; priceId: string }) | null;
  product: { id: string; title: string; type: string; scopeType: string; scopeId: string | null } | null;
  price: { id: string; amountRub: number; period: string } | null;
  user: { id: string; username: string; email: string } | null;
  events: AuditEvent[];
  entitlements: AuditEntitlement[];
  ledger: AuditLedgerEntry[];
  tariffAssignments: Array<{ id: string; readerShareBps: number; acquiringFeeBps: number; status: string }>;
  memberships: Array<{ id: string; clubId: string; role: string; isActive: boolean }>;
  diagnostics: {
    hasOrder: boolean;
    hasProvider: boolean;
    hasProviderEvent: boolean;
    hasEntitlement: boolean;
    hasMembershipOrGrant: boolean;
    hasLedgerEntries: boolean;
    ledgerAmountKopecks: number;
    paymentAmountKopecks: number;
    ledgerAmountMatchesPayment: boolean | null;
  };
}

export interface FilterState {
  from: string;
  to: string;
  status: string;
  provider: string;
  productType: string;
  scopeType: string;
  scopeId: string;
  userId: string;
  search: string;
}
