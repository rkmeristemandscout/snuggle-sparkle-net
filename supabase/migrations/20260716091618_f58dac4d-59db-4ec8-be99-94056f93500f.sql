
-- 1. Organization status
CREATE TYPE public.org_status AS ENUM ('active', 'suspended');
ALTER TABLE public.organizations
  ADD COLUMN status public.org_status NOT NULL DEFAULT 'active';

-- 2. Invitations table
CREATE TABLE public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.org_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_invitations_org ON public.organization_invitations(organization_id);
CREATE INDEX idx_org_invitations_email ON public.organization_invitations(lower(email));
CREATE INDEX idx_org_invitations_token ON public.organization_invitations(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/admins view org invitations"
  ON public.organization_invitations FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Owners/admins create invitations"
  ON public.organization_invitations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
    AND invited_by = auth.uid()
  );

CREATE POLICY "Owners/admins update invitations"
  ON public.organization_invitations FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Owners/admins delete invitations"
  ON public.organization_invitations FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE TRIGGER trg_org_invitations_updated
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Ensure updated_at triggers exist on core tables (idempotent create)
DROP TRIGGER IF EXISTS trg_organizations_updated ON public.organizations;
CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_org_members_updated ON public.organization_members;
CREATE TRIGGER trg_org_members_updated
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Prevent removing/demoting the last owner
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_count INT;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    SELECT count(*) INTO _owner_count FROM public.organization_members
      WHERE organization_id = OLD.organization_id AND role = 'owner';
    IF _owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of the organization';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    SELECT count(*) INTO _owner_count FROM public.organization_members
      WHERE organization_id = OLD.organization_id AND role = 'owner';
    IF _owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of the organization';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_protect_last_owner
  BEFORE UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- 5. Accept invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(_token TEXT)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT;
  _inv public.organization_invitations;
  _org public.organizations;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  SELECT * INTO _inv FROM public.organization_invitations
    WHERE token = _token
    LIMIT 1;

  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already used'; END IF;
  IF _inv.expires_at < now() THEN RAISE EXCEPTION 'Invitation expired'; END IF;
  IF lower(_inv.email) <> lower(_email) THEN
    RAISE EXCEPTION 'This invitation is for a different email address';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_inv.organization_id, _uid, _inv.role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.organization_invitations
    SET accepted_at = now()
    WHERE id = _inv.id;

  SELECT * INTO _org FROM public.organizations WHERE id = _inv.organization_id;
  RETURN _org;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;

-- 6. Leave organization
CREATE OR REPLACE FUNCTION public.leave_organization(_org UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.organization_members
    WHERE organization_id = _org AND user_id = _uid;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_organization(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_organization(UUID) TO authenticated;

-- 7. Unique member per org
ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_org_user_unique;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_org_user_unique UNIQUE (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);

-- 8. Storage policies for organization-logos bucket
-- Path convention: <organization_id>/<filename>
CREATE POLICY "Org logos readable by members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "Owners/admins upload org logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'organization-logos'
    AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  );

CREATE POLICY "Owners/admins update org logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  );

CREATE POLICY "Owners/admins delete org logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  );
