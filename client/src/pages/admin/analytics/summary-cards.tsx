import { BookOpen, Clock, CreditCard, Loader2, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import type { AnalyticsStats, CommerceDashboardResponse } from "./types";
import { formatTime } from "./utils";

export function CommerceSummary({
  commerceDashboard,
  isCommerceLoading,
}: {
  commerceDashboard?: CommerceDashboardResponse;
  isCommerceLoading: boolean;
}) {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Коммерция
        </CardTitle>
        <CardDescription>Финансовые показатели RF Commerce Core за последние 30 дней</CardDescription>
      </CardHeader>
      <CardContent>
        {isCommerceLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка коммерческих метрик...
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <MetricBox label="Выручка" value={`${(commerceDashboard?.revenue ?? 0).toLocaleString()} ₽`} />
            <MetricBox label="MRR" value={`${(commerceDashboard?.mrr ?? 0).toLocaleString()} ₽`} />
            <MetricBox label="ARR" value={`${(commerceDashboard?.arr ?? 0).toLocaleString()} ₽`} />
            <MetricBox label="Churn" value={`${Math.round((commerceDashboard?.churn ?? 0) * 100)}%`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MainMetricCards({ stats }: { stats: AnalyticsStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Всего событий</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalEvents.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">События пользователей</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Активных пользователей</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.topUsers.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Пользователи с активностью</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Популярных книг</CardTitle>
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.topBooks.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Книги с активностью</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Среднее время чтения</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatTime(stats.avgReadingTime)}</div>
          <p className="text-xs text-muted-foreground mt-1">За сессию</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function MetrikaCard() {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Яндекс.Метрика</CardTitle>
        <CardDescription>Полная веб-аналитика с Вебвизором и картой кликов</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Счетчик Яндекс.Метрики установлен на всех страницах сайта. Для просмотра подробной статистики перейдите в
          личный кабинет Метрики.
        </p>
        <a
          href="https://metrika.yandex.ru/dashboard?id=106167747"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Открыть Яндекс.Метрику
        </a>
      </CardContent>
    </Card>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
