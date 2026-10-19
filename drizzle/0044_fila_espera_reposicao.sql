ALTER TABLE "interesses_modelo" ADD COLUMN "consentiu_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interesses_modelo" ADD COLUMN "mensagem_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "reposicao_em" date;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "reposicao_qtd" integer;