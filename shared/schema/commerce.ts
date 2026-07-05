import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users, clubs } from "./core";


export type PaymentProviderCode = 'yookassa';
export type PaymentProviderStatus = 'active' | 'inactive';
export type CommerceProductType = 'platform_subscription' | 'club_subscription' | 'reader_club_subscription' | 'ticket' | 'recording_access' | 'donation';
export type CommerceScopeType = 'platform' | 'club' | 'reader_club' | 'session' | 'recording' | 'reader';
export type CommerceProductStatus = 'draft' | 'active' | 'archived';
export type CommerceProductVisibility = 'public' | 'private';
export type CommercePricePeriod = 'one_time' | 'week' | 'month' | 'quarter' | 'year';
export type CommercePriceStatus = 'active' | 'archived';
export type CommerceOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed';
export type CommercePaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
export type CommercePaymentEventStatus = 'received' | 'processed' | 'failed';
export type CommerceSubscriptionStatus = 'pending' | 'active' | 'grace' | 'past_due' | 'cancelled' | 'expired';
export type CommerceEntitlementSourceType = 'payment' | 'subscription' | 'promo' | 'admin_grant' | 'migration';
export type CommerceEntitlementStatus = 'active' | 'revoked' | 'expired' | 'deleted';
export type CommerceEntitlementRenewalStatus = 'active' | 'cancel_at_period_end';
export type CommerceEntitlementActionType = 'revoke_now' | 'cancel_at_period_end' | 'restore' | 'delete_revoked';
export type CommerceFeatureValueType = 'boolean' | 'integer' | 'string' | 'json';
export type CommerceFeatureResetPeriod = 'day' | 'week' | 'month' | 'year' | null;
export type ReaderClubTariffTemplateStatus = 'draft' | 'active' | 'archived';
export type ReaderClubTariffVisibility = 'public' | 'private';
export type ReaderClubTariffRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ReaderClubTariffAssignmentStatus = 'active' | 'inactive' | 'archived';
export type CommerceLedgerEntryType = 'acquiring_fee' | 'reader_earning' | 'platform_fee';
export type CommerceLedgerEntryStatus = 'pending' | 'available' | 'paid' | 'withdrawn' | 'void';

export const paymentProviders = pgTable('payment_providers', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 40 }).notNull().$type<PaymentProviderCode>(),
  name: varchar('name', { length: 120 }).notNull(),
  encryptedCredentials: text('encrypted_credentials').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('inactive').$type<PaymentProviderStatus>(),
  priority: integer('priority').notNull().default(100),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  oneActiveProvider: uniqueIndex('payment_providers_one_active_idx').on(table.status),
}));

export const commerceProducts = pgTable('commerce_products', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  type: varchar('type', { length: 40 }).notNull().$type<CommerceProductType>(),
  scopeType: varchar('scope_type', { length: 30 }).notNull().$type<CommerceScopeType>(),
  scopeId: varchar('scope_id'),
  code: varchar('code', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('draft').$type<CommerceProductStatus>(),
  visibility: varchar('visibility', { length: 20 }).notNull().default('private').$type<CommerceProductVisibility>(),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commercePrices = pgTable('commerce_prices', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  amountRub: integer('amount_rub').notNull(),
  period: varchar('period', { length: 20 }).notNull().$type<CommercePricePeriod>(),
  status: varchar('status', { length: 20 }).notNull().default('active').$type<CommercePriceStatus>(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commerceFeatureRegistry = pgTable('commerce_feature_registry', {
  key: varchar('key', { length: 120 }).primaryKey(),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 60 }).notNull(),
  scopeType: varchar('scope_type', { length: 30 }).notNull().$type<CommerceScopeType>(),
  valueType: varchar('value_type', { length: 20 }).notNull().default('boolean').$type<CommerceFeatureValueType>(),
  defaultBool: boolean('default_bool'),
  defaultInt: integer('default_int'),
  defaultText: text('default_text'),
  defaultJson: jsonb('default_json'),
  isPublic: boolean('is_public').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  scopeIdx: index('commerce_feature_registry_scope_idx').on(table.scopeType, table.category, table.isActive),
}));

export const commerceProductFeatures = pgTable('commerce_product_features', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  featureKey: varchar('feature_key', { length: 120 }).notNull(),
  valueType: varchar('value_type', { length: 20 }).notNull().default('boolean').$type<CommerceFeatureValueType>(),
  valueBool: boolean('value_bool'),
  valueInt: integer('value_int'),
  valueText: text('value_text'),
  valueJson: jsonb('value_json'),
  resetPeriod: varchar('reset_period', { length: 20 }).$type<CommerceFeatureResetPeriod>(),
  sortOrder: integer('sort_order').notNull().default(0),
  isHighlighted: boolean('is_highlighted').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  featureKeyIdx: index('commerce_product_features_feature_key_idx').on(table.featureKey),
}));

export const commerceOrders = pgTable('commerce_orders', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id),
  priceId: varchar('price_id').notNull().references(() => commercePrices.id),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<CommerceOrderStatus>(),
  amountRub: integer('amount_rub').notNull(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commercePayments = pgTable('commerce_payments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar('order_id').notNull().references(() => commerceOrders.id, { onDelete: 'cascade' }),
  providerId: varchar('provider_id').references(() => paymentProviders.id, { onDelete: 'set null' }),
  providerPaymentId: varchar('provider_payment_id', { length: 180 }),
  status: varchar('status', { length: 30 }).notNull().default('pending').$type<CommercePaymentStatus>(),
  amountRub: integer('amount_rub').notNull(),
  paymentMethodToken: text('payment_method_token'),
  fiscalReceiptId: varchar('fiscal_receipt_id', { length: 180 }),
  fiscalReceiptUrl: text('fiscal_receipt_url'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  providerPaymentUnique: uniqueIndex('commerce_payments_provider_payment_idx').on(table.providerId, table.providerPaymentId),
}));

export const commercePaymentEvents = pgTable('commerce_payment_events', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  providerCode: varchar('provider_code', { length: 40 }).notNull().$type<PaymentProviderCode>(),
  providerEventId: varchar('provider_event_id', { length: 180 }).notNull(),
  providerPaymentId: varchar('provider_payment_id', { length: 180 }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('received').$type<CommercePaymentEventStatus>(),
  receivedAt: timestamp('received_at').notNull().default(sql`now()`),
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),
}, (table) => ({
  providerEventUnique: uniqueIndex('commerce_payment_events_provider_event_idx').on(table.providerCode, table.providerEventId),
}));

export const commerceSubscriptions = pgTable('commerce_subscriptions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id),
  priceId: varchar('price_id').notNull().references(() => commercePrices.id),
  providerId: varchar('provider_id').references(() => paymentProviders.id, { onDelete: 'set null' }),
  providerSubscriptionId: varchar('provider_subscription_id', { length: 180 }),
  paymentMethodToken: text('payment_method_token'),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<CommerceSubscriptionStatus>(),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  graceUntil: timestamp('grace_until'),
  retryCount: integer('retry_count').notNull().default(0),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commerceEntitlements = pgTable('commerce_entitlements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopeType: varchar('scope_type', { length: 30 }).notNull().$type<CommerceScopeType>(),
  scopeId: varchar('scope_id'),
  featureKey: varchar('feature_key', { length: 120 }).notNull(),
  sourceType: varchar('source_type', { length: 30 }).notNull().$type<CommerceEntitlementSourceType>(),
  sourceId: varchar('source_id'),
  status: varchar('status', { length: 20 }).notNull().default('active').$type<CommerceEntitlementStatus>(),
  renewalStatus: varchar('renewal_status', { length: 30 }).notNull().default('active').$type<CommerceEntitlementRenewalStatus>(),
  renewalCancelledAt: timestamp('renewal_cancelled_at'),
  startsAt: timestamp('starts_at').notNull().default(sql`now()`),
  endsAt: timestamp('ends_at'),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commerceEntitlementActions = pgTable('commerce_entitlement_actions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  entitlementId: varchar('entitlement_id').notNull().references(() => commerceEntitlements.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  adminUserId: varchar('admin_user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: varchar('action_type', { length: 40 }).notNull().$type<CommerceEntitlementActionType>(),
  reason: text('reason').notNull(),
  previousStatus: varchar('previous_status', { length: 20 }).notNull().$type<CommerceEntitlementStatus>(),
  newStatus: varchar('new_status', { length: 20 }).notNull().$type<CommerceEntitlementStatus>(),
  previousEndsAt: timestamp('previous_ends_at'),
  newEndsAt: timestamp('new_ends_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => ({
  entitlementIdx: index('commerce_entitlement_actions_entitlement_idx').on(table.entitlementId, table.createdAt),
  userIdx: index('commerce_entitlement_actions_user_idx').on(table.userId, table.createdAt),
}));

export const readerClubTariffTemplates = pgTable('reader_club_tariff_templates', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  amountRub: integer('amount_rub').notNull(),
  period: varchar('period', { length: 20 }).notNull().$type<Exclude<CommercePricePeriod, 'one_time'>>(),
  readerShareBps: integer('reader_share_bps').notNull(),
  acquiringFeeBps: integer('acquiring_fee_bps').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('draft').$type<ReaderClubTariffTemplateStatus>(),
  visibility: varchar('visibility', { length: 20 }).notNull().default('private').$type<ReaderClubTariffVisibility>(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  statusIdx: index('reader_club_tariff_templates_status_idx').on(table.status, table.visibility, table.sortOrder),
}));

export const readerClubTariffRequests = pgTable('reader_club_tariff_requests', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  requestedBy: varchar('requested_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  requestedAmountRub: integer('requested_amount_rub').notNull(),
  requestedPeriod: varchar('requested_period', { length: 20 }).notNull().$type<Exclude<CommercePricePeriod, 'one_time'>>(),
  message: text('message'),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<ReaderClubTariffRequestStatus>(),
  reviewedBy: varchar('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  reviewComment: text('review_comment'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  clubStatusIdx: index('reader_club_tariff_requests_club_status_idx').on(table.clubId, table.status),
}));

export const readerClubTariffAssignments = pgTable('reader_club_tariff_assignments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  templateId: varchar('template_id').references(() => readerClubTariffTemplates.id, { onDelete: 'set null' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  selectedBy: varchar('selected_by').references(() => users.id, { onDelete: 'set null' }),
  readerShareBps: integer('reader_share_bps').notNull(),
  acquiringFeeBps: integer('acquiring_fee_bps').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('active').$type<ReaderClubTariffAssignmentStatus>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  activeClubIdx: uniqueIndex('reader_club_tariff_assignments_active_club_idx').on(table.clubId).where(sql`${table.status} = 'active'`),
}));

export const commerceLedgerEntries = pgTable('commerce_ledger_entries', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  paymentId: varchar('payment_id').notNull().references(() => commercePayments.id, { onDelete: 'cascade' }),
  orderId: varchar('order_id').notNull().references(() => commerceOrders.id, { onDelete: 'cascade' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  clubId: varchar('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  readerUserId: varchar('reader_user_id').references(() => users.id, { onDelete: 'set null' }),
  entryType: varchar('entry_type', { length: 30 }).notNull().$type<CommerceLedgerEntryType>(),
  amountKopecks: integer('amount_kopecks').notNull(),
  shareBps: integer('share_bps'),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<CommerceLedgerEntryStatus>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => ({
  paymentIdx: index('commerce_ledger_entries_payment_idx').on(table.paymentId),
  readerStatusIdx: index('commerce_ledger_entries_reader_status_idx').on(table.readerUserId, table.status),
}));

export const commerceRenewalReminders = pgTable('commerce_renewal_reminders', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  entitlementId: varchar('entitlement_id').notNull().references(() => commerceEntitlements.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  daysBeforeEnd: integer('days_before_end').notNull(),
  sentAt: timestamp('sent_at').notNull().default(sql`now()`),
}, (table) => ({
  entitlementDayIdx: uniqueIndex('commerce_renewal_reminders_entitlement_day_idx').on(table.entitlementId, table.daysBeforeEnd),
  userIdx: index('commerce_renewal_reminders_user_idx').on(table.userId, table.sentAt),
}));

export const commerceFinancialResetLog = pgTable('commerce_financial_reset_log', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  singletonKey: integer('singleton_key').notNull().default(1),
  executedBy: varchar('executed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  confirmationPhrase: text('confirmation_phrase').notNull(),
  summary: jsonb('summary').notNull().default(sql`'{}'::jsonb`),
  executedAt: timestamp('executed_at').notNull().default(sql`now()`),
}, (table) => ({
  onceIdx: uniqueIndex('commerce_financial_reset_once_idx').on(table.singletonKey),
}));

export type PaymentProviderConfig = typeof paymentProviders.$inferSelect;
export type InsertPaymentProviderConfig = typeof paymentProviders.$inferInsert;
export type CommerceProduct = typeof commerceProducts.$inferSelect;
export type InsertCommerceProduct = typeof commerceProducts.$inferInsert;
export type CommercePrice = typeof commercePrices.$inferSelect;
export type InsertCommercePrice = typeof commercePrices.$inferInsert;
export type CommerceFeatureRegistryItem = typeof commerceFeatureRegistry.$inferSelect;
export type InsertCommerceFeatureRegistryItem = typeof commerceFeatureRegistry.$inferInsert;
export type CommerceProductFeature = typeof commerceProductFeatures.$inferSelect;
export type InsertCommerceProductFeature = typeof commerceProductFeatures.$inferInsert;
export type CommerceOrder = typeof commerceOrders.$inferSelect;
export type InsertCommerceOrder = typeof commerceOrders.$inferInsert;
export type CommercePayment = typeof commercePayments.$inferSelect;
export type InsertCommercePayment = typeof commercePayments.$inferInsert;
export type CommercePaymentEvent = typeof commercePaymentEvents.$inferSelect;
export type InsertCommercePaymentEvent = typeof commercePaymentEvents.$inferInsert;
export type CommerceSubscription = typeof commerceSubscriptions.$inferSelect;
export type InsertCommerceSubscription = typeof commerceSubscriptions.$inferInsert;
export type CommerceEntitlement = typeof commerceEntitlements.$inferSelect;
export type InsertCommerceEntitlement = typeof commerceEntitlements.$inferInsert;
export type CommerceEntitlementAction = typeof commerceEntitlementActions.$inferSelect;
export type InsertCommerceEntitlementAction = typeof commerceEntitlementActions.$inferInsert;
export type ReaderClubTariffTemplate = typeof readerClubTariffTemplates.$inferSelect;
export type InsertReaderClubTariffTemplate = typeof readerClubTariffTemplates.$inferInsert;
export type ReaderClubTariffRequest = typeof readerClubTariffRequests.$inferSelect;
export type InsertReaderClubTariffRequest = typeof readerClubTariffRequests.$inferInsert;
export type ReaderClubTariffAssignment = typeof readerClubTariffAssignments.$inferSelect;
export type InsertReaderClubTariffAssignment = typeof readerClubTariffAssignments.$inferInsert;
export type CommerceLedgerEntry = typeof commerceLedgerEntries.$inferSelect;
export type InsertCommerceLedgerEntry = typeof commerceLedgerEntries.$inferInsert;
export type CommerceRenewalReminder = typeof commerceRenewalReminders.$inferSelect;
export type InsertCommerceRenewalReminder = typeof commerceRenewalReminders.$inferInsert;
export type CommerceFinancialResetLog = typeof commerceFinancialResetLog.$inferSelect;
export type InsertCommerceFinancialResetLog = typeof commerceFinancialResetLog.$inferInsert;
