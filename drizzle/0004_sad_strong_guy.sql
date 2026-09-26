CREATE TABLE "camera_eventos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "camera_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"camera_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text,
	"ocorrido_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "camera_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "camera_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"camera_id" integer NOT NULL,
	"evento_id" integer,
	"arquivo_url" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"capturado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cameras" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cameras_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"posicao" integer NOT NULL,
	"nome" text NOT NULL,
	"fonte" text NOT NULL,
	"provedor" text DEFAULT 'nao_conectado' NOT NULL,
	"endereco" text,
	"canal_nvr" integer,
	"segredo_ref" text,
	"status" text DEFAULT 'nao_conectada' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interesses_modelo" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "interesses_modelo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversa_id" integer NOT NULL,
	"cliente_id" integer,
	"telefone" text NOT NULL,
	"modelo_id" integer NOT NULL,
	"origem" text DEFAULT 'equipe' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"avisado_em" timestamp with time zone,
	"follow_up_id" integer
);
--> statement-breakpoint
CREATE TABLE "ligacoes_historico" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ligacoes_historico_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"solicitacao_id" integer NOT NULL,
	"usuario_id" integer,
	"resultado" text NOT NULL,
	"duracao_segundos" integer,
	"notas" text,
	"proxima_acao" text,
	"ocorrida_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitacoes_ligacao" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "solicitacoes_ligacao_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversa_id" integer,
	"cliente_id" integer,
	"nome_contato" text,
	"telefone" text NOT NULL,
	"motivo" text,
	"preferencia" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"responsavel_id" integer,
	"agendado_para" timestamp with time zone,
	"fora_do_horario" boolean DEFAULT false NOT NULL,
	"origem" text DEFAULT 'cliente' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "tipo" text;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "motivo" text;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "origem" text;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "modelo_id" integer;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "contexto" jsonb;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "exige_aprovacao" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "camera_eventos" ADD CONSTRAINT "camera_eventos_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_snapshots" ADD CONSTRAINT "camera_snapshots_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_snapshots" ADD CONSTRAINT "camera_snapshots_evento_id_camera_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."camera_eventos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interesses_modelo" ADD CONSTRAINT "interesses_modelo_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interesses_modelo" ADD CONSTRAINT "interesses_modelo_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interesses_modelo" ADD CONSTRAINT "interesses_modelo_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interesses_modelo" ADD CONSTRAINT "interesses_modelo_follow_up_id_follow_ups_id_fk" FOREIGN KEY ("follow_up_id") REFERENCES "public"."follow_ups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligacoes_historico" ADD CONSTRAINT "ligacoes_historico_solicitacao_id_solicitacoes_ligacao_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacoes_ligacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligacoes_historico" ADD CONSTRAINT "ligacoes_historico_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_ligacao" ADD CONSTRAINT "solicitacoes_ligacao_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_ligacao" ADD CONSTRAINT "solicitacoes_ligacao_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_ligacao" ADD CONSTRAINT "solicitacoes_ligacao_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "camera_eventos_cam_data_idx" ON "camera_eventos" USING btree ("camera_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "camera_snapshots_cam_data_idx" ON "camera_snapshots" USING btree ("camera_id","capturado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "cameras_posicao_uq" ON "cameras" USING btree ("posicao");--> statement-breakpoint
CREATE UNIQUE INDEX "interesses_abertos_uq" ON "interesses_modelo" USING btree ("conversa_id","modelo_id") WHERE "interesses_modelo"."avisado_em" is null;--> statement-breakpoint
CREATE INDEX "interesses_modelo_idx" ON "interesses_modelo" USING btree ("modelo_id");--> statement-breakpoint
CREATE INDEX "ligacoes_hist_sol_idx" ON "ligacoes_historico" USING btree ("solicitacao_id");--> statement-breakpoint
CREATE INDEX "ligacoes_status_idx" ON "solicitacoes_ligacao" USING btree ("status","criado_em");--> statement-breakpoint
CREATE INDEX "ligacoes_conversa_idx" ON "solicitacoes_ligacao" USING btree ("conversa_id");--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE set null ON UPDATE no action;