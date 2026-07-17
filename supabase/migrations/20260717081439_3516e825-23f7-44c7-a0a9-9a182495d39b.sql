
-- request_id column for correlation across audit logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id) WHERE request_id IS NOT NULL;

-- error_logs table for server-side error capture
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT,
  user_id UUID,
  organization_id UUID,
  source TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack TEXT,
  path TEXT,
  method TEXT,
  status INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.error_logs TO service_role;
GRANT SELECT ON public.error_logs TO authenticated;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins view errors" ON public.error_logs;
CREATE POLICY "Super admins view errors" ON public.error_logs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON public.error_logs(request_id) WHERE request_id IS NOT NULL;

-- Notification helpers callable from client (RLS-safe SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.mark_notification_read(_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.notifications SET read_at = now()
   WHERE id = _id AND user_id = _uid AND read_at IS NULL;
END; $$;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(_org UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _count INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  WITH upd AS (
    UPDATE public.notifications SET read_at = now()
     WHERE user_id = _uid AND read_at IS NULL
       AND (_org IS NULL OR organization_id = _org)
     RETURNING 1
  ) SELECT count(*) INTO _count FROM upd;
  RETURN _count;
END; $$;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_notification(_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.notifications WHERE id = _id AND user_id = _uid;
END; $$;
REVOKE ALL ON FUNCTION public.delete_notification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_notification(UUID) TO authenticated;

-- Background cleanup routines
CREATE OR REPLACE FUNCTION public.cleanup_expired_invitations()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INT;
BEGIN
  WITH upd AS (
    UPDATE public.organization_invitations SET expires_at = now()
     WHERE accepted_at IS NULL AND rejected_at IS NULL AND expires_at < now() - INTERVAL '30 days'
     RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  RETURN _n;
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications(_days INT DEFAULT 60)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INT;
BEGIN
  WITH del AS (
    DELETE FROM public.notifications
     WHERE read_at IS NOT NULL AND read_at < now() - (_days || ' days')::INTERVAL
     RETURNING 1
  ) SELECT count(*) INTO _n FROM del;
  RETURN _n;
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(_days INT DEFAULT 365)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INT;
BEGIN
  WITH del AS (
    DELETE FROM public.audit_logs WHERE created_at < now() - (_days || ' days')::INTERVAL
    RETURNING 1
  ) SELECT count(*) INTO _n FROM del;
  RETURN _n;
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_old_error_logs(_days INT DEFAULT 30)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INT;
BEGIN
  WITH del AS (
    DELETE FROM public.error_logs WHERE created_at < now() - (_days || ' days')::INTERVAL
    RETURNING 1
  ) SELECT count(*) INTO _n FROM del;
  RETURN _n;
END; $$;

CREATE OR REPLACE FUNCTION public.run_background_jobs()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv INT; _notif INT; _audit INT; _err INT;
BEGIN
  _inv   := public.cleanup_expired_invitations();
  _notif := public.cleanup_old_notifications(60);
  _audit := public.cleanup_old_audit_logs(365);
  _err   := public.cleanup_old_error_logs(30);
  RETURN jsonb_build_object(
    'expired_invitations', _inv,
    'old_notifications', _notif,
    'old_audit_logs', _audit,
    'old_error_logs', _err,
    'ran_at', now()
  );
END; $$;
REVOKE ALL ON FUNCTION public.run_background_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_background_jobs() TO service_role;

-- pg_cron: nightly background jobs at 03:15 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-background-jobs') THEN
    PERFORM cron.unschedule('nightly-background-jobs');
  END IF;
  PERFORM cron.schedule(
    'nightly-background-jobs', '15 3 * * *',
    $CRON$ SELECT public.run_background_jobs(); $CRON$
  );
END $$;
