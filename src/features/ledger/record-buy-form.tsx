"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/shared/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select";
import { recordBuyAction, type RecordBuyFormState } from "./actions";
import { MAX_DECIMAL_PLACES, type BuyField, type BuyFieldErrorCode } from "./buy-input";

const INITIAL_STATE: RecordBuyFormState = { status: "idle" };

export type BuyAccountOption = { id: string; name: string };
export type BuyAssetOption = { id: string; naturalKey: string; name: string };

/** "invalid" reads differently for a choice, a date and a number. */
function errorKey(field: BuyField, code: BuyFieldErrorCode) {
  if (code !== "invalid") return code;
  if (field === "accountId" || field === "assetId") return "invalidChoice";
  if (field === "date") return "invalidDate";
  return "invalid";
}

export function RecordBuyForm({
  accounts,
  assets,
  today,
}: {
  accounts: BuyAccountOption[];
  assets: BuyAssetOption[];
  /** YYYY-MM-DD in Brasília: the default and the latest allowed trade date. */
  today: string;
}) {
  const t = useTranslations("ledger");
  const [state, formAction, pending] = useActionState(recordBuyAction, INITIAL_STATE);

  const defaults: Record<BuyField, string> = {
    // A single account or asset is the only possible choice, so it comes pre-selected.
    accountId: accounts.length === 1 ? (accounts[0]?.id ?? "") : "",
    assetId: assets.length === 1 ? (assets[0]?.id ?? "") : "",
    date: today,
    quantity: "",
    unitPrice: "",
    fees: "",
  };
  const values = state.status === "invalid" ? state.values : defaults;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  const isInvalid = (field: BuyField) => fieldErrors[field] !== undefined;

  // id, name and the ARIA links between a control and its error message.
  const controlProps = (field: BuyField) => {
    const invalid = isInvalid(field);
    return {
      id: `buy-${field}`,
      name: field,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `buy-${field}-error` : undefined,
    };
  };

  const label = (field: BuyField) => (
    <FieldLabel htmlFor={`buy-${field}`}>{t(`buy.${field}`)}</FieldLabel>
  );

  const errorFor = (field: BuyField) => {
    const code = fieldErrors[field];
    if (!code) return null;
    return (
      <FieldError id={`buy-${field}-error`}>
        {t(`errors.${errorKey(field, code)}`, { max: MAX_DECIMAL_PLACES })}
      </FieldError>
    );
  };

  // Text with a decimal keypad, not type="number": PT-BR users type a comma.
  const decimalInput = (field: "quantity" | "unitPrice" | "fees") => (
    <Field data-invalid={isInvalid(field) || undefined}>
      {label(field)}
      <Input
        {...controlProps(field)}
        defaultValue={values[field]}
        placeholder={t(`buy.${field}Placeholder`)}
        inputMode="decimal"
        autoComplete="off"
      />
      {errorFor(field)}
    </Field>
  );

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={isInvalid("accountId") || undefined}>
            {label("accountId")}
            <NativeSelect
              {...controlProps("accountId")}
              defaultValue={values.accountId}
              className="w-full"
            >
              <NativeSelectOption value="">{t("buy.accountPlaceholder")}</NativeSelectOption>
              {accounts.map((account) => (
                <NativeSelectOption key={account.id} value={account.id}>
                  {account.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errorFor("accountId")}
          </Field>

          <Field data-invalid={isInvalid("assetId") || undefined}>
            {label("assetId")}
            <NativeSelect
              {...controlProps("assetId")}
              defaultValue={values.assetId}
              className="w-full"
            >
              <NativeSelectOption value="">{t("buy.assetPlaceholder")}</NativeSelectOption>
              {assets.map((asset) => (
                <NativeSelectOption key={asset.id} value={asset.id}>
                  {`${asset.naturalKey} · ${asset.name}`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errorFor("assetId")}
          </Field>
        </div>

        <Field data-invalid={isInvalid("date") || undefined}>
          {label("date")}
          <Input {...controlProps("date")} type="date" max={today} defaultValue={values.date} />
          {errorFor("date")}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          {decimalInput("quantity")}
          {decimalInput("unitPrice")}
          {decimalInput("fees")}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t("buy.submitting") : t("buy.submit")}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {state.status === "saved" && !pending ? t("buy.success") : null}
          </p>
        </div>
      </FieldGroup>
    </form>
  );
}
