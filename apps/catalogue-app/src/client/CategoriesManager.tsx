import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AuthoringApiError,
  authoringApi,
  type AuthoringCategory,
} from "./authoring-api";
import {
  categoryHasChildren,
  categoryStats,
  eligibleParentCategories,
  filterCategories,
  type CategoryListFilter,
} from "./category-ui";

type CategoriesManagerProps = {
  organizationId: string;
  categories: AuthoringCategory[];
  canMutate: boolean;
  onRefresh: () => Promise<void>;
};

type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  parentId: string;
  sortOrder: string;
  isVisible: boolean;
};

type ManagerIconName =
  | "plus"
  | "search"
  | "edit"
  | "archive"
  | "close"
  | "category";

const EMPTY_FORM: CategoryFormState = {
  name: "",
  slug: "",
  description: "",
  parentId: "",
  sortOrder: "0",
  isVisible: true,
};

const FILTERS: Array<{
  value: CategoryListFilter;
  label: string;
}> = [
  {
    value: "all",
    label: "All",
  },
  {
    value: "root",
    label: "Root",
  },
  {
    value: "child",
    label: "Subcategories",
  },
  {
    value: "visible",
    label: "Visible",
  },
  {
    value: "hidden",
    label: "Hidden",
  },
];

function ManagerIcon({
  name,
  className = "size-4",
}: {
  name: ManagerIconName;
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

  if (name === "plus") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M4 20h4l11-11-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    );
  }

  if (name === "archive") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="M4 7h16v13H4V7Z" />
        <path d="M3 4h18v3H3V4ZM9 11h6" />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={className}
        {...common}
      >
        <path d="m6 6 12 12M18 6 6 18" />
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
      <rect
        x="4"
        y="4"
        width="7"
        height="7"
        rx="1.5"
      />
      <rect
        x="13"
        y="13"
        width="7"
        height="7"
        rx="1.5"
      />
      <path d="M11 7.5h3a3 3 0 0 1 3 3V13" />
    </svg>
  );
}

function mutationMessage(
  error: unknown,
): string {
  if (error instanceof AuthoringApiError) {
    return error.message;
  }

  return "The category change could not be saved. Please try again.";
}

function parentName(
  categories: AuthoringCategory[],
  parentId: string | null,
): string {
  if (parentId === null) {
    return "Root category";
  }

  return categories.find(
    (category) =>
      category.id === parentId,
  )?.name ?? "Parent category";
}

function fieldClassName(
  invalid = false,
): string {
  return [
    "mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm text-[#1d292e] outline-none transition placeholder:text-[#a2aaa6] focus:ring-2 focus:ring-[#BAF16D]/25",
    invalid
      ? "border-[#d99589] focus:border-[#b95547]"
      : "border-[#d8e1dd] focus:border-[#8eb84f]",
  ].join(" ");
}

export function CategoriesManager({
  organizationId,
  categories,
  canMutate,
  onRefresh,
}: CategoriesManagerProps) {
  const [query, setQuery] =
    useState("");
  const [filter, setFilter] =
    useState<CategoryListFilter>("all");
  const [editorOpen, setEditorOpen] =
    useState(false);
  const [editing, setEditing] =
    useState<AuthoringCategory | null>(
      null,
    );
  const [form, setForm] =
    useState<CategoryFormState>(
      EMPTY_FORM,
    );
  const [formError, setFormError] =
    useState<string | null>(null);
  const [saving, setSaving] =
    useState(false);
  const [archiveTarget, setArchiveTarget] =
    useState<AuthoringCategory | null>(
      null,
    );
  const [archiving, setArchiving] =
    useState(false);
  const [archiveError, setArchiveError] =
    useState<string | null>(null);

  const stats = useMemo(
    () => categoryStats(categories),
    [categories],
  );

  const filtered = useMemo(
    () =>
      filterCategories(
        categories,
        query,
        filter,
      ),
    [categories, filter, query],
  );

  const rootOptions = useMemo(
    () =>
      eligibleParentCategories(
        categories,
        editing?.id,
      ),
    [categories, editing?.id],
  );

  const editingHasChildren =
    editing !== null
    && categoryHasChildren(
      categories,
      editing.id,
    );

  useEffect(() => {
    if (!editorOpen && !archiveTarget) {
      return;
    }

    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function onKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key !== "Escape") {
        return;
      }

      if (!saving && !archiving) {
        setEditorOpen(false);
        setArchiveTarget(null);
        setFormError(null);
        setArchiveError(null);
      }
    }

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previous;

      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [
    archiveTarget,
    archiving,
    editorOpen,
    saving,
  ]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(
    category: AuthoringCategory,
  ) {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      description:
        category.description ?? "",
      parentId:
        category.parentId ?? "",
      sortOrder: String(
        category.sortOrder,
      ),
      isVisible:
        category.isVisible,
    });
    setFormError(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    setEditorOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canMutate || saving) {
      return;
    }

    const name = form.name.trim();
    const slug = form.slug.trim();
    const description =
      form.description.trim();
    const sortOrder =
      Number(form.sortOrder);

    if (name.length === 0) {
      setFormError(
        "Category name is required.",
      );
      return;
    }

    if (description.length > 2_000) {
      setFormError(
        "Description must be 2,000 characters or fewer.",
      );
      return;
    }

    if (
      !Number.isInteger(sortOrder)
      || sortOrder < 0
      || sortOrder > 1_000_000
    ) {
      setFormError(
        "Display order must be a whole number from 0 to 1,000,000.",
      );
      return;
    }

    if (
      editingHasChildren
      && form.parentId !== ""
    ) {
      setFormError(
        "A category with active subcategories must remain a root category.",
      );
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editing) {
        await authoringApi.updateCategory(
          organizationId,
          editing.id,
          {
            version: editing.version,
            name,
            ...(slug.length > 0
              ? { slug }
              : {}),
            description:
              description.length > 0
                ? description
                : null,
            parentId:
              form.parentId.length > 0
                ? form.parentId
                : null,
            sortOrder,
            isVisible:
              form.isVisible,
          },
        );
      } else {
        await authoringApi.createCategory(
          organizationId,
          {
            name,
            ...(slug.length > 0
              ? { slug }
              : {}),
            description:
              description.length > 0
                ? description
                : null,
            parentId:
              form.parentId.length > 0
                ? form.parentId
                : null,
            sortOrder,
            isVisible:
              form.isVisible,
          },
        );
      }

      await onRefresh();
      setEditorOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      setFormError(
        mutationMessage(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveCategory() {
    if (
      !canMutate
      || !archiveTarget
      || archiving
    ) {
      return;
    }

    setArchiving(true);
    setArchiveError(null);

    try {
      await authoringApi.deleteCategory(
        organizationId,
        archiveTarget.id,
        archiveTarget.version,
      );

      await onRefresh();
      setArchiveTarget(null);
    } catch (error) {
      setArchiveError(
        mutationMessage(error),
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#dfe5e2] bg-white shadow-[0_12px_36px_rgba(8,16,20,0.04)]">
        <div className="border-b border-[#e7ece9] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[#BAF16D]" />
                <p className="text-xs font-black uppercase tracking-[0.13em] text-[#789c45]">
                  Categories
                </p>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#0b1519] sm:text-[28px]">
                Organise your catalogue
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f7c77]">
                Keep products and services easy to browse with one level of subcategories. Lower display-order numbers appear first.
              </p>
            </div>

            {canMutate && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1519] px-4 text-sm font-bold text-white transition hover:bg-[#152126] sm:w-auto"
              >
                <ManagerIcon
                  name="plus"
                  className="size-4"
                />
                New category
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-px border-b border-[#e7ece9] bg-[#e7ece9] sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Total",
              stats.total,
              "Active categories",
            ],
            [
              "Root",
              stats.roots,
              "Top-level groups",
            ],
            [
              "Subcategories",
              stats.children,
              "One level deep",
            ],
            [
              "Visible",
              stats.visible,
              "Shown when published",
            ],
          ].map(
            ([label, value, detail]) => (
              <div
                key={String(label)}
                className="bg-white px-5 py-4 sm:px-6"
              >
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#87928d]">
                  {label}
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#0b1519]">
                  {value}
                </div>
                <div className="mt-1 text-xs text-[#7a8782]">
                  {detail}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="border-b border-[#e7ece9] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="relative block xl:max-w-[360px] xl:flex-1">
              <span className="sr-only">
                Search categories
              </span>
              <ManagerIcon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8a9691]"
              />
              <input
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value,
                  )
                }
                placeholder="Search categories"
                className="h-11 w-full rounded-xl border border-[#d8e1dd] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-[#a2aaa6] focus:border-[#8eb84f] focus:ring-2 focus:ring-[#BAF16D]/25"
              />
            </label>

            <div
              className="flex gap-1 overflow-x-auto rounded-xl bg-[#f4f6f5] p-1"
              aria-label="Category filters"
            >
              {FILTERS.map((option) => {
                const active =
                  filter === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFilter(
                        option.value,
                      )
                    }
                    className={[
                      "shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition",
                      active
                        ? "bg-white text-[#1d292e] shadow-[0_1px_4px_rgba(8,16,20,0.08)]"
                        : "text-[#74807b] hover:text-[#344047]",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="px-5 py-14 text-center sm:px-6 sm:py-16">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f0f4f1] text-[#66736e]">
              <ManagerIcon
                name="category"
                className="size-5"
              />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[#1d292e]">
              No categories yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#74807b]">
              Categories are optional, but they make larger catalogues easier for customers to browse.
            </p>
            {canMutate && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b1519] px-4 text-sm font-bold text-white"
              >
                <ManagerIcon
                  name="plus"
                  className="size-4"
                />
                Create first category
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center sm:px-6">
            <h2 className="text-base font-semibold text-[#1d292e]">
              No matching categories
            </h2>
            <p className="mt-2 text-sm text-[#74807b]">
              Try a different search or filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="mt-4 rounded-lg border border-[#d8e1dd] bg-white px-3 py-2 text-xs font-bold text-[#344047]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(170px,0.8fr)_120px_100px_116px] gap-4 border-b border-[#e7ece9] bg-[#fafbfa] px-6 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#87928d]">
                <div>Category</div>
                <div>Parent</div>
                <div>Visibility</div>
                <div>Order</div>
                <div className="text-right">
                  Actions
                </div>
              </div>

              <div className="divide-y divide-[#edf1ef]">
                {filtered.map(
                  (category) => (
                    <div
                      key={category.id}
                      className="grid grid-cols-[minmax(0,1.35fr)_minmax(170px,0.8fr)_120px_100px_116px] items-center gap-4 px-6 py-4 transition hover:bg-[#fbfcfb]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {category.parentId
                            !== null && (
                            <span className="ml-2 h-5 w-3 shrink-0 rounded-bl-lg border-b border-l border-[#cbd4d0]" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#1d292e]">
                              {category.name}
                            </div>
                            <div className="mt-1 truncate text-xs text-[#87928d]">
                              /{category.slug}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="truncate text-sm text-[#63706a]">
                        {parentName(
                          categories,
                          category.parentId,
                        )}
                      </div>

                      <div>
                        <span
                          className={[
                            "inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]",
                            category.isVisible
                              ? "bg-[#eef7e1] text-[#52742c]"
                              : "bg-[#f0f2f1] text-[#77837e]",
                          ].join(" ")}
                        >
                          {category.isVisible
                            ? "Visible"
                            : "Hidden"}
                        </span>
                      </div>

                      <div className="text-sm font-semibold tabular-nums text-[#63706a]">
                        {category.sortOrder}
                      </div>

                      <div className="flex justify-end gap-1">
                        {canMutate ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                openEdit(
                                  category,
                                )
                              }
                              aria-label={`Edit ${category.name}`}
                              className="grid size-9 place-items-center rounded-lg border border-[#dfe5e2] bg-white text-[#59665f] transition hover:bg-[#f4f7f5] hover:text-[#1d292e]"
                            >
                              <ManagerIcon
                                name="edit"
                                className="size-4"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setArchiveError(
                                  null,
                                );
                                setArchiveTarget(
                                  category,
                                );
                              }}
                              aria-label={`Archive ${category.name}`}
                              className="grid size-9 place-items-center rounded-lg border border-[#e6d8d5] bg-white text-[#8a574f] transition hover:bg-[#fff8f6] hover:text-[#8a2f25]"
                            >
                              <ManagerIcon
                                name="archive"
                                className="size-4"
                              />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-[#98a19d]">
                            Read only
                          </span>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="divide-y divide-[#edf1ef] md:hidden">
              {filtered.map(
                (category) => (
                  <article
                    key={category.id}
                    className="p-5"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={[
                          "mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl",
                          category.parentId
                            === null
                            ? "bg-[#eef7e1] text-[#52742c]"
                            : "bg-[#f1f4f2] text-[#66736e]",
                        ].join(" ")}
                      >
                        <ManagerIcon
                          name="category"
                          className="size-4"
                        />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="min-w-0 truncate text-sm font-semibold text-[#1d292e]">
                            {category.name}
                          </h2>
                          <span
                            className={[
                              "rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em]",
                              category.isVisible
                                ? "bg-[#eef7e1] text-[#52742c]"
                                : "bg-[#f0f2f1] text-[#77837e]",
                            ].join(" ")}
                          >
                            {category.isVisible
                              ? "Visible"
                              : "Hidden"}
                          </span>
                        </div>

                        <div className="mt-1 break-all text-xs text-[#87928d]">
                          /{category.slug}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f8faf9] p-3">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#98a19d]">
                          Parent
                        </div>
                        <div className="mt-1 truncate text-xs font-semibold text-[#59665f]">
                          {parentName(
                            categories,
                            category.parentId,
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#98a19d]">
                          Order
                        </div>
                        <div className="mt-1 text-xs font-semibold tabular-nums text-[#59665f]">
                          {category.sortOrder}
                        </div>
                      </div>
                    </div>

                    {category.description && (
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#74807b]">
                        {category.description}
                      </p>
                    )}

                    {canMutate && (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEdit(
                              category,
                            )
                          }
                          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#d8e1dd] bg-white text-xs font-bold text-[#344047]"
                        >
                          <ManagerIcon
                            name="edit"
                            className="size-4"
                          />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setArchiveError(
                              null,
                            );
                            setArchiveTarget(
                              category,
                            );
                          }}
                          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#e6d8d5] bg-white text-xs font-bold text-[#8a574f]"
                        >
                          <ManagerIcon
                            name="archive"
                            className="size-4"
                          />
                          Archive
                        </button>
                      </div>
                    )}
                  </article>
                ),
              )}
            </div>
          </>
        )}
      </section>

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#081014]/45 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target
              === event.currentTarget
            ) {
              closeEditor();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-editor-title"
            className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-white shadow-[-20px_0_60px_rgba(8,16,20,0.16)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e7ece9] px-5 py-5 sm:px-6">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.13em] text-[#789c45]">
                  {editing
                    ? "Edit category"
                    : "New category"}
                </div>
                <h2
                  id="category-editor-title"
                  className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#0b1519]"
                >
                  {editing
                    ? editing.name
                    : "Create a category"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                aria-label="Close category editor"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dfe5e2] bg-white text-[#66736e] disabled:opacity-50"
              >
                <ManagerIcon
                  name="close"
                  className="size-4"
                />
              </button>
            </div>

            <form
              onSubmit={submit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {formError && (
                  <div
                    role="alert"
                    className="mb-5 rounded-xl border border-[#efc7c1] bg-[#fff8f6] px-4 py-3 text-sm leading-6 text-[#8a2f25]"
                  >
                    {formError}
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-[#344047]">
                    Category name
                    <span className="ml-1 text-[#8a2f25]">
                      *
                    </span>
                    <input
                      autoFocus
                      value={form.name}
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            name:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="e.g. Industrial Pumps"
                      className={fieldClassName(
                        form.name.trim()
                          .length === 0
                          && formError
                          !== null,
                      )}
                    />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-[#87928d]">
                    Use a short customer-facing label.
                  </p>
                </div>

                <div className="mt-5">
                  <label className="text-xs font-bold text-[#344047]">
                    URL slug
                    <input
                      value={form.slug}
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            slug:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder={
                        editing
                          ? "Current category slug"
                          : "Generated from the name"
                      }
                      className={fieldClassName()}
                    />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-[#87928d]">
                    Leave blank when creating to generate it from the category name.
                  </p>
                </div>

                <div className="mt-5">
                  <label className="text-xs font-bold text-[#344047]">
                    Parent category
                    <select
                      value={form.parentId}
                      disabled={
                        editingHasChildren
                      }
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            parentId:
                              event.target
                                .value,
                          }),
                        )
                      }
                      className={[
                        fieldClassName(),
                        editingHasChildren
                          ? "cursor-not-allowed bg-[#f4f6f5] text-[#7a8782]"
                          : "",
                      ].join(" ")}
                    >
                      <option value="">
                        Root category
                      </option>
                      {rootOptions.map(
                        (category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-[#87928d]">
                    {editingHasChildren
                      ? "This category has active subcategories, so it must remain at the root level."
                      : "Catalogue supports one level of subcategories."}
                  </p>
                </div>

                <div className="mt-5">
                  <label className="text-xs font-bold text-[#344047]">
                    Description
                    <textarea
                      rows={5}
                      maxLength={2000}
                      value={
                        form.description
                      }
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            description:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="Optional short description for this category"
                      className="mt-2 w-full resize-y rounded-xl border border-[#d8e1dd] bg-white px-3 py-3 text-sm leading-6 text-[#1d292e] outline-none transition placeholder:text-[#a2aaa6] focus:border-[#8eb84f] focus:ring-2 focus:ring-[#BAF16D]/25"
                    />
                  </label>
                  <div className="mt-1 text-right text-[10px] font-semibold tabular-nums text-[#98a19d]">
                    {form.description.length}
                    /2000
                  </div>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold text-[#344047]">
                      Display order
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        value={form.sortOrder}
                        onChange={(event) =>
                          setForm(
                            (current) => ({
                              ...current,
                              sortOrder:
                                event.target
                                  .value,
                            }),
                          )
                        }
                        className={fieldClassName()}
                      />
                    </label>
                    <p className="mt-2 text-xs leading-5 text-[#87928d]">
                      Lower numbers appear first.
                    </p>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-[#344047]">
                      Visibility
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={
                        form.isVisible
                      }
                      onClick={() =>
                        setForm(
                          (current) => ({
                            ...current,
                            isVisible:
                              !current.isVisible,
                          }),
                        )
                      }
                      className="mt-2 flex h-11 w-full items-center justify-between rounded-xl border border-[#d8e1dd] bg-white px-3 text-sm font-semibold text-[#344047]"
                    >
                      <span>
                        {form.isVisible
                          ? "Visible"
                          : "Hidden"}
                      </span>
                      <span
                        className={[
                          "relative h-6 w-11 rounded-full transition",
                          form.isVisible
                            ? "bg-[#9bd652]"
                            : "bg-[#d3d9d6]",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "absolute top-1 size-4 rounded-full bg-white shadow-sm transition",
                            form.isVisible
                              ? "left-6"
                              : "left-1",
                          ].join(" ")}
                        />
                      </span>
                    </button>
                  </div>
                </div>

                {editing && (
                  <div className="mt-6 rounded-xl border border-[#e3e8e5] bg-[#fafbfa] p-4 text-xs leading-5 text-[#74807b]">
                    Editing version{" "}
                    <span className="font-bold text-[#344047]">
                      {editing.version}
                    </span>
                    . If another session changes this category first, Techabanca will ask you to refresh instead of overwriting it.
                  </div>
                )}
              </div>

              <div className="border-t border-[#e7ece9] bg-white px-5 py-4 sm:px-6">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeEditor}
                    disabled={saving}
                    className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-11 rounded-xl bg-[#0b1519] px-5 text-sm font-bold text-white transition hover:bg-[#152126] disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : editing
                        ? "Save changes"
                        : "Create category"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {archiveTarget && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#081014]/45 px-4 backdrop-blur-[2px]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-category-title"
            className="w-full max-w-md rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_24px_70px_rgba(8,16,20,0.22)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff4f1] text-[#8a574f]">
                <ManagerIcon
                  name="archive"
                  className="size-4"
                />
              </span>
              <div>
                <h2
                  id="archive-category-title"
                  className="text-lg font-semibold text-[#1d292e]"
                >
                  Archive category?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#6f7c77]">
                  <span className="font-semibold text-[#344047]">
                    {archiveTarget.name}
                  </span>{" "}
                  will be removed from the active category list.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#e6ebe8] bg-[#fafbfa] p-4 text-xs leading-5 text-[#74807b]">
              Active subcategories will become root categories and assigned items will become uncategorized. Item content is not deleted.
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
                  void archiveCategory()
                }
                className="h-11 rounded-xl bg-[#6f3028] px-4 text-sm font-bold text-white transition hover:bg-[#5b251f] disabled:opacity-50"
              >
                {archiving
                  ? "Archiving..."
                  : "Archive category"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
