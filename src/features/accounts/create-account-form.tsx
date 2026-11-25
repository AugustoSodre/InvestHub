"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/shared/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select";
import { COUNTRIES, CURRENCIES } from "@/shared/db/enums";
import { ACCOUNT_TEXT_MAX_LENGTH, type AccountField } from "./account-input";
import { createAccountAction, type CreateAccountFormState } from "./actions";

const INITIAL_STATE: CreateAccountFormState = { status: "idle" };

const DEFAULT_VALUES: Record<AccountField, string> = {
  name: "",
  institution: "",
  country: "BR",
  currency: "BRL",
};

export function CreateAccountForm() {
  const t = useTranslations("accounts");
  const [state, formAction, pending] = useActionState(createAccountAction, INITIAL_STATE);

  const values = state.status === "invalid" ? state.values : DEFAULT_VALUES;
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};

  const isInvalid = (field: AccountField) => fieldErrors[field] !== undefined;

  // id, name and the ARIA links between a control and its error message.
  const controlProps = (field: AccountField) => {
    const invalid = isInvalid(field);
    return {
      id: `account-${field}`,
      name: field,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `account-${field}-error` : undefined,
    };
  };

  const errorFor = (field: AccountField) => {
    const code = fieldErrors[field];
    if (!code) return null;
    return (
      <FieldError id={`account-${field}-error`}>
        {t(`errors.${code}`, { max: ACCOUNT_TEXT_MAX_LENGTH })}
      </FieldError>
    );
  };

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <Field data-invalid={isInvalid("name") || undefined}>
          <FieldLabel htmlFor="account-name">{t("form.name")}</FieldLabel>
          <Input
            {...controlProps("name")}
            defaultValue={values.name}
            placeholder={t("form.namePlaceholder")}
            autoComplete="off"
          />
          {errorFor("name")}
        </Field>

        <Field data-invalid={isInvalid("institution") || undefined}>
          <FieldLabel htmlFor="account-institution">{t("form.institution")}</FieldLabel>
          <Input
            {...controlProps("institution")}
            defaultValue={values.institution}
            placeholder={t("form.institutionPlaceholder")}
            autoComplete="off"
          />
          {errorFor("institution")}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={isInvalid("country") || undefined}>
            <FieldLabel htmlFor="account-country">{t("form.country")}</FieldLabel>
            <NativeSelect
              {...controlProps("country")}
              defaultValue={values.country}
              className="w-full"
            >
              {COUNTRIES.map((country) => (
                <NativeSelectOption key={country} value={country}>
                  {t(`country.${country}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errorFor("country")}
          </Field>

          <Field data-invalid={isInvalid("currency") || undefined}>
            <FieldLabel htmlFor="account-currency">{t("form.currency")}</FieldLabel>
            <NativeSelect
              {...controlProps("currency")}
              defaultValue={values.currency}
              className="w-full"
            >
              {CURRENCIES.map((currency) => (
                <NativeSelectOption key={currency} value={currency}>
                  {t(`currency.${currency}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errorFor("currency")}
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t("form.submitting") : t("form.submit")}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {state.status === "saved" && !pending ? t("form.success") : null}
          </p>
        </div>
      </FieldGroup>
    </form>
  );
}
