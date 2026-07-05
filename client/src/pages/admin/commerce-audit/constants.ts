export const paymentStatusLabels: Record<string, string> = {
  pending: "Ожидает", succeeded: "Успешен", failed: "Ошибка", cancelled: "Отменён", refunded: "Возврат",
};
export const orderStatusLabels: Record<string, string> = {
  pending: "Ожидает", paid: "Оплачен", cancelled: "Отменён", expired: "Истёк", failed: "Ошибка",
};
export const ledgerTypeLabels: Record<string, string> = {
  acquiring_fee: "Эквайринг", reader_earning: "Чтецу", platform_fee: "Платформа",
};
export const ledgerStatusLabels: Record<string, string> = {
  pending: "Ожидает", available: "Доступно", paid: "Выплачено", withdrawn: "Выведено", void: "Аннулировано",
};
export const entitlementStatusLabels: Record<string, string> = {
  active: "Активно", revoked: "Отозвано", expired: "Истекло", deleted: "Удалено",
};
export const sourceTypeLabels: Record<string, string> = {
  payment: "Платёж", subscription: "Подписка", promo: "Промо", admin_grant: "Выдача", migration: "Миграция",
};
export const eventStatusLabels: Record<string, string> = {
  received: "Получено", processed: "Обработано", failed: "Ошибка",
};
export const productTypeLabels: Record<string, string> = {
  platform_subscription: "Платформа", club_subscription: "Клуб", reader_club_subscription: "Клуб чтеца",
  ticket: "Билет", recording_access: "Запись", donation: "Донат",
};
export const scopeTypeLabels: Record<string, string> = {
  platform: "Платформа", club: "Клуб", reader_club: "Клуб чтеца", session: "Сессия", recording: "Запись", reader: "Чтец",
};
export const discrepancyTypeLabels: Record<string, string> = {
  payment_succeeded_order_not_paid: "Платёж успешен, заказ не оплачен",
  order_paid_payment_not_succeeded: "Заказ оплачен, платёж не успешен",
  succeeded_payment_without_processed_event: "Платёж без события провайдера",
  reader_club_payment_without_membership: "Платёж за клуб без членства",
  reader_club_payment_without_ledger: "Платёж за клуб без начислений",
  ledger_sum_mismatch: "Несовпадение суммы начислений",
  processed_provider_event_without_payment: "Событие без платежа",
  paid_order_without_entitlement: "Оплаченный заказ без доступа",
  active_entitlement_without_valid_source: "Доступ без источника",
};
export const resetCountLabels: Record<string, string> = {
  orders: "Заказы",
  payments: "Платежи",
  paymentEvents: "События",
  ledgerEntries: "Проводки",
  subscriptions: "Подписки",
  paymentEntitlements: "Payment-доступы",
  renewalReminders: "Напоминания",
  entitlementActions: "Действия доступов",
  productsToArchive: "Продукты в архив",
  pricesToArchive: "Цены в архив",
  productFeaturesToDisable: "Фичи отключить",
  tariffTemplatesToArchive: "Шаблоны в архив",
  tariffAssignmentsToArchive: "Назначения в архив",
};

export const PAGE_SIZE = 20;
