import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { Decimal } from "@/shared/decimal";
import { DEFAULT_LOCALE, TIME_ZONE } from "@/shared/i18n/config";
import messages from "@/shared/i18n/messages/pt-BR.json";
import type { AssetPosition, Positions } from "./ledger";
import { PositionsPage, type PositionsPageProps } from "./positions-page";

// Same framework stand-ins as the accounts page test: real PT-BR messages
// through next-intl's translator, and `server-only` (reached through the
// form's server action) resolving to nothing.
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: ptBR } = await import("@/shared/i18n/messages/pt-BR.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "pt-BR", messages: ptBR, namespace: namespace as "ledger" }),
  };
});

const t = messages.ledger;

async function renderPage(props: Partial<PositionsPageProps> = {}): Promise<string> {
  const page = await PositionsPage({
    positions: { consolidated: [], byAccount: [] },
    accounts: [XP, RICO],
    assets: [{ id: PETR4.id, naturalKey: PETR4.naturalKey, name: "PETROBRAS PN" }],
    today: "2026-06-30",
    ...props,
  });
  // Plain .ts (the unit project runs *.test.ts), so no JSX.
  const providerProps = { locale: DEFAULT_LOCALE, timeZone: TIME_ZONE, messages } as ComponentProps<
    typeof NextIntlClientProvider
  >;
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, page));
}

const XP = { id: "00000000-0000-4000-8000-000000000001", name: "XP" };
const RICO = { id: "00000000-0000-4000-8000-000000000002", name: "Rico" };
const PETR4 = {
  id: "00000000-0000-4000-8000-0000000000a1",
  naturalKey: "PETR4@B3",
  name: "PETROBRAS PN",
  currency: "BRL" as const,
};

function position(quantity: string, totalCost: string): AssetPosition {
  const q = new Decimal(quantity);
  const cost = new Decimal(totalCost);
  return { asset: PETR4, quantity: q, totalCost: cost, averagePrice: cost.dividedBy(q) };
}

const POSITIONS: Positions = {
  consolidated: [position("150", "4809.9")],
  byAccount: [
    { account: RICO, positions: [position("50", "1804.9")] },
    { account: XP, positions: [position("100", "3005")] },
  ],
};

/** Intl separates the currency symbol with a no-break space. */
const brl = (amount: string) => `R$ ${amount}`;

describe("PositionsPage", () => {
  it("invites the user to record a buy when there are no positions", async () => {
    const html = await renderPage();

    expect(html).toContain(t.empty.title);
    expect(html).not.toContain("<table");
    expect(html).toContain(t.buy.submit);
  });

  it("shows the consolidated position with the average price rounded to cents", async () => {
    const html = await renderPage({ positions: POSITIONS });

    expect(html).toContain(t.consolidated.title);
    expect(html).toContain("PETR4@B3");
    expect(html).toContain(">150<");
    expect(html).toContain(brl("4.809,90"));
    // 4809.90 / 150 = 32.066, displayed as R$ 32,07.
    expect(html).toContain(brl("32,07"));
    expect(html).not.toContain(t.empty.title);
  });

  it("shows each account's positions separately", async () => {
    const html = await renderPage({ positions: POSITIONS });

    expect(html).toContain(t.byAccount.title);
    expect(html).toContain(brl("30,05"));
    expect(html).toContain(brl("3.005,00"));
    expect(html).toContain(brl("36,10"));
    expect(html).toContain(brl("1.804,90"));
    // Rico is listed before XP, as given.
    expect(html.indexOf(">Rico<")).toBeLessThan(html.indexOf(">XP<", html.indexOf(">Rico<")));
  });

  it("shows crypto-sized quantities with all their decimal places", async () => {
    const tiny = position("0.00012345", "43.2075");
    const html = await renderPage({
      positions: { consolidated: [tiny], byAccount: [{ account: XP, positions: [tiny] }] },
    });

    expect(html).toContain("0,00012345");
  });

  it("offers the user's accounts and catalog assets in the buy form, dated today at most", async () => {
    const html = await renderPage();

    expect(html).toContain(`value="${XP.id}"`);
    expect(html).toContain(`value="${RICO.id}"`);
    expect(html).toContain(`value="${PETR4.id}"`);
    expect(html).toContain("PETR4@B3 · PETROBRAS PN");
    expect(html).toContain('max="2026-06-30"');
  });

  it("points to the accounts page when there is no account to buy into", async () => {
    const html = await renderPage({ accounts: [] });

    expect(html).toContain(t.buy.needsAccount);
    expect(html).toContain('href="/contas"');
  });

  it("points to the catalog when there is no asset to buy", async () => {
    const html = await renderPage({ assets: [] });

    expect(html).toContain(t.buy.needsAsset);
    expect(html).toContain('href="/ativos"');
  });
});
