import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, CheckCircle2, Eye, Loader2, RefreshCw, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativePickerInput } from "@/components/ui/native-picker-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

import { PAGE_SIZE, discrepancyTypeLabels, entitlementStatusLabels, eventStatusLabels, ledgerStatusLabels, ledgerTypeLabels, orderStatusLabels, paymentStatusLabels, productTypeLabels, resetCountLabels, scopeTypeLabels, sourceTypeLabels } from "./commerce-audit/constants";
import { DiscrepancyDetailsView, PaymentDetailsView } from "./commerce-audit/details";
import type { AuditEntitlement, AuditEvent, AuditLedgerEntry, AuditListResult, AuditOrder, AuditPayment, AuditSummary, Discrepancy, DiscrepancyListResult, FilterState, FinancialResetPreview, FinancialResetResult, PaymentDetails } from "./commerce-audit/types";
import { EmptyState, ErrorState, LoadingState, Pagination, StatusBadge, SummaryCard } from "./commerce-audit/ui";
import { buildParams, clickableRowClass, emptyFilters, formatDate, formatMoney, labelOf, toQueryString } from "./commerce-audit/utils";

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
