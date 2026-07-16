import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ActivityLog = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function useActivity(orgId: string | null, limit = 25) {
  const qc = useQueryClient();

  const query = useQuery({
    enabled: !!orgId,
    queryKey: ["activity", orgId],
    queryFn: async (): Promise<ActivityLog[]> => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as ActivityLog[];
    },
  });

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`activity:${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `organization_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ["activity", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  return { activity: query.data ?? [], isLoading: query.isLoading };
}
