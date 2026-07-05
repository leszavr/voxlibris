import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { repositories, storage } from '../repositories/index.js';
import { generateCalendar } from '../services/icalendar-service.js';
import { hashCalendarToken } from '../services/calendar-token-service.js';
import { getLegacyClubSchedules, mergeCalendarSchedules } from '../services/legacy-schedule-calendar.js';
import { sendIcs, sendPrivateIcs } from '../lib/calendar-response.js';
import { getPublicBaseUrl } from '../lib/public-base-url.js';
import { logger } from '../lib/logger.js';
import { optionalJwtAuth } from '../jwt-middleware.js';
import type { Club, ReadingSchedule } from '../../shared/schema.js';

const router = Router();

export const calendarRateLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

async function findLegacySchedule(scheduleId: string): Promise<{ schedule: ReadingSchedule; club: Club } | null> {
  const clubs = await repositories.clubs.getClubs();
  for (const club of clubs) {
    const schedule = getLegacyClubSchedules(club).find((item) => item.id === scheduleId);
    if (schedule) return { schedule, club };
  }
  return null;
}

async function canAccessScheduleClub(club: Club, userId?: string): Promise<boolean> {
  if (!club.isPrivate) return true;
  if (!userId) return false;
  const membership = await storage.getUserClubMembership(club.id, userId);
  return Boolean(membership?.isActive);
}

async function buildClubFeed(res: Response, clubId: string, isPrivateFeed: boolean): Promise<{ body: string; clubId: string } | null> {
  const club = await repositories.clubs.getClub(clubId);
  if (!club) {
    res.status(404).json({ success: false, error: 'Club not found' });
    return null;
  }
  if (club.isPrivate && !isPrivateFeed) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return null;
  }
  const schedules = await repositories.readingSchedule.getCalendarFeedSchedules(club.id, 200);
  const legacySchedules = getLegacyClubSchedules(club);
  return { body: generateCalendar(mergeCalendarSchedules(schedules, legacySchedules), { club, baseUrl: await getPublicBaseUrl() }), clubId: club.id };
}

router.get('/schedule/:scheduleId/calendar.ics', optionalJwtAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const schedule = await repositories.readingSchedule.getSchedule(req.params.scheduleId);
    if (!schedule) {
      const legacy = await findLegacySchedule(req.params.scheduleId);
      if (!legacy) return res.status(404).json({ success: false, error: 'Schedule not found' });
      if (!(await canAccessScheduleClub(legacy.club, userId))) return res.status(403).json({ success: false, error: 'Forbidden' });
      return sendIcs(res, generateCalendar([legacy.schedule], { club: legacy.club, baseUrl: await getPublicBaseUrl() }), `voxlibris-schedule-${legacy.schedule.id}.ics`);
    }
    const club = await repositories.clubs.getClub(schedule.clubId);
    if (!club) return res.status(404).json({ success: false, error: 'Club not found' });
    if (!(await canAccessScheduleClub(club, userId))) return res.status(403).json({ success: false, error: 'Forbidden' });
    sendIcs(res, generateCalendar([schedule], { club, baseUrl: await getPublicBaseUrl() }), `voxlibris-schedule-${schedule.id}.ics`);
  } catch (error) {
    logger.error(`Error generating public schedule calendar: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ success: false, error: 'Failed to generate calendar' });
  }
});

router.get('/clubs/:clubId/calendar.ics', async (req: Request, res: Response) => {
  try {
    const feed = await buildClubFeed(res, req.params.clubId, false);
    if (feed) sendIcs(res, feed.body, `voxlibris-club-${feed.clubId}.ics`, 'inline');
  } catch (error) {
    logger.error(`Error generating club calendar: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ success: false, error: 'Failed to generate calendar' });
  }
});

router.get('/calendar/subscription/:token.ics', calendarRateLimit, async (req: Request, res: Response) => {
  try {
    const subscription = await repositories.calendarSubscriptions.findActiveByHash(hashCalendarToken(req.params.token));
    if (!subscription) return res.status(404).json({ success: false, error: 'Not found' });
    const membership = await storage.getUserClubMembership(subscription.clubId, subscription.userId);
    if (!membership?.isActive) return res.status(404).json({ success: false, error: 'Not found' });
    const feed = await buildClubFeed(res, subscription.clubId, true);
    if (!feed) return;
    await repositories.calendarSubscriptions.updateLastUsed(subscription.id);
    sendPrivateIcs(res, feed.body, `voxlibris-club-${feed.clubId}.ics`);
  } catch (error) {
    logger.error(`Error generating subscription calendar: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ success: false, error: 'Failed to generate calendar' });
  }
});

export default router;
