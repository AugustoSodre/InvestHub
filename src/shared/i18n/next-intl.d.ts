import type messages from "./messages/pt-BR.json";
import type { DEFAULT_LOCALE } from "./config";

// Type-checks translation keys against the PT-BR message file.
declare module "next-intl" {
  interface AppConfig {
    Locale: typeof DEFAULT_LOCALE;
    Messages: typeof messages;
  }
}
