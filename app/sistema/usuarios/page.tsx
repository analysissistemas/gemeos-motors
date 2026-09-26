import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { Pagina } from "@/components/ui/pagina";
import { TelaUsuarios } from "./tela";

export const metadata: Metadata = { title: "Usuários" };

export default async function PaginaUsuarios() {
  const u = await exigirPermissao("usuarios.gerenciar");
  const usuarios = await db
    .select({
      id: schema.usuarios.id,
      nome: schema.usuarios.nome,
      usuario: schema.usuarios.usuario,
      email: schema.usuarios.email,
      papel: schema.usuarios.papel,
      ativo: schema.usuarios.ativo,
      fotoUrl: schema.usuarios.fotoUrl,
      ultimoAcessoEm: schema.usuarios.ultimoAcessoEm,
      criadoEm: schema.usuarios.criadoEm,
    })
    .from(schema.usuarios)
    .orderBy(asc(schema.usuarios.nome));
  return (
    <Pagina>
      <TelaUsuarios usuarios={usuarios} eu={u.id} />
    </Pagina>
  );
}
