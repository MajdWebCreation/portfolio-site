import type { Cents } from "@/lib/money";
import { integer, records, text } from "@/lib/portal/json";
import type { Json } from "@/lib/supabase/database.types";

/** A line of an invoice or quote as the customer received it. */
export type PortalLine = {
  position: number;
  description: string;
  quantityHundredths: number;
  unitPriceCents: Cents;
  vatRate: number;
};

export function linesFromJson(value: Json): PortalLine[] {
  return records(value, "regels")
    .map((item) => ({
      position: integer(item, "position"),
      description: text(item, "description"),
      quantityHundredths: integer(item, "quantity_hundredths"),
      unitPriceCents: integer(item, "unit_price_cents"),
      vatRate: integer(item, "vat_rate"),
    }))
    .sort((a, b) => a.position - b.position);
}
