export interface AnalyticsStats {
  period: string;
  totalEvents: number;
  eventsByType: Array<{ eventType: string; count: number }>;
  topBooks: Array<{ bookId: string; title: string; author: string; events: number }>;
  topUsers: Array<{ userId: string; username: string; events: number }>;
  clubStats: Array<{
    clubId: string;
    clubTitle: string;
    totalEvents: number;
    joinEvents: number;
    leaveEvents: number;
    totalSessions: number;
    activeMembers: number;
    lastActivityAt: string | null;
  }>;
  avgReadingTime: number;
  eventsTrend: Array<{ date: string; count: number }>;
  funnel: Array<{ stage: string; count: number; percentage: number }>;
}

export interface HeatmapResponse {
  period: string;
  heatmap: Array<{ day: number; hour: number; count: number }>;
}

export interface DeviceStatsResponse {
  period: string;
  totalUserAgentEvents: number;
  deviceType: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };
  browsers: Array<{ name: string; count: number }>;
  os: Array<{ name: string; count: number }>;
}

export interface MobilePwaStatsResponse {
  period: string;
  totalTrackedEvents: number;
  summary: {
    pwaInstall: number;
    pwaHomescreenOpen: number;
    mobileReaderOpen: number;
    mobileClubJoin: number;
  };
  eventsByType: Array<{ eventType: string; count: number }>;
  deviceTypes: Array<{ name: string; count: number }>;
  os: Array<{ name: string; count: number }>;
  displayModes: Array<{ name: string; count: number }>;
  sources: Array<{ name: string; count: number }>;
  trend: Array<{
    date: string;
    total: number;
    pwaInstall: number;
    pwaHomescreenOpen: number;
    mobileReaderOpen: number;
    mobileClubJoin: number;
  }>;
}

export interface CommerceDashboardResponse {
  revenue: number;
  mrr: number;
  arr: number;
  churn: number;
  conversion: number;
  recent: Array<{ id: string; status: string; amountRub: number; createdAt: string }>;
}

export interface UserJourneyStatsResponse {
  period: string;
  usersWithFirstRead: number;
  usersWithoutRead: number;
  avgDaysToFirstRead: number;
  distribution: Array<{ daysRange: string; count: number }>;
}

export interface BookAnalyticsExportDetails {
  dailyEvents: Array<{
    date: string;
    [key: string]: string | number;
  }>;
}

export interface HeatmapCellExportDetails {
  eventsByType: Array<{ eventType: string; count: number }>;
}

export interface UserAnalyticsExportDetails {
  totalBooksStarted: number;
  totalBooksCompleted: number;
  totalReadingTime: number;
  avgSessionDuration: number;
  eventsByType: Array<{ eventType: string; count: number }>;
}

export type ClubSortKey = 'totalEvents' | 'activeMembers' | 'totalSessions' | 'lastActivityAt';

export interface CsvColumn<T> {
  header: string;
  accessor: (item: T, index: number) => string | number | null | undefined;
}
