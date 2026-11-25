import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SEEDED_USER_ID } from "@/shared/current-user";
import { DEFAULT_LOCALE, TIME_ZONE } from "@/shared/i18n/config";
import messages from "@/shared/i18n/messages/pt-BR.json";
import type { Account } from "./accounts";
import { AccountsPage } from "./accounts-page";

// Vitest runs outside Next's react-server environment, so the two framework
// pieces that only work there are replaced: `getTranslations` reads the real
// PT-BR messages through next-intl's own translator, and the `server-only`
// marker (reached through the form's server action) resolves to nothing, as
// it does under the react-server condition.
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: ptBR } = await import("@/shared/i18n/messages/pt-BR.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "pt-BR", messages: ptBR, namespace: namespace as "accounts" }),
  };
});

async function renderPage(accounts: Account[]): Promise<string> {
  const page = await AccountsPage({ accounts });
  // Plain .ts (the unit project runs *.test.ts), so no JSX. The provider's
  // props type requires `children`, which createElement takes as an argument.
  const providerProps = { locale: DEFAULT_LOCALE, timeZone: TIME_ZONE, messages } as ComponentProps<
    typeof NextIntlClientProvider
  >;
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, page));
}

const XP: Account = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: SEEDED_USER_ID,
  name: "XP",
  institution: "XP Investimentos",
  country: "BR",
  currency: "BRL",
  createdAt: new Date("2026-01-02T12:00:00Z"),
};

describe("AccountsPage", () => {
  it("invites the user to add an account when there are none", async () => {
    const html = await renderPage([]);

    expect(html).toContain(messages.accounts.empty.title);
    expect(html).toContain(messages.accounts.empty.description);
    expect(html).not.toContain("<table");
    // The create form is on the page, so the invitation can be acted on.
    expect(html).toContain(messages.accounts.form.submit);
  });

  it("lists the accounts instead of the empty state when there are some", async () => {
    const html = await renderPage([XP]);

    expect(html).toContain("<table");
    expect(html).toContain("XP Investimentos");
    expect(html).toContain(messages.accounts.country.BR);
    expect(html).toContain("BRL");
    expect(html).not.toContain(messages.accounts.empty.title);
  });
});
