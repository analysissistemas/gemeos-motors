import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { exigirPermissao } from "@/lib/auth/dal";
import { configLiberada } from "@/lib/auth/desbloqueio";
import { db, schema } from "@/lib/db";
import { carregarPrompts, lerHorario } from "@/lib/ia/prompt";
import { lerConfigWorkflow } from "@/lib/ia/workflow/config";
import { lerControle } from "@/lib/ia/controle";
import { Pagina } from "@/components/ui/pagina";
import { BotaoTrancar, TelaBloqueio } from "../configuracoes/bloqueio";
import { TelaIa } from "./tela";

export const metadata: Metadata = { title: "Inteligência artificial" };

export default async function PaginaIa() {
  const u = await exigirPermissao("config.gerenciar");
  if (!(await configLiberada(u, "ia")))
    return (
      <Pagina estreita>
        <TelaBloqueio titulo="Configurações da IA" usuario={u.usuario} area="ia" />
      </Pagina>
    );
  const [prompts, conhecimento, controle, execucoes, workflow, horario] = await Promise.all([
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
    lerConfigWorkflow(),
    lerHorario(),
  ]);
  return (
    <Pagina>
      <BotaoTrancar area="ia" />
      <TelaIa prompts={prompts} conhecimento={conhecimento} controle={controle} execucoes={execucoes} workflow={workflow} horario={horario} />
    </Pagina>
  );
}
