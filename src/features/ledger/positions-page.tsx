import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatMoney, formatQuantity } from "@/shared/i18n/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { AssetPosition, Positions } from "./ledger";
import { RecordBuyForm, type BuyAccountOption, type BuyAssetOption } from "./record-buy-form";

export type PositionsPageProps = {
  positions: Positions;
  /** The user's accounts and the catalog's assets, for the buy form. */
  accounts: BuyAccountOption[];
  assets: BuyAssetOption[];
  /** YYYY-MM-DD in Brasília. */
  today: string;
};

/** The positions page: consolidated and per-account positions, and the buy form. */
export async function PositionsPage({ positions, accounts, assets, today }: PositionsPageProps) {
  const t = await getTranslations("ledger");
  const empty = positions.consolidated.length === 0;
  const labels: ColumnLabels = {
    asset: t("list.asset"),
    quantity: t("list.quantity"),
    averagePrice: t("list.averagePrice"),
    totalCost: t("list.totalCost"),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>

      {empty ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t("empty.title")}</EmptyTitle>
            <EmptyDescription>{t("empty.description")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <section aria-labelledby="positions-consolidated-title" className="flex flex-col gap-2">
            <h2 id="positions-consolidated-title" className="text-xl font-semibold">
              {t("consolidated.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("consolidated.description")}</p>
            <PositionsTable positions={positions.consolidated} labels={labels} />
          </section>

          <section aria-labelledby="positions-by-account-title" className="flex flex-col gap-6">
            <h2 id="positions-by-account-title" className="text-xl font-semibold">
              {t("byAccount.title")}
            </h2>
            {positions.byAccount.map(({ account, positions: accountPositions }) => (
              <section
                key={account.id}
                aria-labelledby={`positions-account-${account.id}`}
                className="flex flex-col gap-2"
              >
                <h3 id={`positions-account-${account.id}`} className="font-medium">
                  {account.name}
                </h3>
                <PositionsTable positions={accountPositions} labels={labels} />
              </section>
            ))}
          </section>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("buy.title")}</h2>
          </CardTitle>
          <CardDescription>{t("buy.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {accounts.length === 0 ? (
            <Prerequisite
              text={t("buy.needsAccount")}
              href="/contas"
              link={t("buy.goToAccounts")}
            />
          ) : null}
          {assets.length === 0 ? (
            <Prerequisite text={t("buy.needsAsset")} href="/ativos" link={t("buy.goToCatalog")} />
          ) : null}
          <RecordBuyForm accounts={accounts} assets={assets} today={today} />
        </CardContent>
      </Card>
    </main>
  );
}

type ColumnLabels = Record<"asset" | "quantity" | "averagePrice" | "totalCost", string>;

function PositionsTable({
  positions,
  labels,
}: {
  positions: AssetPosition[];
  labels: ColumnLabels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.asset}</TableHead>
          <TableHead className="text-right">{labels.quantity}</TableHead>
          <TableHead className="text-right">{labels.averagePrice}</TableHead>
          <TableHead className="text-right">{labels.totalCost}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map(({ asset, quantity, averagePrice, totalCost }) => (
          <TableRow key={asset.id}>
            <TableCell>
              <span className="font-medium">{asset.naturalKey}</span>
              <span className="block text-xs text-muted-foreground">{asset.name}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatQuantity(quantity)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {averagePrice ? formatMoney(averagePrice, asset.currency) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(totalCost, asset.currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Prerequisite({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {text}{" "}
      <Link href={href} className="font-medium text-foreground underline underline-offset-4">
        {link}
      </Link>
    </p>
  );
}
