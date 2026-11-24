import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, TIME_ZONE } from "./config";
import messages from "./messages/pt-BR.json";

// Single-locale setup: every request renders in PT-BR, so the locale is fixed
// here instead of being read from the URL or headers.
export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  timeZone: TIME_ZONE,
  messages,
}));
