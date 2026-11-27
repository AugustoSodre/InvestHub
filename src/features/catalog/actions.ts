"use server";

import { revalidatePath } from "next/cache";
import { createBrapiClient, type BrapiError } from "@/integrations/brapi/brapi";
import { appDb } from "@/shared/db/app-db";
import type { AssetType } from "@/shared/db/enums";
import { serverEnv } from "@/shared/env";
import {
  ASSET_FIELDS,
  type AssetField,
  type AssetFieldErrors,
  type SearchFieldErrors,
} from "./asset-input";
import { addAsset, searchAssets, type AssetCandidate } from "./catalog";

export type SearchAssetsFormState =
  | { status: "idle" }
  | { status: "found"; query: string; candidates: AssetCandidate[]; tokenMissing: boolean }
  | { status: "failed"; query: string; error: BrapiError }
  | { status: "invalid"; query: string; fieldErrors: SearchFieldErrors };

export type AddAssetFormState =
  | { status: "idle" }
  | { status: "saved"; naturalKey: string; created: boolean }
  | {
      status: "invalid";
      fieldErrors: AssetFieldErrors;
      /** With a "typeConflict" error: the key and the type it is already stored under. */
      conflict?: { naturalKey: string; type: AssetType };
      /** What the user typed, so the form can show it again next to the errors. */
      values: Record<AssetField, string>;
    };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Form adapter for searchAssets. The brapi token stays on the server. */
export async function searchAssetsAction(
  _previous: SearchAssetsFormState,
  formData: FormData,
): Promise<SearchAssetsFormState> {
  const query = text(formData, "query");
  const brapi = createBrapiClient({ token: serverEnv().brapiToken });

  const result = await searchAssets(brapi, query);
  if (!result.ok) {
    return "fieldErrors" in result
      ? { status: "invalid", query, fieldErrors: result.fieldErrors }
      : { status: "failed", query, error: result.error };
  }
  return {
    status: "found",
    query,
    candidates: result.candidates,
    tokenMissing: result.tokenMissing,
  };
}

/** Form adapter for addAsset: read the fields, call the domain, refresh the list. */
export async function addAssetAction(
  _previous: AddAssetFormState,
  formData: FormData,
): Promise<AddAssetFormState> {
  const values = Object.fromEntries(
    ASSET_FIELDS.map((name) => [name, text(formData, name)]),
  ) as Record<AssetField, string>;

  const result = await addAsset(appDb(), values);
  if (!result.ok) {
    return {
      status: "invalid",
      fieldErrors: result.fieldErrors,
      conflict: result.conflict,
      values,
    };
  }

  // The catalog page lives at src/app/ativos.
  revalidatePath("/ativos");
  return { status: "saved", naturalKey: result.asset.naturalKey, created: result.created };
}
