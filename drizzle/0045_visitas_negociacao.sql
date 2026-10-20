ALTER TABLE "test_drives" ADD COLUMN "tipo" text DEFAULT 'test_drive' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_drives" ADD COLUMN "hora_definida" boolean DEFAULT true NOT NULL;