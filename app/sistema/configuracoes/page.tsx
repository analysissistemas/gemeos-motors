import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { exigirPermissao } from "@/lib/auth/dal";
import { configLiberada } from "@/lib/auth/desbloqueio";
import { db, schema } from "@/lib/db";
import { MODELO_IA } from "@/lib/ia/cliente";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { lerConfigParaTela, urlCallback } from "@/lib/mensageria/whatsapp-config";
import { Pagina } from "@/components/ui/pagina";
import { BotaoTrancar, TelaBloqueio } from "./bloqueio";
import { TelaConfiguracoes } from "./tela";

export const metadata: Metadata = { title: "Configurações" };

export default async function PaginaConfiguracoes() {
  const u = await exigirPermissao("config.gerenciar");
  if (!(await configLiberada(u, "config")))
    return (
      <Pagina estreita>
        <TelaBloqueio titulo="Configurações" usuario={u.usuario} area="config" />
      </Pagina>
    );
  const [empresa, respostas, triagem, demo] = await Promise.all([
    db.select().from(schema.empresa).where(eq(schema.empresa.id, 1)).limit(1),
    db.select().from(schema.respostasRapidas).orderBy(asc(schema.respostasRapidas.atalho)),
    db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, "ia.triagem_automatica")).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.conversas).where(eq(schema.conversas.demo, true)),
  ]);
  const [provedor, apiOficial] = await Promise.all([obterProvedor(), lerConfigParaTela()]);
  return (
    <Pagina>
      <BotaoTrancar area="config" />
      <TelaConfiguracoes
        empresa={empresa[0] ?? null}
        respostas={respostas}
        triagemLigada={triagem[0]?.valor !== false}
        conversasDemo={demo[0].n}
        apiOficial={apiOficial}
        urlCallback={urlCallback()}
        info={{ provedor: provedor.nome, simulado: provedor.simulado, modeloIa: MODELO_IA }}
      />
    </Pagina>
  );
}
