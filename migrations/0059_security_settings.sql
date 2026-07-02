INSERT INTO system_settings (key, value, type, category, description, is_public, updated_at)
VALUES
  ('security.max_login_attempts', '5', 'number', 'security', 'Maximum failed login attempts per 15 minutes', false, now()),
  ('security.password_min_length', '8', 'number', 'security', 'Minimum password length', false, now()),
  ('security.require_email_verification', 'true', 'boolean', 'security', 'Require email verification for new users', false, now()),
  ('security.require_2fa_for_admins', 'false', 'boolean', 'security', 'Reserved for future TOTP admin enforcement', false, now())
ON CONFLICT (key) DO NOTHING;
