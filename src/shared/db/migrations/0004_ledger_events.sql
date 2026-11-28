CREATE TYPE "public"."ledger_event_status" AS ENUM('CONFIRMED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."ledger_event_type" AS ENUM('BUY', 'SELL', 'DIVIDEND', 'JCP', 'SPLIT', 'BONUS', 'FEE');--> statement-breakpoint
CREATE TABLE "ledger_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"type" "ledger_event_type" NOT NULL,
	"date" date NOT NULL,
	"quantity" numeric(36, 18) NOT NULL,
	"unit_price" numeric NOT NULL,
	"fees" numeric DEFAULT '0' NOT NULL,
	"currency" "currency" NOT NULL,
	"notes" text,
	"status" "ledger_event_status" DEFAULT 'CONFIRMED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_events_user_id_account_id_asset_id_idx" ON "ledger_events" USING btree ("user_id","account_id","asset_id");