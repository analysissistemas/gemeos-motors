CREATE TABLE "reservas_lancamento" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reservas_lancamento_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"modelo_id" integer,
	"cliente_id" integer,
	"negocio_id" integer,
	"nome" text NOT NULL,
	"telefone" text NOT NULL,
	"cor" text,
	"status" text DEFAULT 'nova' NOT NULL,
	"observacoes" text,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "descricao" text;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "foto_url" text;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "mostrar_no_site" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "disponibilidade" text DEFAULT 'consultar' NOT NULL;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "lancamento" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "lancamento_texto" text;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "ordem" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas_lancamento" ADD CONSTRAINT "reservas_lancamento_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_lancamento" ADD CONSTRAINT "reservas_lancamento_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_lancamento" ADD CONSTRAINT "reservas_lancamento_negocio_id_negocios_id_fk" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservas_status_idx" ON "reservas_lancamento" USING btree ("status","criado_em");--> statement-breakpoint
CREATE INDEX "reservas_modelo_idx" ON "reservas_lancamento" USING btree ("modelo_id");--> statement-breakpoint
/* Os 3 acessórios reais do site (public/estoque.js, CAT_ACES) entram no catálogo:
   sem isso, quando /api/vitrine/catalogo responde, eles somem do site. Preço nulo
   = "Consultar preço" (o site oficial não publica preço de acessório). Idempotente. */
INSERT INTO "modelos" ("tipo", "nome", "preco_tabela", "eletrico", "descricao", "disponibilidade", "ordem")
SELECT v.tipo, v.nome, NULL, true, v.descricao, 'consultar', v.ordem
FROM (VALUES
  ('acessorio', 'Capacete TOMATE Azul', 'Modelo esportivo ventilado com ajuste lateral', 100),
  ('acessorio', 'Capacete TOMATE Branco', 'Modelo aberto com viseira e detalhe laranja', 101),
  ('acessorio', 'Baú 28 litros', 'Base universal Pro Tork, ideal para bagagem no dia a dia', 102)
) AS v(tipo, nome, descricao, ordem)
WHERE NOT EXISTS (SELECT 1 FROM "modelos" m WHERE lower(m."nome") = lower(v.nome));--> statement-breakpoint
/* ordem inicial do site = a mesma do estoque.js (a equipe muda depois em Estoque → Catálogo) */
UPDATE "modelos" m SET "ordem" = v.ordem
FROM (VALUES ('TANK AG11', 0), ('T1', 1), ('M6', 2), ('T3 RETRÔ', 3), ('AG08', 4), ('DF17', 5), ('TCN BASKET', 6), ('MM3', 7)) AS v(nome, ordem)
WHERE lower(m."nome") = lower(v.nome) AND m."ordem" = 0;
