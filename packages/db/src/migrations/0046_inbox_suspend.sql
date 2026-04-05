ALTER TABLE "issues" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "suspend_reason" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "suspended_by_user_id" text;--> statement-breakpoint
CREATE INDEX "issues_suspended_until_idx" ON "issues" USING btree ("suspended_until");
