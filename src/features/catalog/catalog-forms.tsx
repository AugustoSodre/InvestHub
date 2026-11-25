"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { AddAssetForm } from "./add-asset-form";
import { defaultPriceSource, type AssetField } from "./asset-input";
import { AssetSearch } from "./asset-search";
import type { AssetCandidate } from "./catalog";

const MANUAL: Record<AssetField, string> = {
  ticker: "",
  name: "",
  type: "BR_STOCK",
  priceSource: defaultPriceSource("BR_STOCK"),
};

/** The search and the add form, linked: picking a search result pre-fills the form. */
export function CatalogForms() {
  const t = useTranslations("catalog");
  const [picked, setPicked] = useState<AssetCandidate | null>(null);

  const initial = picked
    ? {
        ticker: picked.ticker,
        name: picked.name,
        type: picked.type,
        priceSource: picked.priceSource,
      }
    : MANUAL;

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
            initial={initial}
          />
        </CardContent>
      </Card>
    </>
  );
}
