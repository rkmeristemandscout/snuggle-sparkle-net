import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentOrg } from "@/hooks/use-current-org";

export function OrgSwitcher() {
  const { memberships, currentMembership, setCurrentOrgId } = useCurrentOrg();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-[180px] justify-between">
          <span className="truncate">
            {currentMembership ? currentMembership.organization.name : "No organization"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
        {memberships.length === 0 && (
          <DropdownMenuItem disabled>No organizations yet</DropdownMenuItem>
        )}
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.organization.id}
            onSelect={() => setCurrentOrgId(m.organization.id)}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span className="truncate font-medium">{m.organization.name}</span>
              <span className="text-xs text-muted-foreground">/{m.organization.slug} · {m.role}</span>
            </div>
            {currentMembership?.organization.id === m.organization.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/organizations" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create or join organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
