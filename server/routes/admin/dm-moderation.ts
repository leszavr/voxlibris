import express from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { jwtAuth } from '../../jwt-middleware.js';
import { db } from '../../db.js';
import { logger } from '../../lib/logger.js';
import { conversations, directMessages, dmAdminAccessLog, dmReports, users } from '../../../shared/schema.js';
import type { AdminActionTargetType, AdminActionType } from '../../../shared/schema.js';

type FullAdminMiddleware = express.RequestHandler;
type LogAction = (
  req: express.Request,
  actionType: AdminActionType,
  targetType: AdminActionTargetType,
  targetId: string,
  reason?: string,
  previousValue?: string,
  newValue?: string,
) => Promise<void>;

interface AdminDmModerationRouterDeps {
  requireFullAdmin: FullAdminMiddleware;
  logAction: LogAction;
}

export function createAdminDmModerationRouter(deps: AdminDmModerationRouterDeps) {
  const router = express.Router();
  const { requireFullAdmin, logAction } = deps;

// ─── DM-модерация ─────────────────────────────────────────────────────────────

/**
 * GET /admin/dm/reports
 * Список жалоб на сообщения (только для fullAdmin)
 */
router.get('/dm/reports', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const rows = await db
      .select({
        report: dmReports,
        message: { id: directMessages.id, body: directMessages.body, senderId: directMessages.senderId, conversationId: directMessages.conversationId, isDeleted: directMessages.isDeleted, createdAt: directMessages.createdAt },
        reporter: { id: users.id, username: users.username },
      })
      .from(dmReports)
      .innerJoin(directMessages, eq(dmReports.messageId, directMessages.id))
      .innerJoin(users, eq(dmReports.reporterId, users.id))
      .where(eq(dmReports.status, status as 'pending' | 'reviewed' | 'dismissed'))
      .orderBy(desc(dmReports.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ success: true, reports: rows, total: rows.length });
  } catch (error) {
    logger.error({ error }, 'Failed to list dm reports');
    res.status(500).json({ message: 'Не удалось получить жалобы' });
  }
});

/**
 * GET /admin/dm/conversations/:conversationId
 * Просмотр переписки администратором — только по жалобе, с логированием
 */
router.get('/dm/conversations/:conversationId', jwtAuth, requireFullAdmin, async (req, res) => {
  const adminId = req.user!.id;
  const { conversationId } = req.params;
  const reportId = req.query.reportId as string | undefined;
  const reason = req.query.reason as string | undefined;

  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ message: 'Укажите причину просмотра (параметр reason, мин. 5 символов)' });
  }

  try {
    // Проверяем, что диалог существует
    const conv = await db
      .select({ id: conversations.id, participantA: conversations.participantA, participantB: conversations.participantB })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conv.length) {
      return res.status(404).json({ message: 'Диалог не найден' });
    }

    // Логируем доступ
    await db.insert(dmAdminAccessLog).values({
      adminId,
      conversationId,
      reportId: reportId ?? null,
      reason: reason.trim(),
    });

    await logAction(req, 'view_dm_conversation', 'message', conversationId, JSON.stringify({ reportId, reason: reason.trim() }));

    // Читаем сообщения (последние 100)
    const messages = await db
      .select()
      .from(directMessages)
      .where(eq(directMessages.conversationId, conversationId))
      .orderBy(desc(directMessages.createdAt))
      .limit(100);

    res.json({ success: true, conversation: conv[0], messages });
  } catch (error) {
    logger.error({ error }, 'Failed to view dm conversation as admin');
    res.status(500).json({ message: 'Не удалось загрузить переписку' });
  }
});

/**
 * POST /admin/dm/reports/:reportId/review
 * Закрыть жалобу (reviewed / dismissed)
 */
router.post('/dm/reports/:reportId/review', jwtAuth, requireFullAdmin, async (req, res) => {
  const adminId = req.user!.id;
  const { reportId } = req.params;
  const { status } = req.body as { status: 'reviewed' | 'dismissed' };

  if (!['reviewed', 'dismissed'].includes(status)) {
    return res.status(400).json({ message: 'status должен быть reviewed или dismissed' });
  }

  try {
    const updated = await db
      .update(dmReports)
      .set({ status, reviewedBy: adminId, reviewedAt: new Date() })
      .where(and(eq(dmReports.id, reportId), eq(dmReports.status, 'pending')))
      .returning({ id: dmReports.id });

    if (!updated.length) {
      return res.status(404).json({ message: 'Жалоба не найдена или уже закрыта' });
    }

    const actionType = status === 'reviewed' ? 'review_dm_report' : 'dismiss_dm_report';
    await logAction(req, actionType, 'message', reportId, JSON.stringify({ status }));

    res.json({ success: true, reportId, status });
  } catch (error) {
    logger.error({ error }, 'Failed to review dm report');
    res.status(500).json({ message: 'Не удалось закрыть жалобу' });
  }
});


  return router;
}
