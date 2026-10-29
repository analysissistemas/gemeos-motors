ALTER TABLE "modelo_cores" ADD COLUMN "foto_vitrine_url" text;--> statement-breakpoint
ALTER TABLE "modelo_cores" ADD COLUMN "foto_enquadre" jsonb;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "foto_vitrine_url" text;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "foto_enquadre" jsonb;