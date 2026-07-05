import express from 'express';
import { jwtAuth, requireActiveUser } from '../../jwt-middleware.js';
import { storage, repositories } from '../../repositories/index.js';
import { getPublicBaseUrl } from '../../lib/public-base-url.js';
import { generateCalendarToken, hashCalendarToken } from '../../services/calendar-token-service.js';

const router = express.Router();

async function calendarSubscriptionUrl(token: string): Promise<string> {
  return `${await getPublicBaseUrl()}/api/calendar/subscription/${token}.ics`;
}

async function requireActiveClubMember(res: express.Response, clubId: string, userId: string) {
  const club = await storage.getClub(clubId);
  if (!club) {
    res.status(404).json({ success: false, error: 'Club not found' });
    return null;
  }
  const membership = await storage.getUserClubMembership(clubId, userId);
  if (!membership?.isActive) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return null;
  }
  return { club, membership };
}

router.post('/:clubId/calendar-subscription', jwtAuth, requireActiveUser, async (req, res) => {
  const userId = req.user?.userId ?? req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const access = await requireActiveClubMember(res, req.params.clubId, userId);
  if (!access) return;
  const token = generateCalendarToken();
  const existing = await repositories.calendarSubscriptions.getActiveForUserClub(userId, req.params.clubId);
  if (existing) {
    await repositories.calendarSubscriptions.rotate(userId, req.params.clubId, hashCalendarToken(token));
    return res.json({ success: true, url: await calendarSubscriptionUrl(token), rotated: true });
  }
  await repositories.calendarSubscriptions.create(userId, req.params.clubId, hashCalendarToken(token));
  res.json({ success: true, url: await calendarSubscriptionUrl(token) });
});

router.delete('/:clubId/calendar-subscription', jwtAuth, requireActiveUser, async (req, res) => {
  const userId = req.user?.userId ?? req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const access = await requireActiveClubMember(res, req.params.clubId, userId);
  if (!access) return;
  await repositories.calendarSubscriptions.revoke(userId, req.params.clubId);
  res.json({ success: true });
});

router.post('/:clubId/calendar-subscription/rotate', jwtAuth, requireActiveUser, async (req, res) => {
  const userId = req.user?.userId ?? req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const access = await requireActiveClubMember(res, req.params.clubId, userId);
  if (!access) return;
  const token = generateCalendarToken();
  await repositories.calendarSubscriptions.rotate(userId, req.params.clubId, hashCalendarToken(token));
  res.json({ success: true, url: await calendarSubscriptionUrl(token) });
});

export default router;
