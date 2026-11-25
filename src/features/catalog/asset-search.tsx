"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/shared/ui/button";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { searchAssetsAction, type SearchAssetsFormState } from "./actions";
import type { AssetCandidate } from "./catalog";

const INITIAL_STATE: SearchAssetsFormState = { status: "idle" };

type OnPick = (candidate: AssetCandidate) => void;

/** Ticker search on brapi. Picking a result hands it to the add form. */
export function AssetSearch({ onPick }: { onPick: OnPick }) {
  const t = useTranslations("catalog");
  const [state, formAction, pending] = useActionState(searchAssetsAction, INITIAL_STATE);
  const query = state.status === "idle" ? "" : state.query;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} role="search" className="flex items-end gap-3">
        <Field className="flex-1">
          <FieldLabel htmlFor="asset-search-query">{t("search.label")}</FieldLabel>
          <Input
            id="asset-search-query"
            name="query"
            defaultValue={query}
            placeholder={t("search.placeholder")}
            autoComplete="off"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? t("search.submitting") : t("search.submit")}
        </Button>
      </form>
      <SearchOutcome state={state} onPick={onPick} />
    </div>
  );
}

/** What a search returned: matches to pick, nothing found, or why brapi could not answer. */
export function SearchOutcome({ state, onPick }: { state: SearchAssetsFormState; onPick: OnPick }) {
  const t = useTranslations("catalog");

  if (state.status === "idle") return null;

  if (state.status === "failed") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t(`searchErrors.${state.error}`)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state.tokenMissing ? (
        <p role="note" className="text-sm text-muted-foreground">
          {t("tokenNotice")}
        </p>
      ) : null}
      {state.candidates.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("search.noResults", { query: state.query.trim() })}
        </p>
      ) : (
        <ul aria-label={t("search.results")} className="divide-y rounded-md border">
          {state.candidates.map((candidate) => (
            <li
              key={`${candidate.type}:${candidate.naturalKey}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{`${candidate.ticker} · ${candidate.name}`}</span>
                <span className="text-sm text-muted-foreground">{t(`type.${candidate.type}`)}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onPick(candidate)}>
                {t("search.pick", { ticker: candidate.ticker })}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
