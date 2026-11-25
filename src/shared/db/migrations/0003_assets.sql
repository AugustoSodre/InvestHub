CREATE TYPE "public"."asset_type" AS ENUM('BR_STOCK', 'FII', 'BDR', 'BR_ETF', 'US_STOCK', 'US_ETF', 'CRYPTO', 'INVESTMENT_FUND', 'TESOURO', 'CDB', 'LCI', 'LCA', 'LC', 'CRI', 'CRA');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('brapi', 'yahoo', 'finnhub', 'coingecko', 'cvm', 'tesouro-transparente', 'calculator');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "asset_type" NOT NULL,
	"natural_key" text NOT NULL,
	"name" text NOT NULL,
	"currency" "currency" NOT NULL,
	"price_source" "price_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "assets_type_natural_key_key" ON "assets" USING btree ("type","natural_key");