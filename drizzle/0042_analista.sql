CREATE TABLE "analises_conversa" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analises_conversa_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversa_id" integer NOT NULL,
	"dia" date NOT NULL,
	"ultima_mensagem_id" bigint NOT NULL,
	"ficha" jsonb NOT NULL,
	"metricas" jsonb NOT NULL,
	"assunto" text NOT NULL,
	"resultado" text NOT NULL,
	"nota" integer,
	"descartados" integer DEFAULT 0 NOT NULL,
	"modelo" text,
	"tokens_entrada" integer,
	"tokens_saida" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analises_conversa" ADD CONSTRAINT "analises_conversa_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analises_conversa_dia_unico" ON "analises_conversa" USING btree ("conversa_id","dia");--> statement-breakpoint
CREATE INDEX "analises_conversa_dia_idx" ON "analises_conversa" USING btree ("dia");