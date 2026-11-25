import { describe, expect, it } from "vitest";
import { LOCAL_DATABASE_URL } from "./db/url";
import { parseEnv } from "./env-schema";

describe("parseEnv", () => {
  it("applies defaults when nothing is set", () => {
    expect(parseEnv({})).toEqual({
      nodeEnv: "development",
      databaseUrl: LOCAL_DATABASE_URL,
      demoMode: false,
      brapiToken: undefined,
      finnhubApiKey: undefined,
      coingeckoDemoApiKey: undefined,
      llmProvider: "gemini",
      geminiApiKey: undefined,
      ollamaBaseUrl: undefined,
      telegramBotToken: undefined,
      telegramChatId: undefined,
    });
  });

  it("treats empty values from .env.example as unset", () => {
    const env = parseEnv({ BRAPI_TOKEN: "", LLM_PROVIDER: "", DEMO_MODE: "", DATABASE_URL: "" });
    expect(env.brapiToken).toBeUndefined();
    expect(env.llmProvider).toBe("gemini");
    expect(env.demoMode).toBe(false);
    expect(env.databaseUrl).toBe(LOCAL_DATABASE_URL);
  });

  it("reads keys and flags", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://u:p@db:5432/investhub",
      DEMO_MODE: "true",
      BRAPI_TOKEN: "brapi-token",
      LLM_PROVIDER: "ollama",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    });
    expect(env).toMatchObject({
      nodeEnv: "production",
      databaseUrl: "postgres://u:p@db:5432/investhub",
      demoMode: true,
      brapiToken: "brapi-token",
      llmProvider: "ollama",
      ollamaBaseUrl: "http://127.0.0.1:11434",
    });
  });

  it("requires DATABASE_URL in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it.each([
    ["DEMO_MODE", "yes"],
    ["LLM_PROVIDER", "openai"],
    ["NODE_ENV", "staging"],
    ["OLLAMA_BASE_URL", "not a url"],
  ])("rejects an invalid %s, naming the variable", (name, value) => {
    expect(() => parseEnv({ [name]: value })).toThrow(new RegExp(name));
  });

  it("never echoes a value in its error, since values may be secrets", () => {
    expect(() => parseEnv({ OLLAMA_BASE_URL: "secret-abc123" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret-abc123") }),
    );
  });
});
