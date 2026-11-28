"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/shared/current-user";
import { todayIn } from "@/shared/dates";
import { appDb } from "@/shared/db/app-db";
import { TIME_ZONE } from "@/shared/i18n/config";
import { BUY_FIELDS, type BuyField, type BuyFieldErrors } from "./buy-input";
import { recordBuy } from "./ledger";

export type RecordBuyFormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "invalid";
      fieldErrors: BuyFieldErrors;
      /** What the user typed, so the form can show it again next to the errors. */
      values: Record<BuyField, string>;
    };

/** Form adapter for recordBuy: read the fields, call the domain, refresh the positions. */
export async function recordBuyAction(
  _previous: RecordBuyFormState,
  formData: FormData,
): Promise<RecordBuyFormState> {
  const field = (name: BuyField) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const values = Object.fromEntries(BUY_FIELDS.map((name) => [name, field(name)])) as Record<
    BuyField,
    string
  >;

  // A future trade date is judged by the calendar in Brasília, not the server's clock zone.
  const result = await recordBuy(appDb(), currentUserId(), values, { today: todayIn(TIME_ZONE) });
  if (!result.ok) {
    return { status: "invalid", fieldErrors: result.fieldErrors, values };
  }

  // The positions page lives at src/app/posicoes.
  revalidatePath("/posicoes");
  return { status: "saved" };
}
