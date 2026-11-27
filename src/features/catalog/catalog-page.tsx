import { getTranslations } from "next-intl/server";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { Asset } from "./catalog";
import { CatalogForms } from "./catalog-forms";

/** The asset catalog page: the catalog (or an empty state), the ticker search and the add form. */
export async function CatalogPage({ assets }: { assets: Asset[] }) {
  const t = await getTranslations("catalog");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>

      <section aria-labelledby="assets-list-title">
        <h2 id="assets-list-title" className="sr-only">
          {t("list.title")}
        </h2>
        {assets.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t("empty.title")}</EmptyTitle>
              <EmptyDescription>{t("empty.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("list.naturalKey")}</TableHead>
                <TableHead>{t("list.name")}</TableHead>
                <TableHead>{t("list.type")}</TableHead>
                <TableHead>{t("list.currency")}</TableHead>
                <TableHead>{t("list.priceSource")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.naturalKey}</TableCell>
                  <TableCell className="max-w-64 truncate">{asset.name}</TableCell>
                  <TableCell>{t(`type.${asset.type}`)}</TableCell>
                  <TableCell>{asset.currency}</TableCell>
                  <TableCell>{t(`priceSource.${asset.priceSource}`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <CatalogForms />
    </main>
  );
}
