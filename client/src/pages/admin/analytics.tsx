import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "../../components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Loader2, Download } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { BookAnalyticsModal } from "@/components/admin/BookAnalyticsModal";
import { ClubAnalyticsModal } from "@/components/admin/ClubAnalyticsModal";
import { UserAnalyticsModal } from "@/components/admin/UserAnalyticsModal";
import {
  dayLabelsLong,
  detailedEventTypes,
  deviceTypeColors,
  deviceTypeLabels,
  displayModeColors,
  displayModeLabels,
  eventTypeLabels,
  funnelStageColors,
  funnelStageLabels,
  mobilePwaEventLabels,
  mobilePwaSourceLabels,
} from "./analytics/constants";
import type {
  AnalyticsStats,
  BookAnalyticsExportDetails,
  ClubSortKey,
  CommerceDashboardResponse,
  DeviceStatsResponse,
  HeatmapCellExportDetails,
  HeatmapResponse,
  MobilePwaStatsResponse,
  UserAnalyticsExportDetails,
  UserJourneyStatsResponse,
} from "./analytics/types";
import { AnalyticsLists } from "./analytics/lists";
import { AnalyticsEmptyState } from "./analytics/empty-state";
import { HeatmapCard, ReadingFunnelCard } from "./analytics/funnel-heatmap";
import { AnalyticsPageHeader } from "./analytics/page-header";
import { CommerceSummary, MainMetricCards, MetrikaCard } from "./analytics/summary-cards";
import { buildEventsMap, buildEventsMapFromDailyEvents, downloadCsv } from "./analytics/utils";

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState('7d');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedBookTitle, setSelectedBookTitle] = useState<string | undefined>(undefined);
  const [selectedBookAuthor, setSelectedBookAuthor] = useState<string | undefined>(undefined);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [selectedClubTitle, setSelectedClubTitle] = useState<string | undefined>(undefined);
  const [clubModalOpen, setClubModalOpen] = useState(false);
  const [clubSortKey, setClubSortKey] = useState<ClubSortKey>('totalEvents');
  const [clubSortDirection, setClubSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string | undefined>(undefined);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [isExportingTopBooks, setIsExportingTopBooks] = useState(false);
  const [isExportingTopUsers, setIsExportingTopUsers] = useState(false);
  const [isExportingHeatmap, setIsExportingHeatmap] = useState(false);

  const { data: stats, isLoading } = useQuery<AnalyticsStats>({
    queryKey: [`/api/v1/analytics/stats`, period],
    queryFn: async () => {
      return apiRequest<AnalyticsStats>(`/api/v1/analytics/stats?period=${period}`);
    },
  });

  const { data: heatmapStats, isLoading: isHeatmapLoading } = useQuery<HeatmapResponse>({
    queryKey: [`/api/v1/analytics/heatmap`, period],
    queryFn: async () => {
      return apiRequest<HeatmapResponse>(`/api/v1/analytics/heatmap?period=${period}`);
    },
  });

  const { data: deviceStats, isLoading: isDeviceStatsLoading } = useQuery<DeviceStatsResponse>({
    queryKey: [`/api/v1/analytics/devices`, period],
    queryFn: async () => {
      return apiRequest<DeviceStatsResponse>(`/api/v1/analytics/devices?period=${period}`);
    },
  });

  const { data: userJourneyStats, isLoading: isUserJourneyLoading } = useQuery<UserJourneyStatsResponse>({
    queryKey: [`/api/v1/analytics/user-journey`, period],
    queryFn: async () => {
      return apiRequest<UserJourneyStatsResponse>(`/api/v1/analytics/user-journey?period=${period}`);
    },
  });

  const { data: mobilePwaStats, isLoading: isMobilePwaLoading } = useQuery<MobilePwaStatsResponse>({
    queryKey: [`/api/v1/analytics/mobile-pwa`, period],
    queryFn: async () => {
      return apiRequest<MobilePwaStatsResponse>(`/api/v1/analytics/mobile-pwa?period=${period}`);
    },
  });

  const { data: commerceDashboard, isLoading: isCommerceLoading } = useQuery<CommerceDashboardResponse>({
    queryKey: ["/api/commerce/admin/financial-dashboard"],
    queryFn: async () => apiRequest<CommerceDashboardResponse>("/api/commerce/admin/financial-dashboard"),
  });

  const commerceSummary = <CommerceSummary commerceDashboard={commerceDashboard} isCommerceLoading={isCommerceLoading} />;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  // Показываем сообщение если нет данных
  if (!stats || stats.totalEvents === 0) {
    return (
      <AdminLayout>
        <div className="container mx-auto py-8 px-4">
          <AnalyticsPageHeader period={period} setPeriod={setPeriod} />

          <AnalyticsEmptyState />
          {commerceSummary}
        </div>
      </AdminLayout>
    );
  }

  const funnelData = (stats?.funnel || []).map((item) => ({
    ...item,
    name: funnelStageLabels[item.stage] || item.stage,
    fill: funnelStageColors[item.stage] || '#8884d8',
  }));

  const deviceTypeData = Object.entries(deviceStats?.deviceType || {}).map(([name, count]) => ({
    name,
    label: deviceTypeLabels[name] || name,
    count: Number(count) || 0,
  }));

  const mobilePwaEventData = (mobilePwaStats?.eventsByType || []).map((item) => ({
    ...item,
    label: mobilePwaEventLabels[item.eventType] || item.eventType,
  }));

  const mobilePwaDisplayModeData = (mobilePwaStats?.displayModes || []).map((item) => ({
    ...item,
    label: displayModeLabels[item.name] || item.name,
  }));

  const mobilePwaSourceData = (mobilePwaStats?.sources || []).map((item) => ({
    ...item,
    label: mobilePwaSourceLabels[item.name] || item.name,
  }));

  const userJourneyTotalUsers =
    (userJourneyStats?.usersWithFirstRead || 0) + (userJourneyStats?.usersWithoutRead || 0);
  const userJourneyConversionRate =
    userJourneyTotalUsers > 0
      ? Math.round(((userJourneyStats?.usersWithFirstRead || 0) / userJourneyTotalUsers) * 1000) / 10
      : 0;
  const userJourneyDropoffRate = userJourneyTotalUsers > 0 ? Math.max(0, 100 - userJourneyConversionRate) : 0;

  const toggleClubSort = (key: ClubSortKey) => {
    if (clubSortKey === key) {
      setClubSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setClubSortKey(key);
    setClubSortDirection('desc');
  };

  const sortedClubStats = (() => {
    const items = [...(stats?.clubStats || [])];
    items.sort((a, b) => {
      let left = 0;
      let right = 0;

      if (clubSortKey === 'lastActivityAt') {
        left = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        right = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      } else if (clubSortKey === 'totalEvents') {
        left = a.totalEvents;
        right = b.totalEvents;
      } else if (clubSortKey === 'activeMembers') {
        left = a.activeMembers;
        right = b.activeMembers;
      } else if (clubSortKey === 'totalSessions') {
        left = a.totalSessions;
        right = b.totalSessions;
      }

      if (left === right) {
        return a.clubTitle.localeCompare(b.clubTitle, 'ru');
      }

      return clubSortDirection === 'asc' ? left - right : right - left;
    });
    return items;
  })();

  const getCsvFileName = (baseName: string) => {
    const date = new Date().toISOString().slice(0, 10);
    return `${baseName}-${period}-${date}.csv`;
  };

  const exportTopBooksCsv = async () => {
    if (!stats.topBooks?.length) return;
    setIsExportingTopBooks(true);
    try {
      const rows = await Promise.all(
        stats.topBooks.map(async (book) => {
          try {
            const details = await apiRequest<BookAnalyticsExportDetails>(
              `/api/v1/analytics/book/${book.bookId}?period=${period}`
            );
            return {
              ...book,
              eventsMap: buildEventsMapFromDailyEvents(details.dailyEvents || []),
            };
          } catch {
            return {
              ...book,
              eventsMap: {} as Record<string, number>,
            };
          }
        })
      );

      downloadCsv(getCsvFileName('analytics-top-books'), rows, [
        { header: 'Ранг', accessor: (_, index) => index + 1 },
        { header: 'ID книги', accessor: (item) => item.bookId },
        { header: 'Название', accessor: (item) => item.title },
        { header: 'Автор', accessor: (item) => item.author || '' },
        { header: 'События (всего)', accessor: (item) => item.events },
        ...detailedEventTypes.map((eventType) => ({
          header: `Событие: ${eventTypeLabels[eventType] || eventType}`,
          accessor: (item: typeof rows[number]) => item.eventsMap[eventType] || 0,
        })),
      ]);
    } finally {
      setIsExportingTopBooks(false);
    }
  };

  const exportTopUsersCsv = async () => {
    if (!stats.topUsers?.length) return;
    setIsExportingTopUsers(true);
    try {
      const rows = await Promise.all(
        stats.topUsers.map(async (user) => {
          try {
            const details = await apiRequest<UserAnalyticsExportDetails>(
              `/api/v1/analytics/user/${user.userId}?period=${period}`
            );
            return {
              ...user,
              totalBooksStarted: details.totalBooksStarted,
              totalBooksCompleted: details.totalBooksCompleted,
              totalReadingTime: details.totalReadingTime,
              avgSessionDuration: details.avgSessionDuration,
              eventsMap: buildEventsMap(details.eventsByType || []),
            };
          } catch {
            return {
              ...user,
              totalBooksStarted: 0,
              totalBooksCompleted: 0,
              totalReadingTime: 0,
              avgSessionDuration: 0,
              eventsMap: {} as Record<string, number>,
            };
          }
        })
      );

      downloadCsv(getCsvFileName('analytics-top-users'), rows, [
        { header: 'Ранг', accessor: (_, index) => index + 1 },
        { header: 'ID пользователя', accessor: (item) => item.userId },
        { header: 'Имя пользователя', accessor: (item) => item.username },
        { header: 'События (всего)', accessor: (item) => item.events },
        { header: 'Книг начато', accessor: (item) => item.totalBooksStarted },
        { header: 'Книг завершено', accessor: (item) => item.totalBooksCompleted },
        { header: 'Время чтения, мин', accessor: (item) => item.totalReadingTime },
        { header: 'Средняя сессия, сек', accessor: (item) => item.avgSessionDuration },
        ...detailedEventTypes.map((eventType) => ({
          header: `Событие: ${eventTypeLabels[eventType] || eventType}`,
          accessor: (item: typeof rows[number]) => item.eventsMap[eventType] || 0,
        })),
      ]);
    } finally {
      setIsExportingTopUsers(false);
    }
  };

  const exportClubStatsCsv = () => {
    downloadCsv(getCsvFileName('analytics-club-stats'), sortedClubStats || [], [
      { header: 'ID клуба', accessor: (item) => item.clubId },
      { header: 'Клуб', accessor: (item) => item.clubTitle },
      { header: 'События', accessor: (item) => item.totalEvents },
      { header: 'Вступления', accessor: (item) => item.joinEvents },
      { header: 'Выходы', accessor: (item) => item.leaveEvents },
      { header: 'Сессии чтения', accessor: (item) => item.totalSessions },
      { header: 'Активные участники', accessor: (item) => item.activeMembers },
      { header: 'Последняя активность', accessor: (item) => item.lastActivityAt || '' },
    ]);
  };

  const exportFunnelCsv = () => {
    downloadCsv(getCsvFileName('analytics-funnel'), funnelData || [], [
      { header: 'Этап (код)', accessor: (item) => item.stage },
      { header: 'Этап', accessor: (item) => item.name },
      { header: 'Количество', accessor: (item) => item.count },
      { header: 'Конверсия от предыдущего, %', accessor: (item) => item.percentage },
    ]);
  };

  const exportHeatmapCsv = async () => {
    if (!heatmapStats?.heatmap?.length) return;
    setIsExportingHeatmap(true);
    try {
      const activeCells = heatmapStats.heatmap.filter((cell) => cell.count > 0);
      const rows = await Promise.all(
        activeCells.map(async (cell) => {
          try {
            const details = await apiRequest<HeatmapCellExportDetails>(
              `/api/v1/analytics/heatmap/details?period=${period}&day=${cell.day}&hour=${cell.hour}`
            );
            return {
              ...cell,
              eventsMap: buildEventsMap(details.eventsByType || []),
            };
          } catch {
            return {
              ...cell,
              eventsMap: {} as Record<string, number>,
            };
          }
        })
      );

      downloadCsv(getCsvFileName('analytics-heatmap'), rows, [
        { header: 'День недели (0-6)', accessor: (item) => item.day },
        { header: 'День недели', accessor: (item) => dayLabelsLong[item.day] || item.day },
        { header: 'Час (0-23)', accessor: (item) => item.hour },
        { header: 'События (всего)', accessor: (item) => item.count },
        ...detailedEventTypes.map((eventType) => ({
          header: `Событие: ${eventTypeLabels[eventType] || eventType}`,
          accessor: (item: typeof rows[number]) => item.eventsMap[eventType] || 0,
        })),
      ]);
    } finally {
      setIsExportingHeatmap(false);
    }
  };

  const exportDevicesCsv = () => {
    if (!deviceStats) return;

    const deviceTotal = Object.values(deviceStats.deviceType || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const browserTotal = (deviceStats.browsers || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    const osTotal = (deviceStats.os || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0);

    const rows = [
      ...Object.entries(deviceStats.deviceType || {}).map(([name, count]) => ({
        section: 'Device Type',
        item: deviceTypeLabels[name] || name,
        count: Number(count) || 0,
        share: deviceTotal > 0 ? Math.round(((Number(count) || 0) / deviceTotal) * 1000) / 10 : 0,
      })),
      ...(deviceStats.browsers || []).map((item) => ({
        section: 'Browser',
        item: item.name,
        count: Number(item.count) || 0,
        share: browserTotal > 0 ? Math.round(((Number(item.count) || 0) / browserTotal) * 1000) / 10 : 0,
      })),
      ...(deviceStats.os || []).map((item) => ({
        section: 'OS',
        item: item.name,
        count: Number(item.count) || 0,
        share: osTotal > 0 ? Math.round(((Number(item.count) || 0) / osTotal) * 1000) / 10 : 0,
      })),
    ];

    downloadCsv(getCsvFileName('analytics-devices'), rows, [
      { header: 'Секция', accessor: (item) => item.section },
      { header: 'Элемент', accessor: (item) => item.item },
      { header: 'Количество', accessor: (item) => item.count },
      { header: 'Доля, %', accessor: (item) => item.share },
    ]);
  };

  const exportMobilePwaCsv = () => {
    if (!mobilePwaStats) return;

    const totalEvents = mobilePwaStats.totalTrackedEvents || 0;
    const rows = [
      {
        section: 'Summary',
        item: 'Установка PWA',
        count: mobilePwaStats.summary.pwaInstall,
        share: totalEvents > 0 ? Math.round((mobilePwaStats.summary.pwaInstall / totalEvents) * 1000) / 10 : 0,
      },
      {
        section: 'Summary',
        item: 'Запуск с домашнего экрана',
        count: mobilePwaStats.summary.pwaHomescreenOpen,
        share: totalEvents > 0 ? Math.round((mobilePwaStats.summary.pwaHomescreenOpen / totalEvents) * 1000) / 10 : 0,
      },
      {
        section: 'Summary',
        item: 'Открытие ридера с мобильного',
        count: mobilePwaStats.summary.mobileReaderOpen,
        share: totalEvents > 0 ? Math.round((mobilePwaStats.summary.mobileReaderOpen / totalEvents) * 1000) / 10 : 0,
      },
      {
        section: 'Summary',
        item: 'Вступление в клуб с мобильного',
        count: mobilePwaStats.summary.mobileClubJoin,
        share: totalEvents > 0 ? Math.round((mobilePwaStats.summary.mobileClubJoin / totalEvents) * 1000) / 10 : 0,
      },
      ...mobilePwaEventData.map((item) => ({
        section: 'Events',
        item: item.label,
        count: Number(item.count) || 0,
        share: totalEvents > 0 ? Math.round(((Number(item.count) || 0) / totalEvents) * 1000) / 10 : 0,
      })),
      ...(mobilePwaStats.os || []).map((item) => ({
        section: 'OS',
        item: item.name,
        count: Number(item.count) || 0,
        share: totalEvents > 0 ? Math.round(((Number(item.count) || 0) / totalEvents) * 1000) / 10 : 0,
      })),
      ...mobilePwaDisplayModeData.map((item) => ({
        section: 'Display Mode',
        item: item.label,
        count: Number(item.count) || 0,
        share: totalEvents > 0 ? Math.round(((Number(item.count) || 0) / totalEvents) * 1000) / 10 : 0,
      })),
      ...mobilePwaSourceData.map((item) => ({
        section: 'Source',
        item: item.label,
        count: Number(item.count) || 0,
        share: totalEvents > 0 ? Math.round(((Number(item.count) || 0) / totalEvents) * 1000) / 10 : 0,
      })),
    ];

    downloadCsv(getCsvFileName('analytics-mobile-pwa'), rows, [
      { header: 'Секция', accessor: (item) => item.section },
      { header: 'Элемент', accessor: (item) => item.item },
      { header: 'Количество', accessor: (item) => item.count },
      { header: 'Доля, %', accessor: (item) => item.share },
    ]);
  };

  const exportEventsTrendCsv = () => {
    downloadCsv(getCsvFileName('analytics-events-trend'), stats.eventsTrend || [], [
      { header: 'Дата', accessor: (item) => item.date },
      { header: 'События', accessor: (item) => item.count },
    ]);
  };

  const exportEventsByTypeCsv = () => {
    const rows = (stats.eventsByType || []).map((item) => ({
      eventType: item.eventType,
      label: eventTypeLabels[item.eventType] || item.eventType,
      count: Number(item.count) || 0,
      share: stats.totalEvents > 0 ? Math.round(((Number(item.count) || 0) / stats.totalEvents) * 1000) / 10 : 0,
    }));

    downloadCsv(getCsvFileName('analytics-events-by-type'), rows, [
      { header: 'Тип события (код)', accessor: (item) => item.eventType },
      { header: 'Тип события', accessor: (item) => item.label },
      { header: 'Количество', accessor: (item) => item.count },
      { header: 'Доля, %', accessor: (item) => item.share },
    ]);
  };

  const exportUserJourneyCsv = () => {
    if (!userJourneyStats) return;

    const rows = [
      { section: 'Summary', metric: 'Users with first read', value: userJourneyStats.usersWithFirstRead },
      { section: 'Summary', metric: 'Users without read', value: userJourneyStats.usersWithoutRead },
      { section: 'Summary', metric: 'Avg days to first read', value: userJourneyStats.avgDaysToFirstRead },
      ...(userJourneyStats.distribution || []).map((item) => ({
        section: 'Distribution',
        metric: item.daysRange,
        value: item.count,
      })),
    ];

    downloadCsv(getCsvFileName('analytics-user-journey'), rows, [
      { header: 'Секция', accessor: (item) => item.section },
      { header: 'Метрика', accessor: (item) => item.metric },
      { header: 'Значение', accessor: (item) => item.value },
    ]);
  };

  return (
    <AdminLayout>
        <div className="container mx-auto py-8 px-4">
          <AnalyticsPageHeader period={period} setPeriod={setPeriod} />

          {commerceSummary}

          <MainMetricCards stats={stats} />

          <ReadingFunnelCard funnelData={funnelData} exportFunnelCsv={exportFunnelCsv} />

          <HeatmapCard
            heatmapStats={heatmapStats}
            period={period}
            isHeatmapLoading={isHeatmapLoading}
            isExportingHeatmap={isExportingHeatmap}
            exportHeatmapCsv={() => void exportHeatmapCsv()}
          />

          {/* Статистика устройств и платформ */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Устройства и платформы</CardTitle>
                <CardDescription>
                  Распределение событий по типам устройств, браузерам и операционным системам
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={exportDevicesCsv}
                disabled={!deviceStats || deviceStats.totalUserAgentEvents === 0}
              >
                <Download className="h-4 w-4" />
                Скачать CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isDeviceStatsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !deviceStats || deviceStats.totalUserAgentEvents === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Нет данных по устройствам за выбранный период.
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="h-[280px]">
                    <div className="text-sm font-medium mb-2">Тип устройства</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                        <Pie
                          data={deviceTypeData}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, percent }) =>
                            percent && percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                          }
                        >
                          {deviceTypeData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={deviceTypeColors[entry.name] || '#94a3b8'}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-[280px]">
                    <div className="text-sm font-medium mb-2">Браузеры (топ)</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(deviceStats.browsers || []).slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                        <Bar dataKey="count" fill="#0284c7" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-[280px]">
                    <div className="text-sm font-medium mb-2">Операционные системы (топ)</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(deviceStats.os || []).slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                        <Bar dataKey="count" fill="#16a34a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mobile / PWA analytics */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Mobile / PWA аналитика</CardTitle>
                <CardDescription>
                  Установки, запуски с домашнего экрана и ключевые мобильные действия внутри приложения
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={exportMobilePwaCsv}
                disabled={!mobilePwaStats || mobilePwaStats.totalTrackedEvents === 0}
              >
                <Download className="h-4 w-4" />
                Скачать CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isMobilePwaLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !mobilePwaStats || mobilePwaStats.totalTrackedEvents === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Пока нет mobile/PWA событий за выбранный период. Данные появятся после установок PWA, запусков с домашнего экрана и мобильных входов в ридер или клуб.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Установки PWA</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {mobilePwaStats.summary.pwaInstall.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Запуски с домашнего экрана</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {mobilePwaStats.summary.pwaHomescreenOpen.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Открытия ридера с мобильного</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {mobilePwaStats.summary.mobileReaderOpen.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Вступления в клуб с мобильного</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {mobilePwaStats.summary.mobileClubJoin.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-3">
                    <div className="xl:col-span-2 h-[300px]">
                      <div className="text-sm font-medium mb-2">Ключевые mobile / PWA события</div>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mobilePwaEventData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis />
                          <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                          <Bar dataKey="count" fill="#0f766e" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="h-[300px]">
                      <div className="text-sm font-medium mb-2">Режим запуска</div>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                          <Pie
                            data={mobilePwaDisplayModeData}
                            dataKey="count"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label={({ name, percent }) =>
                              percent && percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                            }
                          >
                            {mobilePwaDisplayModeData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={displayModeColors[entry.name] || '#94a3b8'}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-3">
                    <div className="xl:col-span-2 h-[280px]">
                      <div className="text-sm font-medium mb-2">Операционные системы</div>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(mobilePwaStats.os || []).slice(0, 8)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis />
                          <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                          <Bar dataKey="count" fill="#2563eb" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Источники событий</div>
                      <div className="space-y-2 rounded-lg border p-4">
                        {mobilePwaSourceData.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Нет данных по источникам.</div>
                        ) : (
                          mobilePwaSourceData.map((item) => (
                            <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="font-medium tabular-nums">{item.count}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="h-[300px]">
                    <div className="text-sm font-medium mb-2">Динамика mobile / PWA событий</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mobilePwaStats.trend || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                        />
                        <YAxis />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString('ru-RU')}
                          formatter={(value?: number, name?: string) => [value || 0, mobilePwaEventLabels[name || ''] || name || 'События']}
                        />
                        <Line type="monotone" dataKey="pwaInstall" name="pwa_install" stroke="#7c3aed" strokeWidth={2} />
                        <Line type="monotone" dataKey="pwaHomescreenOpen" name="pwa_homescreen_open" stroke="#0284c7" strokeWidth={2} />
                        <Line type="monotone" dataKey="mobileReaderOpen" name="mobile_reader_open" stroke="#16a34a" strokeWidth={2} />
                        <Line type="monotone" dataKey="mobileClubJoin" name="mobile_club_join" stroke="#f59e0b" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Journey */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>User Journey: Time to First Read</CardTitle>
                <CardDescription>
                  Время от регистрации до первого чтения и доля активированных пользователей
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={exportUserJourneyCsv}
                disabled={!userJourneyStats}
              >
                <Download className="h-4 w-4" />
                Скачать CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isUserJourneyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !userJourneyStats ? (
                <div className="text-sm text-muted-foreground">
                  Нет данных по user journey за выбранный период.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Начали читать</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {userJourneyStats.usersWithFirstRead.toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {userJourneyConversionRate}% от зарегистрированных
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Не начали читать</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {userJourneyStats.usersWithoutRead.toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {userJourneyDropoffRate.toFixed(1)}% от зарегистрированных
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Среднее до первого чтения</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {userJourneyStats.avgDaysToFirstRead.toFixed(1)} дн.
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Только по пользователям с первым чтением
                      </div>
                    </div>
                  </div>

                  {userJourneyStats.distribution.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Недостаточно данных для распределения по интервалам.
                    </div>
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={userJourneyStats.distribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="daysRange" tick={{ fontSize: 12 }} />
                          <YAxis />
                          <Tooltip
                            formatter={(value?: number) => [value || 0, 'Пользователи']}
                            labelFormatter={(value) => `${value} дней`}
                          />
                          <Bar dataKey="count" fill="#0ea5e9" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        {/* График активности по дням */}
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Динамика активности</CardTitle>
              <CardDescription>Количество событий по дням</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={exportEventsTrendCsv}
              disabled={!stats?.eventsTrend?.length}
            >
              <Download className="h-4 w-4" />
              Скачать CSV
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats?.eventsTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('ru-RU')}
                  formatter={(value?: number) => [value || 0, 'События']}
                />
                <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* События по типам */}
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Распределение событий по типам</CardTitle>
              <CardDescription>Какие действия совершают пользователи</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={exportEventsByTypeCsv}
              disabled={!stats?.eventsByType?.length}
            >
              <Download className="h-4 w-4" />
              Скачать CSV
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.eventsByType || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="eventType" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => eventTypeLabels[value] || value}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value?: number) => [value || 0, 'События']}
                  labelFormatter={(value) => eventTypeLabels[value] || value}
                />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <AnalyticsLists
          stats={stats}
          sortedClubStats={sortedClubStats}
          isExportingTopBooks={isExportingTopBooks}
          isExportingTopUsers={isExportingTopUsers}
          exportTopBooksCsv={() => void exportTopBooksCsv()}
          exportTopUsersCsv={() => void exportTopUsersCsv()}
          exportClubStatsCsv={exportClubStatsCsv}
          toggleClubSort={toggleClubSort}
          openBookDetails={(book) => {
            setSelectedBookId(book.bookId);
            setSelectedBookTitle(book.title);
            setSelectedBookAuthor(book.author);
            setBookModalOpen(true);
          }}
          openUserDetails={(user) => {
            setSelectedUserId(user.userId);
            setSelectedUsername(user.username);
            setUserModalOpen(true);
          }}
          openClubDetails={(club) => {
            setSelectedClubId(club.clubId);
            setSelectedClubTitle(club.clubTitle);
            setClubModalOpen(true);
          }}
        />

        <MetrikaCard />
      </div>

      {/* Модалка детализации книги */}
      <BookAnalyticsModal
        bookId={selectedBookId}
        bookTitle={selectedBookTitle}
        bookAuthor={selectedBookAuthor}
        open={bookModalOpen}
        onOpenChange={setBookModalOpen}
      />

      <ClubAnalyticsModal
        clubId={selectedClubId}
        clubTitle={selectedClubTitle}
        period={period}
        open={clubModalOpen}
        onOpenChange={setClubModalOpen}
      />

      <UserAnalyticsModal
        userId={selectedUserId}
        username={selectedUsername}
        period={period}
        open={userModalOpen}
        onOpenChange={setUserModalOpen}
      />
    </AdminLayout>
  );
}
