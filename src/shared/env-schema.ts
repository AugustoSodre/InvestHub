import { z } from "zod";
import { databaseUrl } from "./db/url";

/** `.env.example` leaves unused keys empty; treat "" as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const EnvSchema = z.object({
  NODE_ENV: optional(z.enum(["development", "production", "test"])),
  DATABASE_URL: optional(z.string()),
  DEMO_MODE: optional(z.enum(["true", "false"])),
  BRAPI_TOKEN: optional(z.string()),
  FINNHUB_API_KEY: optional(z.string()),
  COINGECKO_DEMO_API_KEY: optional(z.string()),
  LLM_PROVIDER: optional(z.enum(["gemini", "ollama"])),
  GEMINI_API_KEY: optional(z.string()),
  OLLAMA_BASE_URL: optional(z.url()),
  TELEGRAM_BOT_TOKEN: optional(z.string()),
  TELEGRAM_CHAT_ID: optional(z.string()),
});

/** Validated server configuration. Every key is server-side only. */
export type ServerEnv = {
  nodeEnv: "development" | "production" | "test";
  databaseUrl: string;
  /** Public demo: seeded data, every write blocked, no live feeds. */
  demoMode: boolean;
  brapiToken: string | undefined;
  finnhubApiKey: string | undefined;
  coingeckoDemoApiKey: string | undefined;
  llmProvider: "gemini" | "ollama";
  geminiApiKey: string | undefined;
  ollamaBaseUrl: string | undefined;
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
};

/**
 * Validates raw environment variables. Pure, so it is testable without the
 * real environment; src/shared/env.ts calls it with process.env. Errors name
 * the variable but never echo its value, which may be a secret.
 */
export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
  }
  const env = result.data;
  const nodeEnv = env.NODE_ENV ?? "development";
  return {
    nodeEnv,
    databaseUrl: databaseUrl({ DATABASE_URL: env.DATABASE_URL, NODE_ENV: nodeEnv }),
    demoMode: env.DEMO_MODE === "true",
    brapiToken: env.BRAPI_TOKEN,
    finnhubApiKey: env.FINNHUB_API_KEY,
    coingeckoDemoApiKey: env.COINGECKO_DEMO_API_KEY,
    llmProvider: env.LLM_PROVIDER ?? "gemini",
    geminiApiKey: env.GEMINI_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
  };
}
