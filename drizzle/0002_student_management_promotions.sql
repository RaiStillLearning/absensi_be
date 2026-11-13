CREATE TABLE IF NOT EXISTS "student_promotion_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid,
	"student_id" uuid,
	"nisn" varchar(20) NOT NULL,
	"student_name" varchar(150) NOT NULL,
	"from_class" varchar(50) NOT NULL,
	"to_class" varchar(50) NOT NULL,
	"tahun_ajaran" varchar(20) NOT NULL,
	"process_type" varchar(20) NOT NULL,
	"executed_by" varchar(150) DEFAULT 'Admin' NOT NULL,
	"notes" text DEFAULT '',
	"promoted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotion_scheduler_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_key" varchar(50) NOT NULL,
	"tahun_ajaran" varchar(20) NOT NULL,
	"process_type" varchar(30) NOT NULL,
	"total_processed" integer DEFAULT 0 NOT NULL,
	"total_promoted" integer DEFAULT 0 NOT NULL,
	"total_rejected" integer DEFAULT 0 NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_scheduler_runs_period_key_unique" UNIQUE("period_key")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_promotion_logs" ADD CONSTRAINT "student_promotion_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_promotion_logs_nisn_idx" ON "student_promotion_logs" USING btree ("nisn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_promotion_logs_student_id_idx" ON "student_promotion_logs" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_promotion_logs_promoted_at_idx" ON "student_promotion_logs" USING btree ("promoted_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promotion_scheduler_runs_period_key_idx" ON "promotion_scheduler_runs" USING btree ("period_key");
