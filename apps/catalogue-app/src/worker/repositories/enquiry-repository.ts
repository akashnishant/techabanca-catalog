import type { EnquiryStatus, TenantContext } from "@techabanca/domain";

export type EnquiryRecord = {
  id: number;
  publicId: string;
  catalogueId: number;
  itemId: number | null;
  source: "catalogue" | "item" | "contact";
  contactName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  message: string;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
  contactedAt: string | null;
  closedAt: string | null;
};

type EnquiryRow = {
  id: number;
  public_id: string;
  catalogue_id: number;
  item_id: number | null;
  source: "catalogue" | "item" | "contact";
  contact_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  message: string;
  status: EnquiryStatus;
  created_at: string;
  updated_at: string;
  contacted_at: string | null;
  closed_at: string | null;
};

export class EnquiryRepository {
  constructor(private readonly db: D1Database) {}

  async findByPublicId(
    tenant: TenantContext,
    enquiryPublicId: string,
  ): Promise<EnquiryRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           e.id,
           e.public_id,
           e.catalogue_id,
           e.item_id,
           e.source,
           e.contact_name,
           e.company_name,
           e.email,
           e.phone,
           e.message,
           e.status,
           e.created_at,
           e.updated_at,
           e.contacted_at,
           e.closed_at
         FROM enquiries e
         WHERE e.organization_id = ?
           AND e.public_id = ?
           AND e.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tenant.organizationId, enquiryPublicId)
      .first<EnquiryRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      publicId: row.public_id,
      catalogueId: row.catalogue_id,
      itemId: row.item_id,
      source: row.source,
      contactName: row.contact_name,
      companyName: row.company_name,
      email: row.email,
      phone: row.phone,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contactedAt: row.contacted_at,
      closedAt: row.closed_at,
    };
  }
}
