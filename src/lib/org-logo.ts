import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; exp: number }>();

export async function getOrgLogoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const cached = cache.get(path);
  const now = Date.now();
  if (cached && cached.exp > now) return cached.url;
  const { data, error } = await supabase.storage.from("organization-logos").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, exp: now + 3500 * 1000 });
  return data.signedUrl;
}
