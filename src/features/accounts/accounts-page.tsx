import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { Account } from "./accounts";
import { CreateAccountForm } from "./create-account-form";

/** The accounts page: the user's accounts (or an empty state) and the create form. */
export async function AccountsPage({ accounts }: { accounts: Account[] }) {
  const t = await getTranslations("accounts");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>

      <section aria-labelledby="accounts-list-title">
        <h2 id="accounts-list-title" className="sr-only">
          {t("list.title")}
        </h2>
        {accounts.length === 0 ? (
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
                <TableHead>{t("list.name")}</TableHead>
                <TableHead>{t("list.institution")}</TableHead>
                <TableHead>{t("list.country")}</TableHead>
                <TableHead>{t("list.currency")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.institution}</TableCell>
                  <TableCell>{t(`country.${account.country}`)}</TableCell>
                  <TableCell>{account.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("form.title")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CreateAccountForm />
        </CardContent>
      </Card>
    </main>
  );
}
