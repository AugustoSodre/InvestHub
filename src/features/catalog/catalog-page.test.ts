import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCALE, TIME_ZONE } from "@/shared/i18n/config";
import messages from "@/shared/i18n/messages/pt-BR.json";
import type { AddAssetFormState, SearchAssetsFormState } from "./actions";
import { AddAssetForm } from "./add-asset-form";
import { SearchOutcome } from "./asset-search";
import type { Asset, AssetCandidate } from "./catalog";
import { formValuesFor } from "./catalog-forms";
import { CatalogPage } from "./catalog-page";

// Vitest runs outside Next's react-server environment, so the two framework
// pieces that only work there are replaced: `getTranslations` reads the real
// PT-BR messages through next-intl's own translator, and the `server-only`
// marker (reached through the forms' server actions) resolves to nothing, as
// it does under the react-server condition.
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: ptBR } = await import("@/shared/i18n/messages/pt-BR.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "pt-BR", messages: ptBR, namespace: namespace as "catalog" }),
  };
});

// Plain .ts (the unit project runs *.test.ts), so no JSX. The provider's props
// type requires `children`, which createElement takes as an argument.
function renderWithMessages(node: ReactNode): string {
  const providerProps = { locale: DEFAULT_LOCALE, timeZone: TIME_ZONE, messages } as ComponentProps<
    typeof NextIntlClientProvider
  >;
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, node));
}

async function renderPage(assets: Asset[]): Promise<string> {
  return renderWithMessages(await CatalogPage({ assets }));
}

function renderOutcome(state: SearchAssetsFormState): string {
  return renderWithMessages(createElement(SearchOutcome, { state, onPick: () => {} }));
}

const PETR4: Asset = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "BR_STOCK",
  naturalKey: "PETR4@B3",
  name: "PETROLEO BRASILEIRO S.A. PETROBRAS",
  currency: "BRL",
  priceSource: "brapi",
  createdAt: new Date("2026-01-02T12:00:00Z"),
};

const PETR4_CANDIDATE: AssetCandidate = {
  ticker: "PETR4",
  name: "PETROLEO BRASILEIRO S.A. PETROBRAS",
  type: "BR_STOCK",
  naturalKey: "PETR4@B3",
  currency: "BRL",
  priceSource: "brapi",
};

describe("CatalogPage", () => {
  it("shows an empty state with the search and the manual add form", async () => {
    const html = await renderPage([]);

    expect(html).toContain(messages.catalog.empty.title);
    expect(html).not.toContain("<table");
    expect(html).toContain(messages.catalog.search.submit);
    expect(html).toContain(messages.catalog.form.submit);
  });

  it("lists the catalog's assets with their type, currency and price source", async () => {
    const html = await renderPage([PETR4]);

    expect(html).toContain("<table");
    expect(html).toContain("PETR4@B3");
    expect(html).toContain("PETROLEO BRASILEIRO S.A. PETROBRAS");
    expect(html).toContain(messages.catalog.type.BR_STOCK);
    expect(html).toContain("BRL");
    expect(html).toContain(messages.catalog.priceSource.brapi);
    expect(html).not.toContain(messages.catalog.empty.title);
  });
});

describe("SearchOutcome", () => {
  it("shows each match as 'TICKER · name', ready to pick", () => {
    const html = renderOutcome({
      status: "found",
      query: "PETR4",
      candidates: [PETR4_CANDIDATE],
      tokenMissing: false,
    });

    expect(html).toContain("PETR4 · PETROLEO BRASILEIRO S.A. PETROBRAS");
    expect(html).toContain(messages.catalog.type.BR_STOCK);
    expect(html).toContain("Usar PETR4");
    expect(html).not.toContain("BRAPI_TOKEN");
  });

  it("says when nothing matched", () => {
    const html = renderOutcome({
      status: "found",
      query: "XXXX3",
      candidates: [],
      tokenMissing: false,
    });

    expect(html).toContain("Nenhum ativo encontrado para XXXX3.");
  });

  it.each(["rateLimited", "unavailable"] as const)(
    "explains a %s brapi in friendly words and points to the manual form",
    (error) => {
      const html = renderOutcome({ status: "failed", query: "PETR4", error });

      expect(html).toContain('role="alert"');
      expect(html).toContain(messages.catalog.searchErrors[error]);
      expect(messages.catalog.searchErrors[error]).toContain("manualmente");
    },
  );

  it("explains that BRAPI_TOKEN must be set in .env when brapi asks for a token", () => {
    const html = renderOutcome({ status: "failed", query: "HGLG11", error: "tokenMissing" });

    expect(html).toContain("BRAPI_TOKEN");
    expect(html).toContain(".env");
  });

  it("explains that BRAPI_TOKEN must be set in .env when a match needs a token", () => {
    const html = renderOutcome({
      status: "found",
      query: "HGLG11",
      candidates: [{ ...PETR4_CANDIDATE, ticker: "HGLG11", type: "FII" }],
      tokenMissing: true,
    });

    expect(html).toContain(messages.catalog.tokenNotice);
    expect(messages.catalog.tokenNotice).toContain("BRAPI_TOKEN");
    expect(messages.catalog.tokenNotice).toContain(".env");
  });
});

describe("AddAssetForm after picking a search result", () => {
  const HGLG11: AssetCandidate = {
    ticker: "HGLG11",
    name: "PÁTRIA LOG - FUNDO DE INVESTIMENTO IMOBILIÁRIO - RESPONSABILIDADE LIMITADA",
    type: "FII",
    naturalKey: "HGLG11@B3",
    currency: "BRL",
    priceSource: "brapi",
  };

  function renderPicked(candidate: AssetCandidate | null): string {
    return renderWithMessages(createElement(AddAssetForm, { initial: formValuesFor(candidate) }));
  }

  it("pre-fills a picked FII with type FII, and the type can still be changed", () => {
    const html = renderPicked(HGLG11);

    expect(html).toContain('value="HGLG11"');
    expect(html).toMatch(/<option[^>]*value="FII" selected=""/);
    // Every B3 type is offered in an enabled type select, so FII can be overridden.
    expect(html).toMatch(/<select[^>]*name="type"/);
    expect(html).not.toMatch(/<select[^>]*name="type"[^>]*disabled/);
    for (const type of ["BR_STOCK", "FII", "BDR", "BR_ETF"] as const) {
      expect(html).toContain(`value="${type}"`);
      expect(html).toContain(messages.catalog.type[type]);
    }
  });

  it("starts a manual add as a BR stock priced by brapi when nothing was picked", () => {
    const html = renderPicked(null);

    expect(html).toMatch(/<option[^>]*value="BR_STOCK" selected=""/);
    expect(html).toMatch(/<option[^>]*value="brapi" selected=""/);
  });
});

describe("AddAssetForm after submitting", () => {
  const typed = { ticker: "HGLG11", name: "", type: "BR_STOCK", priceSource: "brapi" };

  function renderSubmitted(state: AddAssetFormState): string {
    return renderWithMessages(
      createElement(AddAssetForm, { initial: formValuesFor(null), initialState: state }),
    );
  }

  it("says the key is already in the catalog under another type, next to the type", () => {
    const html = renderSubmitted({
      status: "invalid",
      fieldErrors: { type: "typeConflict" },
      conflict: { naturalKey: "HGLG11@B3", type: "FII" },
      values: typed,
    });

    expect(html).toContain("HGLG11@B3 já está no catálogo como FII.");
    expect(html).toMatch(/<select[^>]*aria-invalid="true"[^>]*aria-describedby="asset-type-error"/);
  });
});
