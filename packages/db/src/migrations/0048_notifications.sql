CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" text,
	"agent_id" uuid,
	"metadata" jsonb,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"escalation_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "notifications_company_user_read_idx" ON "notifications" USING btree ("company_id","user_id","read_at");
CREATE INDEX IF NOT EXISTS "notifications_entity_idx" ON "notifications" USING btree ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "notifications_escalation_idx" ON "notifications" USING btree ("company_id","severity","read_at","escalation_count");
