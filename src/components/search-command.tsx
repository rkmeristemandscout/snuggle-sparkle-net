import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { currentOrgId } = useCurrentOrg();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useQuery({
    enabled: open && !!currentOrgId,
    queryKey: ["search", currentOrgId],
    queryFn: async () => {
      const [teams, deps, members] = await Promise.all([
        supabase.from("teams").select("id, name, slug").eq("organization_id", currentOrgId!).limit(20),
        supabase.from("departments").select("id, name, slug").eq("organization_id", currentOrgId!).limit(20),
        supabase.from("organization_members").select("user_id").eq("organization_id", currentOrgId!).limit(30),
      ]);
      const ids = (members.data ?? []).map((m) => m.user_id);
      const profs = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] };
      return {
        teams: teams.data ?? [],
        departments: deps.data ?? [],
        members: profs.data ?? [],
      };
    },
  });

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 justify-between px-3 text-sm text-muted-foreground md:flex"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" /> Search…
        </span>
        <kbd className="rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
      </Button>
      <Button
        variant="ghost" size="icon"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="md:hidden"
      >
        <Search className="h-5 w-5" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search teams, departments, members…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {results.data?.teams && results.data.teams.length > 0 && (
            <CommandGroup heading="Teams">
              {results.data.teams.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`team ${t.name}`}
                  onSelect={() => go(() => navigate({ to: "/teams/$teamId", params: { teamId: t.id } }))}
                >
                  {t.name} <span className="ml-auto text-xs text-muted-foreground">/{t.slug}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.data?.departments && results.data.departments.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Departments">
                {results.data.departments.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`department ${d.name}`}
                    onSelect={() => go(() => navigate({ to: "/departments" }))}
                  >
                    {d.name} <span className="ml-auto text-xs text-muted-foreground">/{d.slug}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {results.data?.members && results.data.members.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Members">
                {results.data.members.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`member ${m.full_name ?? m.id}`}
                    onSelect={() => go(() => navigate({ to: "/organizations" }))}
                  >
                    {m.full_name ?? m.id.slice(0, 8)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
