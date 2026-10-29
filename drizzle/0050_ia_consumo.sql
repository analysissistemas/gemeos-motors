CREATE TABLE "ia_consumo" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ia_consumo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"modelo" text NOT NULL,
	"tipo" text NOT NULL,
	"tokens_entrada" integer,
	"tokens_saida" integer,
	"custo_usd" numeric(10, 6) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ia_consumo_criado_idx" ON "ia_consumo" USING btree ("criado_em");