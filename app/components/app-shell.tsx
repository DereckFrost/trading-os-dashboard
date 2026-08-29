"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";

const NAV_ITEMS = [
  { href: "/", label: "Trading Office", icon: DashboardIcon, section: "Operate" },
  { href: "/journal", label: "Trading Journal", icon: JournalIcon, section: "Operate" },
  { href: "/trading-days", label: "Trading Days", icon: CalendarIcon, section: "Operate" },
  { href: "/playbook", label: "Playbook", icon: PlaybookIcon, section: "Knowledge" },
  { href: "/analytics", label: "Analytics", icon: AnalyticsIcon, section: "Review" },
  { href: "/coach", label: "Coach", icon: CoachIcon, section: "Review" },
  { href: "/automations", label: "Automations", icon: AutomationIcon, section: "System" },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;

    const supabase = getSupabaseBrowserClient();
    let active = true;

    async function syncSession(
      session: {
        access_token: string;
        refresh_token: string;
        user: { email?: string | null };
      } | null,
    ) {
      if (!session) {
        if (active) setEmail(null);
        return;
      }

      if (active) setEmail(session.user.email ?? null);

      try {
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            mode: "sync",
          }),
        });
      } catch (error) {
        console.error("No se pudo sincronizar la sesión:", error);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      void syncSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        if (active) setEmail(null);
        return;
      }

      if (
        event === "TOKEN_REFRESHED" ||
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION"
      ) {
        window.setTimeout(() => void syncSession(session), 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname]);

  if (pathname === "/login") return <>{children}</>;

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const grouped = NAV_ITEMS.reduce<
    Record<string, (typeof NAV_ITEMS)[number][]>
  >((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <aside
        className={`fixed inset-y-0 left-0 z-50 hidden border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:flex-col ${
          collapsed ? "w-[72px]" : "w-[248px]"
        } transition-[width] duration-200`}
      >
        <div
          className={`flex h-[72px] shrink-0 items-center border-b border-[var(--border)] ${
            collapsed ? "justify-center" : "px-5"
          }`}
        >
          <Link
            href="/"
            className="group flex items-center gap-3"
            aria-label="Trading OS"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-[0_0_24px_rgb(89_230_165_/_0.08)]">
              <span className="text-sm font-black tracking-[-0.08em]">T</span>
            </span>

            {!collapsed && (
              <span className="min-w-0">
                <span className="block text-[13px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                  Trading OS
                </span>
                <span className="mt-0.5 block text-[10px] font-medium tracking-[0.08em] text-[var(--text-dim)]">
                  OPERATING SYSTEM
                </span>
              </span>
            )}
          </Link>
        </div>

        <nav
          className={`${
            collapsed ? "" : "os-scrollbar overflow-y-auto"
          } flex-1 px-3 py-5`}
          aria-label="Navegación principal"
        >
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="mb-6 last:mb-0">
              {!collapsed && (
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  {section}
                </div>
              )}

              <div className="space-y-1">
                {items.map(({ href, label, icon: Icon }) => (
                  <NavItem
                    key={href}
                    href={href}
                    label={label}
                    icon={<Icon />}
                    collapsed={collapsed}
                    active={isActivePath(pathname, href)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          {!collapsed && email && (
            <div
              className="mb-2 truncate rounded-lg bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-dim)]"
              title={email}
            >
              {email}
            </div>
          )}

          <button
            type="button"
            onClick={() => void logout()}
            className={`mb-1 flex h-10 w-full items-center rounded-lg text-[11px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] ${
              collapsed ? "justify-center" : "gap-3 px-3"
            }`}
            aria-label="Cerrar sesión"
            title={collapsed ? "Cerrar sesión" : undefined}
          >
            <LogoutIcon />
            {!collapsed && "Cerrar sesión"}
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={`flex h-10 w-full items-center rounded-lg text-[var(--text-dim)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] ${
              collapsed ? "justify-center" : "gap-3 px-3"
            }`}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            title={collapsed ? "Expandir menú" : undefined}
          >
            <CollapseIcon collapsed={collapsed} />
            {!collapsed && (
              <span className="text-[11px] font-medium">Contraer menú</span>
            )}
          </button>
        </div>
      </aside>

      <div
        className={`${
          collapsed ? "lg:pl-[72px]" : "lg:pl-[248px]"
        } min-h-screen transition-[padding] duration-200`}
      >
        {children}
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  collapsed,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={`group relative flex min-h-11 items-center rounded-[10px] transition-all ${
        collapsed ? "justify-center px-0" : "gap-3 px-3"
      } ${
        active
          ? "bg-[var(--surface-3)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span
        className={
          active
            ? "text-[var(--accent)]"
            : "text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]"
        }
      >
        {icon}
      </span>

      {!collapsed && (
        <span className="text-[13px] font-medium tracking-[-0.01em]">
          {label}
        </span>
      )}

      {collapsed && (
        <span className="pointer-events-none absolute left-full top-1/2 z-[100] ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--border-strong)] bg-[var(--surface-3)] px-3 py-2 text-[12px] font-medium text-[var(--text-primary)] opacity-0 shadow-[0_12px_30px_rgb(0_0_0_/_0.35)] transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      )}
    </Link>
  );
}

function DashboardIcon() {
  return (
    <Icon>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </Icon>
  );
}

function JournalIcon() {
  return (
    <Icon>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 8h8M8 12h6M8 16h4" />
    </Icon>
  );
}

function CalendarIcon() {
  return (
    <Icon>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </Icon>
  );
}

function PlaybookIcon() {
  return (
    <Icon>
      <path d="M5 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M19 4h-5a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h5a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" />
    </Icon>
  );
}

function AnalyticsIcon() {
  return (
    <Icon>
      <path d="M5 19V10M12 19V5M19 19v-7" />
      <path d="M3 19h18" />
    </Icon>
  );
}

function CoachIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8M12 8v8" />
    </Icon>
  );
}

function AutomationIcon() {
  return (
    <Icon>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

function LogoutIcon() {
  return (
    <Icon>
      <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="m14 8 4 4-4 4M10 12h8" />
    </Icon>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <Icon className={collapsed ? "rotate-180" : ""}>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M9 4v16m-2.5-7 2.5 3-2.5 3" />
    </Icon>
  );
}

function Icon({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-[18px] shrink-0 ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}