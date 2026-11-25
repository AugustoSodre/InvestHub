"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/shared/current-user";
import { appDb } from "@/shared/db/app-db";
import type { AccountField, AccountFieldErrors } from "./account-input";
import { createAccount } from "./accounts";

export type CreateAccountFormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "invalid";
      fieldErrors: AccountFieldErrors;
      /** What the user typed, so the form can show it again next to the errors. */
      values: Record<AccountField, string>;
    };

/** Form adapter for createAccount: read the fields, call the domain, refresh the list. */
export async function createAccountAction(
  _previous: CreateAccountFormState,
  formData: FormData,
): Promise<CreateAccountFormState> {
  const field = (name: AccountField) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const values = {
    name: field("name"),
    institution: field("institution"),
    country: field("country"),
    currency: field("currency"),
  };

  const result = await createAccount(appDb(), currentUserId(), values);
  if (!result.ok) {
    return { status: "invalid", fieldErrors: result.fieldErrors, values };
  }

  // The accounts page lives at src/app/contas.
  revalidatePath("/contas");
  return { status: "saved" };
}
