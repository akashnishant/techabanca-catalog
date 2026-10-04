import type {
  AuthoringItemAttribute,
  AuthoringItemType,
} from "./authoring-api";

export type FieldPackSection = {
  code: string;
  label: string;
  attributeCodes: string[];
};

export type FieldPack = {
  code: string;
  name: string;
  description: string;
  itemType: AuthoringItemType;
  recommendedBusinessTypes: string[];
  sections: FieldPackSection[];
};

export type EditorAttributeGroup = {
  code: string;
  label: string;
  attributes: AuthoringItemAttribute[];
};

export const ITEM_TEMPLATE_ATTRIBUTE_CODE =
  "item-template";

export const FIELD_PACKS: FieldPack[] = [
  {
    code: "general-product",
    name: "General Product",
    description: "A flexible product template for general merchandise and mixed catalogues.",
    itemType: "product",
    recommendedBusinessTypes: ["retailer", "other"],
    sections: [
      {
        code: "identity",
        label: "Identity & Codes",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "model",
          "manufacturer-part-number",
          "product-code",
          "gtin-barcode",
          "hsn-hs-code",
          "origin-country",
        ],
      },
      {
        code: "product",
        label: "Product Details",
        attributeCodes: [
          "material",
          "size",
          "color",
          "dimensions",
          "net-weight",
          "condition",
          "applications",
        ],
      },
      {
        code: "commercial",
        label: "Commercial & Supply",
        attributeCodes: [
          "unit-of-measure",
          "net-quantity",
          "pack-size",
          "pack-quantity",
          "packaging-type",
          "minimum-order-quantity",
          "order-multiple",
          "lead-time",
          "delivery-time",
        ],
      },
      {
        code: "support",
        label: "Warranty & Documents",
        attributeCodes: [
          "warranty",
          "package-contents",
          "certifications",
          "standards-compliance",
          "datasheet-url",
          "manual-url",
          "certificate-url",
        ],
      },
      {
        code: "care",
        label: "Storage & Care",
        attributeCodes: [
          "shelf-life",
          "storage-conditions",
          "care-instructions",
        ],
      }
    ],
  },
  {
    code: "manufactured-product",
    name: "Manufactured Product",
    description: "For finished goods produced or assembled by a manufacturer.",
    itemType: "product",
    recommendedBusinessTypes: ["manufacturer"],
    sections: [
      {
        code: "identity",
        label: "Identity & Codes",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "model",
          "manufacturer-part-number",
          "product-code",
          "gtin-barcode",
          "hsn-hs-code",
          "origin-country",
        ],
      },
      {
        code: "construction",
        label: "Construction & Physical",
        attributeCodes: [
          "material",
          "grade",
          "size",
          "dimensions",
          "net-weight",
          "gross-weight",
          "color",
          "finish",
          "tolerance",
        ],
      },
      {
        code: "technical",
        label: "Technical Specifications",
        attributeCodes: [
          "capacity",
          "power",
          "voltage",
          "current-rating",
          "frequency",
          "phase",
          "operating-temperature",
          "operating-pressure",
          "flow-rate",
          "rpm",
          "torque",
          "efficiency",
          "accuracy",
          "ip-rating",
          "duty-cycle",
          "connection-size",
          "connection-type",
          "mounting-type",
        ],
      },
      {
        code: "commercial",
        label: "Commercial & Supply",
        attributeCodes: [
          "unit-of-measure",
          "pack-size",
          "pack-quantity",
          "packaging-type",
          "minimum-order-quantity",
          "order-multiple",
          "lead-time",
          "delivery-time",
          "customization-available",
        ],
      },
      {
        code: "compliance",
        label: "Applications & Compliance",
        attributeCodes: [
          "applications",
          "certifications",
          "standards-compliance",
        ],
      },
      {
        code: "support",
        label: "Warranty & Documents",
        attributeCodes: [
          "warranty",
          "package-contents",
          "datasheet-url",
          "manual-url",
          "certificate-url",
        ],
      }
    ],
  },
  {
    code: "wholesale-product",
    name: "Wholesale / Distribution Product",
    description: "For traded, stocked, imported, or distributed products.",
    itemType: "product",
    recommendedBusinessTypes: ["wholesale-distribution"],
    sections: [
      {
        code: "identity",
        label: "Identity & Supply Codes",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "manufacturer-part-number",
          "model",
          "product-code",
          "gtin-barcode",
          "hsn-hs-code",
          "origin-country",
        ],
      },
      {
        code: "trade",
        label: "Trade & Ordering",
        attributeCodes: [
          "unit-of-measure",
          "net-quantity",
          "pack-size",
          "pack-quantity",
          "packaging-type",
          "minimum-order-quantity",
          "order-multiple",
          "lead-time",
          "delivery-time",
        ],
      },
      {
        code: "product",
        label: "Product Details",
        attributeCodes: [
          "material",
          "grade",
          "size",
          "color",
          "dimensions",
          "net-weight",
          "gross-weight",
          "condition",
          "applications",
        ],
      },
      {
        code: "support",
        label: "Warranty & Documentation",
        attributeCodes: [
          "warranty",
          "certifications",
          "standards-compliance",
          "datasheet-url",
          "manual-url",
          "certificate-url",
        ],
      }
    ],
  },
  {
    code: "industrial-equipment",
    name: "Industrial Equipment & Machinery",
    description: "For machines, pumps, motors, equipment, components, and technical industrial products.",
    itemType: "product",
    recommendedBusinessTypes: ["industrial", "manufacturer", "wholesale-distribution"],
    sections: [
      {
        code: "identity",
        label: "Identity & Codes",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "model",
          "manufacturer-part-number",
          "product-code",
          "hsn-hs-code",
          "origin-country",
        ],
      },
      {
        code: "mechanical",
        label: "Mechanical & Construction",
        attributeCodes: [
          "material",
          "grade",
          "dimensions",
          "net-weight",
          "gross-weight",
          "finish",
          "capacity",
          "flow-rate",
          "operating-pressure",
          "operating-temperature",
          "rpm",
          "torque",
          "load-capacity",
          "connection-size",
          "connection-type",
          "mounting-type",
        ],
      },
      {
        code: "electrical",
        label: "Electrical",
        attributeCodes: [
          "power",
          "voltage",
          "current-rating",
          "frequency",
          "phase",
          "efficiency",
          "ip-rating",
          "duty-cycle",
        ],
      },
      {
        code: "performance",
        label: "Performance & Accuracy",
        attributeCodes: [
          "accuracy",
          "tolerance",
          "applications",
        ],
      },
      {
        code: "commercial",
        label: "Commercial & Supply",
        attributeCodes: [
          "unit-of-measure",
          "pack-size",
          "minimum-order-quantity",
          "lead-time",
          "delivery-time",
          "customization-available",
        ],
      },
      {
        code: "compliance",
        label: "Compliance & Documents",
        attributeCodes: [
          "certifications",
          "standards-compliance",
          "warranty",
          "datasheet-url",
          "manual-url",
          "certificate-url",
        ],
      }
    ],
  },
  {
    code: "chemicals-raw-materials",
    name: "Chemicals & Raw Materials",
    description: "For chemicals, solvents, acids, additives, ingredients, reagents, and industrial raw materials.",
    itemType: "product",
    recommendedBusinessTypes: ["wholesale-distribution", "manufacturer", "industrial"],
    sections: [
      {
        code: "identity",
        label: "Chemical Identity",
        attributeCodes: [
          "chemical-name",
          "trade-name",
          "brand",
          "manufacturer-name",
          "synonyms",
          "cas-number",
          "ec-number",
          "chemical-formula",
          "molecular-weight",
          "hsn-hs-code",
          "origin-country",
        ],
      },
      {
        code: "quality",
        label: "Grade & Composition",
        attributeCodes: [
          "grade",
          "purity",
          "assay",
          "concentration",
          "physical-form",
          "appearance",
          "odor",
        ],
      },
      {
        code: "properties",
        label: "Physical & Chemical Properties",
        attributeCodes: [
          "ph",
          "density-specific-gravity",
          "viscosity",
          "solubility",
          "melting-freezing-point",
          "boiling-point",
          "flash-point",
        ],
      },
      {
        code: "usage",
        label: "Use & Handling",
        attributeCodes: [
          "recommended-use",
          "applications",
          "restrictions-on-use",
          "handling-instructions",
          "storage-conditions",
          "shelf-life",
        ],
      },
      {
        code: "safety",
        label: "Safety & Transport",
        attributeCodes: [
          "hazardous-material",
          "ghs-classification",
          "signal-word",
          "hazard-statements",
          "precautionary-statements",
          "un-number",
          "transport-hazard-class",
          "packing-group",
          "regulatory-information",
        ],
      },
      {
        code: "trade",
        label: "Packaging & Supply",
        attributeCodes: [
          "unit-of-measure",
          "net-quantity",
          "pack-size",
          "pack-quantity",
          "packaging-type",
          "minimum-order-quantity",
          "order-multiple",
          "lead-time",
          "delivery-time",
        ],
      },
      {
        code: "documents",
        label: "Quality & Technical Documents",
        attributeCodes: [
          "coa-available",
          "coa-url",
          "sds-url",
          "tds-url",
          "certificate-url",
          "certifications",
          "standards-compliance",
        ],
      }
    ],
  },
  {
    code: "food-beverage",
    name: "Food, Beverage & Ingredients",
    description: "For packaged foods, beverages, food ingredients, and menu products.",
    itemType: "product",
    recommendedBusinessTypes: ["food-restaurant", "retailer", "wholesale-distribution", "manufacturer"],
    sections: [
      {
        code: "identity",
        label: "Product Identity",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "product-code",
          "gtin-barcode",
          "hsn-hs-code",
          "flavour",
          "origin-country",
        ],
      },
      {
        code: "composition",
        label: "Ingredients & Dietary",
        attributeCodes: [
          "ingredients",
          "active-ingredients",
          "allergen-information",
          "dietary-info",
          "vegetarian",
          "vegan",
          "gluten-free",
          "organic",
          "additives-preservatives",
        ],
      },
      {
        code: "nutrition",
        label: "Nutrition",
        attributeCodes: [
          "nutrition-information",
          "serving-size",
          "calories",
          "protein",
          "carbohydrates",
          "fat",
        ],
      },
      {
        code: "serving",
        label: "Serving & Preparation",
        attributeCodes: [
          "cuisine",
          "spice-level",
          "portion-size",
          "preparation-instructions",
        ],
      },
      {
        code: "pack",
        label: "Pack & Storage",
        attributeCodes: [
          "net-quantity",
          "pack-size",
          "pack-quantity",
          "packaging-type",
          "shelf-life",
          "storage-conditions",
        ],
      },
      {
        code: "supply",
        label: "Supply",
        attributeCodes: [
          "unit-of-measure",
          "minimum-order-quantity",
          "lead-time",
          "delivery-time",
        ],
      },
      {
        code: "compliance",
        label: "Compliance",
        attributeCodes: [
          "food-license-info",
          "certifications",
          "standards-compliance",
          "certificate-url",
        ],
      }
    ],
  },
  {
    code: "fashion-apparel",
    name: "Fashion & Apparel",
    description: "For garments, fashion accessories, textiles, and footwear.",
    itemType: "product",
    recommendedBusinessTypes: ["fashion-apparel", "retailer", "wholesale-distribution", "manufacturer"],
    sections: [
      {
        code: "identity",
        label: "Identity & Style",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "style-code",
          "product-code",
          "gtin-barcode",
          "origin-country",
          "gender",
          "age-group",
          "season",
          "occasion",
        ],
      },
      {
        code: "variant",
        label: "Size & Variant",
        attributeCodes: [
          "size",
          "size-system",
          "fit",
          "color",
          "pattern",
          "garment-length",
          "waist-size",
          "inseam-length",
          "footwear-size",
          "footwear-width",
        ],
      },
      {
        code: "construction",
        label: "Material & Construction",
        attributeCodes: [
          "material",
          "fabric-composition",
          "sleeve-type",
          "neckline",
          "closure-type",
        ],
      },
      {
        code: "care",
        label: "Care & Packaging",
        attributeCodes: [
          "care-instructions",
          "net-quantity",
          "pack-size",
          "pack-quantity",
          "packaging-type",
        ],
      },
      {
        code: "supply",
        label: "Supply",
        attributeCodes: [
          "minimum-order-quantity",
          "order-multiple",
          "lead-time",
          "delivery-time",
        ],
      },
      {
        code: "support",
        label: "Documents",
        attributeCodes: [
          "certifications",
          "certificate-url",
        ],
      }
    ],
  },
  {
    code: "electronics",
    name: "Electronics & Electrical",
    description: "For consumer electronics, electrical products, devices, and accessories.",
    itemType: "product",
    recommendedBusinessTypes: ["electronics", "retailer", "wholesale-distribution", "manufacturer"],
    sections: [
      {
        code: "identity",
        label: "Identity & Codes",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "model",
          "manufacturer-part-number",
          "product-code",
          "gtin-barcode",
          "hsn-hs-code",
          "origin-country",
        ],
      },
      {
        code: "computing",
        label: "Core Specifications",
        attributeCodes: [
          "processor",
          "ram",
          "storage",
          "display-size",
          "display-resolution",
          "operating-system",
        ],
      },
      {
        code: "connectivity",
        label: "Connectivity & Interfaces",
        attributeCodes: [
          "connectivity",
          "ports",
          "wireless-standards",
          "compatibility",
        ],
      },
      {
        code: "power",
        label: "Power & Battery",
        attributeCodes: [
          "power",
          "voltage",
          "current-rating",
          "frequency",
          "battery-type",
          "battery-capacity",
          "battery-life",
          "charging-specification",
          "energy-rating",
        ],
      },
      {
        code: "physical",
        label: "Physical",
        attributeCodes: [
          "dimensions",
          "net-weight",
          "material",
          "color",
          "ip-rating",
        ],
      },
      {
        code: "support",
        label: "Warranty & Package",
        attributeCodes: [
          "warranty",
          "package-contents",
          "certifications",
          "standards-compliance",
          "manual-url",
          "datasheet-url",
        ],
      },
      {
        code: "supply",
        label: "Supply",
        attributeCodes: [
          "pack-size",
          "minimum-order-quantity",
          "lead-time",
          "delivery-time",
        ],
      }
    ],
  },
  {
    code: "furniture-home",
    name: "Furniture & Home",
    description: "For furniture, furnishings, decor, and home products.",
    itemType: "product",
    recommendedBusinessTypes: ["furniture-home", "retailer", "wholesale-distribution", "manufacturer"],
    sections: [
      {
        code: "identity",
        label: "Identity & Style",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "model",
          "product-code",
          "origin-country",
          "style",
          "room-use",
          "color",
          "pattern",
        ],
      },
      {
        code: "materials",
        label: "Materials & Finish",
        attributeCodes: [
          "material",
          "secondary-material",
          "finish",
          "upholstery",
          "filling-material",
        ],
      },
      {
        code: "dimensions",
        label: "Dimensions & Capacity",
        attributeCodes: [
          "size",
          "dimensions",
          "net-weight",
          "load-capacity",
          "seating-capacity",
        ],
      },
      {
        code: "setup",
        label: "Assembly & Care",
        attributeCodes: [
          "assembly-required",
          "installation-required",
          "care-instructions",
          "customization-available",
        ],
      },
      {
        code: "supply",
        label: "Packaging & Supply",
        attributeCodes: [
          "package-contents",
          "pack-size",
          "packaging-type",
          "minimum-order-quantity",
          "lead-time",
          "delivery-time",
        ],
      },
      {
        code: "support",
        label: "Warranty & Documents",
        attributeCodes: [
          "warranty",
          "certifications",
          "manual-url",
        ],
      }
    ],
  },
  {
    code: "automotive-parts",
    name: "Automotive Parts & Accessories",
    description: "For vehicle parts, accessories, consumables, and fitment-based products.",
    itemType: "product",
    recommendedBusinessTypes: ["automotive", "retailer", "wholesale-distribution", "manufacturer"],
    sections: [
      {
        code: "identity",
        label: "Identity & Part Numbers",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "manufacturer-part-number",
          "oem-number",
          "cross-reference-number",
          "product-code",
          "gtin-barcode",
          "hsn-hs-code",
          "origin-country",
        ],
      },
      {
        code: "fitment",
        label: "Vehicle Fitment",
        attributeCodes: [
          "compatibility",
          "compatible-make",
          "compatible-model",
          "compatible-year",
          "compatible-variant",
          "engine-type",
          "fuel-type",
          "transmission",
          "body-type",
          "position-side",
          "fitment-type",
        ],
      },
      {
        code: "spec",
        label: "Technical Details",
        attributeCodes: [
          "material",
          "dimensions",
          "net-weight",
          "electrical-rating",
          "voltage",
          "power",
        ],
      },
      {
        code: "installation",
        label: "Installation",
        attributeCodes: [
          "installation-required",
          "installation-notes",
        ],
      },
      {
        code: "supply",
        label: "Supply",
        attributeCodes: [
          "pack-size",
          "pack-quantity",
          "minimum-order-quantity",
          "lead-time",
          "delivery-time",
        ],
      },
      {
        code: "support",
        label: "Warranty & Compliance",
        attributeCodes: [
          "warranty",
          "certifications",
          "standards-compliance",
          "manual-url",
          "datasheet-url",
        ],
      }
    ],
  },
  {
    code: "beauty-personal-care",
    name: "Beauty & Personal Care",
    description: "For cosmetics, skincare, haircare, grooming, and personal-care products.",
    itemType: "product",
    recommendedBusinessTypes: ["beauty-wellness", "retailer", "wholesale-distribution", "manufacturer"],
    sections: [
      {
        code: "identity",
        label: "Product Identity",
        attributeCodes: [
          "brand",
          "manufacturer-name",
          "manufacturer-importer",
          "product-type",
          "gtin-barcode",
          "origin-country",
          "shade",
          "finish",
          "fragrance",
        ],
      },
      {
        code: "formula",
        label: "Formula & Ingredients",
        attributeCodes: [
          "ingredients",
          "active-ingredients",
          "active-concentration",
          "allergen-information",
        ],
      },
      {
        code: "suitability",
        label: "Suitability & Benefits",
        attributeCodes: [
          "benefits",
          "concerns",
          "skin-type",
          "hair-type",
          "spf",
          "pa-rating",
        ],
      },
      {
        code: "use",
        label: "Use & Safety",
        attributeCodes: [
          "directions-for-use",
          "usage-frequency",
          "warnings",
          "period-after-opening",
          "shelf-life",
          "storage-conditions",
        ],
      },
      {
        code: "claims",
        label: "Claims & Compliance",
        attributeCodes: [
          "vegan-claim",
          "cruelty-free-claim",
          "organic",
          "certifications",
          "standards-compliance",
        ],
      },
      {
        code: "pack",
        label: "Pack & Supply",
        attributeCodes: [
          "net-quantity",
          "pack-size",
          "pack-quantity",
          "packaging-type",
          "minimum-order-quantity",
          "lead-time",
          "delivery-time",
        ],
      }
    ],
  },
  {
    code: "professional-service",
    name: "Professional Service",
    description: "For consulting, technology, legal, accounting, design, marketing, and other professional services.",
    itemType: "service",
    recommendedBusinessTypes: ["professional-services", "other"],
    sections: [
      {
        code: "scope",
        label: "Service Scope",
        attributeCodes: [
          "service-category",
          "specialization",
          "industries-served",
          "deliverables",
          "inclusions",
          "exclusions",
          "prerequisites",
        ],
      },
      {
        code: "delivery",
        label: "Delivery & Engagement",
        attributeCodes: [
          "delivery-mode",
          "service-area",
          "duration",
          "delivery-time",
          "minimum-engagement",
          "revisions",
          "team-size",
          "support-period",
        ],
      },
      {
        code: "commercial",
        label: "Commercial",
        attributeCodes: [
          "pricing-model",
        ],
      },
      {
        code: "credentials",
        label: "Expertise & Credentials",
        attributeCodes: [
          "experience",
          "qualifications-certifications",
          "certifications",
          "languages",
        ],
      },
      {
        code: "contact",
        label: "Consultation & Portfolio",
        attributeCodes: [
          "consultation-available",
          "booking-url",
          "portfolio-url",
        ],
      }
    ],
  },
  {
    code: "wellness-service",
    name: "Beauty / Wellness Service",
    description: "For salon, spa, beauty, therapy, wellness, and appointment-based services.",
    itemType: "service",
    recommendedBusinessTypes: ["beauty-wellness"],
    sections: [
      {
        code: "scope",
        label: "Service Details",
        attributeCodes: [
          "service-category",
          "specialization",
          "benefits",
          "concerns",
          "prerequisites",
        ],
      },
      {
        code: "delivery",
        label: "Appointment & Delivery",
        attributeCodes: [
          "duration",
          "service-area",
          "delivery-mode",
          "consultation-available",
          "booking-url",
        ],
      },
      {
        code: "commercial",
        label: "Commercial",
        attributeCodes: [
          "pricing-model",
          "minimum-engagement",
        ],
      },
      {
        code: "credentials",
        label: "Practitioner & Safety",
        attributeCodes: [
          "experience",
          "qualifications-certifications",
          "certifications",
          "warnings",
        ],
      },
      {
        code: "support",
        label: "Aftercare & Support",
        attributeCodes: [
          "inclusions",
          "exclusions",
          "support-period",
        ],
      }
    ],
  },
  {
    code: "food-service",
    name: "Food / Catering Service",
    description: "For catering, meal plans, event food service, and restaurant service offerings.",
    itemType: "service",
    recommendedBusinessTypes: ["food-restaurant"],
    sections: [
      {
        code: "scope",
        label: "Service Details",
        attributeCodes: [
          "service-category",
          "cuisine",
          "dietary-info",
          "allergen-information",
          "deliverables",
          "inclusions",
          "exclusions",
        ],
      },
      {
        code: "delivery",
        label: "Service & Delivery",
        attributeCodes: [
          "service-area",
          "duration",
          "delivery-time",
          "delivery-mode",
          "minimum-engagement",
        ],
      },
      {
        code: "commercial",
        label: "Commercial",
        attributeCodes: [
          "pricing-model",
        ],
      },
      {
        code: "booking",
        label: "Booking",
        attributeCodes: [
          "consultation-available",
          "booking-url",
        ],
      }
    ],
  },
  {
    code: "general-service",
    name: "General Service",
    description: "A flexible service template for businesses outside the specialist service presets.",
    itemType: "service",
    recommendedBusinessTypes: ["manufacturer", "wholesale-distribution", "retailer", "industrial", "fashion-apparel", "electronics", "furniture-home", "automotive", "other"],
    sections: [
      {
        code: "scope",
        label: "Service Details",
        attributeCodes: [
          "service-category",
          "specialization",
          "deliverables",
          "inclusions",
          "exclusions",
          "prerequisites",
        ],
      },
      {
        code: "delivery",
        label: "Delivery",
        attributeCodes: [
          "service-area",
          "duration",
          "delivery-time",
          "delivery-mode",
          "minimum-engagement",
          "revisions",
          "support-period",
        ],
      },
      {
        code: "commercial",
        label: "Commercial",
        attributeCodes: [
          "pricing-model",
        ],
      },
      {
        code: "credentials",
        label: "Experience & Credentials",
        attributeCodes: [
          "experience",
          "qualifications-certifications",
          "certifications",
          "languages",
        ],
      },
      {
        code: "contact",
        label: "Consultation & Links",
        attributeCodes: [
          "consultation-available",
          "booking-url",
          "portfolio-url",
        ],
      }
    ],
  }
];

function attributeOrder(
  left: AuthoringItemAttribute,
  right: AuthoringItemAttribute,
): number {
  const leftOrder =
    left.definition.suggestedSortOrder
    ?? left.definition.sortOrder;

  const rightOrder =
    right.definition.suggestedSortOrder
    ?? right.definition.sortOrder;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.definition.label.localeCompare(
    right.definition.label,
    undefined,
    { sensitivity: "base" },
  );
}

export function availableFieldPacks(
  businessTypeCode: string,
  itemType: AuthoringItemType,
): FieldPack[] {
  return FIELD_PACKS
    .filter(
      (pack) =>
        pack.itemType === itemType,
    )
    .sort((left, right) => {
      const leftRecommended =
        left.recommendedBusinessTypes.includes(
          businessTypeCode,
        )
          ? 0
          : 1;
      const rightRecommended =
        right.recommendedBusinessTypes.includes(
          businessTypeCode,
        )
          ? 0
          : 1;

      if (
        leftRecommended
        !== rightRecommended
      ) {
        return leftRecommended
          - rightRecommended;
      }

      return left.name.localeCompare(
        right.name,
        undefined,
        { sensitivity: "base" },
      );
    });
}

export function defaultFieldPack(
  businessTypeCode: string,
  itemType: AuthoringItemType,
): FieldPack {
  const packs =
    availableFieldPacks(
      businessTypeCode,
      itemType,
    );

  const recommended =
    packs.find(
      (pack) =>
        pack.recommendedBusinessTypes.includes(
          businessTypeCode,
        ),
    );

  if (recommended) {
    return recommended;
  }

  const fallbackCode =
    itemType === "service"
      ? "general-service"
      : "general-product";

  const fallback =
    packs.find(
      (pack) =>
        pack.code === fallbackCode,
    );

  if (!fallback) {
    throw new Error(
      "field_pack_configuration_invalid",
    );
  }

  return fallback;
}

export function isFieldPackCode(
  value: string,
): boolean {
  return FIELD_PACKS.some(
    (pack) => pack.code === value,
  );
}

export function fieldPackAttributeCodes(
  packCode: string,
): Set<string> {
  const pack =
    FIELD_PACKS.find(
      (candidate) =>
        candidate.code === packCode,
    );

  return new Set(
    pack?.sections.flatMap(
      (section) =>
        section.attributeCodes,
    ) ?? [],
  );
}

const FIELD_PACK_QUICK_START_OVERRIDES:
  Record<string, string[]> = {
    "chemicals-raw-materials": [
      "chemical-name",
      "brand",
      "manufacturer-name",
      "cas-number",
      "grade",
      "purity",
      "pack-size",
      "minimum-order-quantity",
      "origin-country",
      "storage-conditions",
      "shelf-life",
      "sds-url",
      "coa-available",
    ],
  };

export function fieldPackQuickStartCodes(
  packCode: string,
  limit = 12,
): string[] {
  const pack =
    FIELD_PACKS.find(
      (candidate) =>
        candidate.code === packCode,
    );

  if (!pack || limit <= 0) {
    return [];
  }

  const allCodes =
    pack.sections.flatMap(
      (section) =>
        section.attributeCodes,
    );

  const available =
    new Set(allCodes);

  const override =
    FIELD_PACK_QUICK_START_OVERRIDES[
      packCode
    ];

  if (override) {
    return override
      .filter(
        (code) =>
          available.has(code),
      )
      .slice(0, limit);
  }

  const result: string[] = [];
  let depth = 0;

  while (result.length < limit) {
    let addedAtDepth = false;

    for (const section of pack.sections) {
      const code =
        section.attributeCodes[depth];

      if (
        code
        && !result.includes(code)
      ) {
        result.push(code);
        addedAtDepth = true;

        if (result.length >= limit) {
          break;
        }
      }
    }

    if (!addedAtDepth) {
      break;
    }

    depth += 1;
  }

  return result;
}

export function groupEditorAttributes(
  attributes: AuthoringItemAttribute[],
  packCode: string,
  excludedCodes: ReadonlySet<string> =
    new Set<string>(),
): EditorAttributeGroup[] {
  const pack =
    FIELD_PACKS.find(
      (candidate) =>
        candidate.code === packCode,
    );

  const byCode =
    new Map<
      string,
      AuthoringItemAttribute
    >(
      attributes.map(
        (attribute) => [
          attribute.definition.code,
          attribute,
        ] as const,
      ),
    );

  const assigned =
    new Set<string>(excludedCodes);

  const groups:
    EditorAttributeGroup[] = [];

  for (
    const section
    of pack?.sections ?? []
  ) {
    const sectionAttributes =
      section.attributeCodes
        .filter(
          (code) =>
            !excludedCodes.has(code),
        )
        .map(
          (code) => byCode.get(code),
        )
        .filter(
          (
            attribute,
          ): attribute is AuthoringItemAttribute =>
            attribute !== undefined
            && attribute.definition.isActive,
        );

    for (
      const attribute
      of sectionAttributes
    ) {
      assigned.add(
        attribute.definition.code,
      );
    }

    if (
      sectionAttributes.length > 0
    ) {
      groups.push({
        code:
          `pack-${section.code}`,
        label: section.label,
        attributes:
          sectionAttributes.sort(
            attributeOrder,
          ),
      });
    }
  }

  const businessEssentials =
    attributes
      .filter(
        (attribute) =>
          attribute.definition.code
            !== ITEM_TEMPLATE_ATTRIBUTE_CODE
          && !assigned.has(
            attribute.definition.code,
          )
          && attribute.definition
            .isActive
          && attribute.definition
            .isSuggested,
      )
      .sort(attributeOrder);

  for (
    const attribute
    of businessEssentials
  ) {
    assigned.add(
      attribute.definition.code,
    );
  }

  if (
    businessEssentials.length > 0
  ) {
    groups.push({
      code: "business-essentials",
      label: "Business essentials",
      attributes:
        businessEssentials,
    });
  }

  const custom =
    attributes
      .filter(
        (attribute) =>
          attribute.definition.code
            !== ITEM_TEMPLATE_ATTRIBUTE_CODE
          && !assigned.has(
            attribute.definition.code,
          )
          && attribute.definition
            .isActive
          && attribute.definition
            .source === "custom",
      )
      .sort(attributeOrder);

  for (
    const attribute
    of custom
  ) {
    assigned.add(
      attribute.definition.code,
    );
  }

  if (custom.length > 0) {
    groups.push({
      code: "custom",
      label: "Custom fields",
      attributes: custom,
    });
  }

  const otherSaved =
    attributes
      .filter(
        (attribute) =>
          attribute.definition.code
            !== ITEM_TEMPLATE_ATTRIBUTE_CODE
          && !assigned.has(
            attribute.definition.code,
          )
          && attribute.value !== null,
      )
      .sort(attributeOrder);

  if (otherSaved.length > 0) {
    groups.push({
      code: "other-saved",
      label: "Other saved specifications",
      attributes:
        otherSaved,
    });
  }

  return groups;
}
