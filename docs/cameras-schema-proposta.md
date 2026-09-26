# Proposta de schema: câmeras (aditiva, NÃO aplicada)

Para a sessão dona de `lib/db/schema.ts`. Só tabelas novas; nada existente muda.
Nenhum endereço real aqui: `endereco` vem de cadastro; senha NUNCA no banco em texto
(guardar só o nome da variável de ambiente em `segredo_ref`).

```ts
export const cameras = pgTable("cameras", {
  id: serial("id").primaryKey(),
  posicao: integer("posicao").notNull(), // 1, 2 ou 3
  nome: text("nome").notNull(),
  fonte: text("fonte").notNull(), // rtsp | ip_camera | nvr
  provedor: text("provedor").notNull().default("nao_conectado"),
  endereco: text("endereco"), // preenchido no cadastro, nunca inventado
  canalNvr: integer("canal_nvr"),
  segredoRef: text("segredo_ref"), // nome da variável de ambiente
  status: text("status").notNull().default("nao_conectada"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cameras_posicao_uq").on(t.posicao)]);

export const cameraEventos = pgTable("camera_eventos", {
  id: serial("id").primaryKey(),
  cameraId: integer("camera_id").notNull().references(() => cameras.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(), // movimento | pessoa | conexao_perdida | conexao_restabelecida | snapshot | outro
  descricao: text("descricao"),
  ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("camera_eventos_cam_data_idx").on(t.cameraId, t.ocorridoEm)]);

export const cameraSnapshots = pgTable("camera_snapshots", {
  id: serial("id").primaryKey(),
  cameraId: integer("camera_id").notNull().references(() => cameras.id, { onDelete: "cascade" }),
  eventoId: integer("evento_id").references(() => cameraEventos.id, { onDelete: "set null" }),
  arquivoUrl: text("arquivo_url").notNull(), // armazenamento de arquivos (ex.: Vercel Blob), não o banco
  tipoMime: text("tipo_mime").notNull(),
  capturadoEm: timestamp("capturado_em", { withTimezone: true }).notNull(),
}, (t) => [index("camera_snapshots_cam_data_idx").on(t.cameraId, t.capturadoEm)]);
```

Permissão nova sugerida em `lib/dominio.ts`: `"cameras.ver": ADMIN` (hoje a página usa `config.gerenciar`).
