CREATE TABLE "modelo_cores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "modelo_cores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"modelo_id" integer NOT NULL,
	"nome" text NOT NULL,
	"hex" text NOT NULL,
	"foto_url" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modelo_cores" ADD CONSTRAINT "modelo_cores_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "modelo_cores_nome_uq" ON "modelo_cores" USING btree ("modelo_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "modelo_cores_modelo_idx" ON "modelo_cores" USING btree ("modelo_id","ordem");