CREATE TABLE "ia_memorias" (
	"conversa_id" integer PRIMARY KEY NOT NULL,
	"fatos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resumo" text,
	"limpa_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ia_workflow_execucoes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ia_workflow_execucoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversa_id" integer,
	"mensagem_id" bigint,
	"gatilho" text NOT NULL,
	"status" text DEFAULT 'rodando' NOT NULL,
	"no_atual" text,
	"parado_em" text,
	"motivo" text,
	"passos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone,
	"duracao_ms" integer
);
--> statement-breakpoint
ALTER TABLE "ia_memorias" ADD CONSTRAINT "ia_memorias_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ia_workflow_execucoes" ADD CONSTRAINT "ia_workflow_execucoes_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ia_wf_exec_iniciado_idx" ON "ia_workflow_execucoes" USING btree ("iniciado_em");--> statement-breakpoint
CREATE INDEX "ia_wf_exec_conversa_idx" ON "ia_workflow_execucoes" USING btree ("conversa_id");