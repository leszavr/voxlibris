UPDATE commerce_feature_registry
SET scope_type = 'platform', updated_at = now()
WHERE key = 'clubs.owned.max_count'
  AND scope_type <> 'platform';
