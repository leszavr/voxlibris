import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  Trash2,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativePickerInput } from "@/components/ui/native-picker-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

// ── Типы ответов API ──────────────────────────────────────────────────────────

interface AuditSummary {
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

interface AuditPayment {
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

interface AuditListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface AuditOrder {
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

interface AuditLedgerEntry {
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

interface AuditEntitlement {
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

interface AuditEvent {
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

interface Discrepancy {
  type: string;
  severity: "critical" | "warning";
  entityType: string;
  entityId: string;
  description: string;
  details?: unknown;
}

interface DiscrepancyListResult extends AuditListResult<Discrepancy> {
  byType: Record<string, number>;
}

interface FinancialResetPreview {
  canExecute: boolean;
  alreadyExecuted: boolean;
  executed: { executedAt: string; executedBy: string; summary: unknown } | null;
  executorRequired: { id: string; email: string; username: string; createdAt: string } | null;
  isCurrentUserExecutor: boolean;
  confirmationPhrase: string;
  counts: Record<string, number>;
  warnings: string[];
}

interface FinancialResetResult {
  executed: boolean;
  summary: Record<string, number>;
}

interface PaymentDetails {
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

// ── Лейблы ────────────────────────────────────────────────────────────────────

const paymentStatusLabels: Record<string, string> = {
  pending: "Ожидает", succeeded: "Успешен", failed: "Ошибка", cancelled: "Отменён", refunded: "Возврат",
};
const orderStatusLabels: Record<string, string> = {
  pending: "Ожидает", paid: "Оплачен", cancelled: "Отменён", expired: "Истёк", failed: "Ошибка",
};
const ledgerTypeLabels: Record<string, string> = {
  acquiring_fee: "Эквайринг", reader_earning: "Чтецу", platform_fee: "Платформа",
};
const ledgerStatusLabels: Record<string, string> = {
  pending: "Ожидает", available: "Доступно", paid: "Выплачено", withdrawn: "Выведено", void: "Аннулировано",
};
const entitlementStatusLabels: Record<string, string> = {
  active: "Активно", revoked: "Отозвано", expired: "Истекло", deleted: "Удалено",
};
const sourceTypeLabels: Record<string, string> = {
  payment: "Платёж", subscription: "Подписка", promo: "Промо", admin_grant: "Выдача", migration: "Миграция",
};
const eventStatusLabels: Record<string, string> = {
  received: "Получено", processed: "Обработано", failed: "Ошибка",
};
const productTypeLabels: Record<string, string> = {
  platform_subscription: "Платформа", club_subscription: "Клуб", reader_club_subscription: "Клуб чтеца",
  ticket: "Билет", recording_access: "Запись", donation: "Донат",
};
const scopeTypeLabels: Record<string, string> = {
  platform: "Платформа", club: "Клуб", reader_club: "Клуб чтеца", session: "Сессия", recording: "Запись", reader: "Чтец",
};
const discrepancyTypeLabels: Record<string, string> = {
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
const resetCountLabels: Record<string, string> = {
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

function labelOf<T extends string>(labels: Record<T, string>, value: T | string) {
  return labels[value as T] ?? value;
}

// ── Форматирование ────────────────────────────────────────────────────────────

function formatMoney(kopecks: number): string {
  const rub = kopecks / 100;
  return rub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " руб.";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function paymentIdFromDiscrepancy(discrepancy: Discrepancy): string | null {
  if (discrepancy.entityType === "payment") return discrepancy.entityId;
  const details = discrepancy.details;
  if (!details || typeof details !== "object" || !("paymentId" in details)) return null;
  const paymentId = (details as { paymentId?: unknown }).paymentId;
  return typeof paymentId === "string" ? paymentId : null;
}

function clickableRowClass(paymentId: string | null | undefined) {
  return paymentId ? "cursor-pointer hover:bg-muted/50" : "";
}

function discrepancyDetails(discrepancy: Discrepancy): Record<string, unknown> {
  return discrepancy.details && typeof discrepancy.details === "object" ? discrepancy.details as Record<string, unknown> : {};
}

function formatDiscrepancyDetail(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (key.toLowerCase().includes("kopecks") && typeof value === "number") return formatMoney(value);
  return String(value);
}

// ── Фильтры ───────────────────────────────────────────────────────────────────

interface FilterState {
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

const emptyFilters: FilterState = {
  from: "", to: "", status: "", provider: "", productType: "", scopeType: "", scopeId: "", userId: "", search: "",
};

function buildParams(filters: FilterState, page: number, pageSize: number): Record<string, string> {
  const params: Record<string, string> = {
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  };
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.status) params.status = filters.status;
  if (filters.provider) params.provider = filters.provider;
  if (filters.productType) params.productType = filters.productType;
  if (filters.scopeType) params.scopeType = filters.scopeType;
  if (filters.scopeId) params.scopeId = filters.scopeId;
  if (filters.userId) params.userId = filters.userId;
  if (filters.search) params.search = filters.search;
  return params;
}

function toQueryString(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

// ── UI-компоненты-состояния ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorState({ error, onRetry }: Readonly<{ error: unknown; onRetry?: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {error instanceof Error ? error.message : "Ошибка загрузки данных"}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Повторить
        </Button>
      ) : null}
    </div>
  );
}

function EmptyState({ text }: Readonly<{ text: string }>) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

// ── Карточка сводки ───────────────────────────────────────────────────────────

function SummaryCard({ title, value, sub, icon }: Readonly<{ title: string; value: string | number; sub?: string; icon: React.ReactNode }>) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

// ── Пагинация ─────────────────────────────────────────────────────────────────

function Pagination({ page, pageSize, total, onPage }: Readonly<{ page: number; pageSize: number; total: number; onPage: (page: number) => void }>) {
  const pages = Math.ceil(total / pageSize) || 1;
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between mt-4">
      <div className="text-sm text-muted-foreground">
        Показано {from}–{to} из {total}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Назад
        </Button>
        <span className="text-sm">Стр. {page} из {pages}</span>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} className="gap-1">
          Вперёд <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Бейджи статусов ───────────────────────────────────────────────────────────

function StatusBadge({ status, labels }: Readonly<{ status: string; labels: Record<string, string> }>) {
  const variant: "default" | "destructive" | "secondary" | "outline" =
    status === "succeeded" || status === "paid" || status === "processed" || status === "active" || status === "available"
      ? "default"
      : status === "failed" || status === "revoked" || status === "deleted" || status === "void"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{labelOf(labels, status)}</Badge>;
}

// ── Главная страница ──────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function CommerceAuditPage() {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [page, setPage] = useState(1);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<Discrepancy | null>(null);
  const [activeDiscrepancyType, setActiveDiscrepancyType] = useState<string | null>(null);
  const [resetPhrase, setResetPhrase] = useState("");

  const params = useMemo(() => buildParams(appliedFilters, page, PAGE_SIZE), [appliedFilters, page]);

  const summary = useQuery({
    queryKey: ["commerce-audit-summary", appliedFilters],
    queryFn: () => apiRequest<AuditSummary>(`/api/commerce/admin/audit/summary?${toQueryString(buildParams(appliedFilters, 1, 1))}`),
  });

  const payments = useQuery({
    queryKey: ["commerce-audit-payments", params],
    queryFn: () => apiRequest<AuditListResult<AuditPayment>>(`/api/commerce/admin/audit/payments?${toQueryString(params)}`),
  });

  const orders = useQuery({
    queryKey: ["commerce-audit-orders", params],
    queryFn: () => apiRequest<AuditListResult<AuditOrder>>(`/api/commerce/admin/audit/orders?${toQueryString(params)}`),
  });

  const ledger = useQuery({
    queryKey: ["commerce-audit-ledger", params],
    queryFn: () => apiRequest<AuditListResult<AuditLedgerEntry>>(`/api/commerce/admin/audit/ledger?${toQueryString(params)}`),
  });

  const entitlements = useQuery({
    queryKey: ["commerce-audit-entitlements", params],
    queryFn: () => apiRequest<AuditListResult<AuditEntitlement>>(`/api/commerce/admin/audit/entitlements?${toQueryString(params)}`),
  });

  const events = useQuery({
    queryKey: ["commerce-audit-events", params],
    queryFn: () => apiRequest<AuditListResult<AuditEvent>>(`/api/commerce/admin/audit/provider-events?${toQueryString(params)}`),
  });

  const discrepancies = useQuery({
    queryKey: ["commerce-audit-discrepancies", params],
    queryFn: () => apiRequest<DiscrepancyListResult>(`/api/commerce/admin/audit/discrepancies?${toQueryString(params)}`),
  });

  const paymentDetails = useQuery({
    queryKey: ["commerce-audit-payment-details", selectedPaymentId],
    enabled: Boolean(selectedPaymentId),
    queryFn: () => apiRequest<PaymentDetails>(`/api/commerce/admin/audit/payments/${selectedPaymentId}`),
  });

  const shownDiscrepancies = useMemo(() => {
    const items = discrepancies.data?.items ?? [];
    return activeDiscrepancyType ? items.filter((item) => item.type === activeDiscrepancyType) : items;
  }, [activeDiscrepancyType, discrepancies.data?.items]);

  const resetPreview = useQuery({
    queryKey: ["commerce-financial-reset-preview"],
    queryFn: () => apiRequest<FinancialResetPreview>("/api/commerce/admin/financial-reset/preview"),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest<FinancialResetResult>("/api/commerce/admin/financial-reset/execute", {
      method: "POST",
      body: JSON.stringify({ confirmationPhrase: resetPhrase }),
    }),
    onSuccess: () => {
      setResetPhrase("");
      resetPreview.refetch();
      refetchAll();
    },
  });

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  };

  const isRefreshing = summary.isFetching || payments.isFetching || orders.isFetching || ledger.isFetching || entitlements.isFetching || events.isFetching || discrepancies.isFetching;

  const refetchAll = () => {
    void Promise.all([
      summary.refetch(),
      payments.refetch(),
      orders.refetch(),
      ledger.refetch(),
      entitlements.refetch(),
      events.refetch(),
      discrepancies.refetch(),
    ]);
  };

  return (
    <AdminLayout>
      <div className="container mx-auto space-y-6 px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Финансовый аудит</h1>
            <p className="text-muted-foreground">
              Мониторинг платежей, заказов, начислений и расхождений коммерческой цепочки.
            </p>
          </div>
          <Button variant="outline" onClick={refetchAll} disabled={isRefreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Обновить
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" /> Фильтры
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
              <div>
                <Label htmlFor="from">Дата от</Label>
                <NativePickerInput id="from" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="to">Дата до</Label>
                <NativePickerInput id="to" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              </div>
              <div>
                <Label>Статус</Label>
                <Input placeholder="succeeded, paid, active…" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} />
              </div>
              <div>
                <Label>Провайдер</Label>
                <Select value={filters.provider || "all"} onValueChange={(v) => setFilters({ ...filters, provider: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Все" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    <SelectItem value="yookassa">YooKassa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Тип продукта</Label>
                <Select value={filters.productType || "all"} onValueChange={(v) => setFilters({ ...filters, productType: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Все" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {Object.entries(productTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Область</Label>
                <Select value={filters.scopeType || "all"} onValueChange={(v) => setFilters({ ...filters, scopeType: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Все" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {Object.entries(scopeTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ID области</Label>
                <Input placeholder="clubId…" value={filters.scopeId} onChange={(e) => setFilters({ ...filters, scopeId: e.target.value })} />
              </div>
              <div>
                <Label>Поиск пользователя</Label>
                <Input placeholder="email или username" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={applyFilters} className="gap-2"><Search className="h-4 w-4" /> Применить</Button>
              <Button variant="outline" onClick={resetFilters} className="gap-2"><X className="h-4 w-4" /> Сбросить</Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {summary.isLoading ? <LoadingState /> : summary.error ? <ErrorState error={summary.error} onRetry={summary.refetch} /> : summary.data ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <SummaryCard title="Выручка" value={summary.data.payments.revenueFormatted} sub="за период" icon={<CheckCircle2 className="h-4 w-4" />} />
            <SummaryCard title="Платежей" value={summary.data.payments.total} sub={`успешных: ${summary.data.payments.succeeded}`} icon={<CheckCircle2 className="h-4 w-4" />} />
            <SummaryCard title="Заказов" value={summary.data.orders.total} sub={`оплачено: ${summary.data.orders.paid}`} icon={<CheckCircle2 className="h-4 w-4" />} />
            <SummaryCard title="Начислений" value={summary.data.ledger.total} sub={`чтецам: ${formatMoney(summary.data.ledger.readerEarningsKopecks)}`} icon={<CheckCircle2 className="h-4 w-4" />} />
            <SummaryCard title="Доступов" value={summary.data.entitlements.active} sub={`отозвано: ${summary.data.entitlements.revoked}`} icon={<CheckCircle2 className="h-4 w-4" />} />
            <SummaryCard title="Расхождений" value={summary.data.discrepancies.total} sub={summary.data.discrepancies.total > 0 ? "требуют внимания" : "всё корректно"} icon={<ShieldAlert className="h-4 w-4" />} />
          </div>
        ) : null}

        {/* Tabs */}
        <Tabs defaultValue="payments">
          <TabsList className="flex-wrap">
            <TabsTrigger value="payments">Платежи</TabsTrigger>
            <TabsTrigger value="orders">Заказы</TabsTrigger>
            <TabsTrigger value="ledger">Начисления</TabsTrigger>
            <TabsTrigger value="entitlements">Доступы</TabsTrigger>
            <TabsTrigger value="events">События</TabsTrigger>
            <TabsTrigger value="discrepancies">
              Расхождения
              {discrepancies.data ? <Badge variant={discrepancies.data.total > 0 ? "destructive" : "secondary"} className="ml-2">{discrepancies.data.total}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="reset" className="bg-destructive font-bold text-destructive-foreground hover:bg-destructive/80 data-[state=active]:bg-destructive/80 data-[state=active]:text-destructive-foreground">Активация рабочего режима</TabsTrigger>
          </TabsList>

          {/* Payments */}
          <TabsContent value="payments">
            <Card>
              <CardHeader><CardTitle>Платежи</CardTitle><CardDescription>Список платежей с деталями заказа и провайдера</CardDescription></CardHeader>
              <CardContent>
                {payments.isLoading ? <LoadingState /> : payments.error ? <ErrorState error={payments.error} onRetry={payments.refetch} /> : (
                  <>
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Дата</TableHead>
                            <TableHead>Статус</TableHead>
                            <TableHead>Сумма</TableHead>
                            <TableHead>Пользователь</TableHead>
                            <TableHead>Продукт</TableHead>
                            <TableHead>Провайдер</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.data?.items.length === 0 ? (
                            <TableRow><TableCell colSpan={7}><EmptyState text="Платежей не найдено" /></TableCell></TableRow>
                          ) : payments.data?.items.map((p) => (
                            <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedPaymentId(p.id)}>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                              <TableCell><StatusBadge status={p.status} labels={paymentStatusLabels} /></TableCell>
                              <TableCell className="font-medium" title={p.amountFormatted}>{formatMoney(p.amountKopecks)}</TableCell>
                              <TableCell className="text-sm">{p.user?.email ?? p.order?.userId ?? "—"}</TableCell>
                              <TableCell className="text-sm">{p.product ? labelOf(productTypeLabels, p.product.type) : "—"}</TableCell>
                              <TableCell className="text-sm">{p.provider?.code ?? "—"}</TableCell>
                              <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={payments.data?.total ?? 0} onPage={setPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders */}
          <TabsContent value="orders">
            <Card>
              <CardHeader><CardTitle>Заказы</CardTitle><CardDescription>Реестр заказов</CardDescription></CardHeader>
              <CardContent>
                {orders.isLoading ? <LoadingState /> : orders.error ? <ErrorState error={orders.error} onRetry={orders.refetch} /> : (
                  <>
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Дата</TableHead>
                            <TableHead>Статус</TableHead>
                            <TableHead>Сумма</TableHead>
                            <TableHead>Пользователь</TableHead>
                            <TableHead>Продукт</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.data?.items.length === 0 ? (
                            <TableRow><TableCell colSpan={5}><EmptyState text="Заказов не найдено" /></TableCell></TableRow>
                          ) : orders.data?.items.map((o) => (
                            <TableRow key={o.id} className={clickableRowClass(o.paymentId)} onClick={() => o.paymentId && setSelectedPaymentId(o.paymentId)}>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                              <TableCell><StatusBadge status={o.status} labels={orderStatusLabels} /></TableCell>
                              <TableCell className="font-medium" title={o.amountFormatted}>{formatMoney(o.amountKopecks)}</TableCell>
                              <TableCell className="text-sm">{o.user?.email ?? o.userId}</TableCell>
                              <TableCell className="text-sm">{o.product?.title ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={orders.data?.total ?? 0} onPage={setPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ledger */}
          <TabsContent value="ledger">
            <Card>
              <CardHeader><CardTitle>Начисления</CardTitle><CardDescription>Финансовые записи по распределению денег</CardDescription></CardHeader>
              <CardContent>
                {ledger.isLoading ? <LoadingState /> : ledger.error ? <ErrorState error={ledger.error} onRetry={ledger.refetch} /> : (
                  <>
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Дата</TableHead>
                            <TableHead>Тип</TableHead>
                            <TableHead>Статус</TableHead>
                            <TableHead>Сумма</TableHead>
                            <TableHead>Чтец</TableHead>
                            <TableHead>Клуб</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ledger.data?.items.length === 0 ? (
                            <TableRow><TableCell colSpan={6}><EmptyState text="Записей не найдено" /></TableCell></TableRow>
                          ) : ledger.data?.items.map((l) => (
                            <TableRow key={l.id} className={clickableRowClass(l.paymentId)} onClick={() => setSelectedPaymentId(l.paymentId)}>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(l.createdAt)}</TableCell>
                              <TableCell className="text-sm">{labelOf(ledgerTypeLabels, l.entryType)}</TableCell>
                              <TableCell><StatusBadge status={l.status} labels={ledgerStatusLabels} /></TableCell>
                              <TableCell className="font-medium" title={l.amountFormatted}>{formatMoney(l.amountKopecks)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{l.readerUserId ?? "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{l.clubId ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={ledger.data?.total ?? 0} onPage={setPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Entitlements */}
          <TabsContent value="entitlements">
            <Card>
              <CardHeader><CardTitle>Доступы</CardTitle><CardDescription>Права, выданные пользователям после оплаты или вручную</CardDescription></CardHeader>
              <CardContent>
                {entitlements.isLoading ? <LoadingState /> : entitlements.error ? <ErrorState error={entitlements.error} onRetry={entitlements.refetch} /> : (
                  <>
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Дата</TableHead>
                            <TableHead>Право</TableHead>
                            <TableHead>Статус</TableHead>
                            <TableHead>Источник</TableHead>
                            <TableHead>Пользователь</TableHead>
                            <TableHead>Область</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entitlements.data?.items.length === 0 ? (
                            <TableRow><TableCell colSpan={6}><EmptyState text="Доступов не найдено" /></TableCell></TableRow>
                          ) : entitlements.data?.items.map((e) => (
                            <TableRow key={e.id} className={clickableRowClass(e.sourceType === "payment" ? e.sourceId : null)} onClick={() => e.sourceType === "payment" && e.sourceId && setSelectedPaymentId(e.sourceId)}>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(e.createdAt)}</TableCell>
                              <TableCell className="font-mono text-xs">{e.featureKey}</TableCell>
                              <TableCell><StatusBadge status={e.status} labels={entitlementStatusLabels} /></TableCell>
                              <TableCell className="text-sm">{labelOf(sourceTypeLabels, e.sourceType)}</TableCell>
                              <TableCell className="text-sm">{e.user?.email ?? e.userId}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{labelOf(scopeTypeLabels, e.scopeType)}{e.scopeId ? `:${e.scopeId.slice(0, 8)}` : ""}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={entitlements.data?.total ?? 0} onPage={setPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Events */}
          <TabsContent value="events">
            <Card>
              <CardHeader><CardTitle>События провайдера</CardTitle><CardDescription>Вебхуки и уведомления от платёжных провайдеров</CardDescription></CardHeader>
              <CardContent>
                {events.isLoading ? <LoadingState /> : events.error ? <ErrorState error={events.error} onRetry={events.refetch} /> : (
                  <>
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Получено</TableHead>
                            <TableHead>Событие</TableHead>
                            <TableHead>Статус</TableHead>
                            <TableHead>Провайдер</TableHead>
                            <TableHead>ID платежа у провайдера</TableHead>
                            <TableHead>Ошибка</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {events.data?.items.length === 0 ? (
                            <TableRow><TableCell colSpan={6}><EmptyState text="Событий не найдено" /></TableCell></TableRow>
                          ) : events.data?.items.map((ev) => (
                            <TableRow key={ev.id} className={clickableRowClass(ev.paymentId)} onClick={() => ev.paymentId && setSelectedPaymentId(ev.paymentId)}>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(ev.receivedAt)}</TableCell>
                              <TableCell className="font-mono text-xs">{ev.eventType}</TableCell>
                              <TableCell><StatusBadge status={ev.status} labels={eventStatusLabels} /></TableCell>
                              <TableCell className="text-sm">{ev.providerCode}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{ev.providerPaymentId ?? "—"}</TableCell>
                              <TableCell className="max-w-[200px] truncate text-xs text-destructive" title={ev.errorMessage ?? ""}>{ev.errorMessage ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={events.data?.total ?? 0} onPage={setPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Discrepancies */}
          <TabsContent value="discrepancies">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" /> Расхождения
                </CardTitle>
                <CardDescription>Автоматически обнаруженные проблемы в коммерческой цепочке</CardDescription>
              </CardHeader>
              <CardContent>
                {discrepancies.isLoading ? <LoadingState /> : discrepancies.error ? <ErrorState error={discrepancies.error} onRetry={discrepancies.refetch} /> : (
                  <>
                    {discrepancies.data && discrepancies.data.total > 0 ? (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {activeDiscrepancyType ? (
                          <Button size="sm" variant="ghost" onClick={() => setActiveDiscrepancyType(null)}>Показать все</Button>
                        ) : null}
                        {Object.entries(discrepancies.data.byType).map(([type, count]) => (
                          <button key={type} type="button" onClick={() => setActiveDiscrepancyType(type)}>
                          <Badge variant={activeDiscrepancyType === type ? "default" : "outline"} className="gap-1 cursor-pointer">
                            {labelOf(discrepancyTypeLabels, type)}: {count}
                          </Badge>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Тип</TableHead>
                            <TableHead>Важность</TableHead>
                            <TableHead>Сущность</TableHead>
                            <TableHead>Описание</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shownDiscrepancies.length === 0 ? (
                            <TableRow><TableCell colSpan={4}><EmptyState text="🎉 Расхождений не обнаружено" /></TableCell></TableRow>
                          ) : shownDiscrepancies.map((d, i) => {
                            return (
                            <TableRow key={`${d.entityId}-${d.type}-${i}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedDiscrepancy(d)}>
                              <TableCell className="text-sm font-medium">{labelOf(discrepancyTypeLabels, d.type)}</TableCell>
                              <TableCell>
                                <Badge variant={d.severity === "critical" ? "destructive" : "secondary"} className="gap-1">
                                  {d.severity === "critical" ? <AlertTriangle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                                  {d.severity === "critical" ? "Критично" : "Предупреждение"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{d.entityType}:{d.entityId.slice(0, 8)}</TableCell>
                              <TableCell className="text-sm">{d.description}</TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={discrepancies.data?.total ?? 0} onPage={setPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reset">
            <Card className="border-2 border-destructive/70 bg-destructive/5">
              <CardHeader className="border-b border-destructive/30 bg-destructive/10">
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" /> Активация рабочего режима
                </CardTitle>
                <CardDescription className="text-destructive/80">
                  Удаляет тестовые платежи, заказы, проводки, подписки и payment-based доступы. Продукты и тарифы архивируются.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {resetPreview.isLoading ? <LoadingState /> : resetPreview.error ? <ErrorState error={resetPreview.error} onRetry={resetPreview.refetch} /> : resetPreview.data ? (
                  resetPreview.data.alreadyExecuted ? (
                    <div className="space-y-4 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-5 text-destructive">
                      <div className="flex items-center gap-2 text-lg font-semibold">
                        <CheckCircle2 className="h-5 w-5" /> Платформа переведена в рабочий режим
                      </div>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        <li>Все тестовые финансовые данные удалены.</li>
                        <li>Тестовые тарифы и коммерческие продукты архивированы.</li>
                        <li>Финансовые показатели очищены до нуля.</li>
                        <li>Повторный финансовый сброс невозможен.</li>
                      </ul>
                      {resetPreview.data.executed?.executedAt ? (
                        <div className="text-xs font-medium text-destructive/80">
                          Выполнено: {formatDate(resetPreview.data.executed.executedAt)} · admin: {resetPreview.data.executed.executedBy}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {Object.entries(resetPreview.data.counts).map(([key, value]) => (
                          <div key={key} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                            <div className="text-xs font-medium text-destructive/80">{resetCountLabels[key] ?? key}</div>
                            <div className="text-xl font-semibold text-destructive">{value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-lg border-2 border-destructive/50 bg-destructive/10 p-4">
                        <div className="mb-2 font-medium text-destructive">Внимание</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {resetPreview.data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      </div>

                      <div className="rounded-lg border border-destructive/30 bg-background p-3 text-sm">
                        Главный администратор: {resetPreview.data.executorRequired?.email ?? "не найден"}
                        {!resetPreview.data.isCurrentUserExecutor ? <span className="ml-2 text-destructive">Текущий пользователь не может выполнить reset.</span> : null}
                      </div>

                      <div className="space-y-2">
                        <Label>Введите точную фразу подтверждения</Label>
                        <div className="rounded border border-destructive/30 bg-destructive/5 p-2 font-mono text-xs text-destructive">{resetPreview.data.confirmationPhrase}</div>
                        <Input value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value)} disabled={!resetPreview.data.canExecute || resetMutation.isPending} />
                      </div>

                      {resetMutation.error ? <ErrorState error={resetMutation.error} onRetry={() => resetMutation.reset()} /> : null}
                      {resetMutation.data?.executed ? (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">Очистка выполнена успешно.</div>
                      ) : null}

                      <Button
                        variant="destructive"
                        className="gap-2"
                        disabled={!resetPreview.data.canExecute || resetPhrase !== resetPreview.data.confirmationPhrase || resetMutation.isPending}
                        onClick={() => resetMutation.mutate()}
                      >
                        {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Активировать рабочий режим и заблокировать повтор
                      </Button>
                    </>
                  )
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={Boolean(selectedDiscrepancy)} onOpenChange={(open) => !open && setSelectedDiscrepancy(null)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Карточка расхождения</DialogTitle>
              <DialogDescription>Подробности проблемной цепочки и данные, из-за которых сработала проверка</DialogDescription>
            </DialogHeader>
            {selectedDiscrepancy ? (
              <DiscrepancyDetailsView
                discrepancy={selectedDiscrepancy}
                openPayment={(paymentId) => {
                  setSelectedDiscrepancy(null);
                  setSelectedPaymentId(paymentId);
                }}
              />
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Payment Details Dialog */}
        <Dialog open={Boolean(selectedPaymentId)} onOpenChange={(open) => !open && setSelectedPaymentId(null)}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Детали платежа</DialogTitle>
              <DialogDescription>
                Полная цепочка: платёж → заказ → продукт → события → доступы → начисления
              </DialogDescription>
            </DialogHeader>
            {paymentDetails.isLoading ? <LoadingState /> : paymentDetails.error ? <ErrorState error={paymentDetails.error} onRetry={paymentDetails.refetch} /> : paymentDetails.data ? (
              <PaymentDetailsView data={paymentDetails.data} />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

// ── Детали платежа ────────────────────────────────────────────────────────────

function DiscrepancyDetailsView({ discrepancy, openPayment }: Readonly<{ discrepancy: Discrepancy; openPayment: (paymentId: string) => void }>) {
  const details = discrepancyDetails(discrepancy);
  const paymentId = paymentIdFromDiscrepancy(discrepancy);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={discrepancy.severity === "critical" ? "destructive" : "secondary"} className="gap-1">
            {discrepancy.severity === "critical" ? <AlertTriangle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {discrepancy.severity === "critical" ? "Критично" : "Предупреждение"}
          </Badge>
          <span className="font-medium">{labelOf(discrepancyTypeLabels, discrepancy.type)}</span>
        </div>
        <p className="text-sm">{discrepancy.description}</p>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <Label>Проблемная сущность</Label>
          <div className="mt-1 font-mono text-xs">{discrepancy.entityType}:{discrepancy.entityId}</div>
        </div>
        <div className="rounded-lg border p-3">
          <Label>Связанный платёж</Label>
          <div className="mt-1 font-mono text-xs">{paymentId ?? "Не найден"}</div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-medium">Что вызвало расхождение</h3>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          {Object.entries(details).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <div className="text-xs text-amber-800">{key}</div>
              <div className="break-all font-mono text-xs">{formatDiscrepancyDetail(key, value)}</div>
            </div>
          ))}
        </div>
      </div>

      {paymentId ? <Button onClick={() => openPayment(paymentId)}>Открыть полную цепочку платежа</Button> : null}
    </div>
  );
}

function PaymentDetailsView({ data }: Readonly<{ data: PaymentDetails }>) {
  const { payment, product, price, user, provider, events, entitlements, ledger, diagnostics } = data;

  return (
    <div className="space-y-6">
      {/* Основная информация */}
      <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
        <div><Label>ID платежа</Label><div className="font-mono text-xs bg-muted p-2 rounded">{payment.id}</div></div>
        <div><Label>Статус</Label><div><StatusBadge status={payment.status} labels={paymentStatusLabels} /></div></div>
        <div><Label>Сумма</Label><div className="font-medium" title={payment.amountFormatted}>{formatMoney(payment.amountKopecks)}</div></div>
        <div><Label>Провайдер</Label><div>{provider ? `${provider.name} (${provider.code})` : "—"}</div></div>
        <div><Label>ID платежа у провайдера</Label><div className="font-mono text-xs">{payment.providerPaymentId ?? "—"}</div></div>
        <div><Label>Дата</Label><div>{formatDate(payment.createdAt)}</div></div>
        <div><Label>Пользователь</Label><div>{user ? `${user.email} (${user.username})` : "—"}</div></div>
        <div><Label>Продукт</Label><div>{product ? `${product.title} (${labelOf(productTypeLabels, product.type)})` : "—"}</div></div>
        <div><Label>Цена</Label><div>{price ? `${price.amountRub} ₽ / ${price.period}` : "—"}</div></div>
        {payment.fiscalReceiptUrl ? (
          <div><Label>Чек</Label><a href={payment.fiscalReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Открыть чек ↗</a></div>
        ) : null}
      </div>

      {/* Диагностика */}
      <Card>
        <CardHeader><CardTitle className="text-base">Диагностика цепочки</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <DiagItem label="Заказ" ok={diagnostics.hasOrder} />
            <DiagItem label="Провайдер" ok={diagnostics.hasProvider} />
            <DiagItem label="Событие провайдера" ok={diagnostics.hasProviderEvent} />
            <DiagItem label="Доступ выдан" ok={diagnostics.hasEntitlement} />
            <DiagItem label="Членство/грант" ok={diagnostics.hasMembershipOrGrant} />
            <DiagItem label="Начисления созданы" ok={diagnostics.hasLedgerEntries} />
            <div className="flex items-center gap-2">
              {diagnostics.ledgerAmountMatchesPayment === null ? (
                <span className="text-muted-foreground">—</span>
              ) : diagnostics.ledgerAmountMatchesPayment ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm">Сумма начислений: {formatMoney(diagnostics.ledgerAmountKopecks)} / {formatMoney(diagnostics.paymentAmountKopecks)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* События */}
      <div>
        <h3 className="mb-2 font-medium">События провайдера ({events.length})</h3>
        {events.length === 0 ? <EmptyState text="Событий нет" /> : (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {events.map((ev) => (
              <div key={ev.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-mono text-xs">{ev.eventType}</span>
                  <StatusBadge status={ev.status} labels={eventStatusLabels} />
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(ev.receivedAt)}{ev.errorMessage ? ` · ${ev.errorMessage}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Доступы */}
      <div>
        <h3 className="mb-2 font-medium">Доступы ({entitlements.length})</h3>
        {entitlements.length === 0 ? <EmptyState text="Доступов нет" /> : (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {entitlements.map((e) => (
              <div key={e.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-mono text-xs">{e.featureKey}</span>
                  <StatusBadge status={e.status} labels={entitlementStatusLabels} />
                </div>
                <div className="text-xs text-muted-foreground">{labelOf(sourceTypeLabels, e.sourceType)}{e.sourceId ? ` · ${e.sourceId.slice(0, 8)}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ledger */}
      <div>
        <h3 className="mb-2 font-medium">Начисления ({ledger.length})</h3>
        {ledger.length === 0 ? <EmptyState text="Начислений нет" /> : (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {ledger.map((l) => (
              <div key={l.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span>{labelOf(ledgerTypeLabels, l.entryType)}</span>
                  <span className="font-medium" title={l.amountFormatted}>{formatMoney(l.amountKopecks)}</span>
                </div>
                <div className="text-xs text-muted-foreground"><StatusBadge status={l.status} labels={ledgerStatusLabels} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiagItem({ label, ok }: Readonly<{ label: string; ok: boolean }>) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-destructive" />}
      <span className="text-sm">{label}</span>
    </div>
  );
}
