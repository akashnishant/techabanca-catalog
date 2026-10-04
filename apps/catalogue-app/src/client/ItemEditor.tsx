import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";
import {
  AuthoringApiError,
  authoringApi,
  type AuthoringAttributeDefinition,
  type AuthoringItem,
  type AuthoringItemAttribute,
  type AuthoringItemStatus,
  type AuthoringItemType,
} from "./authoring-api";
import {
  orderCategories,
} from "./category-ui";
import {
  allowedItemTypes,
  attributeInputValue,
  defaultItemType,
  definitionAppliesToItem,
  formatPriceInput,
  parseAttributeInput,
  parsePriceInput,
  sortEditorAttributes,
} from "./item-editor-ui";
import {
  ITEM_TEMPLATE_ATTRIBUTE_CODE,
  availableFieldPacks,
  defaultFieldPack,
  fieldPackAttributeCodes,
  fieldPackQuickStartCodes,
  groupEditorAttributes,
  isFieldPackCode,
} from "./item-field-presets";
import { ItemMediaEditor, type ItemMediaHandle } from "./ItemMediaEditor";
import type {
  CatalogueMode,
} from "./onboarding-api";

type ItemEditorProps = {
  organizationId: string;
  catalogueMode: CatalogueMode;
  businessTypeCode: string;
  categories: Parameters<
    typeof orderCategories
  >[0];
  item: AuthoringItem | null;
  onClose: () => void;
  onSaved: (
    item: AuthoringItem,
  ) => Promise<void>;
};

type ItemForm = {
  itemType: AuthoringItemType;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  shortDescription: string;
  longDescription: string;
  price: string;
  currencyCode: string;
  showPrice: boolean;
  status: AuthoringItemStatus;
  isFeatured: boolean;
  sortOrder: string;
};

type AttributeDraft = {
  input: string;
  isVisible: boolean;
  version: number | null;
  hadValue: boolean;
};

function formFromItem(
  item: AuthoringItem | null,
  mode: CatalogueMode,
): ItemForm {
  return {
    itemType:
      item?.itemType
      ?? defaultItemType(mode),
    name: item?.name ?? "",
    slug: item?.slug ?? "",
    sku: item?.sku ?? "",
    categoryId:
      item?.categoryId ?? "",
    shortDescription:
      item?.shortDescription ?? "",
    longDescription:
      item?.longDescription ?? "",
    price:
      formatPriceInput(
        item?.priceMinorUnits
        ?? null,
      ),
    currencyCode:
      item?.currencyCode
      ?? "INR",
    showPrice:
      item?.showPrice ?? false,
    status:
      item?.status ?? "draft",
    isFeatured:
      item?.isFeatured ?? false,
    sortOrder: String(
      item?.sortOrder ?? 0,
    ),
  };
}

function friendlyError(
  error: unknown,
): string {
  if (error instanceof AuthoringApiError) {
    return error.message;
  }

  return "The item could not be saved. Please try again.";
}

function inputClassName(): string {
  return "mt-2 h-11 w-full rounded-xl border border-[#d8e1dd] bg-white px-3 text-sm text-[#1d292e] outline-none transition placeholder:text-[#a2aaa6] focus:border-[#8eb84f] focus:ring-2 focus:ring-[#BAF16D]/25";
}

function textAreaClassName(): string {
  return "mt-2 w-full resize-y rounded-xl border border-[#d8e1dd] bg-white px-3 py-3 text-sm leading-6 text-[#1d292e] outline-none transition placeholder:text-[#a2aaa6] focus:border-[#8eb84f] focus:ring-2 focus:ring-[#BAF16D]/25";
}

function buildAttributeDrafts(
  attributes: AuthoringItemAttribute[],
): Record<string, AttributeDraft> {
  const result:
    Record<string, AttributeDraft> = {};

  for (const attribute of attributes) {
    result[attribute.definition.id] = {
      input:
        attributeInputValue(
          attribute,
        ),
      isVisible:
        attribute.value
          ?.isVisible
        ?? true,
      version:
        attribute.value
          ?.version
        ?? null,
      hadValue:
        attribute.value !== null,
    };
  }

  return result;
}

function mergeAttributeLists(
  definitions:
    AuthoringAttributeDefinition[],
  existing:
    AuthoringItemAttribute[],
): AuthoringItemAttribute[] {
  const byId = new Map<
    string,
    AuthoringItemAttribute
  >();

  for (const definition of definitions) {
    if (!definition.isActive) {
      continue;
    }

    byId.set(
      definition.id,
      {
        definition,
        value: null,
      },
    );
  }

  for (const attribute of existing) {
    if (
      attribute.value !== null
      || attribute.definition
        .source === "custom"
      || attribute.definition
        .isSuggested
    ) {
      byId.set(
        attribute.definition.id,
        attribute,
      );
    }
  }

  return sortEditorAttributes(
    [...byId.values()],
  );
}

export function ItemEditor({
  organizationId,
  catalogueMode,
  businessTypeCode,
  categories,
  item,
  onClose,
  onSaved,
}: ItemEditorProps) {
  const [currentItem, setCurrentItem] =
    useState<AuthoringItem | null>(
      item,
    );
  const [form, setForm] =
    useState<ItemForm>(
      () =>
        formFromItem(
          item,
          catalogueMode,
        ),
    );
  const [
    fieldPackCode,
    setFieldPackCode,
  ] = useState(
    () =>
      defaultFieldPack(
        businessTypeCode,
        item?.itemType
        ?? defaultItemType(
          catalogueMode,
        ),
      ).code,
  );
  const [attributes, setAttributes] =
    useState<
      AuthoringItemAttribute[]
    >([]);
  const [
    attributeDrafts,
    setAttributeDrafts,
  ] = useState<
    Record<string, AttributeDraft>
  >({});
  const [
    initialAttributes,
    setInitialAttributes,
  ] = useState<
    AuthoringItemAttribute[]
  >([]);
  const [loadingAttributes, setLoadingAttributes] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const initialMediaItemId = useRef(item?.id ?? null);
  const mediaRef = useRef<ItemMediaHandle>(null);
  const [formError, setFormError] =
    useState<string | null>(null);
  const [specSearch, setSpecSearch] =
    useState("");
  const [showAllFields, setShowAllFields] =
    useState(false);
  const [addSpecCode, setAddSpecCode] =
    useState("");
  const [extraAttributeCodes, setExtraAttributeCodes] =
    useState<string[]>([]);

  const types = useMemo(
    () =>
      allowedItemTypes(
        catalogueMode,
      ),
    [catalogueMode],
  );

  const orderedCategories = useMemo(
    () =>
      orderCategories(categories),
    [categories],
  );

  const fieldPackOptions = useMemo(
    () =>
      availableFieldPacks(
        businessTypeCode,
        form.itemType,
      ),
    [
      businessTypeCode,
      form.itemType,
    ],
  );

  const selectedFieldPack = useMemo(
    () =>
      fieldPackOptions.find(
        (pack) =>
          pack.code
          === fieldPackCode,
      )
      ?? defaultFieldPack(
        businessTypeCode,
        form.itemType,
      ),
    [
      businessTypeCode,
      fieldPackCode,
      fieldPackOptions,
      form.itemType,
    ],
  );

  const recommendedPacks = useMemo(
    () =>
      fieldPackOptions.filter(
        (pack) =>
          pack.recommendedBusinessTypes.includes(
            businessTypeCode,
          ),
      ),
    [
      businessTypeCode,
      fieldPackOptions,
    ],
  );

  const otherPacks = useMemo(
    () =>
      fieldPackOptions.filter(
        (pack) =>
          !pack.recommendedBusinessTypes.includes(
            businessTypeCode,
          ),
      ),
    [
      businessTypeCode,
      fieldPackOptions,
    ],
  );

  const quickStartCodes = useMemo(
    () =>
      fieldPackQuickStartCodes(
        fieldPackCode,
        13,
      ),
    [fieldPackCode],
  );

  const quickStartCodeSet = useMemo(
    () =>
      new Set(quickStartCodes),
    [quickStartCodes],
  );

  const quickStartAttributes = useMemo(
    () => {
      const byCode =
        new Map(
          attributes.map(
            (attribute) => [
              attribute.definition.code,
              attribute,
            ] as const,
          ),
        );

      return quickStartCodes
        .map(
          (code) =>
            byCode.get(code),
        )
        .filter(
          (
            attribute,
          ): attribute is AuthoringItemAttribute =>
            attribute !== undefined
            && attribute.definition.isActive,
        );
    },
    [attributes, quickStartCodes],
  );

  const attributeGroups = useMemo(
    () =>
      groupEditorAttributes(
        attributes,
        fieldPackCode,
        quickStartCodeSet,
      ),
    [
      attributes,
      fieldPackCode,
      quickStartCodeSet,
    ],
  );

  const normalDisplayCodes = useMemo(
    () =>
      new Set([
        ...quickStartCodes,
        ...attributeGroups.flatMap(
          (group) =>
            group.attributes.map(
              (attribute) =>
                attribute.definition.code,
            ),
        ),
      ]),
    [
      attributeGroups,
      quickStartCodes,
    ],
  );

  const compatibleAttributes = useMemo(
    () =>
      sortEditorAttributes(
        attributes.filter(
          (attribute) =>
            attribute.definition.code
              !== ITEM_TEMPLATE_ATTRIBUTE_CODE
            && attribute.definition.isActive
            && definitionAppliesToItem(
              attribute.definition,
              form.itemType,
            ),
        ),
      ),
    [attributes, form.itemType],
  );

  const extraAttributes = useMemo(
    () => {
      const selected =
        new Set(extraAttributeCodes);

      return compatibleAttributes.filter(
        (attribute) =>
          selected.has(
            attribute.definition.code,
          )
          && !normalDisplayCodes.has(
            attribute.definition.code,
          ),
      );
    },
    [
      compatibleAttributes,
      extraAttributeCodes,
      normalDisplayCodes,
    ],
  );

  const addSpecificationOptions = useMemo(
    () => {
      const selected =
        new Set(extraAttributeCodes);

      return compatibleAttributes.filter(
        (attribute) =>
          !normalDisplayCodes.has(
            attribute.definition.code,
          )
          && !selected.has(
            attribute.definition.code,
          ),
      );
    },
    [
      compatibleAttributes,
      extraAttributeCodes,
      normalDisplayCodes,
    ],
  );

  const normalizedSpecSearch =
    specSearch.trim().toLowerCase();

  const searchResults = useMemo(
    () => {
      if (!normalizedSpecSearch) {
        return [];
      }

      return compatibleAttributes.filter(
        (attribute) => {
          const definition =
            attribute.definition;

          return [
            definition.label,
            definition.code,
            definition.unitHint ?? "",
          ].some(
            (value) =>
              value
                .toLowerCase()
                .includes(
                  normalizedSpecSearch,
                ),
          );
        },
      );
    },
    [
      compatibleAttributes,
      normalizedSpecSearch,
    ],
  );

  const hasSavedAttributeValues =
    initialAttributes.some(
      (attribute) =>
        attribute.value !== null
        && attribute.definition.code
          !== ITEM_TEMPLATE_ATTRIBUTE_CODE,
    );

  const typeLocked =
    types.length === 1
    || (
      currentItem !== null
      && hasSavedAttributeValues
    );

  useEffect(() => {
    setSpecSearch("");
    setShowAllFields(false);
    setAddSpecCode("");
  }, [fieldPackCode, form.itemType]);

  useEffect(() => {
    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function onKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key === "Escape"
        && !saving && !mediaBusy
      ) {
        onClose();
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
  }, [onClose, saving, mediaBusy]);

  useEffect(() => {
    let cancelled = false;

    async function loadAttributes() {
      setLoadingAttributes(true);
      setFormError(null);

      try {
        const definitionData =
          await authoringApi.attributes(
            organizationId,
            {
              appliesTo:
                form.itemType,
            },
          );

        let existing:
          AuthoringItemAttribute[] = [];

        if (currentItem !== null) {
          const existingData =
            await authoringApi.itemAttributes(
              organizationId,
              currentItem.id,
            );

          existing =
            existingData.attributes;
        }

        if (cancelled) {
          return;
        }

        const merged =
          mergeAttributeLists(
            definitionData.attributes,
            existing,
          );

        const savedTemplate =
          existing.find(
            (attribute) =>
              attribute.definition.code
              === ITEM_TEMPLATE_ATTRIBUTE_CODE,
          );

        const savedTemplateValue =
          savedTemplate?.value?.value;

        const nextPackCode =
          typeof savedTemplateValue
            === "string"
          && isFieldPackCode(
            savedTemplateValue,
          )
          && availableFieldPacks(
            businessTypeCode,
            form.itemType,
          ).some(
            (pack) =>
              pack.code
              === savedTemplateValue,
          )
            ? savedTemplateValue
            : defaultFieldPack(
                businessTypeCode,
                form.itemType,
              ).code;

        setFieldPackCode(
          nextPackCode,
        );
        setInitialAttributes(
          existing,
        );
        setAttributes(merged);
        setAttributeDrafts(
          buildAttributeDrafts(
            merged,
          ),
        );
      } catch (error) {
        if (!cancelled) {
          setFormError(
            friendlyError(error),
          );
          setAttributes([]);
          setAttributeDrafts({});
        }
      } finally {
        if (!cancelled) {
          setLoadingAttributes(false);
        }
      }
    }

    void loadAttributes();

    return () => {
      cancelled = true;
    };
  }, [
    businessTypeCode,
    currentItem?.id,
    form.itemType,
    organizationId,
  ]);

  function setAttributeDraft(
    definitionId: string,
    patch: Partial<AttributeDraft>,
  ) {
    setAttributeDrafts(
      (current) => ({
        ...current,
        [definitionId]: {
          ...(current[definitionId]
            ?? {
              input: "",
              isVisible: true,
              version: null,
              hadValue: false,
            }),
          ...patch,
        },
      }),
    );

    if (
      patch.input !== undefined
      && patch.input.trim() !== ""
    ) {
      const attribute =
        attributes.find(
          (candidate) =>
            candidate.definition.id
            === definitionId,
        );

      const code =
        attribute?.definition.code;

      if (
        code
        && code !== ITEM_TEMPLATE_ATTRIBUTE_CODE
        && !normalDisplayCodes.has(code)
      ) {
        setExtraAttributeCodes(
          (current) =>
            current.includes(code)
              ? current
              : [...current, code],
        );
      }
    }
  }

  async function saveAttributes(
    savedItem: AuthoringItem,
  ) {
    const selectedCodes =
      fieldPackAttributeCodes(
        fieldPackCode,
      );

    const templateAttribute =
      attributes.find(
        (attribute) =>
          attribute.definition.code
          === ITEM_TEMPLATE_ATTRIBUTE_CODE,
      );

    if (!templateAttribute) {
      throw new Error(
        "Item template metadata is unavailable.",
      );
    }

    const templateDraft =
      attributeDrafts[
        templateAttribute.definition.id
      ] ?? {
        input: "",
        isVisible: false,
        version: null,
        hadValue: false,
      };

    await authoringApi
      .setItemAttribute(
        organizationId,
        savedItem.id,
        templateAttribute.definition.id,
        {
          value:
            fieldPackCode,
          version:
            templateDraft.version,
          sortOrder: 0,
          isVisible: false,
        },
      );

    for (const attribute of attributes) {
      if (
        attribute.definition.code
        === ITEM_TEMPLATE_ATTRIBUTE_CODE
      ) {
        continue;
      }

      if (
        !definitionAppliesToItem(
          attribute.definition,
          savedItem.itemType,
        )
      ) {
        continue;
      }

      const draft =
        attributeDrafts[
          attribute.definition.id
        ] ?? {
          input: "",
          isVisible: true,
          version: null,
          hadValue: false,
        };

      const shouldManage =
        attribute.definition
          .source === "custom"
        || attribute.definition
          .isSuggested
        || selectedCodes.has(
          attribute.definition.code,
        )
        || attribute.value !== null
        || draft.input.trim() !== "";

      if (!shouldManage) {
        continue;
      }

      const parsed =
        parseAttributeInput(
          attribute.definition,
          draft.input,
        );

      if (parsed.kind === "invalid") {
        throw new Error(
          parsed.message,
        );
      }

      if (parsed.kind === "empty") {
        if (
          attribute.definition
            .isRequired
        ) {
          throw new Error(
            `${attribute.definition.label} is required.`,
          );
        }

        if (
          draft.hadValue
          && draft.version !== null
        ) {
          await authoringApi
            .deleteItemAttribute(
              organizationId,
              savedItem.id,
              attribute.definition.id,
              draft.version,
            );
        }

        continue;
      }

      await authoringApi
        .setItemAttribute(
          organizationId,
          savedItem.id,
          attribute.definition.id,
          {
            value:
              parsed.value,
            version:
              draft.version,
            sortOrder:
              attribute.definition
                .suggestedSortOrder
              ?? attribute.definition
                .sortOrder,
            isVisible:
              draft.isVisible,
          },
        );
    }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving || mediaBusy) {
      return;
    }

    const name = form.name.trim();
    const slug = form.slug.trim();
    const sku = form.sku.trim();
    const shortDescription =
      form.shortDescription.trim();
    const longDescription =
      form.longDescription.trim();
    const currencyCode =
      form.currencyCode
        .trim()
        .toUpperCase();
    const sortOrder =
      Number(form.sortOrder);

    if (name.length === 0) {
      setFormError(
        "Item name is required.",
      );
      return;
    }

    if (
      currentItem !== null
      && slug.length === 0
    ) {
      setFormError(
        "URL slug cannot be empty when editing an item.",
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

    const price =
      parsePriceInput(
        form.price,
      );

    if (price.kind === "invalid") {
      setFormError(price.message);
      return;
    }

    if (
      price.kind === "value"
      && !/^[A-Z]{3}$/.test(
        currencyCode,
      )
    ) {
      setFormError(
        "Currency must be a three-letter code such as INR, USD, or EUR.",
      );
      return;
    }

    if (
      form.showPrice
      && price.kind === "empty"
    ) {
      setFormError(
        "Enter a price before enabling Show price.",
      );
      return;
    }

    for (const attribute of attributes) {
      if (
        !definitionAppliesToItem(
          attribute.definition,
          form.itemType,
        )
      ) {
        continue;
      }

      const draft =
        attributeDrafts[
          attribute.definition.id
        ];

      const parsed =
        parseAttributeInput(
          attribute.definition,
          draft?.input ?? "",
        );

      if (parsed.kind === "invalid") {
        setFormError(
          parsed.message,
        );
        return;
      }

      if (
        parsed.kind === "empty"
        && attribute.definition
          .isRequired
      ) {
        setFormError(
          `${attribute.definition.label} is required.`,
        );
        return;
      }
    }

    setSaving(true);
    setFormError(null);

    let savedItem:
      AuthoringItem | null = null;

    try {
      mediaRef.current?.validate();
      const common = {
        itemType:
          form.itemType,
        name,
        ...(slug.length > 0
          ? { slug }
          : {}),
        sku:
          sku.length > 0
            ? sku
            : null,
        categoryId:
          form.categoryId.length > 0
            ? form.categoryId
            : null,
        shortDescription:
          shortDescription.length > 0
            ? shortDescription
            : null,
        longDescription:
          longDescription.length > 0
            ? longDescription
            : null,
        priceMinorUnits:
          price.kind === "value"
            ? price.priceMinorUnits
            : null,
        currencyCode:
          price.kind === "value"
            ? currencyCode
            : null,
        showPrice:
          price.kind === "value"
            ? form.showPrice
            : false,
        status:
          form.status,
        isFeatured:
          form.isFeatured,
        sortOrder,
      };

      if (currentItem === null) {
        const result =
          await authoringApi.createItem(
            organizationId,
            common,
          );

        savedItem = result.item;
      } else {
        const result =
          await authoringApi.updateItem(
            organizationId,
            currentItem.id,
            {
              version:
                currentItem.version,
              ...common,
            },
          );

        savedItem = result.item;
      }

      setCurrentItem(savedItem);
      setForm(
        formFromItem(
          savedItem,
          catalogueMode,
        ),
      );

      await saveAttributes(
        savedItem,
      );

      await mediaRef.current?.save(savedItem.id);
      await onSaved(savedItem);
    } catch (error) {
      if (savedItem !== null) {
        try {
          const [
            definitionData,
            refreshed,
          ] = await Promise.all([
            authoringApi.attributes(
              organizationId,
              {
                appliesTo:
                  savedItem.itemType,
              },
            ),
            authoringApi.itemAttributes(
              organizationId,
              savedItem.id,
            ),
          ]);

          const merged =
            mergeAttributeLists(
              definitionData.attributes,
              refreshed.attributes,
            );

          const savedTemplate =
            refreshed.attributes.find(
              (attribute) =>
                attribute.definition.code
                === ITEM_TEMPLATE_ATTRIBUTE_CODE,
            );

          const savedTemplateValue =
            savedTemplate?.value?.value;

          if (
            typeof savedTemplateValue
              === "string"
            && isFieldPackCode(
              savedTemplateValue,
            )
          ) {
            setFieldPackCode(
              savedTemplateValue,
            );
          }

          setInitialAttributes(
            refreshed.attributes,
          );
          setAttributes(merged);
          setAttributeDrafts(
            buildAttributeDrafts(
              merged,
            ),
          );
        } catch {
          // Preserve the primary save error.
        }
      }

      setFormError(
        savedItem !== null
          ? `Item details were saved, but media or specifications need attention. ${friendlyError(error)}`
          : friendlyError(error),
      );
    } finally {
      setSaving(false);
    }
  }

  function renderAttributeInput(
    attribute: AuthoringItemAttribute,
  ) {
    const definition =
      attribute.definition;

    const draft =
      attributeDrafts[
        definition.id
      ] ?? {
        input: "",
        isVisible: true,
        version: null,
        hadValue: false,
      };

    if (
      definition.dataType
      === "boolean"
    ) {
      return (
        <select
          id={`specification-${definition.id}`}
          value={draft.input}
          onChange={(event) =>
            setAttributeDraft(
              definition.id,
              {
                input:
                  event.target.value,
              },
            )
          }
          className={inputClassName()}
        >
          <option value="">
            Not set
          </option>
          <option value="true">
            Yes
          </option>
          <option value="false">
            No
          </option>
        </select>
      );
    }

    return (
      <input
        id={`specification-${definition.id}`}
        type={
          definition.dataType
            === "number"
            ? "number"
            : definition.dataType
                === "date"
              ? "date"
              : definition.dataType
                  === "url"
                ? "url"
                : "text"
        }
        step={
          definition.dataType
            === "number"
            ? "any"
            : undefined
        }
        value={draft.input}
        onChange={(event) =>
          setAttributeDraft(
            definition.id,
            {
              input:
                event.target.value,
            },
          )
        }
        placeholder={
          definition.dataType
            === "url"
            ? "https://..."
            : "Not set"
        }
        className={inputClassName()}
      />
    );
  }

  function attributeCompleted(
    attribute: AuthoringItemAttribute,
  ): boolean {
    const draft =
      attributeDrafts[
        attribute.definition.id
      ];

    return Boolean(
      draft?.input.trim(),
    );
  }

  function completedCount(
    list: AuthoringItemAttribute[],
  ): number {
    return list.filter(
      attributeCompleted,
    ).length;
  }

  function renderAttributeCard(
    attribute: AuthoringItemAttribute,
  ) {
    const definition =
      attribute.definition;

    const draft =
      attributeDrafts[
        definition.id
      ];

    return (
      <div
        key={definition.id}
        className="rounded-xl border border-[#e1e7e4] bg-[#fbfcfb] p-3.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={`specification-${definition.id}`}
                className="text-xs font-bold text-[#344047]"
              >
                {definition.label}
                {definition.isRequired && (
                  <span className="ml-1 text-[#8a2f25]">
                    *
                  </span>
                )}
              </label>
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[#98a19d]">
                {definition.source
                  === "custom"
                  ? "Custom"
                  : definition.isSuggested
                    ? "Business"
                    : "Template"}
              </span>
            </div>

            <div className="mt-1 text-[9px] text-[#a0aaa5]">
              {definition.dataType}
              {definition.unitHint
                ? ` - ${definition.unitHint}`
                : ""}
            </div>
          </div>

          <label
            title="Show this specification on the public catalogue"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e1e7e4] bg-white px-2 py-1 text-[9px] font-bold text-[#74807b]"
          >
            <input
              type="checkbox"
              aria-label={`Show ${definition.label} publicly`}
              checked={
                draft?.isVisible
                ?? true
              }
              onChange={(event) =>
                setAttributeDraft(
                  definition.id,
                  {
                    isVisible:
                      event.target.checked,
                  },
                )
              }
              className="size-3.5 accent-[#7eac43]"
            />
            Public
          </label>
        </div>

        {renderAttributeInput(
          attribute,
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#081014]/45 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target
          === event.currentTarget
          && !saving && !mediaBusy
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col bg-white shadow-[-20px_0_60px_rgba(8,16,20,0.16)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e7ece9] px-5 py-5 sm:px-7">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.13em] text-[#789c45]">
              {currentItem
                ? "Edit item"
                : "New item"}
            </div>
            <h2
              id="item-editor-title"
              className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#0b1519]"
            >
              {currentItem?.name
                || "Create catalogue item"}
            </h2>
            {currentItem && (
              <p className="mt-1 text-xs text-[#87928d]">
                Version {currentItem.version}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={saving || mediaBusy}
            onClick={onClose}
            aria-label="Close item editor"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dfe5e2] bg-white text-xl leading-none text-[#66736e] disabled:opacity-50"
          >
            x
          </button>
        </div>

        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {formError && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-[#efc7c1] bg-[#fff8f6] px-4 py-3 text-sm leading-6 text-[#8a2f25]"
              >
                {formError}
              </div>
            )}

            <section>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#87928d]">
                Item details
              </div>

              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <label className="text-xs font-bold text-[#344047] sm:col-span-2">
                  Item name
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
                            event.target.value,
                        }),
                      )
                    }
                    placeholder="e.g. Industrial Centrifugal Pump"
                    className={inputClassName()}
                  />
                </label>

                <label className="text-xs font-bold text-[#344047]">
                  Type
                  <select
                    value={
                      form.itemType
                    }
                    disabled={
                      typeLocked
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          itemType:
                            event.target
                              .value as AuthoringItemType,
                        }),
                      )
                    }
                    className={[
                      inputClassName(),
                      typeLocked
                        ? "cursor-not-allowed bg-[#f4f6f5] text-[#7a8782]"
                        : "",
                    ].join(" ")}
                  >
                    {types.map(
                      (itemType) => (
                        <option
                          key={itemType}
                          value={itemType}
                        >
                          {itemType
                            === "product"
                            ? "Product"
                            : "Service"}
                        </option>
                      ),
                    )}
                  </select>
                  {currentItem
                  && hasSavedAttributeValues
                  && types.length > 1 && (
                    <span className="mt-2 block text-[11px] font-normal leading-5 text-[#87928d]">
                      Type is locked while this item has saved specification values.
                    </span>
                  )}
                </label>

                <label className="text-xs font-bold text-[#344047]">
                  Category
                  <select
                    value={
                      form.categoryId
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          categoryId:
                            event.target.value,
                        }),
                      )
                    }
                    className={inputClassName()}
                  >
                    <option value="">
                      Uncategorized
                    </option>
                    {orderedCategories.map(
                      (category) => (
                        <option
                          key={category.id}
                          value={category.id}
                        >
                          {category.parentId
                            ? `- ${category.name}`
                            : category.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="text-xs font-bold text-[#344047]">
                  URL slug
                  <input
                    value={form.slug}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          slug:
                            event.target.value,
                        }),
                      )
                    }
                    placeholder={
                      currentItem
                        ? "Item URL slug"
                        : "Generated from the name"
                    }
                    className={inputClassName()}
                  />
                </label>

                <label className="text-xs font-bold text-[#344047]">
                  SKU
                  <input
                    value={form.sku}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          sku:
                            event.target.value,
                        }),
                      )
                    }
                    placeholder="Optional internal code"
                    className={inputClassName()}
                  />
                </label>

                <label className="text-xs font-bold text-[#344047] sm:col-span-2">
                  Short description
                  <textarea
                    rows={3}
                    value={
                      form.shortDescription
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          shortDescription:
                            event.target.value,
                        }),
                      )
                    }
                    placeholder="A concise summary for catalogue cards"
                    className={textAreaClassName()}
                  />
                </label>

                <label className="text-xs font-bold text-[#344047] sm:col-span-2">
                  Full description
                  <textarea
                    rows={7}
                    value={
                      form.longDescription
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          longDescription:
                            event.target.value,
                        }),
                      )
                    }
                    placeholder="Detailed product or service information"
                    className={textAreaClassName()}
                  />
                </label>
              </div>
            </section>

            <details className="mt-7 rounded-2xl border border-[#e1e7e4] bg-[#fbfcfb] p-4">
              <summary className="cursor-pointer text-sm font-bold text-[#344047]">
                Pricing and display
              </summary>
              <p className="mt-3 text-xs leading-5 text-[#74807b]">
                Configure the price and authoring status. Publishing to your public catalogue remains a separate action.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-[#344047]">
                  Price
                  <input
                    inputMode="decimal"
                    value={form.price}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        price: event.target.value,
                      }))
                    }
                    placeholder="e.g. 1250.50"
                    className={inputClassName()}
                  />
                </label>
                <label className="text-xs font-bold text-[#344047]">
                  Currency
                  <input
                    value={form.currencyCode}
                    maxLength={3}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currencyCode: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="INR"
                    className={inputClassName()}
                  />
                </label>
                <label className="text-xs font-bold text-[#344047]">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as AuthoringItemStatus,
                      }))
                    }
                    className={inputClassName()}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published source</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-[#344047]">
                  Display order
                  <input
                    type="number"
                    min={0}
                    max={1_000_000}
                    step={1}
                    value={form.sortOrder}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sortOrder: event.target.value,
                      }))
                    }
                    className={inputClassName()}
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#344047]">
                  <input
                    type="checkbox"
                    checked={form.showPrice}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        showPrice: event.target.checked,
                      }))
                    }
                    className="size-4 accent-[#7eac43]"
                  />
                  Show price
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#344047]">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        isFeatured: event.target.checked,
                      }))
                    }
                    className="size-4 accent-[#7eac43]"
                  />
                  Featured item
                </label>
              </div>
            </details>

            <ItemMediaEditor ref={mediaRef} organizationId={organizationId}
              itemId={initialMediaItemId.current} disabled={saving} onBusy={setMediaBusy} />

            <section className="mt-7 border-t border-[#e7ece9] pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#87928d]">
                    Specifications and custom fields
                  </div>
                  <p className="mt-2 max-w-xl text-xs leading-5 text-[#74807b]">
                    Start with the closest item template. Recommended fields stay upfront, while the complete field library remains available through groups, search, and Add specification.
                  </p>
                </div>
                {loadingAttributes && (
                  <span className="size-4 animate-spin rounded-full border-2 border-[#d8e3d1] border-t-[#789c45]" />
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-[#dfe6e2] bg-[#f8faf9] p-4">
                <label className="text-xs font-bold text-[#344047]">
                  Item template
                  <select
                    value={fieldPackCode}
                    disabled={loadingAttributes}
                    onChange={(event) =>
                      setFieldPackCode(
                        event.target.value,
                      )
                    }
                    className={inputClassName()}
                  >
                    {recommendedPacks.length > 0 && (
                      <optgroup label="Recommended for your business">
                        {recommendedPacks.map(
                          (pack) => (
                            <option
                              key={pack.code}
                              value={pack.code}
                            >
                              {pack.name}
                            </option>
                          ),
                        )}
                      </optgroup>
                    )}
                    {otherPacks.length > 0 && (
                      <optgroup
                        label={
                          form.itemType === "service"
                            ? "Other service templates"
                            : "Other product templates"
                        }
                      >
                        {otherPacks.map(
                          (pack) => (
                            <option
                              key={pack.code}
                              value={pack.code}
                            >
                              {pack.name}
                            </option>
                          ),
                        )}
                      </optgroup>
                    )}
                  </select>
                </label>

                <p className="mt-3 text-xs leading-5 text-[#74807b]">
                  {selectedFieldPack.description}
                </p>

                {selectedFieldPack.code
                  === "chemicals-raw-materials" && (
                  <div className="mt-3 rounded-xl border border-[#dbe7d0] bg-[#f5faef] px-3 py-2.5 text-[11px] leading-5 text-[#526346]">
                    Chemical identity, composition, physical properties, safety, transport, packaging, SDS, TDS, and COA fields remain available without forcing every field open at once.
                  </div>
                )}
              </div>

              {!loadingAttributes
              && compatibleAttributes.length === 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-[#d8e1dd] bg-[#fbfcfb] px-4 py-6 text-center text-xs leading-5 text-[#87928d]">
                  No fields are available for this item type.
                </div>
              )}

              {!loadingAttributes
              && compatibleAttributes.length > 0 && (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-[#344047]">
                      Search specifications
                      <input
                        type="search"
                        value={specSearch}
                        onChange={(event) =>
                          setSpecSearch(
                            event.target.value,
                          )
                        }
                        placeholder="Search CAS, density, warranty, voltage..."
                        className={inputClassName()}
                      />
                    </label>

                    <div className="text-xs font-bold text-[#344047]">
                      Add specification
                      <div className="mt-2 flex gap-2">
                        <select
                          value={addSpecCode}
                          onChange={(event) =>
                            setAddSpecCode(
                              event.target.value,
                            )
                          }
                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d8e1dd] bg-white px-3 text-xs font-medium text-[#344047] outline-none transition focus:border-[#9aba70] focus:ring-2 focus:ring-[#baf16d]/30"
                        >
                          <option value="">
                            Choose another field
                          </option>
                          {addSpecificationOptions.map(
                            (attribute) => (
                              <option
                                key={attribute.definition.id}
                                value={attribute.definition.code}
                              >
                                {attribute.definition.label}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          type="button"
                          disabled={!addSpecCode}
                          onClick={() => {
                            if (!addSpecCode) {
                              return;
                            }

                            setExtraAttributeCodes(
                              (current) =>
                                current.includes(
                                  addSpecCode,
                                )
                                  ? current
                                  : [
                                      ...current,
                                      addSpecCode,
                                    ],
                            );
                            setAddSpecCode("");
                          }}
                          className="h-11 shrink-0 rounded-xl border border-[#d8e1dd] bg-white px-3 text-xs font-bold text-[#344047] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e9e6] bg-[#fbfcfb] px-3 py-2.5">
                    <p className="text-[10px] leading-4 text-[#87928d]">
                      Recommended fields keep day-to-day entry short. Use search or Add specification for anything else.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSpecSearch("");
                        setShowAllFields(
                          (current) => !current,
                        );
                      }}
                      className="rounded-lg border border-[#dfe5e2] bg-white px-3 py-1.5 text-[10px] font-bold text-[#52605a]"
                    >
                      {showAllFields
                        ? "Use guided view"
                        : `Show all ${compatibleAttributes.length} fields`}
                    </button>
                  </div>

                  {normalizedSpecSearch && (
                    <div className="mt-4 rounded-2xl border border-[#e1e7e4] bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-[#344047]">
                            Search results
                          </div>
                          <p className="mt-1 text-[10px] text-[#87928d]">
                            Matching fields from the complete compatible library.
                          </p>
                        </div>
                        <span className="rounded-md bg-[#f4f7f5] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#87928d]">
                          {searchResults.length} matches
                        </span>
                      </div>

                      {searchResults.length > 0 ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {searchResults.map(
                            renderAttributeCard,
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-[#d8e1dd] bg-[#fbfcfb] px-4 py-5 text-center text-xs text-[#87928d]">
                          No matching specification was found.
                        </div>
                      )}
                    </div>
                  )}

                  {!normalizedSpecSearch
                  && showAllFields && (
                    <div className="mt-4 rounded-2xl border border-[#e1e7e4] bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-[#344047]">
                            All compatible fields
                          </div>
                          <p className="mt-1 text-[10px] text-[#87928d]">
                            Power-user view. Empty fields are not saved unless they are required by the selected template.
                          </p>
                        </div>
                        <span className="rounded-md bg-[#f4f7f5] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#87928d]">
                          {completedCount(
                            compatibleAttributes,
                          )} of {compatibleAttributes.length} completed
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {compatibleAttributes.map(
                          renderAttributeCard,
                        )}
                      </div>
                    </div>
                  )}

                  {!normalizedSpecSearch
                  && !showAllFields && (
                    <>
                      {quickStartAttributes.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-[#dce8d1] bg-[#f8fbf5] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold text-[#344047]">
                                Recommended fields
                              </div>
                              <p className="mt-1 text-[10px] leading-4 text-[#74807b]">
                                High-value fields for a fast, useful catalogue entry. Complete only what applies.
                              </p>
                            </div>
                            <span className="rounded-md bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#789c45]">
                              {completedCount(
                                quickStartAttributes,
                              )} of {quickStartAttributes.length} completed
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {quickStartAttributes.map(
                              renderAttributeCard,
                            )}
                          </div>
                        </div>
                      )}

                      {extraAttributes.length > 0 && (
                        <details
                          open
                          className="mt-4 overflow-hidden rounded-2xl border border-[#e1e7e4] bg-white"
                        >
                          <summary className="cursor-pointer list-none bg-[#f8faf9] px-4 py-3 text-xs font-bold text-[#344047]">
                            <span className="flex items-center justify-between gap-3">
                              <span>
                                Additional specifications
                              </span>
                              <span className="rounded-md bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#87928d]">
                                {completedCount(
                                  extraAttributes,
                                )} of {extraAttributes.length} completed
                              </span>
                            </span>
                          </summary>
                          <div className="grid gap-3 border-t border-[#e7ece9] p-3 sm:grid-cols-2 sm:p-4">
                            {extraAttributes.map(
                              renderAttributeCard,
                            )}
                          </div>
                        </details>
                      )}

                      <div className="mt-4 space-y-3">
                        {attributeGroups.map(
                          (group) => (
                            <details
                              key={group.code}
                              className="overflow-hidden rounded-2xl border border-[#e1e7e4] bg-white"
                            >
                              <summary className="cursor-pointer list-none bg-[#f8faf9] px-4 py-3 text-xs font-bold text-[#344047]">
                                <span className="flex items-center justify-between gap-3">
                                  <span>
                                    {group.label}
                                  </span>
                                  <span className="rounded-md bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#87928d]">
                                    {completedCount(
                                      group.attributes,
                                    )} of {group.attributes.length} completed
                                  </span>
                                </span>
                              </summary>

                              <div className="grid gap-3 border-t border-[#e7ece9] p-3 sm:grid-cols-2 sm:p-4">
                                {group.attributes.map(
                                  renderAttributeCard,
                                )}
                              </div>
                            </details>
                          ),
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>

          </div>

          <div className="shrink-0 border-t border-[#e7ece9] bg-white px-5 py-4 shadow-[0_-10px_30px_rgba(8,16,20,0.06)] sm:px-7">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving || mediaBusy}
                onClick={onClose}
                className="h-11 rounded-xl border border-[#d8e1dd] bg-white px-4 text-sm font-bold text-[#344047] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  saving
                  || mediaBusy
                  || loadingAttributes
                }
                className="h-11 rounded-xl bg-[#0b1519] px-5 text-sm font-bold text-white transition hover:bg-[#152126] disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : currentItem
                    ? "Save changes"
                    : "Create item"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
