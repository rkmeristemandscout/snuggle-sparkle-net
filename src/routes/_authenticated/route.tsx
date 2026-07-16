import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { OrganizationProvider } from "@/hooks/use-current-org";
import { OrgSwitcher } from "@/components/org-switcher";
import { ThemeProvider, useTheme } from "@/hooks/use-theme";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationsMenu } from "@/components/notifications-menu";
import { SearchCommand } from "@/components/search-command";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Moon, Sun, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { mode: "signin" as const } });
    }
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  return (
    <ThemeProvider>
      <OrganizationProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <TopBar />
            <main className="flex-1 px-4 py-6 md:px-8">
              <Outlet />
            </main>
          </SidebarInset>
        </SidebarProvider>
      </OrganizationProvider>
    </ThemeProvider>
  );
}

function TopBar() {
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" as const }, replace: true });
  }

  const initials =
    (user?.user_metadata?.full_name as string | undefined)
      ?.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "U";

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger />
      <div className="hidden md:block">
        <OrgSwitcher />
      </div>
      <div className="flex-1" />
      <SearchCommand />
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>
      <NotificationsMenu />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.user_metadata?.avatar_url as string | undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="truncate text-sm">{user?.user_metadata?.full_name as string ?? "Account"}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/profile">Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/organizations">Organizations</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
