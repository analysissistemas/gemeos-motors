CREATE TABLE "test_drives" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "test_drives_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cliente_id" integer,
	"nome_contato" text,
	"telefone" text,
	"conversa_id" integer,
	"negocio_id" integer,
	"modelo_id" integer,
	"veiculo_id" integer,
	"veiculo_descricao" text,
	"agendado_para" timestamp with time zone NOT NULL,
	"responsavel_id" integer,
	"status" text DEFAULT 'agendado' NOT NULL,
	"observacoes" text,
	"resultado" text,
	"encerrado_em" timestamp with time zone,
	"encerrado_por" integer,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "foto_url" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "foto_url" text;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_negocio_id_negocios_id_fk" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_encerrado_por_usuarios_id_fk" FOREIGN KEY ("encerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_drives" ADD CONSTRAINT "test_drives_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_drives_agenda_idx" ON "test_drives" USING btree ("status","agendado_para");--> statement-breakpoint
CREATE INDEX "test_drives_veiculo_idx" ON "test_drives" USING btree ("veiculo_id","agendado_para");--> statement-breakpoint
CREATE INDEX "test_drives_modelo_idx" ON "test_drives" USING btree ("modelo_id","agendado_para");--> statement-breakpoint
CREATE INDEX "test_drives_conversa_idx" ON "test_drives" USING btree ("conversa_id");--> statement-breakpoint
CREATE INDEX "test_drives_cliente_idx" ON "test_drives" USING btree ("cliente_id");