CREATE TABLE "class_students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "daily_attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_attendance_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attendance_status" varchar(20) DEFAULT 'present' NOT NULL,
	"attendance_source" varchar(20) DEFAULT 'barcode' NOT NULL,
	"check_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_barcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"format" varchar(20) DEFAULT 'QR_CODE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_barcodes_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nisn" varchar(20) NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"gender" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_nisn_unique" UNIQUE("nisn")
);
--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_records" ADD CONSTRAINT "daily_attendance_records_daily_attendance_id_daily_attendances_id_fk" FOREIGN KEY ("daily_attendance_id") REFERENCES "public"."daily_attendances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_records" ADD CONSTRAINT "daily_attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendances" ADD CONSTRAINT "daily_attendances_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_barcodes" ADD CONSTRAINT "student_barcodes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_students_class_student_idx" ON "class_students" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_attendance_records_session_student_idx" ON "daily_attendance_records" USING btree ("daily_attendance_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_attendances_class_date_idx" ON "daily_attendances" USING btree ("class_id","attendance_date");