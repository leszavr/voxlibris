import express from 'express';
import { jwtAuth, requireAdmin } from './jwt-middleware.js';
import { storage } from './repositories/index.js';
import { emailService } from './services/email-service.js';
import type { AdminActionType, AdminActionTargetType } from '../shared/schema.js';
import { logger } from './lib/logger.js';
import {
  getPublicBaseUrl,
  invalidatePublicBaseUrlCache,
  normalizePublicBaseUrl,
  platformBaseUrlSettingKey,
} from './lib/public-base-url.js';
const router = express.Router();

// Middleware для проверки полных админских прав (только admin, не moderator)
const requireFullAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Full admin role required' });
  }

  next();
};

// Интерфейс для логирования действий администратора (KISS: группируем параметры)
interface AdminActionLog {
  adminId: string;
  actionType: AdminActionType;
  targetType: AdminActionTargetType;
  targetId: string;
  reason?: string;
  previousValue?: string;
  newValue?: string;
  req?: express.Request;
}

// Функция для логирования действий админа через storage
const logAdminAction = async (params: AdminActionLog) => {
  try {
    await storage.logAdminAction({
      adminId: params.adminId,
      actionType: params.actionType,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      previousValue: params.previousValue,
      newValue: params.newValue,
      ipAddress: params.req?.ip,
      userAgent: params.req?.get('User-Agent')
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Не прерываем выполнение из-за ошибки логирования
  }
};

// Helper для упрощения вызовов (KISS: уменьшаем повторяющийся код)
const logAction = (
  req: express.Request,
  actionType: AdminActionType,
  targetType: AdminActionTargetType,
  targetId: string,
  reason?: string,
  previousValue?: string,
  newValue?: string
) => logAdminAction({
  adminId: req.user!.userId,
  actionType,
  targetType,
  targetId,
  reason,
  previousValue,
  newValue,
  req
});

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  if (normalized < 1) {
    return fallback;
  }

  return max ? Math.min(normalized, max) : normalized;
}

import { createAdminUsersRouter } from './routes/admin/users.js';

router.use(createAdminUsersRouter({ requireFullAdmin, logAction }));

import { createAdminBooksRouter } from './routes/admin/books.js';

router.use(createAdminBooksRouter({ requireFullAdmin, logAction }));

import { createAdminClubsRouter } from './routes/admin/clubs.js';

router.use(createAdminClubsRouter({ logAction }));

import { createAdminOverviewRouter } from './routes/admin/overview.js';

router.use(createAdminOverviewRouter({ requireFullAdmin, logAction }));

// ==== SYSTEM SETTINGS ====

type GeneralSettingsPayload = {
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceReason: string;
  maintenanceUntil: string;
  maintenanceMessage: string;
};

async function getGeneralSettings(): Promise<GeneralSettingsPayload> {
  const rows = await storage.getSettingsByCategory('general');
  const values = new Map(rows.map((row) => [row.key, row.value ?? '']));

  return {
    registrationEnabled: values.get('general.registration_enabled') !== 'false',
    maintenanceMode: values.get('general.maintenance_mode') === 'true',
    maintenanceReason: values.get('general.maintenance_reason') || '',
    maintenanceUntil: values.get('general.maintenance_until') || '',
    maintenanceMessage: values.get('general.maintenance_message') || '',
  };
}

function normalizeGeneralSettingsInput(input: unknown): GeneralSettingsPayload {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const text = (key: string, fallback: string, max: number) => {
    const value = typeof body[key] === 'string' ? body[key].trim() : fallback;
    return value.slice(0, max);
  };

  return {
    registrationEnabled: body.registrationEnabled !== false,
    maintenanceMode: body.maintenanceMode === true,
    maintenanceReason: text('maintenanceReason', '', 180),
    maintenanceUntil: text('maintenanceUntil', '', 80),
    maintenanceMessage: text('maintenanceMessage', '', 1000),
  };
}

router.get('/settings/general/public', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ settings: await getGeneralSettings() });
  } catch (error) {
    console.error('Error fetching public general settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/settings/general', jwtAuth, requireAdmin, async (_req, res) => {
  try {
    res.json({ settings: await getGeneralSettings() });
  } catch (error) {
    console.error('Error fetching general settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/settings/general', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const next = normalizeGeneralSettingsInput(req.body);
    const entries = [
      ['general.registration_enabled', String(next.registrationEnabled), 'Allow public registration'],
      ['general.maintenance_mode', String(next.maintenanceMode), 'Enable maintenance overlay for non-admin users'],
      ['general.maintenance_reason', next.maintenanceReason, 'Maintenance reason shown to users'],
      ['general.maintenance_until', next.maintenanceUntil, 'Maintenance expected end time shown to users'],
      ['general.maintenance_message', next.maintenanceMessage, 'Additional maintenance message shown to users'],
    ] as const;

    for (const [key, value, description] of entries) {
      await storage.setSetting({ key, value, category: 'general', description, updatedBy: req.user!.userId });
    }

    await logAction(req, 'update_settings', 'settings', 'general', 'Updated general platform settings');
    res.json({ success: true, settings: next });
  } catch (error) {
    console.error('Error saving general settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить настройки системы
router.get('/settings', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { category } = req.query;
    const settings = await storage.getSystemSettings(category as string);
    const now = new Date();

    // Группируем настройки по категориям для удобного отображения
    type GroupedSettings = Record<
      string,
      Record<
        string,
        {
          value: unknown;
          type: string;
          description: string | null;
          isPublic: boolean;
          updatedAt: Date;
          updatedBy: string | null;
        }
      >
    >;

    const grouped = settings.reduce<GroupedSettings>((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {};
      }

      // Парсим значение в зависимости от типа
      let value: unknown = setting.value;
      try {
        switch (setting.type) {
          case 'boolean':
            value = setting.value === 'true';
            break;
          case 'number':
            value = Number(setting.value);
            break;
          case 'json':
            value = JSON.parse(setting.value);
            break;
          default:
            value = setting.value;
        }
      } catch (error) {
        console.error(`Failed to parse setting ${setting.key}:`, error);
      }

      acc[setting.category][setting.key] = {
        value,
        type: setting.type,
        description: setting.description,
        isPublic: setting.isPublic,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy
      };

      return acc;
    }, {});

    if (!category || category === 'security') {
      grouped.security ??= {};
      grouped.security['security.max_login_attempts'] ??= {
        value: 5,
        type: 'number',
        description: 'Maximum failed login attempts per 15 minutes',
        isPublic: false,
        updatedAt: now,
        updatedBy: null,
      };
      grouped.security['security.password_min_length'] ??= {
        value: 8,
        type: 'number',
        description: 'Minimum password length',
        isPublic: false,
        updatedAt: now,
        updatedBy: null,
      };
      grouped.security['security.require_email_verification'] ??= {
        value: true,
        type: 'boolean',
        description: 'Require email verification for new users',
        isPublic: false,
        updatedAt: now,
        updatedBy: null,
      };
      grouped.security['security.require_2fa_for_admins'] ??= {
        value: false,
        type: 'boolean',
        description: 'Reserved for future TOTP admin enforcement',
        isPublic: false,
        updatedAt: now,
        updatedBy: null,
      };
    }

    res.json(grouped);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки системы
router.put('/settings', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const updatedSettings = req.body;
    const results = [];
    const normalizers: Record<string, (value: unknown) => unknown> = {
      'security.max_login_attempts': (value) => Math.max(3, parsePositiveInt(value, 5, 20)),
      'security.password_min_length': (value) => Math.max(8, parsePositiveInt(value, 8, 128)),
      'security.require_2fa_for_admins': () => false,
    };

    // Обновляем каждую настройку через storage
    for (const [key, value] of Object.entries(updatedSettings)) {
      try {
        const normalizedValue = normalizers[key]?.(value) ?? value;
        const success = await storage.updateSystemSetting(key, normalizedValue, req.user!.userId);
        results.push({ key, success });
      } catch (error) {
        console.error(`Failed to update setting ${key}:`, error);
        results.push({ key, success: false, error: (error as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      message: `Settings updated: ${successCount} successful, ${failureCount} failed`,
      results
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== FEEDBACK SETTINGS ====

// Получить настройки обратной связи
router.get('/settings/feedback', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const feedbackSettings = await storage.getSettingsByCategory('feedback');

    const settings: Record<string, string> = {};
    feedbackSettings.forEach((s) => {
      settings[s.key] = s.value || '';
    });

    res.json({
      success: true,
      settings: {
        'feedback.emails': settings['feedback.emails'] || '',
      },
    });
  } catch (error) {
    console.error('Error fetching feedback settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Сохранить настройки обратной связи
router.put('/settings/feedback', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { emails } = req.body;

    if (!emails || typeof emails !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email addresses are required'
      });
    }

    // Валидация email адресов
    const emailList = emails.split(',').map(email => email.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    for (const email of emailList) {
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: `Invalid email format: ${email}`
        });
      }
    }

    // Сохраняем настройку
    await storage.setSetting({
      key: 'feedback.emails',
      value: emails,
      category: 'feedback',
      description: 'Email addresses for feedback notifications (comma-separated)',
      updatedBy: req.user!.userId
    });

    // Логируем действие админа
    await logAction(
      req,
      'update_settings',
      'settings',
      'feedback',
      'Updated feedback email settings'
    );

    logger.info({ admin: req.user?.username }, 'Feedback settings updated');

    res.json({
      success: true,
      message: 'Feedback settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving feedback settings:', error);
    res.status(500).json({ message: 'Failed to save feedback settings' });
  }
});

// ==== SMTP SETTINGS ====

// ==== PLATFORM URL SETTINGS ====

router.get('/settings/platform', jwtAuth, requireAdmin, async (_req, res) => {
  try {
    const setting = await storage.getSetting(platformBaseUrlSettingKey);
    const canonicalUrl = setting?.value ? normalizePublicBaseUrl(setting.value) : null;
    const effectiveUrl = await getPublicBaseUrl();
    const envConfigured = Boolean(process.env.APP_BASE_URL || process.env.APP_BASE_URLS || process.env.CLIENT_URL);

    let source: string;
    if (canonicalUrl) {
      source = 'database';
    } else if (envConfigured) {
      source = 'environment';
    } else {
      source = 'fallback';
    }

    res.json({
      settings: {
        canonicalUrl: canonicalUrl || '',
        effectiveUrl,
        source,
      },
    });
  } catch (error) {
    console.error('Error fetching platform URL settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/settings/platform', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const rawCanonicalUrl = typeof req.body?.canonicalUrl === 'string' ? req.body.canonicalUrl : '';
    const normalizedCanonicalUrl = normalizePublicBaseUrl(rawCanonicalUrl);

    if (!normalizedCanonicalUrl) {
      return res.status(400).json({
        message: 'Некорректный canonical URL. Допустимы только абсолютные http/https URL.',
      });
    }

    const parsed = new URL(normalizedCanonicalUrl);
    if (
      process.env.NODE_ENV === 'production' &&
      parsed.hostname !== 'localhost' &&
      parsed.protocol !== 'https:'
    ) {
      return res.status(400).json({
        message: 'В production canonical URL должен использовать https.',
      });
    }

    const previous = await storage.getSetting(platformBaseUrlSettingKey);

    await storage.setSetting({
      key: platformBaseUrlSettingKey,
      value: normalizedCanonicalUrl,
      category: 'platform',
      description: 'Canonical public URL used for emails and external links',
      isEncrypted: false,
      updatedBy: req.user!.userId,
    });

    invalidatePublicBaseUrlCache();

    await logAction(
      req,
      'update_settings',
      'settings',
      platformBaseUrlSettingKey,
      'Updated canonical public URL',
      previous?.value || undefined,
      normalizedCanonicalUrl,
    );

    res.json({
      success: true,
      settings: {
        canonicalUrl: normalizedCanonicalUrl,
      },
    });
  } catch (error) {
    console.error('Error saving platform URL settings:', error);
    res.status(500).json({ message: 'Failed to save platform URL settings' });
  }
});

// Получить SMTP настройки
router.get('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const smtpSettings = await storage.getSettingsByCategory('smtp');
    
    const settings: Record<string, string> = {};
    smtpSettings.forEach((s) => {
      if (s.key === 'smtp.password') {
        settings[s.key] = s.value ? '********' : '';
      } else {
        settings[s.key] = s.value || '';
      }
    });

    res.json({
      success: true,
      settings: {
        'smtp.host': settings['smtp.host'] || '',
        'smtp.port': settings['smtp.port'] || '587',
        'smtp.user': settings['smtp.user'] || '',
        'smtp.password': settings['smtp.password'] || '',
        'smtp.from': settings['smtp.from'] || '',
        'smtp.secure': settings['smtp.secure'] || 'false',
        'smtp.enabled': settings['smtp.enabled'] || 'false',
      },
    });
  } catch (error) {
    console.error('Error fetching SMTP settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Сохранить SMTP настройки
router.put('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { host, port, user, password, from, secure, enabled } = req.body;

    // Сохраняем каждую настройку через storage.setSetting
    await storage.setSetting({
      key: 'smtp.host',
      value: host || '',
      category: 'smtp',
      description: 'SMTP host',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.port',
      value: port?.toString() || '587',
      category: 'smtp',
      description: 'SMTP port',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.user',
      value: user || '',
      category: 'smtp',
      description: 'SMTP username',
      updatedBy: req.user!.userId,
    });

    if (password && password !== '********') {
      await storage.setSetting({
        key: 'smtp.password',
        value: password,
        category: 'smtp',
        description: 'SMTP password',
        isEncrypted: true,
        updatedBy: req.user!.userId,
      });
    }

    await storage.setSetting({
      key: 'smtp.from',
      value: from || '',
      category: 'smtp',
      description: 'From email address',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.secure',
      value: secure ? 'true' : 'false',
      category: 'smtp',
      description: 'Use SSL/TLS',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.enabled',
      value: enabled ? 'true' : 'false',
      category: 'smtp',
      description: 'Enable SMTP',
      updatedBy: req.user!.userId,
    });

    // Сбрасываем транспорт email сервиса для применения новых настроек
    emailService.resetTransporter();

    logger.info({ admin: req.user?.username }, 'SMTP settings updated');

    res.json({ 
      success: true,
      message: 'SMTP settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving SMTP settings:', error);
    res.status(500).json({ message: 'Failed to save SMTP settings' });
  }
});

// Тестовая отправка email
router.post('/settings/smtp/test', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'Test email address is required' 
      });
    }

    // Сбрасываем транспорт чтобы использовать актуальные настройки
    emailService.resetTransporter();

    const result = await emailService.sendTestEmail(testEmail);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Не удалось отправить письмо. Проверьте настройки SMTP.'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email'
    });
  }
});

import { createAdminSystemRouter } from './routes/admin/system.js';

router.use(createAdminSystemRouter({ logAction }));

// ============================================
// SMTP Settings Management
// ============================================

/**
 * GET /api/admin/settings/smtp
 * Получить текущие SMTP настройки (без пароля)
 */
router.get('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const smtpSettings = await storage.getSettingsByCategory('smtp');
    
    // Формируем объект настроек, исключая пароль в явном виде
    const settings: Record<string, string> = {};
    smtpSettings.forEach(setting => {
      if (setting.key === 'smtp.password') {
        settings[setting.key] = setting.value ? '********' : '';
      } else {
        settings[setting.key] = setting.value ?? '';
      }
    });

    res.json({
      success: true,
      settings: {
        'smtp.host': settings['smtp.host'] || '',
        'smtp.port': settings['smtp.port'] || '587',
        'smtp.user': settings['smtp.user'] || '',
        'smtp.password': settings['smtp.password'] || '',
        'smtp.from': settings['smtp.from'] || '',
        'smtp.secure': settings['smtp.secure'] || 'false',
        'smtp.enabled': settings['smtp.enabled'] || 'false',
      }
    });
  } catch (error) {
    console.error('Error getting SMTP settings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to get SMTP settings' 
    });
  }
});

/**
 * PUT /api/admin/settings/smtp
 * Обновить SMTP настройки
 */
router.put('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { host, port, user, password, from, secure, enabled } = req.body;

    // Валидация
    if (!host || !port || !from) {
      return res.status(400).json({
        success: false,
        message: 'Host, port, and from email are required'
      });
    }

    const adminId = req.user!.userId;

    // Сохраняем каждую настройку
    const settingsToSave = [
      { key: 'smtp.host', value: host, category: 'smtp', description: 'SMTP server host' },
      { key: 'smtp.port', value: String(port), category: 'smtp', description: 'SMTP server port' },
      { key: 'smtp.user', value: user || '', category: 'smtp', description: 'SMTP username' },
      { key: 'smtp.from', value: from, category: 'smtp', description: 'From email address' },
      { key: 'smtp.secure', value: String(secure || false), category: 'smtp', description: 'Use SSL/TLS' },
      { key: 'smtp.enabled', value: String(enabled || false), category: 'smtp', description: 'SMTP enabled' },
    ];

    // Если передан пароль (не маска), сохраняем его
    if (password && password !== '********') {
      settingsToSave.push({
        key: 'smtp.password',
        value: password,
        category: 'smtp',
        description: 'SMTP password'
      });
    }

    // Сохраняем все настройки
    for (const setting of settingsToSave) {
      await storage.setSetting({
        ...setting,
        updatedBy: adminId,
        isEncrypted: setting.key === 'smtp.password'
      });
    }

    await logAction(
      req,
      'update_smtp_settings',
      'settings',
      'smtp',
      'Updated SMTP configuration'
    );

    res.json({
      success: true,
      message: 'SMTP settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SMTP settings'
    });
  }
});

/**
 * POST /api/admin/settings/smtp/test
 * Отправить тестовое письмо для проверки SMTP настроек
 */
router.post('/settings/smtp/test', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        message: 'Test email address is required'
      });
    }

    // Сбрасываем кэш транспорта чтобы использовать новые настройки
    emailService.resetTransporter();
    
    // Отправляем тестовое письмо через email-service
    const result = await emailService.sendTestEmail(testEmail);
    
    await logAction(
      req,
      'test_smtp',
      'settings',
      'smtp',
      `Test email sent to ${testEmail}: ${result.success ? 'SUCCESS' : 'FAILED'}`,
      undefined,
      JSON.stringify({ messageId: result.messageId, error: result.error })
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Тестовое письмо успешно отправлено! Проверьте почту.',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Не удалось отправить письмо. Проверьте настройки SMTP.'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email'
    });
  }
});

// ==== CLUB MANAGEMENT ====

/**
 * PUT /api/v1/admin/clubs/:id/privacy
 * Изменить статус публичности клуба (isPrivate)
 * Только для админов/модераторов
 */
router.put('/clubs/:id/privacy', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublic } = req.body;

    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({ message: 'isPublic field is required and must be a boolean' });
    }

    // Конвертируем isPublic (client) в isPrivate (server)
    // isPublic = false -> isPrivate = true (закрытый клуб)
    // isPublic = true -> isPrivate = false (публичный клуб)
    const isPrivate = !isPublic;

    const updatedClub = await storage.updateClubPrivacy(id, isPrivate);

    if (!updatedClub) {
      return res.status(404).json({ message: 'Club not found' });
    }

    await logAction(
      req,
      'update_club_privacy',
      'club',
      id,
      `Changed privacy to ${isPrivate ? 'private' : 'public'}`,
      undefined,
      String(isPrivate)
    );

    res.json({
      message: 'Club privacy updated successfully',
      is_public: isPublic
    });
  } catch (error) {
    console.error('Error updating club privacy:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

import { createAdminRecordingsRouter } from './routes/admin/recordings.js';

router.use(createAdminRecordingsRouter());

import { createAdminDmModerationRouter } from './routes/admin/dm-moderation.js';

router.use(createAdminDmModerationRouter({ requireFullAdmin, logAction }));

export default router;
