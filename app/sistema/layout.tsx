import { exigirUsuario } from "@/lib/auth/dal";
import { contarPendencias } from "@/lib/consultas/contadores";
import { Casca } from "@/components/shell/casca";
import { ProvedorContadores } from "@/components/shell/contadores";
import { VigiaVersao } from "@/components/shell/versao";

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const inicial = await contarPendencias(usuario);
  return (
    <ProvedorContadores inicial={inicial}>
      <VigiaVersao />
      <Casca usuario={{ nome: usuario.nome, papel: usuario.papel, fotoUrl: usuario.fotoUrl }}>{children}</Casca>
    </ProvedorContadores>
  );
}
