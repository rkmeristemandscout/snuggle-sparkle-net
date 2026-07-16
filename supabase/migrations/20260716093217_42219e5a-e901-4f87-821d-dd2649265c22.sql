
-- =========================================================
-- notifications
-- =========================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications(user_id) WHERE read_at IS NULL;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- =========================================================
-- activity_logs
-- =========================================================
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_org_idx ON public.activity_logs(organization_id, created_at DESC);

GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read activity" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- =========================================================
-- Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.activity_logs REPLICA IDENTITY FULL;

-- =========================================================
-- Helper: notify all org members except the actor
-- =========================================================
CREATE OR REPLACE FUNCTION public.notify_org_members(
  _org UUID, _except UUID, _type TEXT, _title TEXT, _message TEXT, _link TEXT, _metadata JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, link, metadata)
  SELECT om.user_id, _org, _type, _title, _message, _link, COALESCE(_metadata, '{}'::jsonb)
  FROM public.organization_members om
  WHERE om.organization_id = _org AND (_except IS NULL OR om.user_id <> _except);
END;
$$;

-- =========================================================
-- Trigger: member joined
-- =========================================================
CREATE OR REPLACE FUNCTION public.on_member_joined()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _org_name TEXT;
  _member_name TEXT;
BEGIN
  SELECT name INTO _org_name FROM public.organizations WHERE id = NEW.organization_id;
  SELECT COALESCE(full_name, 'A new member') INTO _member_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (NEW.organization_id, _actor, 'member.joined', 'organization_member', NEW.id,
    _member_name || ' joined ' || COALESCE(_org_name, 'the organization'),
    jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role));

  PERFORM public.notify_org_members(
    NEW.organization_id, NEW.user_id,
    'member.joined',
    'New member joined',
    _member_name || ' joined the organization',
    '/organizations',
    jsonb_build_object('user_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_member_joined
AFTER INSERT ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.on_member_joined();

-- =========================================================
-- Trigger: role updated
-- =========================================================
CREATE OR REPLACE FUNCTION public.on_member_role_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _member_name TEXT;
  _org_name TEXT;
BEGIN
  IF NEW.role = OLD.role THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, 'A member') INTO _member_name FROM public.profiles WHERE id = NEW.user_id;
  SELECT name INTO _org_name FROM public.organizations WHERE id = NEW.organization_id;

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (NEW.organization_id, _actor, 'member.role_updated', 'organization_member', NEW.id,
    _member_name || ' is now ' || NEW.role,
    jsonb_build_object('user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role));

  INSERT INTO public.notifications (user_id, organization_id, type, title, message, link, metadata)
  VALUES (NEW.user_id, NEW.organization_id, 'role.updated',
    'Your role changed',
    'Your role in ' || COALESCE(_org_name, 'the organization') || ' is now ' || NEW.role,
    '/dashboard',
    jsonb_build_object('from', OLD.role, 'to', NEW.role));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_member_role_updated
AFTER UPDATE OF role ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.on_member_role_updated();

-- =========================================================
-- Trigger: team created
-- =========================================================
CREATE OR REPLACE FUNCTION public.on_team_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _actor_name TEXT;
BEGIN
  SELECT COALESCE(full_name, 'Someone') INTO _actor_name FROM public.profiles WHERE id = _actor;

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (NEW.organization_id, _actor, 'team.created', 'team', NEW.id,
    _actor_name || ' created team ' || NEW.name,
    jsonb_build_object('team_name', NEW.name, 'slug', NEW.slug));

  PERFORM public.notify_org_members(
    NEW.organization_id, _actor,
    'team.created',
    'New team created',
    _actor_name || ' created team ' || NEW.name,
    '/teams',
    jsonb_build_object('team_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_team_created
AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.on_team_created();
