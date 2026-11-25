// Drizzle schema: every table lives here so drizzle-kit sees one file. Feature
// modules own the logic that reads and writes their tables.
import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { COUNTRIES, CURRENCIES } from "./enums";

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
