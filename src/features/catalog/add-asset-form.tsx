"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { PRICE_SOURCES } from "@/shared/db/enums";
import { Button } from "@/shared/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select";
import { addAssetAction, type AddAssetFormState } from "./actions";
import { ADDABLE_ASSET_TYPES, ASSET_NAME_MAX_LENGTH, type AssetField } from "./asset-input";

const INITIAL_STATE: AddAssetFormState = { status: "idle" };

/**
 * Adds an asset to the catalog, pre-filled from a picked search result or
 * filled in by hand (for example while brapi is down). Type and price source
 * can be overridden either way.
 */
export function AddAssetForm({
  initial,
  initialState = INITIAL_STATE,
}: {
  initial: Record<AssetField, string>;
  /** The form's state before any submit; tests render the outcomes of a submit through it. */
  initialState?: AddAssetFormState;
}) {
  const t = useTranslations("catalog");
  const [state, formAction, pending] = useActionState(addAssetAction, initialState);

  const values = state.status === "invalid" ? state.values : initial;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  const isInvalid = (field: AssetField) => fieldErrors[field] !== undefined;

  // id, name and the ARIA links between a control and its error message.
  const controlProps = (field: AssetField) => {
    const invalid = isInvalid(field);
    return {
      id: `asset-${field}`,
      name: field,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `asset-${field}-error` : undefined,
    };
  };

  const errorFor = (field: AssetField) => {
    const code = fieldErrors[field];
    if (!code) return null;
    const conflict = state.status === "invalid" ? state.conflict : undefined;
    const message =
      code === "typeConflict" && conflict
        ? t("errors.typeConflict", { key: conflict.naturalKey, type: t(`type.${conflict.type}`) })
        : t(`errors.${field === "ticker" && code === "invalid" ? "tickerInvalid" : code}`, {
            max: ASSET_NAME_MAX_LENGTH,
          });
    return <FieldError id={`asset-${field}-error`}>{message}</FieldError>;
  };

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={isInvalid("ticker") || undefined}>
            <FieldLabel htmlFor="asset-ticker">{t("form.ticker")}</FieldLabel>
            <Input
              {...controlProps("ticker")}
              defaultValue={values.ticker}
              placeholder={t("form.tickerPlaceholder")}
              autoComplete="off"
              autoCapitalize="characters"
            />
            {errorFor("ticker")}
          </Field>

          <Field data-invalid={isInvalid("type") || undefined}>
            <FieldLabel htmlFor="asset-type">{t("form.type")}</FieldLabel>
            <NativeSelect {...controlProps("type")} defaultValue={values.type} className="w-full">
              {ADDABLE_ASSET_TYPES.map((type) => (
                <NativeSelectOption key={type} value={type}>
                  {t(`type.${type}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errorFor("type")}
          </Field>
        </div>

        <Field data-invalid={isInvalid("name") || undefined}>
          <FieldLabel htmlFor="asset-name">{t("form.name")}</FieldLabel>
          <Input
            {...controlProps("name")}
            defaultValue={values.name}
            placeholder={t("form.namePlaceholder")}
            autoComplete="off"
          />
          {errorFor("name")}
        </Field>

        <Field data-invalid={isInvalid("priceSource") || undefined}>
          <FieldLabel htmlFor="asset-priceSource">{t("form.priceSource")}</FieldLabel>
          <NativeSelect
            {...controlProps("priceSource")}
            defaultValue={values.priceSource}
            className="w-full"
          >
            {PRICE_SOURCES.map((source) => (
              <NativeSelectOption key={source} value={source}>
                {t(`priceSource.${source}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errorFor("priceSource")}
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t("form.submitting") : t("form.submit")}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {state.status === "saved" && !pending
              ? t(state.created ? "form.created" : "form.reused", { key: state.naturalKey })
              : null}
          </p>
        </div>
      </FieldGroup>
    </form>
  );
}
