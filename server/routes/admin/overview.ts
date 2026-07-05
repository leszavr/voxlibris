import express from 'express';
import { sql } from 'drizzle-orm';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { storage } from '../../repositories/index.js';
import { db } from '../../db.js';
import { books, clubBooks, clubs, personalBooks, users } from '../../../shared/schema.js';
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

interface AdminOverviewRouterDeps {
  requireFullAdmin: FullAdminMiddleware;
  logAction: LogAction;
}

export function createAdminOverviewRouter(deps: AdminOverviewRouterDeps) {
  const router = express.Router();
  const { requireFullAdmin, logAction } = deps;

// ==== STATISTICS ====

// Получить общую статистику системы
router.get('/stats/overview', jwtAuth, requireAdmin, async (_req, res) => {
  try {
    const [userStatsRows, generalBookStatsRows, personalBookStatsRows, clubBookStatsRows, clubStatsRows] = await Promise.all([
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${users.status} = 'active')::int`,
          pending: sql<number>`COUNT(*) FILTER (WHERE ${users.status} = 'pending')::int`,
          suspended: sql<number>`COUNT(*) FILTER (WHERE ${users.status} = 'suspended')::int`,
          admins: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'admin')::int`,
          moderators: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'moderator')::int`,
        })
        .from(users)
        .where(sql`${users.status} != 'deleted'`),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${books.status} = 'active')::int`,
          blocked: sql<number>`COUNT(*) FILTER (WHERE ${books.status} = 'blocked')::int`,
        })
        .from(books),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${personalBooks.isDeleted} = false)::int`,
          blocked: sql<number>`COUNT(*) FILTER (WHERE ${personalBooks.isDeleted} = true)::int`,
        })
        .from(personalBooks),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${clubBooks.isDeleted} = false)::int`,
          blocked: sql<number>`COUNT(*) FILTER (WHERE ${clubBooks.isDeleted} = true)::int`,
        })
        .from(clubBooks),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'active')::int`,
          recruiting: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'recruiting')::int`,
          completed: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'completed')::int`,
          archived: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'archived')::int`,
        })
        .from(clubs)
        .where(sql`${clubs.status} != 'pending'`),
    ]);

    const userStatsRaw = userStatsRows[0] || {
      total: 0,
      active: 0,
      pending: 0,
      suspended: 0,
      admins: 0,
      moderators: 0,
    };
    const generalBookStatsRaw = generalBookStatsRows[0] || { total: 0, active: 0, blocked: 0 };
    const personalBookStatsRaw = personalBookStatsRows[0] || { total: 0, active: 0, blocked: 0 };
    const clubBookStatsRaw = clubBookStatsRows[0] || { total: 0, active: 0, blocked: 0 };
    const clubStatsRaw = clubStatsRows[0] || {
      total: 0,
      active: 0,
      recruiting: 0,
      completed: 0,
      archived: 0,
    };

    const userStats = {
      total: Number(userStatsRaw.total || 0),
      active: Number(userStatsRaw.active || 0),
      pending: Number(userStatsRaw.pending || 0),
      suspended: Number(userStatsRaw.suspended || 0),
      admins: Number(userStatsRaw.admins || 0),
      moderators: Number(userStatsRaw.moderators || 0),
    };

    // Считаем книги из всех таблиц: books, personal_books, club_books
    const totalGeneralBooks = Number(generalBookStatsRaw.total || 0);
    const activeGeneralBooks = Number(generalBookStatsRaw.active || 0);
    const blockedGeneralBooks = Number(generalBookStatsRaw.blocked || 0);

    const totalPersonalBooks = Number(personalBookStatsRaw.total || 0);
    const activePersonalBooks = Number(personalBookStatsRaw.active || 0);
    const blockedPersonalBooks = Number(personalBookStatsRaw.blocked || 0);

    const totalClubBooks = Number(clubBookStatsRaw.total || 0);
    const activeClubBooks = Number(clubBookStatsRaw.active || 0);
    const blockedClubBooks = Number(clubBookStatsRaw.blocked || 0);
    
    const bookStats = {
      total: totalGeneralBooks + totalPersonalBooks + totalClubBooks,
      active: activeGeneralBooks + activePersonalBooks + activeClubBooks,
      blocked: blockedGeneralBooks + blockedPersonalBooks + blockedClubBooks,
    };

    const clubStats = {
      total: Number(clubStatsRaw.total || 0),
      active: Number(clubStatsRaw.active || 0),
      recruiting: Number(clubStatsRaw.recruiting || 0),
      completed: Number(clubStatsRaw.completed || 0),
      archived: Number(clubStatsRaw.archived || 0),
    };

    res.json({
      users: userStats,
      books: bookStats,
      clubs: clubStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== ADMIN AUDIT LOGS ====

// Получить логи админских действий
router.get('/audit-logs', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { 
      page = '1', 
      limit = '50', 
      action, 
      adminId, 
      targetType, 
      dateFrom, 
      dateTo 
    } = req.query;

    const pageNum = Math.max(1, Number.parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit as string) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Получаем логи с фильтрами
    const logs = await storage.getAdminActionLogs({
      limit: limitNum,
      offset,
      action: action as string,
      adminId: adminId as string, 
      targetType: targetType as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    const totalCount = await storage.getAdminActionLogsCount({
      action: action as string,
      adminId: adminId as string,
      targetType: targetType as string, 
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить статистику админских действий
router.get('/audit-stats', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = Math.min(365, Math.max(1, Number.parseInt(days as string) || 30));
    
    const stats = await storage.getAdminActionStats(daysNum);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== SECURITY SETTINGS ====

// Получить настройки безопасности
router.get('/security-settings', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const settings = await storage.getSettingsByCategory('security');
    const securitySettings: Record<string, string> = {};
    
    settings.forEach(s => {
      securitySettings[s.key] = s.value || '';
    });
    
    res.json({
      success: true,
      settings: {
        'security.impersonation.enabled': securitySettings['security.impersonation.enabled'] || 'true',
        'security.impersonation.log_retention_days': securitySettings['security.impersonation.log_retention_days'] || '90',
        'security.admin_session_timeout': securitySettings['security.admin_session_timeout'] || '60'
      }
    });
  } catch (error) {
    console.error('Error fetching security settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки безопасности
router.put('/security-settings', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { impersonationEnabled, logRetentionDays, adminSessionTimeout } = req.body;
    
    const settingsToSave = [
      {
        key: 'security.impersonation.enabled',
        value: impersonationEnabled ? 'true' : 'false',
        category: 'security',
        description: 'Enable/disable admin impersonation feature',
        updatedBy: req.user!.userId
      },
      {
        key: 'security.impersonation.log_retention_days', 
        value: String(Math.max(1, Number.parseInt(logRetentionDays) || 90)),
        category: 'security',
        description: 'Days to retain impersonation logs',
        updatedBy: req.user!.userId
      },
      {
        key: 'security.admin_session_timeout',
        value: String(Math.max(15, Number.parseInt(adminSessionTimeout) || 60)),
        category: 'security', 
        description: 'Admin session timeout in minutes',
        updatedBy: req.user!.userId
      }
    ];
    
    for (const setting of settingsToSave) {
      await storage.setSetting(setting);
    }
    
    await logAction(
      req,
      'update_settings',
      'settings',
      'security',
      'Updated security settings'
    );
    
    res.json({
      success: true,
      message: 'Security settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  return router;
}
