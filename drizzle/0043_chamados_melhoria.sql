CREATE TABLE "chamados_melhoria" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chamados_melhoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tipo" text NOT NULL,
	"area" text NOT NULL,
	"titulo" text NOT NULL,
	"problema" text NOT NULL,
	"proposta" jsonb NOT NULL,
	"evidencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clientes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'novo' NOT NULL,
	"resultado" jsonb,
	"observacao" text,
	"decidido_por" integer,
	"decidido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chamados_melhoria" ADD CONSTRAINT "chamados_melhoria_decidido_por_usuarios_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chamados_melhoria_status_idx" ON "chamados_melhoria" USING btree ("status","criado_em");