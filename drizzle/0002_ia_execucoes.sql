CREATE TABLE "ia_execucoes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ia_execucoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversa_id" integer,
	"origem" text NOT NULL,
	"texto" text NOT NULL,
	"aprovada" boolean NOT NULL,
	"enviada" boolean NOT NULL,
	"motivo" text,
	"violacoes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ia_execucoes" ADD CONSTRAINT "ia_execucoes_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ia_execucoes_criado_idx" ON "ia_execucoes" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "ia_execucoes_conversa_idx" ON "ia_execucoes" USING btree ("conversa_id");