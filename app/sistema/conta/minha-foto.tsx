"use client";
import { useRouter } from "next/navigation";
import { EditorFoto } from "@/components/ui/editor-foto";
import { acaoFotoUsuario, acaoRemoverFotoUsuario } from "@/app/sistema/usuarios/acoes";

/** A própria foto: aparece no menu, na lista de usuários e onde a pessoa é responsável. */
export function MinhaFoto({ id, nome, foto }: { id: number; nome: string; foto: string | null }) {
  const router = useRouter();
  return (
    <EditorFoto
      nome={nome}
      foto={foto}
      titulo="Sua foto"
      aoEnviar={(dados) => acaoFotoUsuario(id, dados)}
      aoRemover={() => acaoRemoverFotoUsuario(id)}
      aoMudar={() => router.refresh()}
    />
  );
}
