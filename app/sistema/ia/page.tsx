import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { carregarPrompts } from "@/lib/ia/prompt";
import { Pagina } from "@/components/ui/pagina";
import { TelaIa } from "./tela";

export const metadata: Metadata = { title: "Inteligência artificial" };

export default async function PaginaIa() {
  await exigirPermissao("config.gerenciar");
  const [prompts, conhecimento] = await Promise.all([
    carregarPrompts(),
    db.select().from(schema.iaConhecimento).orderBy(asc(schema.iaConhecimento.categoria), asc(schema.iaConhecimento.titulo)),
  ]);
  return (
    <Pagina>
      <TelaIa prompts={prompts} conhecimento={conhecimento} />
    </Pagina>
  );
}
