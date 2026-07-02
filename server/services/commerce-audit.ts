/**
 * Финансовый аудит платежей VoxLibris.
 *
 * Сервис предоставляет read-only доступ к цепочке коммерческих сущностей
 * (orders → payments → events → entitlements → ledger) и обнаруживает
 * расхождения между ними. Все методы возвращают санитизированные данные:
 * без encrypted_credentials, paymentMethodToken, raw webhook payload.
 */
import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.js';
import { logger } from '../lib/logger.js';
import {
  clubMembers,
  commerceEntitlements,
  commerceLedgerEntries,
  commerceOrders,
  commercePaymentEvents,
  commercePayments,
  commercePrices,
  commerceProductFeatures,
  commerceProducts,
  paymentProviders,
  readerClubTariffAssignments,
  users,
  type CommercePaymentEventStatus,
  type PaymentProviderCode,
} from '../../shared/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Типы фильтров и пагинации
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditFilters {
  from?: Date;
  to?: Date;
  status?: string;
  provider?: string;
  productType?: string;
  scopeType?: string;
  scopeId?: string;
  userId?: string;
  recipientUserId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface AuditListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditPagination {
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function auditLimit(limit?: number) {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function auditOffset(offset?: number) {
  return Math.max(offset ?? 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Форматирование сумм
// ─────────────────────────────────────────────────────────────────────────────

export interface MoneyAmount {
  amountKopecks: number;
  amountFormatted: string;
}

/** Преобразует рубли в копейки и форматирует в «490 руб. 00 коп.». */
export function rubToMoney(amountRub: number): MoneyAmount {
  const kopecks = Math.round(amountRub * 100);
  const rub = Math.floor(kopecks / 100);
  const kop = kopecks % 100;
  return { amountKopecks: kopecks, amountFormatted: `${rub} руб. ${String(kop).padStart(2, '0')} коп.` };
}

/** Форматирует копейки напрямую. */
export function kopecksToMoney(amountKopecks: number): MoneyAmount {
  const rub = Math.floor(amountKopecks / 100);
  const kop = amountKopecks % 100;
  return { amountKopecks, amountFormatted: `${rub} руб. ${String(kop).padStart(2, '0')} коп.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Санитизация
// ─────────────────────────────────────────────────────────────────────────────

function sanitizePayment(payment: typeof commercePayments.$inferSelect) {
  const { paymentMethodToken: _token, ...rest } = payment;
  return { ...rest, amountUnit: 'rub' as const, ...rubToMoney(payment.amountRub) };
}

function sanitizeOrder(order: typeof commerceOrders.$inferSelect) {
  return { ...order, amountUnit: 'rub' as const, ...rubToMoney(order.amountRub) };
}

function sanitizeLedgerEntry(entry: typeof commerceLedgerEntries.$inferSelect) {
  return { ...entry, amountUnit: 'kopecks' as const, ...kopecksToMoney(entry.amountKopecks) };
}

function sanitizeEvent(event: typeof commercePaymentEvents.$inferSelect) {
  // payloadHash — не секрет, но raw payload не хранится в БД по дизайну.
  return event;
}

function sanitizeEntitlement(entitlement: typeof commerceEntitlements.$inferSelect) {
  return entitlement;
}

// ─────────────────────────────────────────────────────────────────────────────
// Сводка
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditSummary {
  period: { from: Date | null; to: Date | null };
  payments: {
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
    refunded: number;
    revenueKopecks: number;
    revenueFormatted: string;
  };
  orders: {
    total: number;
    paid: number;
    pending: number;
    cancelled: number;
    failed: number;
  };
  ledger: {
    total: number;
    readerEarningsKopecks: number;
    platformFeeKopecks: number;
    acquiringFeeKopecks: number;
  };
  entitlements: {
    active: number;
    revoked: number;
    expired: number;
  };
  discrepancies: {
    total: number;
    byType: Record<string, number>;
  };
  byProvider: Array<{ provider: string; count: number; revenueKopecks: number }>;
  byProductType: Array<{ productType: string; count: number; revenueKopecks: number }>;
}

export async function financialAuditSummary(filters: AuditFilters = {}): Promise<AuditSummary> {
  const from = filters.from ?? null;
  const to = filters.to ?? null;

  const dateCondPayments = [
    from ? gte(commercePayments.createdAt, from) : undefined,
    to ? lte(commercePayments.createdAt, to) : undefined,
  ].filter((c): c is SQL => Boolean(c));

  const dateCondOrders = [
    from ? gte(commerceOrders.createdAt, from) : undefined,
    to ? lte(commerceOrders.createdAt, to) : undefined,
  ].filter((c): c is SQL => Boolean(c));

  const dateCondLedger = [
    from ? gte(commerceLedgerEntries.createdAt, from) : undefined,
    to ? lte(commerceLedgerEntries.createdAt, to) : undefined,
  ].filter((c): c is SQL => Boolean(c));

  const dateCondEntitlements = [
    from ? gte(commerceEntitlements.createdAt, from) : undefined,
    to ? lte(commerceEntitlements.createdAt, to) : undefined,
  ].filter((c): c is SQL => Boolean(c));

  const [paymentStats] = await db.select({
    total: count(),
    succeeded: sql<number>`count(*) filter (where ${commercePayments.status} = 'succeeded')`,
    failed: sql<number>`count(*) filter (where ${commercePayments.status} = 'failed')`,
    pending: sql<number>`count(*) filter (where ${commercePayments.status} = 'pending')`,
    refunded: sql<number>`count(*) filter (where ${commercePayments.status} = 'refunded')`,
    revenueKopecks: sql<number>`coalesce(sum(case when ${commercePayments.status} = 'succeeded' then ${commercePayments.amountRub} * 100 else 0 end), 0)`,
  }).from(commercePayments).where(dateCondPayments.length > 0 ? and(...dateCondPayments) : undefined);

  const [orderStats] = await db.select({
    total: count(),
    paid: sql<number>`count(*) filter (where ${commerceOrders.status} = 'paid')`,
    pending: sql<number>`count(*) filter (where ${commerceOrders.status} = 'pending')`,
    cancelled: sql<number>`count(*) filter (where ${commerceOrders.status} = 'cancelled')`,
    failed: sql<number>`count(*) filter (where ${commerceOrders.status} = 'failed')`,
  }).from(commerceOrders).where(dateCondOrders.length > 0 ? and(...dateCondOrders) : undefined);

  const [ledgerStats] = await db.select({
    total: count(),
    readerEarningsKopecks: sql<number>`coalesce(sum(case when ${commerceLedgerEntries.entryType} = 'reader_earning' then ${commerceLedgerEntries.amountKopecks} else 0 end), 0)`,
    platformFeeKopecks: sql<number>`coalesce(sum(case when ${commerceLedgerEntries.entryType} = 'platform_fee' then ${commerceLedgerEntries.amountKopecks} else 0 end), 0)`,
    acquiringFeeKopecks: sql<number>`coalesce(sum(case when ${commerceLedgerEntries.entryType} = 'acquiring_fee' then ${commerceLedgerEntries.amountKopecks} else 0 end), 0)`,
  }).from(commerceLedgerEntries).where(dateCondLedger.length > 0 ? and(...dateCondLedger) : undefined);

  const [entitlementStats] = await db.select({
    active: sql<number>`count(*) filter (where ${commerceEntitlements.status} = 'active')`,
    revoked: sql<number>`count(*) filter (where ${commerceEntitlements.status} = 'revoked')`,
    expired: sql<number>`count(*) filter (where ${commerceEntitlements.status} = 'expired')`,
  }).from(commerceEntitlements).where(dateCondEntitlements.length > 0 ? and(...dateCondEntitlements) : undefined);

  // Расхождения (без пагинации — только count)
  const discrepancies = await listDiscrepancies({ ...filters, limit: MAX_LIMIT, offset: 0 });
  const byType: Record<string, number> = {};
  for (const d of discrepancies.items) {
    byType[d.type] = (byType[d.type] ?? 0) + 1;
  }

  // По провайдерам
  const providerRows = await db.select({
    code: paymentProviders.code,
    count: count(),
    revenueKopecks: sql<number>`coalesce(sum(case when ${commercePayments.status} = 'succeeded' then ${commercePayments.amountRub} * 100 else 0 end), 0)`,
  })
    .from(commercePayments)
    .leftJoin(paymentProviders, eq(paymentProviders.id, commercePayments.providerId))
    .where(dateCondPayments.length > 0 ? and(...dateCondPayments) : undefined)
    .groupBy(paymentProviders.code);

  // По типам продуктов
  const productTypeRows = await db.select({
    productType: commerceProducts.type,
    count: count(),
    revenueKopecks: sql<number>`coalesce(sum(case when ${commercePayments.status} = 'succeeded' then ${commercePayments.amountRub} * 100 else 0 end), 0)`,
  })
    .from(commercePayments)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
    .innerJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .where(dateCondPayments.length > 0 ? and(...dateCondPayments) : undefined)
    .groupBy(commerceProducts.type);

  const revenueKopecks = Number(paymentStats?.revenueKopecks ?? 0);

  return {
    period: { from, to },
    payments: {
      total: Number(paymentStats?.total ?? 0),
      succeeded: Number(paymentStats?.succeeded ?? 0),
      failed: Number(paymentStats?.failed ?? 0),
      pending: Number(paymentStats?.pending ?? 0),
      refunded: Number(paymentStats?.refunded ?? 0),
      revenueKopecks,
      revenueFormatted: kopecksToMoney(revenueKopecks).amountFormatted,
    },
    orders: {
      total: Number(orderStats?.total ?? 0),
      paid: Number(orderStats?.paid ?? 0),
      pending: Number(orderStats?.pending ?? 0),
      cancelled: Number(orderStats?.cancelled ?? 0),
      failed: Number(orderStats?.failed ?? 0),
    },
    ledger: {
      total: Number(ledgerStats?.total ?? 0),
      readerEarningsKopecks: Number(ledgerStats?.readerEarningsKopecks ?? 0),
      platformFeeKopecks: Number(ledgerStats?.platformFeeKopecks ?? 0),
      acquiringFeeKopecks: Number(ledgerStats?.acquiringFeeKopecks ?? 0),
    },
    entitlements: {
      active: Number(entitlementStats?.active ?? 0),
      revoked: Number(entitlementStats?.revoked ?? 0),
      expired: Number(entitlementStats?.expired ?? 0),
    },
    discrepancies: {
      total: discrepancies.total,
      byType,
    },
    byProvider: providerRows.map((r) => ({ provider: r.code ?? 'unknown', count: Number(r.count), revenueKopecks: Number(r.revenueKopecks) })),
    byProductType: productTypeRows.map((r) => ({ productType: r.productType, count: Number(r.count), revenueKopecks: Number(r.revenueKopecks) })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// List-методы
// ─────────────────────────────────────────────────────────────────────────────

export async function listAuditPayments(filters: AuditFilters = {}): Promise<AuditListResult<ReturnType<typeof sanitizePayment>>> {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(commercePayments.createdAt, filters.from));
  if (filters.to) conditions.push(lte(commercePayments.createdAt, filters.to));
  if (filters.status) conditions.push(eq(commercePayments.status, filters.status as typeof commercePayments.$inferSelect.status));
  if (filters.provider) {
    conditions.push(eq(paymentProviders.code, filters.provider as PaymentProviderCode));
  }
  if (filters.userId) conditions.push(eq(commerceOrders.userId, filters.userId));
  if (filters.productType) conditions.push(eq(commerceProducts.type, filters.productType as typeof commerceProducts.$inferSelect.type));
  if (filters.scopeType) conditions.push(eq(commerceProducts.scopeType, filters.scopeType as typeof commerceProducts.$inferSelect.scopeType));
  if (filters.scopeId) conditions.push(eq(commerceProducts.scopeId, filters.scopeId));
  if (filters.search) {
    conditions.push(or(ilike(users.email, `%${filters.search}%`), ilike(users.username, `%${filters.search}%`))!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = auditLimit(filters.limit);
  const offset = auditOffset(filters.offset);

  const [totalRow] = await db.select({ total: count() })
    .from(commercePayments)
    .leftJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
    .leftJoin(paymentProviders, eq(paymentProviders.id, commercePayments.providerId))
    .leftJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .leftJoin(users, eq(users.id, commerceOrders.userId))
    .where(where);

  const items = await db.select({
    payment: commercePayments,
    order: { id: commerceOrders.id, status: commerceOrders.status, userId: commerceOrders.userId, productId: commerceOrders.productId },
    provider: { code: paymentProviders.code, name: paymentProviders.name },
    product: { id: commerceProducts.id, title: commerceProducts.title, type: commerceProducts.type, scopeType: commerceProducts.scopeType, scopeId: commerceProducts.scopeId },
    user: { id: users.id, username: users.username, email: users.email },
  })
    .from(commercePayments)
    .leftJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
    .leftJoin(paymentProviders, eq(paymentProviders.id, commercePayments.providerId))
    .leftJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .leftJoin(users, eq(users.id, commerceOrders.userId))
    .where(where)
    .orderBy(desc(commercePayments.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: items.map((row) => ({ ...sanitizePayment(row.payment), order: row.order, provider: row.provider, product: row.product, user: row.user })),
    total: Number(totalRow?.total ?? 0),
    limit,
    offset,
  };
}

export async function getAuditPaymentDetails(id: string) {
  const [payment] = await db.select().from(commercePayments).where(eq(commercePayments.id, id)).limit(1);
  if (!payment) return null;

  const [order] = await db.select().from(commerceOrders).where(eq(commerceOrders.id, payment.orderId)).limit(1);
  const [provider] = payment.providerId
    ? await db.select({ id: paymentProviders.id, code: paymentProviders.code, name: paymentProviders.name, status: paymentProviders.status }).from(paymentProviders).where(eq(paymentProviders.id, payment.providerId)).limit(1)
    : [null];

  const [product, price] = order
    ? await Promise.all([
        db.select().from(commerceProducts).where(eq(commerceProducts.id, order.productId)).limit(1),
        db.select().from(commercePrices).where(eq(commercePrices.id, order.priceId)).limit(1),
      ])
    : [[], []];

  const [events, entitlements, ledger, tariffAssignments, memberships, user] = await Promise.all([
    payment.providerPaymentId
      ? db.select().from(commercePaymentEvents).where(eq(commercePaymentEvents.providerPaymentId, payment.providerPaymentId)).orderBy(desc(commercePaymentEvents.receivedAt))
      : Promise.resolve([]),
    db.select().from(commerceEntitlements).where(eq(commerceEntitlements.sourceId, payment.id)).orderBy(desc(commerceEntitlements.createdAt)),
    db.select().from(commerceLedgerEntries).where(eq(commerceLedgerEntries.paymentId, payment.id)).orderBy(desc(commerceLedgerEntries.createdAt)),
    order ? db.select().from(readerClubTariffAssignments).where(eq(readerClubTariffAssignments.productId, order.productId)).orderBy(desc(readerClubTariffAssignments.createdAt)) : Promise.resolve([]),
    order ? db.select().from(clubMembers).where(and(eq(clubMembers.userId, order.userId), eq(clubMembers.isActive, true))).orderBy(desc(clubMembers.joinedAt)) : Promise.resolve([]),
    order ? db.select({ id: users.id, username: users.username, email: users.email }).from(users).where(eq(users.id, order.userId)).limit(1) : Promise.resolve([]),
  ]);

  const expectedKopecks = payment.amountRub * 100;
  const actualKopecks = ledger.reduce((sum, e) => sum + e.amountKopecks, 0);

  return {
    payment: sanitizePayment(payment),
    provider,
    order: order ? sanitizeOrder(order) : null,
    product: product[0] ?? null,
    price: price[0] ?? null,
    user: user[0] ?? null,
    events: events.map(sanitizeEvent),
    entitlements: entitlements.map(sanitizeEntitlement),
    ledger: ledger.map(sanitizeLedgerEntry),
    tariffAssignments,
    memberships,
    diagnostics: {
      hasOrder: Boolean(order),
      hasProvider: Boolean(provider),
      hasProviderEvent: events.length > 0,
      hasEntitlement: entitlements.length > 0,
      hasMembershipOrGrant: memberships.length > 0 || entitlements.some((e) => e.sourceType === 'admin_grant' || e.sourceType === 'promo'),
      hasLedgerEntries: ledger.length > 0,
      ledgerAmountKopecks: actualKopecks,
      paymentAmountKopecks: expectedKopecks,
      ledgerAmountMatchesPayment: ledger.length === 0 ? null : actualKopecks === expectedKopecks,
    },
  };
}

export async function listAuditOrders(filters: AuditFilters = {}): Promise<AuditListResult<ReturnType<typeof sanitizeOrder> & { paymentId?: string | null; product?: { id: string; title: string; type: string } | null; user?: { id: string; username: string; email: string } | null }>> {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(commerceOrders.createdAt, filters.from));
  if (filters.to) conditions.push(lte(commerceOrders.createdAt, filters.to));
  if (filters.status) conditions.push(eq(commerceOrders.status, filters.status as typeof commerceOrders.$inferSelect.status));
  if (filters.userId) conditions.push(eq(commerceOrders.userId, filters.userId));
  if (filters.productType) conditions.push(eq(commerceProducts.type, filters.productType as typeof commerceProducts.$inferSelect.type));
  if (filters.scopeType) conditions.push(eq(commerceProducts.scopeType, filters.scopeType as typeof commerceProducts.$inferSelect.scopeType));
  if (filters.scopeId) conditions.push(eq(commerceProducts.scopeId, filters.scopeId));
  if (filters.search) {
    conditions.push(or(ilike(users.email, `%${filters.search}%`), ilike(users.username, `%${filters.search}%`))!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = auditLimit(filters.limit);
  const offset = auditOffset(filters.offset);

  const [totalRow] = await db.select({ total: count() })
    .from(commerceOrders)
    .leftJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .leftJoin(users, eq(users.id, commerceOrders.userId))
    .where(where);

  const items = await db.select({
    order: commerceOrders,
    payment: { id: commercePayments.id },
    product: { id: commerceProducts.id, title: commerceProducts.title, type: commerceProducts.type },
    user: { id: users.id, username: users.username, email: users.email },
  })
    .from(commerceOrders)
    .leftJoin(commercePayments, eq(commercePayments.orderId, commerceOrders.id))
    .leftJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .leftJoin(users, eq(users.id, commerceOrders.userId))
    .where(where)
    .orderBy(desc(commerceOrders.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: items.map((row) => ({ ...sanitizeOrder(row.order), paymentId: row.payment?.id ?? null, product: row.product, user: row.user })),
    total: Number(totalRow?.total ?? 0),
    limit,
    offset,
  };
}

export async function listAuditLedger(filters: AuditFilters = {}): Promise<AuditListResult<ReturnType<typeof sanitizeLedgerEntry> & { product?: { id: string; title: string } | null }>> {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(commerceLedgerEntries.createdAt, filters.from));
  if (filters.to) conditions.push(lte(commerceLedgerEntries.createdAt, filters.to));
  if (filters.status) conditions.push(eq(commerceLedgerEntries.status, filters.status as typeof commerceLedgerEntries.$inferSelect.status));
  if (filters.userId) conditions.push(eq(commerceOrders.userId, filters.userId));
  if (filters.recipientUserId) conditions.push(eq(commerceLedgerEntries.readerUserId, filters.recipientUserId));
  if (filters.productType) conditions.push(eq(commerceProducts.type, filters.productType as typeof commerceProducts.$inferSelect.type));
  if (filters.scopeType) conditions.push(eq(commerceProducts.scopeType, filters.scopeType as typeof commerceProducts.$inferSelect.scopeType));
  if (filters.scopeId) conditions.push(eq(commerceLedgerEntries.clubId, filters.scopeId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = auditLimit(filters.limit);
  const offset = auditOffset(filters.offset);

  const [totalRow] = await db.select({ total: count() })
    .from(commerceLedgerEntries)
    .leftJoin(commerceOrders, eq(commerceOrders.id, commerceLedgerEntries.orderId))
    .leftJoin(commerceProducts, eq(commerceProducts.id, commerceLedgerEntries.productId))
    .where(where);

  const items = await db.select({
    entry: commerceLedgerEntries,
    product: { id: commerceProducts.id, title: commerceProducts.title },
  })
    .from(commerceLedgerEntries)
    .leftJoin(commerceProducts, eq(commerceProducts.id, commerceLedgerEntries.productId))
    .where(where)
    .orderBy(desc(commerceLedgerEntries.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: items.map((row) => ({ ...sanitizeLedgerEntry(row.entry), product: row.product })),
    total: Number(totalRow?.total ?? 0),
    limit,
    offset,
  };
}

export async function listAuditEntitlements(filters: AuditFilters = {}): Promise<AuditListResult<typeof commerceEntitlements.$inferSelect & { user?: { id: string; username: string; email: string } | null; product?: { id: string; title: string } | null }>> {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(commerceEntitlements.createdAt, filters.from));
  if (filters.to) conditions.push(lte(commerceEntitlements.createdAt, filters.to));
  if (filters.status) conditions.push(eq(commerceEntitlements.status, filters.status as typeof commerceEntitlements.$inferSelect.status));
  if (filters.userId) conditions.push(eq(commerceEntitlements.userId, filters.userId));
  if (filters.scopeType) conditions.push(eq(commerceEntitlements.scopeType, filters.scopeType as typeof commerceEntitlements.$inferSelect.scopeType));
  if (filters.scopeId) conditions.push(eq(commerceEntitlements.scopeId, filters.scopeId));
  if (filters.search) {
    conditions.push(or(ilike(users.email, `%${filters.search}%`), ilike(users.username, `%${filters.search}%`))!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = auditLimit(filters.limit);
  const offset = auditOffset(filters.offset);

  const [totalRow] = await db.select({ total: count() })
    .from(commerceEntitlements)
    .leftJoin(users, eq(users.id, commerceEntitlements.userId))
    .where(where);

  const items = await db.select({
    entitlement: commerceEntitlements,
    user: { id: users.id, username: users.username, email: users.email },
  })
    .from(commerceEntitlements)
    .leftJoin(users, eq(users.id, commerceEntitlements.userId))
    .where(where)
    .orderBy(desc(commerceEntitlements.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: items.map((row) => ({ ...row.entitlement, user: row.user })),
    total: Number(totalRow?.total ?? 0),
    limit,
    offset,
  };
}

export async function listProviderEvents(filters: AuditFilters = {}): Promise<AuditListResult<ReturnType<typeof sanitizeEvent> & { paymentId?: string | null }>> {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(commercePaymentEvents.receivedAt, filters.from));
  if (filters.to) conditions.push(lte(commercePaymentEvents.receivedAt, filters.to));
  if (filters.status) conditions.push(eq(commercePaymentEvents.status, filters.status as CommercePaymentEventStatus));
  if (filters.provider) conditions.push(eq(commercePaymentEvents.providerCode, filters.provider as PaymentProviderCode));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = auditLimit(filters.limit);
  const offset = auditOffset(filters.offset);

  const [totalRow] = await db.select({ total: count() }).from(commercePaymentEvents).where(where);

  const items = await db.select({ event: commercePaymentEvents, payment: { id: commercePayments.id } }).from(commercePaymentEvents)
    .leftJoin(commercePayments, eq(commercePayments.providerPaymentId, commercePaymentEvents.providerPaymentId))
    .where(where)
    .orderBy(desc(commercePaymentEvents.receivedAt))
    .limit(limit)
    .offset(offset);

  return {
    items: items.map((row) => ({ ...sanitizeEvent(row.event), paymentId: row.payment?.id ?? null })),
    total: Number(totalRow?.total ?? 0),
    limit,
    offset,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discrepancy checks
// ─────────────────────────────────────────────────────────────────────────────

export interface Discrepancy {
  type: string;
  severity: 'critical' | 'warning';
  entityType: 'payment' | 'order' | 'entitlement' | 'event';
  entityId: string;
  description: string;
  details?: unknown;
}

export interface DiscrepancyListResult extends AuditListResult<Discrepancy> {
  byType: Record<string, number>;
}

/**
 * Обнаруживает расхождения в коммерческой цепочке.
 * Каждый check — отдельный запрос, результаты объединяются.
 */
export async function listDiscrepancies(filters: AuditFilters = {}): Promise<DiscrepancyListResult> {
  const limit = auditLimit(filters.limit);
  const offset = auditOffset(filters.offset);
  const from = filters.from;
  const to = filters.to;

  const dateCondPayments = [
    from ? gte(commercePayments.createdAt, from) : undefined,
    to ? lte(commercePayments.createdAt, to) : undefined,
  ].filter((c): c is SQL => Boolean(c));

  const dateCondOrders = [
    from ? gte(commerceOrders.createdAt, from) : undefined,
    to ? lte(commerceOrders.createdAt, to) : undefined,
  ].filter((c): c is SQL => Boolean(c));

  const dateCondEvents = [
    from ? gte(commercePaymentEvents.receivedAt, from) : undefined,
    to ? lte(commercePaymentEvents.receivedAt, to) : undefined,
  ].filter((c): c is SQL => Boolean(c));

  const paymentWhere = dateCondPayments.length > 0 ? and(...dateCondPayments) : undefined;
  const orderWhere = dateCondOrders.length > 0 ? and(...dateCondOrders) : undefined;
  const eventWhere = dateCondEvents.length > 0 ? and(...dateCondEvents) : undefined;

  const checks: Promise<Discrepancy[]>[] = [
    // 1. payment_succeeded_order_not_paid
    db.select({ id: commercePayments.id, paymentId: commercePayments.id, orderStatus: commerceOrders.status, amountRub: commercePayments.amountRub })
      .from(commercePayments)
      .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
      .where(and(eq(commercePayments.status, 'succeeded'), sql`${commerceOrders.status} != 'paid'`, ...(paymentWhere ? [paymentWhere] : [])))
      .then((rows) => rows.map((r) => ({
        type: 'payment_succeeded_order_not_paid',
        severity: 'critical' as const,
        entityType: 'payment' as const,
        entityId: r.paymentId,
        description: `Платёж ${r.paymentId} succeeded, но заказ в статусе ${r.orderStatus}`,
        details: { paymentId: r.paymentId, orderStatus: r.orderStatus, amountRub: r.amountRub },
      }))),

    // 2. order_paid_payment_not_succeeded
    db.select({ id: commerceOrders.id, orderId: commerceOrders.id, paymentStatus: commercePayments.status, paymentId: commercePayments.id })
      .from(commerceOrders)
      .innerJoin(commercePayments, eq(commercePayments.orderId, commerceOrders.id))
      .where(and(eq(commerceOrders.status, 'paid'), sql`${commercePayments.status} != 'succeeded'`, ...(orderWhere ? [orderWhere] : [])))
      .then((rows) => rows.map((r) => ({
        type: 'order_paid_payment_not_succeeded',
        severity: 'critical' as const,
        entityType: 'order' as const,
        entityId: r.orderId,
        description: `Заказ ${r.orderId} оплачен, но платёж ${r.paymentId} в статусе ${r.paymentStatus}`,
        details: { orderId: r.orderId, paymentId: r.paymentId, paymentStatus: r.paymentStatus },
      }))),

    // 3. succeeded_payment_without_processed_event
    db.select({ id: commercePayments.id, paymentId: commercePayments.id, providerPaymentId: commercePayments.providerPaymentId })
      .from(commercePayments)
      .leftJoin(commercePaymentEvents, eq(commercePaymentEvents.providerPaymentId, commercePayments.providerPaymentId))
      .where(and(eq(commercePayments.status, 'succeeded'), isNull(commercePaymentEvents.id), ...(paymentWhere ? [paymentWhere] : [])))
      .then((rows) => rows.map((r) => ({
        type: 'succeeded_payment_without_processed_event',
        severity: 'warning' as const,
        entityType: 'payment' as const,
        entityId: r.paymentId,
        description: `Платёж ${r.paymentId} succeeded без события от провайдера`,
        details: { paymentId: r.paymentId, providerPaymentId: r.providerPaymentId },
      }))),

    // 4. reader_club_payment_without_membership
    db.select({ id: commercePayments.id, paymentId: commercePayments.id, scopeId: commerceProducts.scopeId, userId: commerceOrders.userId })
      .from(commercePayments)
      .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
      .innerJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
      .leftJoin(clubMembers, and(eq(clubMembers.clubId, commerceProducts.scopeId), eq(clubMembers.userId, commerceOrders.userId), eq(clubMembers.isActive, true)))
      .where(and(
        eq(commercePayments.status, 'succeeded'),
        eq(commerceProducts.scopeType, 'reader_club'),
        isNull(clubMembers.id),
        ...(paymentWhere ? [paymentWhere] : []),
      ))
      .then((rows) => rows.map((r) => ({
        type: 'reader_club_payment_without_membership',
        severity: 'critical' as const,
        entityType: 'payment' as const,
        entityId: r.paymentId,
        description: `Платёж ${r.paymentId} за клуб чтеца, но пользователь ${r.userId} не член клуба ${r.scopeId}`,
        details: { paymentId: r.paymentId, clubId: r.scopeId, userId: r.userId },
      }))),

    // 5. reader_club_payment_without_ledger
    db.select({ id: commercePayments.id, paymentId: commercePayments.id, amountRub: commercePayments.amountRub })
      .from(commercePayments)
      .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
      .innerJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
      .leftJoin(commerceLedgerEntries, eq(commerceLedgerEntries.paymentId, commercePayments.id))
      .where(and(
        eq(commercePayments.status, 'succeeded'),
        eq(commerceProducts.scopeType, 'reader_club'),
        isNull(commerceLedgerEntries.id),
        ...(paymentWhere ? [paymentWhere] : []),
      ))
      .then((rows) => rows.map((r) => ({
        type: 'reader_club_payment_without_ledger',
        severity: 'warning' as const,
        entityType: 'payment' as const,
        entityId: r.paymentId,
        description: `Платёж ${r.paymentId} за клуб чтеца без начислений`,
        details: { paymentId: r.paymentId, amountRub: r.amountRub },
      }))),

    // 6. ledger_sum_mismatch
    db.select({
      id: commercePayments.id,
      paymentId: commercePayments.id,
      amountRub: commercePayments.amountRub,
      ledgerSum: sql<number>`coalesce(sum(${commerceLedgerEntries.amountKopecks}), 0)`,
    })
      .from(commercePayments)
      .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
      .innerJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
      .leftJoin(commerceLedgerEntries, eq(commerceLedgerEntries.paymentId, commercePayments.id))
      .where(and(
        eq(commercePayments.status, 'succeeded'),
        eq(commerceProducts.scopeType, 'reader_club'),
        ...(paymentWhere ? [paymentWhere] : []),
      ))
      .groupBy(commercePayments.id, commercePayments.amountRub)
      .having(sql`coalesce(sum(${commerceLedgerEntries.amountKopecks}), 0) != ${commercePayments.amountRub} * 100`)
      .then((rows) => rows.map((r) => ({
        type: 'ledger_sum_mismatch',
        severity: 'critical' as const,
        entityType: 'payment' as const,
        entityId: r.paymentId,
        description: `Сумма начислений (${r.ledgerSum} коп.) не совпадает с платежом (${r.amountRub * 100} коп.)`,
        details: { paymentId: r.paymentId, expectedKopecks: r.amountRub * 100, actualKopecks: Number(r.ledgerSum) },
      }))),

    // 7. processed_provider_event_without_payment
    db.select({ id: commercePaymentEvents.id, eventId: commercePaymentEvents.id, providerPaymentId: commercePaymentEvents.providerPaymentId, eventType: commercePaymentEvents.eventType })
      .from(commercePaymentEvents)
      .leftJoin(commercePayments, eq(commercePayments.providerPaymentId, commercePaymentEvents.providerPaymentId))
      .where(and(
        eq(commercePaymentEvents.status, 'processed'),
        isNull(commercePayments.id),
        ...(eventWhere ? [eventWhere] : []),
      ))
      .then((rows) => rows.map((r) => ({
        type: 'processed_provider_event_without_payment',
        severity: 'warning' as const,
        entityType: 'event' as const,
        entityId: r.eventId,
        description: `Событие ${r.eventId} (${r.eventType}) обработано, но платёж не найден (providerPaymentId: ${r.providerPaymentId})`,
        details: { eventId: r.eventId, providerPaymentId: r.providerPaymentId, eventType: r.eventType },
      }))),

    // 8. paid_order_without_entitlement
    db.select({ id: commerceOrders.id, orderId: commerceOrders.id, paymentId: commercePayments.id, userId: commerceOrders.userId, productId: commerceOrders.productId })
      .from(commerceOrders)
      .leftJoin(commercePayments, eq(commercePayments.orderId, commerceOrders.id))
      .innerJoin(commerceProductFeatures, eq(commerceProductFeatures.productId, commerceOrders.productId))
      .leftJoin(commerceEntitlements, and(
        eq(commerceEntitlements.userId, commerceOrders.userId),
        eq(commerceEntitlements.featureKey, commerceProductFeatures.featureKey),
        eq(commerceEntitlements.status, 'active'),
      ))
      .where(and(
        eq(commerceOrders.status, 'paid'),
        isNull(commerceEntitlements.id),
        ...(orderWhere ? [orderWhere] : []),
      ))
      .groupBy(commerceOrders.id, commercePayments.id)
      .then((rows) => rows.map((r) => ({
        type: 'paid_order_without_entitlement',
        severity: 'critical' as const,
        entityType: 'order' as const,
        entityId: r.orderId,
        description: `Заказ ${r.orderId} оплачен, но доступ не выдан (пользователь ${r.userId}, продукт ${r.productId})`,
        details: { orderId: r.orderId, paymentId: r.paymentId, userId: r.userId, productId: r.productId },
      }))),

    // 9. active_entitlement_without_valid_source
    db.select({ id: commerceEntitlements.id, entitlementId: commerceEntitlements.id, sourceType: commerceEntitlements.sourceType, sourceId: commerceEntitlements.sourceId, featureKey: commerceEntitlements.featureKey })
      .from(commerceEntitlements)
      .leftJoin(commercePayments, and(eq(commercePayments.id, commerceEntitlements.sourceId), eq(commerceEntitlements.sourceType, 'payment')))
      .where(and(
        eq(commerceEntitlements.status, 'active'),
        eq(commerceEntitlements.sourceType, 'payment'),
        isNull(commercePayments.id),
      ))
      .then((rows) => rows.map((r) => ({
        type: 'active_entitlement_without_valid_source',
        severity: 'critical' as const,
        entityType: 'entitlement' as const,
        entityId: r.entitlementId,
        description: `Активный доступ ${r.entitlementId} (${r.featureKey}) ссылается на несуществующий платёж ${r.sourceId}`,
        details: { entitlementId: r.entitlementId, sourceType: r.sourceType, sourceId: r.sourceId, featureKey: r.featureKey },
      }))),
  ];

  try {
    const results = await Promise.all(checks);
    const all = results.flat();
    const byType: Record<string, number> = {};
    for (const d of all) byType[d.type] = (byType[d.type] ?? 0) + 1;

    const paged = all.slice(offset, offset + limit);
    return { items: paged, total: all.length, limit, offset, byType };
  } catch (error) {
    logger.error({ error }, 'Discrepancy checks failed');
    throw error;
  }
}
