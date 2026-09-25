ALTER TABLE "ia_execucoes" ADD COLUMN "prompt_versoes" jsonb;--> statement-breakpoint
ALTER TABLE "ia_execucoes" ADD COLUMN "modelo" text;--> statement-breakpoint
ALTER TABLE "ia_execucoes" ADD COLUMN "tokens_entrada" integer;--> statement-breakpoint
ALTER TABLE "ia_execucoes" ADD COLUMN "tokens_saida" integer;--> statement-breakpoint
ALTER TABLE "ia_execucoes" ADD COLUMN "custo_usd" numeric(10, 6);