import type { CustomerSnapshot, DocumentLine } from "@/lib/admin/documents/types";

/**
 * The snapshot and line shapes shared by quotes and invoices. Both tables
 * carry the same `customer_*` columns and the same line columns, so the
 * mapping lives here once instead of in each document module.
 */
export type SnapshotColumns = {
  customer_id: string;
  customer_company_name: string;
  customer_contact_name: string;
  customer_email: string;
  customer_street: string;
  customer_postal_code: string;
  customer_city: string;
  customer_country: string;
  customer_kvk_number: string | null;
  customer_vat_number: string | null;
};

export function snapshotFromRow(row: SnapshotColumns): CustomerSnapshot {
  return {
    customerId: row.customer_id,
    companyName: row.customer_company_name,
    contactName: row.customer_contact_name,
    email: row.customer_email,
    street: row.customer_street,
    postalCode: row.customer_postal_code,
    city: row.customer_city,
    country: row.customer_country,
    ...(row.customer_kvk_number ? { kvkNumber: row.customer_kvk_number } : {}),
    ...(row.customer_vat_number ? { vatNumber: row.customer_vat_number } : {}),
  };
}

export function snapshotToColumns(snapshot: CustomerSnapshot): SnapshotColumns {
  return {
    customer_id: snapshot.customerId,
    customer_company_name: snapshot.companyName,
    customer_contact_name: snapshot.contactName,
    customer_email: snapshot.email,
    customer_street: snapshot.street,
    customer_postal_code: snapshot.postalCode,
    customer_city: snapshot.city,
    customer_country: snapshot.country,
    customer_kvk_number: snapshot.kvkNumber ?? null,
    customer_vat_number: snapshot.vatNumber ?? null,
  };
}

export type LineRow = {
  id: string;
  position: number;
  description: string;
  quantity_hundredths: number;
  unit_price_cents: number;
  vat_rate: number;
};

/** Lines come back ordered by `position`, which is the order the admin set. */
export function linesFromRows(rows: LineRow[]): DocumentLine[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.id,
      description: row.description,
      quantityHundredths: row.quantity_hundredths,
      unitPriceCents: row.unit_price_cents,
      vatRate: row.vat_rate,
    }));
}

/** Domain lines to insert rows; `position` fixes the order in the database. */
export function linesToRows<K extends string>(
  key: K,
  documentId: string,
  lines: DocumentLine[],
): (Omit<LineRow, "id"> & Record<K, string>)[] {
  return lines.map((line, index) => ({
    [key]: documentId,
    position: index,
    description: line.description,
    quantity_hundredths: line.quantityHundredths,
    unit_price_cents: line.unitPriceCents,
    vat_rate: line.vatRate,
  })) as (Omit<LineRow, "id"> & Record<K, string>)[];
}
