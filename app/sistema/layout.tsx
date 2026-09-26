import { exigirUsuario } from "@/lib/auth/dal";
import { contarPendencias } from "@/lib/consultas/contadores";
import { Casca } from "@/components/shell/casca";
import { ProvedorContadores } from "@/components/shell/contadores";

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const inicial = await contarPendencias(usuario);
  return (
    <ProvedorContadores inicial={inicial}>
      <Casca usuario={{ nome: usuario.nome, papel: usuario.papel, fotoUrl: usuario.fotoUrl }}>{children}</Casca>
    </ProvedorContadores>
  );
}
