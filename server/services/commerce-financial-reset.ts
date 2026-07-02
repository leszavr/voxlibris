import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  commerceEntitlements,
  commerceFinancialResetLog,
  commerceLedgerEntries,
  commerceOrders,
  commercePaymentEvents,
  commercePayments,
  commercePrices,
  commerceProductFeatures,
  commerceProducts,
  commerceRenewalReminders,
  commerceSubscriptions,
  readerClubTariffAssignments,
  readerClubTariffTemplates,
  users,
} from '../../shared/schema.js';

export const FINANCIAL_RESET_CONFIRMATION = 'ОЧИСТИТЬ ТЕСТОВЫЕ ФИНАНСЫ И ЗАПУСТИТЬ МАГАЗИН';

type ResetCounts = Record<
  | 'orders'
  | 'payments'
  | 'paymentEvents'
  | 'ledgerEntries'
  | 'subscriptions'
  | 'paymentEntitlements'
  | 'renewalReminders'
  | 'entitlementActions'
  | 'productsToArchive'
  | 'pricesToArchive'
  | 'productFeaturesToDisable'
  | 'tariffTemplatesToArchive'
  | 'tariffAssignmentsToArchive',
  number
>;

async function scalarCount(query: ReturnType<typeof sql>) {
  const [row] = await db.execute<{ value: string | number }>(query);
  return Number(row?.value ?? 0);
}

export async function firstAdmin() {
  const [admin] = await db.select({ id: users.id, email: users.email, username: users.username, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.role, 'admin'))
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return admin ?? null;
}

export async function financialResetAlreadyExecuted() {
  const [row] = await db.select({ id: commerceFinancialResetLog.id, executedAt: commerceFinancialResetLog.executedAt, executedBy: commerceFinancialResetLog.executedBy, summary: commerceFinancialResetLog.summary })
    .from(commerceFinancialResetLog)
    .limit(1);
  return row ?? null;
}

export async function financialResetCounts(): Promise<ResetCounts> {
  const [
    orders,
    payments,
    paymentEvents,
    ledgerEntries,
    subscriptions,
    paymentEntitlements,
    renewalReminders,
    entitlementActions,
    productsToArchive,
    pricesToArchive,
    productFeaturesToDisable,
    tariffTemplatesToArchive,
    tariffAssignmentsToArchive,
  ] = await Promise.all([
    scalarCount(sql`select count(*)::int as value from commerce_orders`),
    scalarCount(sql`select count(*)::int as value from commerce_payments`),
    scalarCount(sql`select count(*)::int as value from commerce_payment_events`),
    scalarCount(sql`select count(*)::int as value from commerce_ledger_entries`),
    scalarCount(sql`select count(*)::int as value from commerce_subscriptions`),
    scalarCount(sql`select count(*)::int as value from commerce_entitlements where source_type = 'payment'`),
    scalarCount(sql`select count(*)::int as value from commerce_renewal_reminders`),
    scalarCount(sql`
      select count(*)::int as value
      from commerce_entitlement_actions a
      join commerce_entitlements e on e.id = a.entitlement_id
      where e.source_type = 'payment'
    `),
    scalarCount(sql`select count(*)::int as value from commerce_products where status <> 'archived' or visibility <> 'private'`),
    scalarCount(sql`select count(*)::int as value from commerce_prices where status <> 'archived'`),
    scalarCount(sql`select count(*)::int as value from commerce_product_features where is_active = true`),
    scalarCount(sql`select count(*)::int as value from reader_club_tariff_templates where status <> 'archived' or visibility <> 'private'`),
    scalarCount(sql`select count(*)::int as value from reader_club_tariff_assignments where status <> 'archived'`),
  ]);

  return { orders, payments, paymentEvents, ledgerEntries, subscriptions, paymentEntitlements, renewalReminders, entitlementActions, productsToArchive, pricesToArchive, productFeaturesToDisable, tariffTemplatesToArchive, tariffAssignmentsToArchive };
}

export async function financialResetPreview(currentUserId: string) {
  const [admin, executed, counts] = await Promise.all([firstAdmin(), financialResetAlreadyExecuted(), financialResetCounts()]);
  return {
    canExecute: Boolean(admin && admin.id === currentUserId && !executed),
    alreadyExecuted: Boolean(executed),
    executed,
    executorRequired: admin,
    isCurrentUserExecutor: Boolean(admin && admin.id === currentUserId),
    confirmationPhrase: FINANCIAL_RESET_CONFIRMATION,
    counts,
    warnings: [
      'Будут удалены все тестовые финансовые операции, платежи, подписки, проводки и payment-based entitlements.',
      'Коммерческие продукты, цены, фичи и тарифные назначения будут архивированы/деактивированы, но не удалены.',
      'Пользователи, клубы и членства в клубах не удаляются.',
      'Операция необратима и доступна только один раз.',
    ],
  };
}

export async function executeFinancialReset(currentUserId: string, confirmationPhrase: string) {
  if (confirmationPhrase !== FINANCIAL_RESET_CONFIRMATION) throw new Error('Неверная фраза подтверждения');

  const admin = await firstAdmin();
  if (!admin || admin.id !== currentUserId) throw new Error('Финансовый reset может выполнить только главный администратор');

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(560058)`);

    const [existing] = await tx.select({ id: commerceFinancialResetLog.id }).from(commerceFinancialResetLog).limit(1);
    if (existing) throw new Error('Финансовый reset уже был выполнен');

    const summary = await financialResetCounts();

    await tx.delete(commerceRenewalReminders);
    await tx.execute(sql`
      delete from commerce_entitlement_actions a
      using commerce_entitlements e
      where e.id = a.entitlement_id and e.source_type = 'payment'
    `);
    await tx.delete(commerceEntitlements).where(eq(commerceEntitlements.sourceType, 'payment'));
    await tx.delete(commerceSubscriptions);
    await tx.delete(commerceLedgerEntries);
    await tx.delete(commercePaymentEvents);
    await tx.delete(commercePayments);
    await tx.delete(commerceOrders);

    await tx.update(commerceProducts).set({ status: 'archived', visibility: 'private', updatedAt: new Date() });
    await tx.update(commercePrices).set({ status: 'archived', updatedAt: new Date() });
    await tx.update(commerceProductFeatures).set({ isActive: false, updatedAt: new Date() });
    await tx.update(readerClubTariffTemplates).set({ status: 'archived', visibility: 'private', updatedAt: new Date() });
    await tx.update(readerClubTariffAssignments).set({ status: 'archived', updatedAt: new Date() });

    const [log] = await tx.insert(commerceFinancialResetLog).values({
      singletonKey: 1,
      executedBy: currentUserId,
      confirmationPhrase,
      summary,
    }).returning();

    return { executed: true, log, summary };
  });
}
