// Drizzle schema: every table lives here so drizzle-kit sees one file. Feature
// modules own the logic that reads and writes their tables.
import { sql } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ASSET_TYPES,
  COUNTRIES,
  CURRENCIES,
  LEDGER_EVENT_STATUSES,
  LEDGER_EVENT_TYPES,
  PRICE_SOURCES,
} from "./enums";

/**
 * v1 has a single user (the owner) and no auth. The row exists so every table
 * can carry a real `user_id` foreign key; migration 0002 seeds it.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const country = pgEnum("country", COUNTRIES);

export const currency = pgEnum("currency", CURRENCIES);

/** A brokerage or exchange where assets are held (glossary: Account). */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    institution: text("institution").notNull(),
    country: country("country").notNull(),
    currency: currency("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Names are unique per user, ignoring case: "XP" and "xp" are the same account.
    uniqueIndex("accounts_user_id_name_key").on(t.userId, sql`lower(${t.name})`),
  ],
);

export const assetType = pgEnum("asset_type", ASSET_TYPES);

export const priceSource = pgEnum("price_source", PRICE_SOURCES);

/**
 * The typed asset catalog (glossary: Asset). Global, not per user: an asset is
 * canonical, and holdings belong to users through ledger events.
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: assetType("type").notNull(),
    /**
     * Identifies one instrument, e.g. `PETR4@B3` (ticker@exchange). Unique on
     * its own, not per type: HGLG11@B3 is one asset, whatever type it was given.
     */
    naturalKey: text("natural_key").notNull(),
    name: text("name").notNull(),
    currency: currency("currency").notNull(),
    /** Defaults from the type; the user can override it. */
    priceSource: priceSource("price_source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("assets_natural_key_key").on(t.naturalKey)],
);

export const ledgerEventType = pgEnum("ledger_event_type", LEDGER_EVENT_TYPES);

export const ledgerEventStatus = pgEnum("ledger_event_status", LEDGER_EVENT_STATUSES);

/**
 * The transaction ledger (glossary: Ledger event), the source of truth.
 * Positions are derived from these rows, never stored. Amounts are in the
 * event's `currency` (the asset's own); wrap driver strings in Decimal at the
 * boundary.
 */
export const ledgerEvents = pgTable(
  "ledger_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    type: ledgerEventType("type").notNull(),
    /** Trade date: a calendar day, no time zone. */
    date: date("date", { mode: "string" }).notNull(),
    quantity: numeric("quantity", { precision: 36, scale: 18 }).notNull(),
    unitPrice: numeric("unit_price").notNull(),
    fees: numeric("fees").notNull().default("0"),
    currency: currency("currency").notNull(),
    /** User-typed text: never goes into an LLM prompt (CLAUDE.md hard rules). */
    notes: text("notes"),
    status: ledgerEventStatus("status").notNull().default("CONFIRMED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_events_user_id_account_id_asset_id_idx").on(t.userId, t.accountId, t.assetId),
  ],
);
