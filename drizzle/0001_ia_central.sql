CREATE TABLE "ia_conhecimento" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ia_conhecimento_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"categoria" text NOT NULL,
	"titulo" text NOT NULL,
	"conteudo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" integer
);
--> statement-breakpoint
CREATE TABLE "ia_prompt_versoes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ia_prompt_versoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"secao" text NOT NULL,
	"versao" integer NOT NULL,
	"conteudo" text NOT NULL,
	"status" text NOT NULL,
	"nota" text,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"publicado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ia_conhecimento" ADD CONSTRAINT "ia_conhecimento_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ia_prompt_versoes" ADD CONSTRAINT "ia_prompt_versoes_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ia_conhecimento_categoria_idx" ON "ia_conhecimento" USING btree ("categoria");--> statement-breakpoint
CREATE UNIQUE INDEX "ia_prompt_secao_versao_uq" ON "ia_prompt_versoes" USING btree ("secao","versao");--> statement-breakpoint
CREATE UNIQUE INDEX "ia_prompt_um_rascunho_uq" ON "ia_prompt_versoes" USING btree ("secao") WHERE "ia_prompt_versoes"."status" = 'rascunho';--> statement-breakpoint
CREATE UNIQUE INDEX "ia_prompt_uma_publicada_uq" ON "ia_prompt_versoes" USING btree ("secao") WHERE "ia_prompt_versoes"."status" = 'publicada';