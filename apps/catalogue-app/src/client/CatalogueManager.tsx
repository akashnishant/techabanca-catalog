import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AuthoringApiError,
  authoringApi,
  type AuthoringCategory,
  type AuthoringItem,
} from "./authoring-api";
import {
  orderCategories,
} from "./category-ui";
import {
  activeCatalogueFilterCount,
  buildCatalogueItemFilters,
  catalogueCategoryLabel,
  cataloguePriceLabel,
  catalogueStatusLabel,
  catalogueTypeLabel,
  mergeCatalogueItemPages,
  type CatalogueCategoryFilter,
  type CatalogueFilterState,
  type CatalogueStatusFilter,
  type CatalogueTypeFilter,
} from "./catalogue-list-ui";
import {
  ItemEditor,
} from "./ItemEditor";
import type {
  CatalogueMode,
} from "./onboarding-api";

type CatalogueManagerProps = {
  organizationId: string;
  categories: AuthoringCategory[];
  catalogueMode: CatalogueMode;
  businessTypeCode: string;
  canMutate: boolean;
  onWorkspaceRefresh:
    () => Promise<void>;
};

type CatalogueIconName =
  | "search"
  | "refresh"
  | "catalogue"
  | "star"
  | "filter"
  | "plus"
  | "edit"
  | "archive";

const PAGE_SIZE = 25;

const EMPTY_FILTERS: CatalogueFilterState = {
  query: "",
  status: "all",
  itemType: "all",
  category: "all",
};

function CatalogueIcon({
  name,
  className = "size-4",
}: {
  name: CatalogueIconName;
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

  if (name === "search") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
        <path d="M20 7v5h-5" />
        <path d="M19 12a7 7 0 1 1-2-5" />
      </svg>
    );
  }

  if (name === "star") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
        <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
      </svg>
    );
  }

  if (name === "filter") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
        <path d="M4 20h4l11-11-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    );
  }

  if (name === "archive") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
        <path d="M4 7h16v13H4V7Z" />
        <path d="M3 4h18v3H3V4ZM9 11h6" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function requestMessage(
  error: unknown,
): string {
  if (error instanceof AuthoringApiError) {
    if (
      error.code
      === "invalid_item_cursor"
    ) {
      return "The catalogue changed while these results were open. Refresh the list to continue.";
    }

    return error.message;
  }

  return "Catalogue items could not be loaded. Please try again.";
}

function statusClassName(
  status: AuthoringItem["status"],
): string {
  if (status === "published") {
    return "bg-[#edf5f7] text-[#486970]";
  }

  if (status === "hidden") {
    return "bg-[#f0f2f1] text-[#747f7b]";
  }

  return "bg-[#fff7df] text-[#826920]";
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#87928d]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-11 w-full rounded-xl border border-[#d8e1dd] bg-white px-3 text-sm font-semibold text-[#344047] outline-none transition focus:border-[#8eb84f] focus:ring-2 focus:ring-[#BAF16D]/25"
      >
        {children}
      </select>
    </label>
  );
}

export function CatalogueManager({
  organizationId,
  categories,
  catalogueMode,
  businessTypeCode,
  canMutate,
  onWorkspaceRefresh,
}: CatalogueManagerProps) {
  const [filters, setFilters] =
    useState<CatalogueFilterState>(
      EMPTY_FILTERS,
    );
  const [items, setItems] =
    useState<AuthoringItem[]>([]);
  const [nextCursor, setNextCursor] =
    useState<string | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [loadingMore, setLoadingMore] =
    useState(false);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [editorOpen, setEditorOpen] =
    useState(false);
  const [editingItem, setEditingItem] =
    useState<AuthoringItem | null>(
      null,
    );
  const [archiveTarget, setArchiveTarget] =
    useState<AuthoringItem | null>(
      null,
    );
  const [archiving, setArchiving] =
    useState(false);
  const [archiveError, setArchiveError] =
    useState<string | null>(null);
  const requestVersion = useRef(0);
  const editorRequestVersion = useRef(0);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);

  const orderedCategories = useMemo(
    () => orderCategories(categories),
    [categories],
  );

  const activeFilterCount =
    activeCatalogueFilterCount(
      filters,
    );

  const loadFirstPage = useCallback(
    async (
      background = false,
    ) => {
      const version =
        requestVersion.current + 1;

      requestVersion.current =
        version;

      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const result =
          await authoringApi.items(
            organizationId,
            buildCatalogueItemFilters(
              filters,
              undefined,
              PAGE_SIZE,
            ),
          );

        if (
          requestVersion.current
          !== version
        ) {
          return;
        }

        setItems(result.items);
        setNextCursor(
          result.nextCursor,
        );
      } catch (requestError) {
        if (
          requestVersion.current
          !== version
        ) {
          return;
        }

        setError(
          requestMessage(
            requestError,
          ),
        );
        setItems([]);
        setNextCursor(null);
      } finally {
        if (
          requestVersion.current
          === version
        ) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      filters,
      organizationId,
    ],
  );

  useEffect(() => {
    const delay =
      filters.query.trim().length > 0
        ? 250
        : 0;

    const timer =
      window.setTimeout(
        () => {
          void loadFirstPage();
        },
        delay,
      );

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadFirstPage]);

  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setItems([]);
    setNextCursor(null);
    setError(null);
    setEditorOpen(false);
    setEditingItem(null);
    setArchiveTarget(null);
    editorRequestVersion.current += 1;
    setOpeningItemId(null);
  }, [organizationId]);

  async function loadMore() {
    if (
      nextCursor === null
      || loadingMore
    ) {
      return;
    }

    const version =
      requestVersion.current;

    setLoadingMore(true);
    setError(null);

    try {
      const result =
        await authoringApi.items(
          organizationId,
          buildCatalogueItemFilters(
            filters,
            nextCursor,
            PAGE_SIZE,
          ),
        );

      if (
        requestVersion.current
        !== version
      ) {
        return;
      }

      setItems((current) =>
        mergeCatalogueItemPages(
          current,
          result.items,
        ),
      );
      setNextCursor(
        result.nextCursor,
      );
    } catch (requestError) {
      if (
        requestVersion.current
        === version
      ) {
        setError(
          requestMessage(
            requestError,
          ),
        );
      }
    } finally {
      if (
        requestVersion.current
        === version
      ) {
        setLoadingMore(false);
      }
    }
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function openCreate() {
    editorRequestVersion.current += 1;
    setOpeningItemId(null);
    setEditingItem(null);
    setEditorOpen(true);
  }

  async function openEdit(
    item: AuthoringItem,
  ) {
    const version = ++editorRequestVersion.current;
    setOpeningItemId(item.id);
    setError(null);

    try {
      const result = await authoringApi.item(organizationId, item.id);
      if (editorRequestVersion.current !== version) return;
      setEditingItem(result.item);
      setEditorOpen(true);
    } catch (requestError) {
      if (editorRequestVersion.current === version) {
        setError(requestMessage(requestError));
      }
    } finally {
      if (editorRequestVersion.current === version) {
        setOpeningItemId(null);
      }
    }
  }

  async function itemSaved() {
    await Promise.all([
      loadFirstPage(true),
      onWorkspaceRefresh(),
    ]);

    setEditorOpen(false);
    setEditingItem(null);
  }

  async function archiveItem() {
    if (
      !archiveTarget
      || archiving
    ) {
      return;
    }

    setArchiving(true);
    setArchiveError(null);

    try {
      await authoringApi.deleteItem(
        organizationId,
        archiveTarget.id,
        archiveTarget.version,
      );

      setArchiveTarget(null);

      await Promise.all([
        loadFirstPage(true),
        onWorkspaceRefresh(),
      ]);
    } catch (requestError) {
      setArchiveError(
        requestMessage(
          requestError,
        ),
      );
    } finally {
      setArchiving(false);
    }
  }

  const resultLabel =
    nextCursor !== null
      ? `${items.length}+ loaded`
      : `${items.length} loaded`;

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#dfe5e2] bg-white shadow-[0_12px_36px_rgba(8,16,20,0.04)]">
        <div className="border-b border-[#e7ece9] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[#BAF16D]" />
                <p className="text-xs font-black uppercase tracking-[0.13em] text-[#789c45]">
                  Catalogue
                </p>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#0b1519] sm:text-[28px]">
                Catalogue items
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                Search, filter, and manage the products and services in your business catalogue. Saved content remains separate from your published website.
              </p>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="rounded-xl border border-[#e0e6e3] bg-[#f8faf9] px-3 py-2">
                <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#98a19d]">
                  Results
                </div>
                <div className="mt-0.5 text-xs font-bold text-[#344047]">
                  {resultLabel}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadFirstPage(true)
                }
                disabled={
                  loading || refreshing
                }
                aria-label="Refresh catalogue list"
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#d8e1dd] bg-white text-[#59665f] transition hover:bg-[#f8faf9] disabled:opacity-50"
              >
                <CatalogueIcon
                  name="refresh"
                  className={[
                    "size-4",
                    refreshing
                      ? "animate-spin"
                      : "",
                  ].join(" ")}
                />
              </button>

              {canMutate && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="ml-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0b1519] px-4 text-sm font-bold text-white transition hover:bg-[#152126]"
                >
                  <CatalogueIcon
                    name="plus"
                    className="size-4"
                  />
                  New item
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-b border-[#e7ece9] bg-[#fbfcfb] px-5 py-4 sm:px-6">
          <label className="relative block">
            <span className="sr-only">
              Search catalogue items
            </span>
            <CatalogueIcon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8a9691]"
            />
            <input
              type="search"
              maxLength={160}
              value={filters.query}
              onChange={(event) =>
                setFilters(
                  (current) => ({
                    ...current,
                    query:
                      event.target.value,
                  }),
                )
              }
              placeholder="Search name, SKU, or description"
              className="h-11 w-full rounded-xl border border-[#d8e1dd] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-[#a2aaa6] focus:border-[#8eb84f] focus:ring-2 focus:ring-[#BAF16D]/25"
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.35fr_auto] xl:items-end">
            <SelectField
              label="Status"
              value={filters.status}
              onChange={(value) =>
                setFilters(
                  (current) => ({
                    ...current,
                    status:
                      value as CatalogueStatusFilter,
                  }),
                )
              }
            >
              <option value="all">
                All statuses
              </option>
              <option value="draft">
                Draft
              </option>
              <option value="published">
                Published source
              </option>
              <option value="hidden">
                Hidden
              </option>
            </SelectField>

            <SelectField
              label="Type"
              value={filters.itemType}
              onChange={(value) =>
                setFilters(
                  (current) => ({
                    ...current,
                    itemType:
                      value as CatalogueTypeFilter,
                  }),
                )
              }
            >
              <option value="all">
                Products and services
              </option>
              <option value="product">
                Products
              </option>
              <option value="service">
                Services
              </option>
            </SelectField>

            <SelectField
              label="Category"
              value={filters.category}
              onChange={(value) =>
                setFilters(
                  (current) => ({
                    ...current,
                    category:
                      value as CatalogueCategoryFilter,
                  }),
                )
              }
            >
              <option value="all">
                All categories
              </option>
              <option value="uncategorized">
                Uncategorized
              </option>
              {orderedCategories.map(
                (category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.parentId
                      !== null
                      ? `- ${category.name}`
                      : category.name}
                  </option>
                ),
              )}
            </SelectField>

            <button
              type="button"
              onClick={clearFilters}
              disabled={
                activeFilterCount === 0
              }
              className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-xs font-bold text-[#59665f] transition hover:bg-[#f4f7f5] disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2 xl:col-span-1"
            >
              Clear filters
              {activeFilterCount > 0
                ? ` (${activeFilterCount})`
                : ""}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="border-b border-[#efc7c1] bg-[#fff8f6] px-5 py-4 text-sm text-[#8a2f25] sm:px-6"
          >
            <div className="font-semibold">
              Catalogue results could not be loaded
            </div>
            <div className="mt-1 leading-6">
              {error}
            </div>
            <button
              type="button"
              onClick={() =>
                void loadFirstPage()
              }
              className="mt-3 rounded-lg border border-[#e4b8b1] bg-white px-3 py-2 text-xs font-bold"
            >
              Refresh results
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid min-h-[320px] place-items-center px-5 py-12 sm:px-6">
            <div className="flex items-center gap-3 text-sm font-semibold text-[#66736e]">
              <span className="size-5 animate-spin rounded-full border-2 border-[#d8e3d1] border-t-[#789c45]" />
              Loading catalogue items...
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-14 text-center sm:px-6 sm:py-16">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f0f4f1] text-[#66736e]">
              <CatalogueIcon
                name={
                  activeFilterCount > 0
                    ? "filter"
                    : "catalogue"
                }
                className="size-5"
              />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[#1d292e]">
              {activeFilterCount > 0
                ? "No matching items"
                : "No catalogue items yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#74807b]">
              {activeFilterCount > 0
                ? "Try a different search term or clear one of the active filters."
                : "Add your first product or service to begin building the catalogue."}
            </p>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-xl border border-[#d8e1dd] bg-white px-4 py-2.5 text-sm font-bold text-[#344047]"
              >
                Clear all filters
              </button>
            ) : canMutate ? (
              <button
                type="button"
                onClick={openCreate}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b1519] px-4 text-sm font-bold text-white"
              >
                <CatalogueIcon
                  name="plus"
                  className="size-4"
                />
                Create first item
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <div className={[
                "grid gap-4 border-b border-[#e7ece9] bg-[#fafbfa] px-6 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#87928d]",
                canMutate
                  ? "grid-cols-[minmax(0,1.45fr)_minmax(140px,0.75fr)_95px_115px_125px_70px_86px]"
                  : "grid-cols-[minmax(0,1.5fr)_minmax(150px,0.8fr)_100px_120px_130px_80px]",
              ].join(" ")}>
                <div>Item</div>
                <div>Category</div>
                <div>Type</div>
                <div>Status</div>
                <div>Price</div>
                <div className="text-right">
                  Order
                </div>
                {canMutate && (
                  <div className="text-right">
                    Actions
                  </div>
                )}
              </div>

              <div className="divide-y divide-[#edf1ef]">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className={[
                      "grid items-center gap-4 px-6 py-4 transition hover:bg-[#fbfcfb]",
                      canMutate
                        ? "grid-cols-[minmax(0,1.45fr)_minmax(140px,0.75fr)_95px_115px_125px_70px_86px]"
                        : "grid-cols-[minmax(0,1.5fr)_minmax(150px,0.8fr)_100px_120px_130px_80px]",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f4f1] text-[#66736e]">
                          <CatalogueIcon
                            name="catalogue"
                            className="size-4"
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate text-sm font-semibold text-[#1d292e]">
                              {item.name}
                            </h2>
                            {item.isFeatured && (
                              <span
                                title="Featured item"
                                className="shrink-0 text-[#789c45]"
                              >
                                <CatalogueIcon
                                  name="star"
                                  className="size-3.5"
                                />
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex min-w-0 gap-2 text-xs text-[#87928d]">
                            <span className="truncate">
                              /{item.slug}
                            </span>
                            {item.sku && (
                              <span className="truncate">
                                SKU {item.sku}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="truncate text-sm text-[#63706a]">
                      {catalogueCategoryLabel(
                        categories,
                        item.categoryId,
                      )}
                    </div>

                    <div className="text-sm text-[#63706a]">
                      {catalogueTypeLabel(
                        item.itemType,
                      )}
                    </div>

                    <div>
                      <span
                        className={[
                          "inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.07em]",
                          statusClassName(
                            item.status,
                          ),
                        ].join(" ")}
                      >
                        {catalogueStatusLabel(
                          item.status,
                        )}
                      </span>
                    </div>

                    <div className="truncate text-sm font-semibold text-[#344047]">
                      {cataloguePriceLabel(
                        item,
                      )}
                    </div>

                    <div className="text-right text-sm font-semibold tabular-nums text-[#63706a]">
                      {item.sortOrder}
                    </div>

                    {canMutate && (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            void openEdit(item)
                          }
                          disabled={openingItemId !== null}
                          aria-busy={openingItemId === item.id}
                          aria-label={`Edit ${item.name}`}
                          className="grid size-9 place-items-center rounded-lg border border-[#dfe5e2] bg-white text-[#59665f] transition hover:bg-[#f4f7f5]"
                        >
                          <CatalogueIcon
                            name="edit"
                            className="size-4"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setArchiveError(null);
                            setArchiveTarget(item);
                          }}
                          aria-label={`Archive ${item.name}`}
                          className="grid size-9 place-items-center rounded-lg border border-[#e6d8d5] bg-white text-[#8a574f] transition hover:bg-[#fff8f6]"
                        >
                          <CatalogueIcon
                            name="archive"
                            className="size-4"
                          />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <div className="divide-y divide-[#edf1ef] md:hidden">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="p-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f0f4f1] text-[#66736e]">
                      <CatalogueIcon
                        name="catalogue"
                        className="size-4"
                      />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="min-w-0 truncate text-sm font-semibold text-[#1d292e]">
                          {item.name}
                        </h2>
                        {item.isFeatured && (
                          <span
                            title="Featured item"
                            className="shrink-0 text-[#789c45]"
                          >
                            <CatalogueIcon
                              name="star"
                              className="size-3.5"
                            />
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#87928d]">
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

                    <span
                      className={[
                        "shrink-0 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em]",
                        statusClassName(
                          item.status,
                        ),
                      ].join(" ")}
                    >
                      {catalogueStatusLabel(
                        item.status,
                      )}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-[#f8faf9] p-3">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#98a19d]">
                        Category
                      </div>
                      <div className="mt-1 truncate text-xs font-semibold text-[#59665f]">
                        {catalogueCategoryLabel(
                          categories,
                          item.categoryId,
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#98a19d]">
                        Type
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#59665f]">
                        {catalogueTypeLabel(
                          item.itemType,
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#98a19d]">
                        Price
                      </div>
                      <div className="mt-1 truncate text-xs font-semibold text-[#59665f]">
                        {cataloguePriceLabel(
                          item,
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#98a19d]">
                        Order
                      </div>
                      <div className="mt-1 text-xs font-semibold tabular-nums text-[#59665f]">
                        {item.sortOrder}
                      </div>
                    </div>
                  </div>

                  {item.shortDescription && (
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#74807b]">
                      {item.shortDescription}
                    </p>
                  )}

                  {canMutate && (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void openEdit(item)
                        }
                        disabled={openingItemId !== null}
                        aria-busy={openingItemId === item.id}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#d8e1dd] bg-white text-xs font-bold text-[#344047]"
                      >
                        <CatalogueIcon
                          name="edit"
                          className="size-4"
                        />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setArchiveError(null);
                          setArchiveTarget(item);
                        }}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#e6d8d5] bg-white text-xs font-bold text-[#8a574f]"
                      >
                        <CatalogueIcon
                          name="archive"
                          className="size-4"
                        />
                        Archive
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        {!loading && items.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-[#e7ece9] bg-[#fafbfa] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-xs leading-5 text-[#74807b]">
              Showing{" "}
              <span className="font-bold text-[#344047]">
                {items.length}
              </span>{" "}
              catalogue item
              {items.length === 1
                ? ""
                : "s"}
              {nextCursor !== null
                ? ". More are available."
                : "."}
            </div>

            {nextCursor !== null && (
              <button
                type="button"
                onClick={() =>
                  void loadMore()
                }
                disabled={loadingMore}
                className="h-10 w-full rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] transition hover:bg-[#f4f7f5] disabled:opacity-50 sm:w-auto"
              >
                {loadingMore
                  ? "Loading..."
                  : "Load more"}
              </button>
            )}
          </div>
        )}

        <div className="border-t border-[#e7ece9] bg-white px-5 py-3 text-[10px] leading-5 text-[#98a19d] sm:px-6">
          Saved changes do not update the live website automatically. Review and publish website revisions in Website.
        </div>
      </section>

      {editorOpen && canMutate && (
        <ItemEditor
          organizationId={
            organizationId
          }
          catalogueMode={
            catalogueMode
          }
          businessTypeCode={
            businessTypeCode
          }
          categories={categories}
          item={editingItem}
          onClose={() => {
            setEditorOpen(false);
            setEditingItem(null);
            void loadFirstPage(true);
          }}
          onSaved={async () => {
            await itemSaved();
          }}
        />
      )}

      {archiveTarget && canMutate && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#081014]/45 px-4 backdrop-blur-[2px]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-item-title"
            className="w-full max-w-md rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_24px_70px_rgba(8,16,20,0.22)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff4f1] text-[#8a574f]">
                <CatalogueIcon
                  name="archive"
                  className="size-4"
                />
              </span>
              <div>
                <h2
                  id="archive-item-title"
                  className="text-lg font-semibold text-[#1d292e]"
                >
                  Archive item?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#6f7c77]">
                  <span className="font-semibold text-[#344047]">
                    {archiveTarget.name}
                  </span>{" "}
                  will be removed from the active catalogue list.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#e6ebe8] bg-[#fafbfa] p-4 text-xs leading-5 text-[#74807b]">
              The item and its specification values are retained as archived data. Its active slug and SKU can be reused later.
            </div>

            {archiveError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-[#efc7c1] bg-[#fff8f6] px-4 py-3 text-sm text-[#8a2f25]"
              >
                {archiveError}
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={archiving}
                onClick={() => {
                  setArchiveTarget(null);
                  setArchiveError(null);
                }}
                className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={() =>
                  void archiveItem()
                }
                className="h-11 rounded-xl bg-[#6f3028] px-4 text-sm font-bold text-white transition hover:bg-[#5b251f] disabled:opacity-50"
              >
                {archiving
                  ? "Archiving..."
                  : "Archive item"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
