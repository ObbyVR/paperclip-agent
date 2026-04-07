CREATE TABLE IF NOT EXISTS "blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"icon" text,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"steps" jsonb NOT NULL,
	"default_params" jsonb,
	"estimated_cost_cents" integer,
	"estimated_duration_minutes" integer,
	"tags" text[],
	"triggers" text[],
	"required_secrets" text[],
	"required_tools" text[],
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "blueprint_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step_id" text,
	"params" jsonb,
	"step_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_cost_cents" integer DEFAULT 0 NOT NULL,
	"total_duration_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "blueprint_runs" ADD CONSTRAINT "blueprint_runs_blueprint_id_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "blueprint_runs" ADD CONSTRAINT "blueprint_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "blueprints_company_status_idx" ON "blueprints" USING btree ("company_id","status");
CREATE UNIQUE INDEX IF NOT EXISTS "blueprints_slug_company_uq" ON "blueprints" USING btree ("company_id","slug");
CREATE INDEX IF NOT EXISTS "blueprint_runs_blueprint_idx" ON "blueprint_runs" USING btree ("blueprint_id","created_at");
CREATE INDEX IF NOT EXISTS "blueprint_runs_company_status_idx" ON "blueprint_runs" USING btree ("company_id","status");
