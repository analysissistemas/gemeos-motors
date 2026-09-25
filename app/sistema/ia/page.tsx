import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { carregarPrompts } from "@/lib/ia/prompt";
import { lerControle } from "@/lib/ia/controle";
import { Pagina } from "@/components/ui/pagina";
import { TelaIa } from "./tela";

export const metadata: Metadata = { title: "Inteligência artificial" };

export default async function PaginaIa() {
  await exigirPermissao("config.gerenciar");
  const [prompts, conhecimento, controle, execucoes] = await Promise.all([
    carregarPrompts(),
    db.select().from(schema.iaConhecimento).orderBy(asc(schema.iaConhecimento.categoria), asc(schema.iaConhecimento.titulo)),
    lerControle(),
    db
      .select({
        id: schema.iaExecucoes.id,
        criadoEm: schema.iaExecucoes.criadoEm,
        origem: schema.iaExecucoes.origem,
        texto: schema.iaExecucoes.texto,
        enviada: schema.iaExecucoes.enviada,
        motivo: schema.iaExecucoes.motivo,
        violacoes: schema.iaExecucoes.violacoes,
        contato: schema.conversas.contatoNome,
      })
      .from(schema.iaExecucoes)
      .leftJoin(schema.conversas, eq(schema.conversas.id, schema.iaExecucoes.conversaId))
      .orderBy(desc(schema.iaExecucoes.id))
      .limit(30),
  ]);
  return (
    <Pagina>
      <TelaIa prompts={prompts} conhecimento={conhecimento} controle={controle} execucoes={execucoes} />
    </Pagina>
  );
}
