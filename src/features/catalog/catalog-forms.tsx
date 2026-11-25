"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { AddAssetForm } from "./add-asset-form";
import { assetDefaults, type AssetCandidate, type AssetField } from "./asset-input";
import { AssetSearch } from "./asset-search";

/** The add form's starting values: the picked search result, or a blank BR stock for manual entry. */
export function formValuesFor(picked: AssetCandidate | null): Record<AssetField, string> {
  if (!picked) {
    return {
      ticker: "",
      name: "",
      type: "BR_STOCK",
      priceSource: assetDefaults("BR_STOCK").priceSource,
    };
  }
  return {
    ticker: picked.ticker,
    name: picked.name,
    type: picked.type,
    priceSource: picked.priceSource,
  };
}

/** The search and the add form, linked: picking a search result pre-fills the form. */
export function CatalogForms() {
  const t = useTranslations("catalog");
  const [picked, setPicked] = useState<AssetCandidate | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("search.title")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AssetSearch onPick={setPicked} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("form.title")}</h2>
          </CardTitle>
          <CardDescription>{t("form.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* A new key remounts the form, so a pick replaces whatever was typed. */}
          <AddAssetForm
            key={picked ? `${picked.type}:${picked.naturalKey}` : "manual"}
            initial={formValuesFor(picked)}
          />
        </CardContent>
      </Card>
    </>
  );
}
