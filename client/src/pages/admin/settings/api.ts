import { apiRequest } from "@/lib/queryClient";

import type {
  AdminSettingsApiResponse,
  AdminSettingsApiValue,
  DmRetentionAdminSettings,
  DmRetentionCleanupStats,
  GeneralSettingsResponse,
  PlatformSettingsResponse,
  SystemHealth,
  SystemSettings,
} from "./types";

function readSetting<T>(items: Record<string, AdminSettingsApiValue> | undefined, key: string, fallback: T): T {
  const value = items?.[key]?.value;
  return value === undefined ? fallback : value as T;
}

export async function fetchSystemSettings(): Promise<SystemSettings> {
  const response = await apiRequest<AdminSettingsApiResponse>('/api/v1/admin/settings');
  const security = response.security;

  return {
    ...response,
    general: response.general as unknown as SystemSettings['general'],
    security: {
      require_email_verification: readSetting(security, 'security.require_email_verification', true),
      max_login_attempts: readSetting(security, 'security.max_login_attempts', 5),
      password_min_length: readSetting(security, 'security.password_min_length', 8),
      require_2fa_for_admins: false,
    },
  } as SystemSettings;
}

export async function fetchGeneralSettings(): Promise<SystemSettings['general']> {
  const response = await apiRequest<GeneralSettingsResponse>('/api/v1/admin/settings/general');
  return response.settings;
}

export async function updateGeneralSettings(settings: SystemSettings['general']): Promise<SystemSettings['general']> {
  const response = await apiRequest<GeneralSettingsResponse>('/api/v1/admin/settings/general', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return response.settings;
}

export async function fetchPlatformSettings(): Promise<PlatformSettingsResponse> {
  return apiRequest<PlatformSettingsResponse>('/api/v1/admin/settings/platform');
}

export async function updatePlatformSettings(canonicalUrl: string): Promise<void> {
  await apiRequest('/api/v1/admin/settings/platform', {
    method: 'PUT',
    body: JSON.stringify({ canonicalUrl }),
  });
}

export async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<void> {
  const payload = settings.security ? {
    'security.require_email_verification': settings.security.require_email_verification,
    'security.max_login_attempts': settings.security.max_login_attempts,
    'security.password_min_length': settings.security.password_min_length,
    'security.require_2fa_for_admins': false,
  } : settings;

  await apiRequest('/api/v1/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  return apiRequest<SystemHealth>('/api/v1/admin/system/health');
}

export async function fetchDmRetentionAdminSettings(): Promise<DmRetentionAdminSettings> {
  const response = await apiRequest<{ success: boolean; settings: DmRetentionAdminSettings }>('/api/dm/admin/retention-settings');
  return response.settings;
}

export async function updateDmRetentionAdminSettings(payload: {
  adminMaxDays?: number;
  hardDeleteGraceDays?: number;
}): Promise<DmRetentionAdminSettings> {
  const response = await apiRequest<{ success: boolean; settings: DmRetentionAdminSettings }>('/api/dm/admin/retention-settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.settings;
}

export async function runDmRetentionCleanup(batchSize?: number): Promise<DmRetentionCleanupStats> {
  const response = await apiRequest<{ success: boolean; stats: DmRetentionCleanupStats }>('/api/dm/admin/retention-cleanup/run', {
    method: 'POST',
    body: JSON.stringify({ batchSize }),
  });
  return response.stats;
}
