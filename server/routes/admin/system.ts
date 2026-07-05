import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import { jwtAuth, requireAdmin } from '../../jwt-middleware.js';
import { storage } from '../../repositories/index.js';
import { authService } from '../../auth-service.js';
import { fileStorage } from '../../file-storage.js';
import { db } from '../../db.js';
import type { AdminActionTargetType, AdminActionType } from '../../../shared/schema.js';

type LogAction = (
  req: express.Request,
  actionType: AdminActionType,
  targetType: AdminActionTargetType,
  targetId: string,
  reason?: string,
  previousValue?: string,
  newValue?: string,
) => Promise<void>;

interface AdminSystemRouterDeps {
  logAction: LogAction;
}

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return fallback;
  return max ? Math.min(normalized, max) : normalized;
}

function parseAdminPagination(pageRaw: unknown, limitRaw: unknown) {
  const page = parsePositiveInt(pageRaw, 1);
  const limit = parsePositiveInt(limitRaw, 20, 100);
  return { page, limit, offset: (page - 1) * limit };
}

export function createAdminSystemRouter(deps: AdminSystemRouterDeps) {
  const router = express.Router();
  const { logAction } = deps;

// ==== SYSTEM HEALTH ====

type HealthStatus = 'healthy' | 'warning' | 'error';

interface DatabaseHealthMetrics {
  status: HealthStatus;
  connections: number;
  max_connections: number;
  uptime: string;
}

interface ServerHealthMetrics {
  status: 'healthy';
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  uptime: string;
}

function toDateOrNull(value: Date | string | undefined): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getServerHealthMetrics(): ServerHealthMetrics {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
  const memoryPercentage = totalMemoryBytes > 0
    ? Math.round((usedMemoryBytes / totalMemoryBytes) * 100)
    : 0;

  const cpuCount = Math.max(os.cpus().length, 1);
  const loadAverage1m = os.loadavg()[0] ?? 0;
  const cpuUsage = Math.max(0, Math.min(100, Math.round((loadAverage1m / cpuCount) * 100)));

  return {
    status: 'healthy',
    cpu_usage: cpuUsage,
    memory_usage: memoryPercentage,
    disk_usage: 0,
    uptime: formatUptime(process.uptime()),
  };
}

async function getDiskUsagePercentage(): Promise<number> {
  const diskStats = await fs.statfs(process.cwd());
  const totalDiskBlocks = Number(diskStats.blocks);
  const availableDiskBlocks = Number(diskStats.bavail);
  const usedDiskBlocks = Math.max(0, totalDiskBlocks - availableDiskBlocks);

  if (totalDiskBlocks <= 0) {
    return 0;
  }

  return Math.round((usedDiskBlocks / totalDiskBlocks) * 100);
}

async function getDatabaseHealthMetrics(): Promise<DatabaseHealthMetrics> {
  const { sql } = await import('drizzle-orm');
  const connectionStatsResult = await db.execute(sql`
    SELECT
      COUNT(*)::int AS current_connections,
      current_setting('max_connections')::int AS max_connections,
      pg_postmaster_start_time() AS started_at
    FROM pg_stat_activity
  `);

  const connectionStatsRow = (connectionStatsResult as Array<{
    current_connections?: number | string;
    max_connections?: number | string;
    started_at?: Date | string;
  }>)[0];

  const connections = Number(connectionStatsRow?.current_connections ?? 0);
  const maxConnections = Number(connectionStatsRow?.max_connections ?? 0);
  const startedAt = toDateOrNull(connectionStatsRow?.started_at);

  let status: HealthStatus = 'healthy';
  if (maxConnections > 0) {
    const connectionRatio = connections / maxConnections;
    if (connectionRatio >= 0.9) {
      status = 'error';
    } else if (connectionRatio >= 0.75) {
      status = 'warning';
    }
  }

  let uptime = '0м';
  if (startedAt) {
    const uptimeSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    uptime = formatUptime(uptimeSeconds);
  }

  return {
    status,
    connections,
    max_connections: maxConnections,
    uptime,
  };
}

async function getEmailServiceHealthStatus(): Promise<boolean> {
  const smtpSettings = await storage.getSetting('smtp.enabled');
  let emailServiceStatus = smtpSettings?.value === 'true';

  if (emailServiceStatus) {
    const host = await storage.getSetting('smtp.host');
    const user = await storage.getSetting('smtp.user');
    emailServiceStatus = !!(host && user);
  }

  return emailServiceStatus;
}

async function getFileStorageHealthStatus(): Promise<boolean> {
  const hasS3Config = !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY &&
    process.env.S3_BUCKET
  );

  if (!hasS3Config) {
    return false;
  }

  await fileStorage.initializeBucket();
  return true;
}

function getAuthServiceHealthStatus(): boolean {
  const hasJwtConfig = !!(process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET);

  if (!hasJwtConfig) {
    return false;
  }

  authService.verifyAccessToken('__healthcheck__');
  return true;
}

// Получить состояние системы
router.get('/system/health', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const serverMetrics = getServerHealthMetrics();
    serverMetrics.disk_usage = await getDiskUsagePercentage();

    let databaseMetrics: DatabaseHealthMetrics = {
      status: 'error',
      connections: 0,
      max_connections: 0,
      uptime: '0м',
    };
    try {
      databaseMetrics = await getDatabaseHealthMetrics();
    } catch (error) {
      console.error('[Health] Database check failed:', error);
    }

    let emailServiceStatus = false;
    try {
      emailServiceStatus = await getEmailServiceHealthStatus();
    } catch (error) {
      console.error('[Health] Email service check failed:', error);
    }

    let fileStorageStatus = false;
    try {
      fileStorageStatus = await getFileStorageHealthStatus();
    } catch (error) {
      console.error('[Health] File storage check failed:', error);
    }

    let authServiceStatus = false;
    try {
      authServiceStatus = getAuthServiceHealthStatus();
    } catch (error) {
      console.error('[Health] Auth service check failed:', error);
    }

    const health = {
      database: databaseMetrics,
      server: serverMetrics,
      services: {
        auth_service: authServiceStatus,
        file_storage: fileStorageStatus,
        email_service: emailServiceStatus,
        background_jobs: true,
      }
    };

    res.json(health);
  } catch (error) {
    console.error('Error fetching health:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Вспомогательная функция для форматирования uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}д ${hours}ч ${mins}м`;
  } else if (hours > 0) {
    return `${hours}ч ${mins}м`;
  } else {
    return `${mins}м`;
  }
}

// ==== REPORTS MANAGEMENT ====

// Получить список отчетов
router.get('/reports', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { page, limit } = parseAdminPagination(req.query.page, req.query.limit);
    const { status, type, assignedTo } = req.query;

    const filters: { status?: string; type?: string; assignedTo?: string } = {};
    if (status) filters.status = status as string;
    if (type) filters.type = type as string;
    if (assignedTo) filters.assignedTo = assignedTo as string;

    const result = await storage.getModerationReportsPage({ filters, page, limit });

    res.json({
      reports: result.reports,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить статус отчета
router.put('/reports/:reportId/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, admin_notes } = req.body;

    if (!['new', 'in_progress', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Заглушка - в реальном проекте здесь было бы обновление в БД
    const updatedReport = {
      id: reportId,
      status,
      admin_notes,
      updated_at: new Date().toISOString()
    };

    await logAction(
      req,
      'update_report_status',
      'report',
      reportId,
      `Changed status to ${status}`
    );

    res.json({ report: updatedReport });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  return router;
}
