import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AuthOrganization,
  AuthUser,
} from "./auth-api";
import {
  AuthoringApiError,
  authoringApi,
  type AuthoringAttributeDefinition,
  type AuthoringCategory,
  type AuthoringItem,
} from "./authoring-api";
import { CategoriesManager } from "./CategoriesManager";

type WorkspaceView =
  | "home"
  | "catalogue"
  | "categories"
  | "enquiries"
  | "website"
  | "analytics"
  | "share"
  | "business"
  | "subscription"
  | "settings";

type WorkspaceSnapshot = {
  catalogueId: string;
  categories: AuthoringCategory[];
  items: AuthoringItem[];
  hasMoreItems: boolean;
  attributes: AuthoringAttributeDefinition[];
};

type WorkspaceProps = {
  brandLight: ReactNode;
  brandDark: ReactNode;
  user: AuthUser;
  organizations: AuthOrganization[];
  selectedOrganization: AuthOrganization;
  catalogueSlug: string | null;
  onSelectOrganization: (
    organizationId: string,
  ) => void;
  onEditSetup: () => void;
  onLogout: () => Promise<void>;
  loggingOut: boolean;
};

type IconName =
  | "home"
  | "catalogue"
  | "categories"
  | "enquiries"
  | "website"
  | "analytics"
  | "share"
  | "business"
  | "subscription"
  | "settings"
  | "more"
  | "refresh"
  | "arrow";

const DESKTOP_NAV: Array<{
  id: WorkspaceView;
  label: string;
  icon: IconName;
}> = [
  {
    id: "home",
    label: "Home",
    icon: "home",
  },
  {
    id: "catalogue",
    label: "Catalogue",
    icon: "catalogue",
  },
  {
    id: "categories",
    label: "Categories",
    icon: "categories",
  },
  {
    id: "enquiries",
    label: "Enquiries",
    icon: "enquiries",
  },
  {
    id: "website",
    label: "Website",
    icon: "website",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "analytics",
  },
  {
    id: "share",
    label: "Share",
    icon: "share",
  },
  {
    id: "business",
    label: "Business Profile",
    icon: "business",
  },
  {
    id: "subscription",
    label: "Subscription",
    icon: "subscription",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
  },
];

const MOBILE_NAV: Array<{
  id:
    | WorkspaceView
    | "more";
  label: string;
  icon: IconName;
}> = [
  {
    id: "home",
    label: "Home",
    icon: "home",
  },
  {
    id: "catalogue",
    label: "Catalogue",
    icon: "catalogue",
  },
  {
    id: "enquiries",
    label: "Enquiries",
    icon: "enquiries",
  },
  {
    id: "website",
    label: "Website",
    icon: "website",
  },
  {
    id: "more",
    label: "More",
    icon: "more",
  },
];

function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap:
      "round" as const,
    strokeLinejoin:
      "round" as const,
  };

  if (name === "home") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9 21v-6h6v6" />
      </svg>
    );
  }

  if (name === "catalogue") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="2"
        />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  if (name === "categories") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <rect
          x="3"
          y="4"
          width="7"
          height="7"
          rx="1.5"
        />
        <rect
          x="14"
          y="4"
          width="7"
          height="7"
          rx="1.5"
        />
        <rect
          x="3"
          y="15"
          width="7"
          height="6"
          rx="1.5"
        />
        <rect
          x="14"
          y="15"
          width="7"
          height="6"
          rx="1.5"
        />
      </svg>
    );
  }

  if (name === "enquiries") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M4 5h16v12H9l-5 4V5Z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }

  if (name === "website") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
    );
  }

  if (name === "analytics") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    );
  }

  if (name === "share") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="19" r="2.5" />
        <path d="m8.3 10.9 7.4-4.7M8.3 13.1l7.4 4.7" />
      </svg>
    );
  }

  if (name === "business") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M4 21V8l8-5 8 5v13" />
        <path d="M8 21v-7h8v7M8 10h.01M12 10h.01M16 10h.01" />
      </svg>
    );
  }

  if (name === "subscription") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <rect
          x="3"
          y="5"
          width="18"
          height="14"
          rx="2"
        />
        <path d="M3 10h18M7 15h4" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.6V21H10v-.1A1.8 1.8 0 0 0 8.9 19a1.8 1.8 0 0 0-2 .4l-.1.1L4 16.7l.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 13.5H3v-3h.1A1.8 1.8 0 0 0 4.5 9a1.8 1.8 0 0 0-.4-2L4 6.9l2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3.1V3h4v.1A1.8 1.8 0 0 0 15.1 5a1.8 1.8 0 0 0 2-.4l.1-.1L20 7.3l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.5 1.1h.1v3H21A1.8 1.8 0 0 0 19.4 15Z" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M20 7v5h-5" />
        <path d="M19 12a7 7 0 1 1-2-5" />
      </svg>
    );
  }

  if (name === "arrow") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      {...common}
    >
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

function hashView(): WorkspaceView {
  if (typeof window === "undefined") {
    return "home";
  }

  const prefix = "#workspace/";
  const value = window.location.hash;

  if (!value.startsWith(prefix)) {
    return "home";
  }

  const candidate =
    value.slice(prefix.length) as WorkspaceView;

  return DESKTOP_NAV.some(
    (item) => item.id === candidate,
  )
    ? candidate
    : "home";
}

function friendlyError(
  error: unknown,
): string {
  if (error instanceof AuthoringApiError) {
    return error.message;
  }

  return "The catalogue workspace could not be loaded. Please try again.";
}

function viewTitle(
  view: WorkspaceView,
): string {
  return DESKTOP_NAV.find(
    (item) => item.id === view,
  )?.label ?? "Workspace";
}

function statusLabel(
  status: AuthoringItem["status"],
): string {
  if (status === "published") {
    return "Published source";
  }

  if (status === "hidden") {
    return "Hidden";
  }

  return "Draft";
}

function Placeholder({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow: string;
}) {
  return (
    <section className="rounded-2xl border border-[#dfe5e2] bg-white p-6 shadow-[0_12px_36px_rgba(8,16,20,0.04)] sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-[#0b1519]">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
        {description}
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#dfe5e2] bg-[#f8faf9] px-3 py-2 text-xs font-semibold text-[#66736e]">
        <span className="size-1.5 rounded-full bg-[#BAF16D]" />
        Workspace foundation ready
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_8px_28px_rgba(8,16,20,0.035)]">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#7a8782]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#0b1519]">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-[#74807b]">
        {detail}
      </div>
    </div>
  );
}

export function AuthoringWorkspace({
  brandLight,
  brandDark,
  user,
  organizations,
  selectedOrganization,
  catalogueSlug,
  onSelectOrganization,
  onEditSetup,
  onLogout,
  loggingOut,
}: WorkspaceProps) {
  const [activeView, setActiveView] =
    useState<WorkspaceView>(
      hashView,
    );
  const [moreOpen, setMoreOpen] =
    useState(false);
  const [loading, setLoading] =
    useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [snapshot, setSnapshot] =
    useState<WorkspaceSnapshot | null>(
      null,
    );

  const loadSnapshot = useCallback(
    async (
      background = false,
    ) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const [
          categoryData,
          itemData,
          attributeData,
        ] = await Promise.all([
          authoringApi.categories(
            selectedOrganization.id,
          ),
          authoringApi.items(
            selectedOrganization.id,
            {
              limit: 100,
            },
          ),
          authoringApi.attributes(
            selectedOrganization.id,
          ),
        ]);

        setSnapshot({
          catalogueId:
            itemData.catalogueId
            || categoryData.catalogueId,
          categories:
            categoryData.categories,
          items: itemData.items,
          hasMoreItems:
            itemData.nextCursor !== null,
          attributes:
            attributeData.attributes,
        });
      } catch (requestError) {
        setError(
          friendlyError(requestError),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedOrganization.id],
  );

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    setActiveView(hashView());
    setMoreOpen(false);
  }, [selectedOrganization.id]);

  const customAttributes = useMemo(
    () =>
      snapshot?.attributes.filter(
        (attribute) =>
          attribute.source === "custom",
      ).length ?? 0,
    [snapshot],
  );

  const suggestedAttributes = useMemo(
    () =>
      snapshot?.attributes.filter(
        (attribute) =>
          attribute.isSuggested,
      ).length ?? 0,
    [snapshot],
  );

  const itemCountLabel =
    snapshot?.hasMoreItems
      ? "100+"
      : String(
          snapshot?.items.length ?? 0,
        );

  const reservedUrl = catalogueSlug
    ? `${catalogueSlug}.techabanca.com`
    : "Not reserved";

  function navigate(
    view: WorkspaceView,
  ) {
    setActiveView(view);
    setMoreOpen(false);

    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `#workspace/${view}`,
      );
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function mobileNavigate(
    value: WorkspaceView | "more",
  ) {
    if (value === "more") {
      setMoreOpen((current) => !current);
      return;
    }

    navigate(value);
  }

  const activeDesktopLabel =
    viewTitle(activeView);

  return (
    <main className="min-h-screen bg-[#f5f7f6] text-[#081014] [&_a[href]]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_select:not(:disabled)]:cursor-pointer lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen bg-[#0b1519] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          {brandDark}
        </div>

        <nav
          aria-label="Catalogue workspace"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          <div className="space-y-1">
            {DESKTOP_NAV.map(
              (item) => {
                const active =
                  activeView === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      navigate(item.id)
                    }
                    className={[
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition",
                      active
                        ? "bg-white/[0.09] text-white"
                        : "text-white/60 hover:bg-white/[0.05] hover:text-white/85",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        active
                          ? "bg-[#BAF16D] text-[#0b1519]"
                          : "bg-white/[0.04] text-white/65",
                      ].join(" ")}
                    >
                      <Icon
                        name={item.icon}
                        className="size-4"
                      />
                    </span>
                    <span className="truncate">
                      {item.label}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
              Active business
            </div>
            <div className="mt-2 truncate text-sm font-semibold text-white">
              {selectedOrganization.name}
            </div>
            <div className="mt-1 text-xs capitalize text-white/45">
              {selectedOrganization.role} access
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-[#e0e6e3] bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              {brandLight}
            </div>

            <div className="hidden min-w-0 lg:block">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#7a8782]">
                Catalogue workspace
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-[#1c282d]">
                {activeDesktopLabel}
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              {organizations.length > 1 && (
                <select
                  aria-label="Business workspace"
                  value={
                    selectedOrganization.id
                  }
                  onChange={(event) =>
                    onSelectOrganization(
                      event.target.value,
                    )
                  }
                  className="hidden h-10 max-w-[220px] rounded-xl border border-[#d9e1dd] bg-white px-3 text-sm font-semibold outline-none focus:border-[#8eb84f] sm:block"
                >
                  {organizations.map(
                    (organization) => (
                      <option
                        key={organization.id}
                        value={organization.id}
                      >
                        {organization.name}
                      </option>
                    ),
                  )}
                </select>
              )}

              <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-[#e0e6e3] bg-[#f8faf9] px-3 py-2 md:flex">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#e8efeb] text-xs font-black text-[#4e5c56]">
                  {user.displayName
                    .trim()
                    .slice(0, 1)
                    .toUpperCase()
                    || "U"}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[150px] truncate text-xs font-semibold text-[#243036]">
                    {user.displayName}
                  </span>
                  <span className="block max-w-[150px] truncate text-[10px] text-[#7a8782]">
                    {user.email}
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadSnapshot(true)
                }
                disabled={
                  refreshing || loading
                }
                aria-label="Refresh workspace"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dfe5e2] bg-white text-[#59665f] transition hover:bg-[#f8faf9] disabled:opacity-50"
              >
                <Icon
                  name="refresh"
                  className={[
                    "size-4",
                    refreshing
                      ? "animate-spin"
                      : "",
                  ].join(" ")}
                />
              </button>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() =>
                  void onLogout()
                }
                className="hidden h-10 shrink-0 rounded-xl border border-[#dfe5e2] bg-white px-3 text-sm font-semibold text-[#344047] transition hover:bg-[#f8faf9] disabled:opacity-50 sm:block"
              >
                {loggingOut
                  ? "Signing out..."
                  : "Sign out"}
              </button>
            </div>
          </div>

          {organizations.length > 1 && (
            <div className="border-t border-[#edf1ef] px-4 py-2 sm:hidden">
              <select
                aria-label="Business workspace mobile"
                value={
                  selectedOrganization.id
                }
                onChange={(event) =>
                  onSelectOrganization(
                    event.target.value,
                  )
                }
                className="h-10 w-full rounded-xl border border-[#d9e1dd] bg-white px-3 text-sm font-semibold outline-none"
              >
                {organizations.map(
                  (organization) => (
                    <option
                      key={organization.id}
                      value={organization.id}
                    >
                      {organization.name}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}
        </header>

        <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10">
          {!(
            selectedOrganization.role
              === "owner"
            || selectedOrganization.role
              === "admin"
          ) && (
            <div className="mb-5 rounded-xl border border-[#e2dfc8] bg-[#fffdf1] px-4 py-3 text-sm leading-6 text-[#736a34]">
              You have editor access. Catalogue data is available for review, while owner or admin access is required for changes.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-[#efc7c1] bg-[#fff8f6] px-4 py-3 text-sm text-[#8a2f25]"
            >
              <div className="font-semibold">
                Workspace data could not be loaded
              </div>
              <div className="mt-1">
                {error}
              </div>
              <button
                type="button"
                onClick={() =>
                  void loadSnapshot()
                }
                className="mt-3 rounded-lg border border-[#e4b8b1] bg-white px-3 py-2 text-xs font-bold"
              >
                Try again
              </button>
            </div>
          )}

          {loading && !snapshot ? (
            <div className="grid min-h-[420px] place-items-center rounded-2xl border border-[#dfe5e2] bg-white shadow-[0_12px_36px_rgba(8,16,20,0.04)]">
              <div className="flex items-center gap-3 text-sm font-semibold text-[#66736e]">
                <span className="size-5 animate-spin rounded-full border-2 border-[#d8e3d1] border-t-[#789c45]" />
                Loading catalogue workspace...
              </div>
            </div>
          ) : (
            <>
              {activeView === "home" && (
                <>
                  <section className="overflow-hidden rounded-2xl border border-[#dfe5e2] bg-white shadow-[0_14px_40px_rgba(8,16,20,0.045)]">
                    <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
                      <div>
                        <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                          <span className="size-1.5 rounded-full bg-[#BAF16D]" />
                          Authoring workspace
                        </div>
                        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-[#0b1519] sm:text-4xl">
                          Keep your business catalogue organised and ready to share.
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#68756f]">
                          Your onboarding setup is complete. Catalogue authoring now uses the tenant-scoped Category, Item, and Attribute APIs without exposing draft data publicly.
                        </p>

                        <div className="mt-6 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                "catalogue",
                              )
                            }
                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0b1519] px-4 text-sm font-bold text-white transition hover:bg-[#152126]"
                          >
                            Open catalogue
                            <Icon
                              name="arrow"
                              className="size-4"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                "categories",
                              )
                            }
                            className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] transition hover:bg-[#f8faf9]"
                          >
                            Review categories
                          </button>
                          <button
                            type="button"
                            onClick={onEditSetup}
                            className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] transition hover:bg-[#f8faf9]"
                          >
                            Edit setup
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#0b1519] p-5 text-white">
                        <div className="text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                          Reserved public address
                        </div>
                        <div className="mt-3 break-all text-lg font-semibold">
                          {reservedUrl}
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-white/55">
                          <span className="size-1.5 rounded-full bg-[#BAF16D]" />
                          Reserved only - publishing remains separate
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      label="Catalogue items"
                      value={itemCountLabel}
                      detail={
                        snapshot?.hasMoreItems
                          ? "First 100 loaded; more items are available."
                          : "Current active authoring records."
                      }
                    />
                    <StatCard
                      label="Categories"
                      value={String(
                        snapshot?.categories
                          .length ?? 0,
                      )}
                      detail="Active catalogue categories."
                    />
                    <StatCard
                      label="Suggested fields"
                      value={String(
                        suggestedAttributes,
                      )}
                      detail="System fields suggested for this business type."
                    />
                    <StatCard
                      label="Custom fields"
                      value={String(
                        customAttributes,
                      )}
                      detail="Tenant-owned catalogue attributes."
                    />
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                    <section className="rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_10px_32px_rgba(8,16,20,0.035)] sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.13em] text-[#7a8782]">
                            Catalogue preview
                          </p>
                          <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">
                            Current items
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              "catalogue",
                            )
                          }
                          className="text-xs font-bold text-[#52742c]"
                        >
                          View catalogue
                        </button>
                      </div>

                      <div className="mt-5 divide-y divide-[#edf1ef]">
                        {(snapshot?.items ?? [])
                          .slice(0, 5)
                          .map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                            >
                              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f4f2] text-[#66736e]">
                                <Icon
                                  name="catalogue"
                                  className="size-4"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-[#1d292e]">
                                  {item.name}
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[#7a8782]">
                                  <span className="capitalize">
                                    {item.itemType}
                                  </span>
                                  <span>
                                    {statusLabel(
                                      item.status,
                                    )}
                                  </span>
                                </div>
                              </div>
                              <span className="rounded-lg border border-[#e0e6e3] bg-[#fafbfa] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#77837e]">
                                v{item.version}
                              </span>
                            </div>
                          ))}

                        {(snapshot?.items.length
                          ?? 0) === 0 && (
                          <div className="py-8 text-center text-sm text-[#7a8782]">
                            No active items are available yet.
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_10px_32px_rgba(8,16,20,0.035)] sm:p-6">
                      <p className="text-xs font-black uppercase tracking-[0.13em] text-[#7a8782]">
                        Authoring foundation
                      </p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">
                        Ready for focused management screens
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-[#6f7c77]">
                        The workspace client now speaks directly to the tenant-scoped Category, Item, and Attribute APIs. The next slices add focused management UI without changing this shell.
                      </p>

                      <div className="mt-5 space-y-3">
                        {[
                          [
                            "Categories",
                            "Hierarchy and visibility",
                          ],
                          [
                            "Catalogue list",
                            "Search and filtering",
                          ],
                          [
                            "Item editor",
                            "Details and typed fields",
                          ],
                        ].map(
                          ([title, detail]) => (
                            <div
                              key={title}
                              className="flex items-center gap-3 rounded-xl border border-[#e6ebe8] bg-[#fafbfa] p-3"
                            >
                              <span className="size-2 rounded-full bg-[#BAF16D]" />
                              <span>
                                <span className="block text-sm font-semibold">
                                  {title}
                                </span>
                                <span className="mt-0.5 block text-xs text-[#7a8782]">
                                  {detail}
                                </span>
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}

              {activeView === "catalogue" && (
                <section className="rounded-2xl border border-[#dfe5e2] bg-white shadow-[0_12px_36px_rgba(8,16,20,0.04)]">
                  <div className="border-b border-[#e7ece9] px-5 py-5 sm:px-6">
                    <p className="text-xs font-black uppercase tracking-[0.13em] text-[#789c45]">
                      Catalogue
                    </p>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h1 className="text-2xl font-semibold tracking-[-0.03em]">
                          Catalogue items
                        </h1>
                        <p className="mt-1 text-sm text-[#6f7c77]">
                          Read-only workspace preview. Search, filters, and authoring controls are added in the dedicated Catalogue UI slice.
                        </p>
                      </div>
                      <div className="text-xs font-semibold text-[#77837e]">
                        Catalogue ID:{" "}
                        <span className="font-mono">
                          {snapshot?.catalogueId
                            ?? "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-[#edf1ef]">
                    {(snapshot?.items ?? [])
                      .slice(0, 12)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold text-[#1d292e]">
                                {item.name}
                              </div>
                              {item.isFeatured && (
                                <span className="rounded-md bg-[#eef7e1] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#52742c]">
                                  Featured
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#77837e]">
                              <span className="capitalize">
                                {item.itemType}
                              </span>
                              <span>
                                {statusLabel(
                                  item.status,
                                )}
                              </span>
                              <span>
                                /{item.slug}
                              </span>
                              {item.sku && (
                                <span>
                                  SKU {item.sku}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-[#77837e]">
                            {item.showPrice
                            && item.priceMinorUnits
                              !== null
                            && item.currencyCode ? (
                              <span className="font-semibold text-[#344047]">
                                {item.currencyCode}{" "}
                                {(
                                  item.priceMinorUnits
                                  / 100
                                ).toLocaleString(
                                  "en-IN",
                                  {
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </span>
                            ) : (
                              <span>
                                Price hidden
                              </span>
                            )}
                            <span className="rounded-lg border border-[#e0e6e3] bg-[#fafbfa] px-2 py-1 font-bold">
                              v{item.version}
                            </span>
                          </div>
                        </div>
                      ))}

                    {(snapshot?.items.length
                      ?? 0) === 0 && (
                      <div className="px-6 py-12 text-center text-sm text-[#7a8782]">
                        No active catalogue items are available.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeView === "categories" && snapshot && (
                <CategoriesManager
                  organizationId={
                    selectedOrganization.id
                  }
                  categories={
                    snapshot.categories
                  }
                  canMutate={
                    selectedOrganization.role
                      === "owner"
                    || selectedOrganization.role
                      === "admin"
                  }
                  onRefresh={() =>
                    loadSnapshot(true)
                  }
                />
              )}

              {activeView === "enquiries" && (
                <Placeholder
                  eyebrow="Enquiries"
                  title="Customer enquiry management"
                  description="The workspace navigation is ready for enquiry triage. The dedicated enquiry milestone will add New, Contacted, and Closed workflows without turning Catalogue into e-commerce."
                />
              )}

              {activeView === "website" && (
                <section className="rounded-2xl border border-[#dfe5e2] bg-white p-6 shadow-[0_12px_36px_rgba(8,16,20,0.04)] sm:p-8">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                    Website
                  </p>
                  <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">
                    Public catalogue website
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                    Your reserved address is ready for the controlled renderer and publishing milestones. Draft authoring data is not public.
                  </p>
                  <div className="mt-6 max-w-xl rounded-xl border border-[#dfe5e2] bg-[#f8faf9] p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#7a8782]">
                      Reserved address
                    </div>
                    <div className="mt-2 break-all text-lg font-semibold">
                      {reservedUrl}
                    </div>
                    <div className="mt-2 text-xs text-[#77837e]">
                      Reserved only - not publicly live
                    </div>
                  </div>
                </section>
              )}

              {activeView === "analytics" && (
                <Placeholder
                  eyebrow="Analytics"
                  title="Catalogue performance"
                  description="Analytics will be added after the public catalogue and publishing path are active, using privacy-conscious aggregate events rather than personal visitor data."
                />
              )}

              {activeView === "share" && (
                <Placeholder
                  eyebrow="Share"
                  title="Share centre"
                  description="This area is reserved for the canonical catalogue URL, QR code, WhatsApp sharing, and item-level share links once the public publishing path is active."
                />
              )}

              {activeView === "business" && (
                <section className="rounded-2xl border border-[#dfe5e2] bg-white p-6 shadow-[0_12px_36px_rgba(8,16,20,0.04)] sm:p-8">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                    Business Profile
                  </p>
                  <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">
                    Business and catalogue setup
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                    Return to the onboarding setup to update the business identity, business type, catalogue mode, contacts, theme, first item, or reserved URL.
                  </p>
                  <button
                    type="button"
                    onClick={onEditSetup}
                    className="mt-6 h-11 rounded-xl bg-[#0b1519] px-4 text-sm font-bold text-white transition hover:bg-[#152126]"
                  >
                    Edit setup
                  </button>
                </section>
              )}

              {activeView === "subscription" && (
                <Placeholder
                  eyebrow="Subscription"
                  title="Plan and usage"
                  description="Plan entitlements and provider lifecycle controls will be surfaced here in the subscription milestone. Existing authoring content remains editable when plan limits are reached."
                />
              )}

              {activeView === "settings" && (
                <section className="rounded-2xl border border-[#dfe5e2] bg-white p-6 shadow-[0_12px_36px_rgba(8,16,20,0.04)] sm:p-8">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">
                    Settings
                  </p>
                  <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">
                    Workspace settings
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                    Account and workspace controls will expand here as the remaining catalogue milestones are completed.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onEditSetup}
                      className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] transition hover:bg-[#f8faf9]"
                    >
                      Edit catalogue setup
                    </button>
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={() =>
                        void onLogout()
                      }
                      className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] transition hover:bg-[#f8faf9] disabled:opacity-50"
                    >
                      {loggingOut
                        ? "Signing out..."
                        : "Sign out"}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {moreOpen && (
          <div className="fixed inset-x-3 bottom-[82px] z-40 rounded-2xl border border-[#dfe5e2] bg-white p-3 shadow-[0_18px_55px_rgba(8,16,20,0.18)] lg:hidden">
            <div className="grid grid-cols-2 gap-2">
              {DESKTOP_NAV.filter(
                (item) =>
                  ![
                    "home",
                    "catalogue",
                    "enquiries",
                    "website",
                  ].includes(item.id),
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    navigate(item.id)
                  }
                  className="flex items-center gap-2 rounded-xl border border-[#e5eae7] bg-[#fafbfa] px-3 py-3 text-left text-xs font-semibold text-[#344047]"
                >
                  <Icon
                    name={item.icon}
                    className="size-4"
                  />
                  <span>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={loggingOut}
              onClick={() =>
                void onLogout()
              }
              className="mt-2 h-10 w-full rounded-xl border border-[#e5eae7] bg-white text-xs font-bold text-[#344047] disabled:opacity-50"
            >
              {loggingOut
                ? "Signing out..."
                : "Sign out"}
            </button>
          </div>
        )}

        <nav
          aria-label="Mobile workspace navigation"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dfe5e2] bg-white/96 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
        >
          <div className="grid grid-cols-5">
            {MOBILE_NAV.map((item) => {
              const active =
                item.id === "more"
                  ? moreOpen
                  : activeView === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    mobileNavigate(
                      item.id,
                    )
                  }
                  className={[
                    "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold transition",
                    active
                      ? "text-[#1d292e]"
                      : "text-[#84908b]",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid size-8 place-items-center rounded-lg",
                      active
                        ? "bg-[#eef7e1] text-[#52742c]"
                        : "",
                    ].join(" ")}
                  >
                    <Icon
                      name={item.icon}
                      className="size-[18px]"
                    />
                  </span>
                  <span>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </main>
  );
}
