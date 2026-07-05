export type HealthStatus = 'healthy' | 'warning' | 'error';

export interface SystemSettings {
  general: {
    registrationEnabled: boolean;
    maintenanceMode: boolean;
    maintenanceReason: string;
    maintenanceUntil: string;
    maintenanceMessage: string;
  };
  security: {
    require_email_verification: boolean;
    max_login_attempts: number;
    password_min_length: number;
    require_2fa_for_admins: boolean;
  };
  notifications: {
    email_notifications: boolean;
    admin_email: string;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_enabled: boolean;
  };
  moderation: {
    auto_moderation_enabled: boolean;
    require_book_approval: boolean;
    require_club_approval: boolean;
    spam_detection_enabled: boolean;
    profanity_filter_enabled: boolean;
  };
}

export interface SystemHealth {
  database: {
    status: HealthStatus;
    connections: number;
    max_connections: number;
    uptime: string;
  };
  server: {
    status: HealthStatus;
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    uptime: string;
  };
  services: {
    auth_service: boolean;
    file_storage: boolean;
    email_service: boolean;
    background_jobs: boolean;
  };
}

export interface PlatformSettingsResponse {
  settings: {
    canonicalUrl: string;
    effectiveUrl: string;
    source: 'database' | 'environment' | 'fallback';
  };
}

export interface GeneralSettingsResponse {
  settings: SystemSettings['general'];
}

export interface DmRetentionAdminSettings {
  adminMaxDays: number;
  hardDeleteGraceDays: number;
}

export interface DmRetentionCleanupStats {
  softDeleted: number;
  hardDeleted: number;
  durationMs: number;
  batchSize: number;
  adminMaxDays: number;
  hardDeleteGraceDays: number;
}

export type AdminSettingsApiValue = { value: unknown };
export type AdminSettingsApiResponse = Record<string, Record<string, AdminSettingsApiValue>>;
