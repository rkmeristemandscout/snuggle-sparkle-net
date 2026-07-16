
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  usage_count BIGINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_org ON public.api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON public.api_keys(prefix);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys select" ON public.api_keys FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), organization_id, 'org.manage_api_keys'));
CREATE POLICY "api_keys insert" ON public.api_keys FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), organization_id, 'org.manage_api_keys'));
CREATE POLICY "api_keys update" ON public.api_keys FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), organization_id, 'org.manage_api_keys'))
  WITH CHECK (public.has_permission(auth.uid(), organization_id, 'org.manage_api_keys'));
CREATE POLICY "api_keys delete" ON public.api_keys FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), organization_id, 'org.manage_api_keys'));

CREATE TRIGGER trg_api_keys_updated
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  ip TEXT,
  user_agent TEXT,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_org_time ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_category ON public.audit_logs(category);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs self insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
CREATE POLICY "audit_logs view" ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (organization_id IS NOT NULL AND public.has_permission(auth.uid(), organization_id, 'audit.view'))
  );

CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INT NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_feature_flags_org_key
  ON public.feature_flags(COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::UUID), key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags read" ON public.feature_flags FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );
CREATE POLICY "feature_flags insert" ON public.feature_flags FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NULL AND public.is_super_admin(auth.uid()))
    OR (organization_id IS NOT NULL AND public.has_permission(auth.uid(), organization_id, 'feature_flag.manage'))
  );
CREATE POLICY "feature_flags update" ON public.feature_flags FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND public.is_super_admin(auth.uid()))
    OR (organization_id IS NOT NULL AND public.has_permission(auth.uid(), organization_id, 'feature_flag.manage'))
  )
  WITH CHECK (
    (organization_id IS NULL AND public.is_super_admin(auth.uid()))
    OR (organization_id IS NOT NULL AND public.has_permission(auth.uid(), organization_id, 'feature_flag.manage'))
  );
CREATE POLICY "feature_flags delete" ON public.feature_flags FOR DELETE TO authenticated
  USING (
    (organization_id IS NULL AND public.is_super_admin(auth.uid()))
    OR (organization_id IS NOT NULL AND public.has_permission(auth.uid(), organization_id, 'feature_flag.manage'))
  );

CREATE TRIGGER trg_feature_flags_updated
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions (key, category, description) VALUES
  ('audit.view',          'audit',       'View organization audit logs'),
  ('feature_flag.manage', 'feature_flag','Toggle organization feature flags')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key IN ('super_admin','organization_owner','admin')
  AND p.key IN ('audit.view','feature_flag.manage')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_api_key(_org UUID, _name TEXT, _scopes TEXT[] DEFAULT ARRAY['read']::TEXT[], _expires_at TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (id UUID, prefix TEXT, token TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid UUID := auth.uid(); _raw TEXT; _prefix TEXT; _hash TEXT; _id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(_uid, _org, 'org.manage_api_keys') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  _raw := 'sk_live_' || encode(gen_random_bytes(24), 'hex');
  _prefix := substring(_raw from 1 for 12);
  _hash := encode(digest(_raw, 'sha256'), 'hex');
  INSERT INTO public.api_keys (organization_id, name, prefix, token_hash, scopes, expires_at, created_by)
  VALUES (_org, _name, _prefix, _hash, COALESCE(_scopes, ARRAY['read']::TEXT[]), _expires_at, _uid)
  RETURNING api_keys.id INTO _id;
  INSERT INTO public.audit_logs (organization_id, actor_id, category, action, entity_type, entity_id, summary, metadata)
  VALUES (_org, _uid, 'security', 'api_key.created', 'api_key', _id::TEXT,
          'API key "' || _name || '" was generated', jsonb_build_object('prefix', _prefix));
  RETURN QUERY SELECT _id, _prefix, _raw;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_api_key(_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _key public.api_keys;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _key FROM public.api_keys WHERE id = _id;
  IF _key.id IS NULL THEN RAISE EXCEPTION 'API key not found'; END IF;
  IF NOT public.has_permission(_uid, _key.organization_id, 'org.manage_api_keys') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.api_keys SET revoked_at = now() WHERE id = _id;
  INSERT INTO public.audit_logs (organization_id, actor_id, category, action, entity_type, entity_id, summary, metadata)
  VALUES (_key.organization_id, _uid, 'security', 'api_key.revoked', 'api_key', _id::TEXT,
          'API key "' || _key.name || '" was revoked', jsonb_build_object('prefix', _key.prefix));
END; $$;

CREATE OR REPLACE FUNCTION public.regenerate_api_key(_id UUID)
RETURNS TABLE (id UUID, prefix TEXT, token TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _key public.api_keys; _raw TEXT; _prefix TEXT; _hash TEXT; _new_id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _key FROM public.api_keys WHERE api_keys.id = _id;
  IF _key.id IS NULL THEN RAISE EXCEPTION 'API key not found'; END IF;
  IF NOT public.has_permission(_uid, _key.organization_id, 'org.manage_api_keys') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.api_keys SET revoked_at = now() WHERE api_keys.id = _id AND revoked_at IS NULL;
  _raw := 'sk_live_' || encode(gen_random_bytes(24), 'hex');
  _prefix := substring(_raw from 1 for 12);
  _hash := encode(digest(_raw, 'sha256'), 'hex');
  INSERT INTO public.api_keys (organization_id, name, prefix, token_hash, scopes, expires_at, created_by)
  VALUES (_key.organization_id, _key.name, _prefix, _hash, _key.scopes, _key.expires_at, _uid)
  RETURNING api_keys.id INTO _new_id;
  INSERT INTO public.audit_logs (organization_id, actor_id, category, action, entity_type, entity_id, summary, metadata)
  VALUES (_key.organization_id, _uid, 'security', 'api_key.regenerated', 'api_key', _new_id::TEXT,
          'API key "' || _key.name || '" was regenerated', jsonb_build_object('prefix', _prefix, 'previous_id', _id));
  RETURN QUERY SELECT _new_id, _prefix, _raw;
END; $$;

CREATE OR REPLACE FUNCTION public.write_audit_log(_org UUID, _category TEXT, _action TEXT, _summary TEXT, _entity_type TEXT DEFAULT NULL, _entity_id TEXT DEFAULT NULL, _metadata JSONB DEFAULT '{}'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.audit_logs (organization_id, actor_id, category, action, entity_type, entity_id, summary, metadata)
  VALUES (_org, _uid, _category, _action, _entity_type, _entity_id, _summary, COALESCE(_metadata, '{}'::JSONB))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _uid UUID := auth.uid(); _result JSONB;
BEGIN
  IF _uid IS NULL OR NOT public.is_super_admin(_uid) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT jsonb_build_object(
    'organizations', (SELECT count(*) FROM public.organizations),
    'active_organizations', (SELECT count(*) FROM public.organizations WHERE status = 'active'),
    'users', (SELECT count(*) FROM auth.users),
    'teams', (SELECT count(*) FROM public.teams),
    'departments', (SELECT count(*) FROM public.departments),
    'invitations', (SELECT count(*) FROM public.organization_invitations WHERE accepted_at IS NULL AND rejected_at IS NULL AND expires_at > now()),
    'api_keys', (SELECT count(*) FROM public.api_keys WHERE revoked_at IS NULL),
    'audit_events_7d', (SELECT count(*) FROM public.audit_logs WHERE created_at > now() - INTERVAL '7 days')
  ) INTO _result;
  RETURN _result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_organizations()
RETURNS TABLE (id UUID, name TEXT, slug TEXT, status public.org_status, created_at TIMESTAMPTZ, member_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  RETURN QUERY
    SELECT o.id, o.name, o.slug, o.status, o.created_at,
      (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id) AS member_count
    FROM public.organizations o ORDER BY o.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ, org_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  RETURN QUERY
    SELECT u.id, u.email::TEXT, p.full_name, u.created_at, u.last_sign_in_at,
      (SELECT count(*) FROM public.organization_members m WHERE m.user_id = u.id) AS org_count
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.created_at DESC LIMIT 500;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_api_key(UUID, TEXT, TEXT[], TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.api_keys;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags;

INSERT INTO public.feature_flags (organization_id, key, name, description, enabled) VALUES
  (NULL, 'billing.enabled',    'Billing',            'Enable billing surfaces globally', false),
  (NULL, 'ai.assistant',       'AI Assistant',       'Enable the AI assistant beta',     false),
  (NULL, 'advanced_analytics', 'Advanced Analytics', 'Enable extended analytics',        true)
ON CONFLICT DO NOTHING;
