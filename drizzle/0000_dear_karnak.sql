CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"jenis" varchar(30) NOT NULL,
	"judul" varchar(150) NOT NULL,
	"deskripsi" varchar(255) NOT NULL,
	"waktu" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"class_code_id" integer,
	"name" varchar(50) NOT NULL,
	"tingkat" varchar(10) DEFAULT 'X' NOT NULL,
	"jurusan" varchar(50) DEFAULT 'RPL' NOT NULL,
	"wali_kelas" varchar(150) DEFAULT '' NOT NULL,
	"tahun_ajaran" varchar(20) DEFAULT '2026/2027' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "daily_attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_attendance_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"record_code" varchar(50) DEFAULT '',
	"attendance_status" varchar(20) DEFAULT 'present' NOT NULL,
	"attendance_source" varchar(20) DEFAULT 'barcode' NOT NULL,
	"jam_masuk" varchar(20) DEFAULT '06:45',
	"keterangan" varchar(255) DEFAULT 'Tepat waktu',
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
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"kelas" varchar(50) NOT NULL,
	"hari" varchar(20) NOT NULL,
	"jam_ke" integer NOT NULL,
	"waktu_mulai" varchar(10) NOT NULL,
	"waktu_selesai" varchar(10) NOT NULL,
	"mata_pelajaran" varchar(100) NOT NULL,
	"guru" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_barcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"barcode_value" varchar(50),
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
	"nis" varchar(20) DEFAULT '242510001' NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"gender" varchar(10) NOT NULL,
	"kelas" varchar(50) DEFAULT 'X RPL 1' NOT NULL,
	"jurusan" varchar(100) DEFAULT 'Rekayasa Perangkat Lunak' NOT NULL,
	"tempat_lahir" varchar(100) DEFAULT 'Depok' NOT NULL,
	"tanggal_lahir" varchar(50) DEFAULT '14 Maret 2008' NOT NULL,
	"agama" varchar(30) DEFAULT 'Islam' NOT NULL,
	"alamat" varchar(255) DEFAULT 'Jl. H. Caraka No. 12, Cisalak, Depok' NOT NULL,
	"telepon" varchar(30) DEFAULT '0812-9876-5432' NOT NULL,
	"nama_wali" varchar(150) DEFAULT 'Bambang Pratama' NOT NULL,
	"telepon_wali" varchar(30) DEFAULT '0813-1122-3344' NOT NULL,
	"email" varchar(150) DEFAULT 'siswa@ghamacaraka.sch.id' NOT NULL,
	"foto_profil" text DEFAULT '',
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_nisn_unique" UNIQUE("nisn")
);
--> statement-breakpoint
CREATE TABLE "subject_attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_key" varchar(50) NOT NULL,
	"kelas" varchar(50) NOT NULL,
	"mata_pelajaran" varchar(100) NOT NULL,
	"tanggal" varchar(20) NOT NULL,
	"no_urut" integer DEFAULT 1 NOT NULL,
	"nisn" varchar(20) NOT NULL,
	"nama_siswa" varchar(150) NOT NULL,
	"status" varchar(20) DEFAULT 'Hadir' NOT NULL,
	"catatan" varchar(255) DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"nip" varchar(30) DEFAULT '',
	"nama_guru" varchar(150) NOT NULL,
	"nama_panggilan" varchar(50) DEFAULT '',
	"mata_pelajaran" varchar(100) NOT NULL,
	"email" varchar(150) DEFAULT '',
	"nomor_telepon" varchar(30) DEFAULT '',
	"jenis_kelamin" varchar(20) DEFAULT 'Perempuan' NOT NULL,
	"tempat_lahir" varchar(100) DEFAULT 'Jakarta' NOT NULL,
	"tanggal_lahir" varchar(50) DEFAULT '12 Mei 1989' NOT NULL,
	"alamat" varchar(255) DEFAULT 'Depok, Jawa Barat' NOT NULL,
	"is_walas" boolean DEFAULT false NOT NULL,
	"kelas_walas" varchar(50) DEFAULT '' NOT NULL,
	"foto_profil" text DEFAULT '',
	"status_akun" varchar(20) DEFAULT 'Aktif' NOT NULL,
	"tahun_ajaran" varchar(20) DEFAULT '2026/2027' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'siswa' NOT NULL,
	"nama_lengkap" varchar(150) DEFAULT '',
	"email" varchar(150) DEFAULT '',
	"foto_profil" text DEFAULT '',
	"student_id" uuid,
	"teacher_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_records" ADD CONSTRAINT "daily_attendance_records_daily_attendance_id_daily_attendances_id_fk" FOREIGN KEY ("daily_attendance_id") REFERENCES "public"."daily_attendances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_records" ADD CONSTRAINT "daily_attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendances" ADD CONSTRAINT "daily_attendances_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_barcodes" ADD CONSTRAINT "student_barcodes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_students_class_student_idx" ON "class_students" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_attendance_records_session_student_idx" ON "daily_attendance_records" USING btree ("daily_attendance_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_attendances_class_date_idx" ON "daily_attendances" USING btree ("class_id","attendance_date");