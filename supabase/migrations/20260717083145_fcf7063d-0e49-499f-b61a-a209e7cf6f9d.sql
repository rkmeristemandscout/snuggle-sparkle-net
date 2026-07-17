CREATE OR REPLACE FUNCTION public.create_api_key(_org uuid, _name text, _scopes text[] DEFAULT ARRAY['read'::text], _expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, prefix text, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid UUID := auth.uid(); _raw TEXT; _prefix TEXT; _hash TEXT; _id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(_uid, _org, 'org.manage_api_keys') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  _raw := 'sk_live_' || encode(extensions.gen_random_bytes(24), 'hex');
  _prefix := substring(_raw from 1 for 12);
  _hash := encode(extensions.digest(_raw, 'sha256'), 'hex');
  INSERT INTO public.api_keys (organization_id, name, prefix, token_hash, scopes, expires_at, created_by)
  VALUES (_org, _name, _prefix, _hash, COALESCE(_scopes, ARRAY['read']::TEXT[]), _expires_at, _uid)
  RETURNING api_keys.id INTO _id;
  INSERT INTO public.audit_logs (organization_id, actor_id, category, action, entity_type, entity_id, summary, metadata)
  VALUES (_org, _uid, 'security', 'api_key.created', 'api_key', _id::TEXT,
          'API key "' || _name || '" was generated', jsonb_build_object('prefix', _prefix));
  RETURN QUERY SELECT _id, _prefix, _raw;
END; $function$;

CREATE OR REPLACE FUNCTION public.regenerate_api_key(_id uuid)
 RETURNS TABLE(id uuid, prefix text, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid UUID := auth.uid(); _key public.api_keys; _raw TEXT; _prefix TEXT; _hash TEXT; _new_id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _key FROM public.api_keys WHERE api_keys.id = _id;
  IF _key.id IS NULL THEN RAISE EXCEPTION 'API key not found'; END IF;
  IF NOT public.has_permission(_uid, _key.organization_id, 'org.manage_api_keys') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.api_keys SET revoked_at = now() WHERE api_keys.id = _id AND revoked_at IS NULL;
  _raw := 'sk_live_' || encode(extensions.gen_random_bytes(24), 'hex');
  _prefix := substring(_raw from 1 for 12);
  _hash := encode(extensions.digest(_raw, 'sha256'), 'hex');
  INSERT INTO public.api_keys (organization_id, name, prefix, token_hash, scopes, expires_at, created_by)
  VALUES (_key.organization_id, _key.name, _prefix, _hash, _key.scopes, _key.expires_at, _uid)
  RETURNING api_keys.id INTO _new_id;
  INSERT INTO public.audit_logs (organization_id, actor_id, category, action, entity_type, entity_id, summary, metadata)
  VALUES (_key.organization_id, _uid, 'security', 'api_key.regenerated', 'api_key', _new_id::TEXT,
          'API key "' || _key.name || '" was regenerated', jsonb_build_object('prefix', _prefix, 'previous_id', _id));
  RETURN QUERY SELECT _new_id, _prefix, _raw;
END; $function$;

CREATE OR REPLACE FUNCTION public.resend_invitation(_invitation_id uuid)
 RETURNS organization_invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _inv public.organization_invitations;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _inv FROM public.organization_invitations WHERE id = _invitation_id;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_org_role(_inv.organization_id, _uid, ARRAY['owner','admin']::public.org_role[]) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF _inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already accepted'; END IF;

  UPDATE public.organization_invitations
     SET token = encode(extensions.gen_random_bytes(24), 'hex'),
         expires_at = now() + INTERVAL '14 days',
         rejected_at = NULL,
         updated_at = now()
   WHERE id = _invitation_id
   RETURNING * INTO _inv;
  RETURN _inv;
END;
$function$;