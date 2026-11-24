import { getTranslations } from "next-intl/server";
import { Button } from "@/shared/ui/button";

export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("tagline")}</p>
      <Button size="lg">{t("cta")}</Button>
    </main>
  );
}
