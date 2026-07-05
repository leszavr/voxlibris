import { Router, type Request, type Response } from 'express';
import { db } from '../../db.js';
import { analyticsEvents } from '../../../shared/schema.js';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { and, desc, gte, inArray } from 'drizzle-orm';
import { incrementCounter, parseAnalyticsMetadata, sortCountEntries } from './shared.js';

const router = Router();
const MOBILE_PWA_ANALYTICS_EVENT_TYPES = ['pwa_install', 'pwa_homescreen_open', 'book_open', 'club_join'] as const;


type MobilePwaNormalizedEventType =
  | 'pwa_install'
  | 'pwa_homescreen_open'
  | 'mobile_reader_open'
  | 'mobile_club_join';

interface MobilePwaSummary {
  pwaInstall: number;
  pwaHomescreenOpen: number;
  mobileReaderOpen: number;
  mobileClubJoin: number;
}

interface MobilePwaTrendEntry {
  date: string;
  total: number;
  pwaInstall: number;
  pwaHomescreenOpen: number;
  mobileReaderOpen: number;
  mobileClubJoin: number;
}

interface MobilePwaEventRow {
  eventType: string;
  metadata: string | null;
  createdAt: Date;
}

function resolvePeriodStartDate(periodRaw: unknown): Date {
  const period = typeof periodRaw === 'string' ? periodRaw : '30d';
  const startDate = new Date();

  if (period === '7d') {
    startDate.setDate(startDate.getDate() - 7);
    return startDate;
  }

  if (period === '30d') {
    startDate.setDate(startDate.getDate() - 30);
    return startDate;
  }

  if (period === '90d') {
    startDate.setDate(startDate.getDate() - 90);
    return startDate;
  }

  if (period === 'all') {
    return new Date('2020-01-01');
  }

  startDate.setDate(startDate.getDate() - 30);
  return startDate;
}

function createMobilePwaSummary(): MobilePwaSummary {
  return {
    pwaInstall: 0,
    pwaHomescreenOpen: 0,
    mobileReaderOpen: 0,
    mobileClubJoin: 0,
  };
}

function createMobilePwaTrendEntry(date: string): MobilePwaTrendEntry {
  return {
    date,
    total: 0,
    pwaInstall: 0,
    pwaHomescreenOpen: 0,
    mobileReaderOpen: 0,
    mobileClubJoin: 0,
  };
}

function normalizeMobilePwaEventType(
  eventType: string,
  deviceType: string | null,
  source: string | null,
): MobilePwaNormalizedEventType | null {
  if (eventType === 'pwa_install') {
    return 'pwa_install';
  }

  if (eventType === 'pwa_homescreen_open') {
    return 'pwa_homescreen_open';
  }

  const isMobileContext = deviceType === 'mobile' || deviceType === 'tablet';

  if (eventType === 'book_open' && isMobileContext && (source === 'personal_reader' || source === 'club_reader')) {
    return 'mobile_reader_open';
  }

  if (eventType === 'club_join' && isMobileContext) {
    return 'mobile_club_join';
  }

  return null;
}

function incrementMobilePwaSummary(summary: MobilePwaSummary, eventType: MobilePwaNormalizedEventType) {
  if (eventType === 'pwa_install') {
    summary.pwaInstall += 1;
    return;
  }

  if (eventType === 'pwa_homescreen_open') {
    summary.pwaHomescreenOpen += 1;
    return;
  }

  if (eventType === 'mobile_reader_open') {
    summary.mobileReaderOpen += 1;
    return;
  }

  summary.mobileClubJoin += 1;
}

function incrementMobilePwaTrend(entry: MobilePwaTrendEntry, eventType: MobilePwaNormalizedEventType) {
  entry.total += 1;

  if (eventType === 'pwa_install') {
    entry.pwaInstall += 1;
    return;
  }

  if (eventType === 'pwa_homescreen_open') {
    entry.pwaHomescreenOpen += 1;
    return;
  }

  if (eventType === 'mobile_reader_open') {
    entry.mobileReaderOpen += 1;
    return;
  }

  entry.mobileClubJoin += 1;
}

function collectMobilePwaStats(events: MobilePwaEventRow[]) {
  const eventTypeMap = new Map<string, number>();
  const deviceTypeMap = new Map<string, number>();
  const osMap = new Map<string, number>();
  const displayModeMap = new Map<string, number>();
  const sourceMap = new Map<string, number>();
  const trendMap = new Map<string, MobilePwaTrendEntry>();
  const summary = createMobilePwaSummary();

  for (const event of events) {
    const metadata = parseAnalyticsMetadata(event.metadata);
    const deviceType = typeof metadata.deviceType === 'string' ? metadata.deviceType : null;
    const os = typeof metadata.os === 'string' ? metadata.os : null;
    const displayMode = typeof metadata.displayMode === 'string' ? metadata.displayMode : null;
    const source = typeof metadata.source === 'string' ? metadata.source : null;

    const normalizedEventType = normalizeMobilePwaEventType(event.eventType, deviceType, source);
    if (!normalizedEventType) {
      continue;
    }

    incrementMobilePwaSummary(summary, normalizedEventType);
    incrementCounter(eventTypeMap, normalizedEventType);
    incrementCounter(deviceTypeMap, deviceType);
    incrementCounter(osMap, os);
    incrementCounter(displayModeMap, displayMode);
    incrementCounter(sourceMap, source);

    const date = new Date(event.createdAt).toISOString().slice(0, 10);
    const dayEntry = trendMap.get(date) || createMobilePwaTrendEntry(date);
    incrementMobilePwaTrend(dayEntry, normalizedEventType);
    trendMap.set(date, dayEntry);
  }

  return {
    summary,
    eventTypeMap,
    deviceTypeMap,
    osMap,
    displayModeMap,
    sourceMap,
    trendMap,
  };
}

/**
 * GET /api/v1/analytics/mobile-pwa
 * Срез mobile/PWA событий для админки
 */
router.get('/mobile-pwa', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query;

    const startDate = resolvePeriodStartDate(period);

    const events = await db
      .select({
        eventType: analyticsEvents.eventType,
        metadata: analyticsEvents.metadata,
        createdAt: analyticsEvents.createdAt,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, [...MOBILE_PWA_ANALYTICS_EVENT_TYPES]),
        ),
      )
      .orderBy(desc(analyticsEvents.createdAt));

    const {
      summary,
      eventTypeMap,
      deviceTypeMap,
      osMap,
      displayModeMap,
      sourceMap,
      trendMap,
    } = collectMobilePwaStats(events);

    const totalTrackedEvents =
      summary.pwaInstall +
      summary.pwaHomescreenOpen +
      summary.mobileReaderOpen +
      summary.mobileClubJoin;

    res.json({
      period,
      totalTrackedEvents,
      summary,
      eventsByType: sortCountEntries(eventTypeMap).map(({ name, count }) => ({ eventType: name, count })),
      deviceTypes: sortCountEntries(deviceTypeMap),
      os: sortCountEntries(osMap),
      displayModes: sortCountEntries(displayModeMap),
      sources: sortCountEntries(sourceMap),
      trend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error('[Analytics] Error fetching mobile/PWA stats:', error);
    res.status(500).json({ error: 'Failed to fetch mobile/PWA analytics stats' });
  }
});

export default router;
