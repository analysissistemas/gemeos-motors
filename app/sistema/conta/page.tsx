import type { Metadata } from "next";
import { exigirUsuario } from "@/lib/auth/dal";
import { PAPEIS } from "@/lib/dominio";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, ItemInfo, Painel } from "@/components/ui/basicos";
import { TrocarSenha } from "./trocar-senha";
import { MinhaFoto } from "./minha-foto";

export const metadata: Metadata = { title: "Minha conta" };

export default async function PaginaConta() {
  const u = await exigirUsuario();
  return (
    <Pagina estreita>
      <CabecalhoPagina titulo="Minha conta" />
      <Painel className="mb-4 p-5">
        <div className="mb-5 flex items-center gap-4">
          <MinhaFoto id={u.id} nome={u.nome} foto={u.fotoUrl} />
          <p className="text-[13px] text-ink-2">Sua foto aparece no menu e para a equipe, para todo mundo saber quem está atendendo.</p>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <ItemInfo rotulo="Nome">{u.nome}</ItemInfo>
          <ItemInfo rotulo="Usuário">{u.usuario}</ItemInfo>
          <ItemInfo rotulo="Perfil">{PAPEIS[u.papel]}</ItemInfo>
          <ItemInfo rotulo="E-mail">{u.email}</ItemInfo>
        </dl>
      </Painel>
      <TrocarSenha />
    </Pagina>
  );
}
