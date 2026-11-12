import { exigirUsuario } from "@/lib/auth/dal";
import { contarPendencias } from "@/lib/consultas/contadores";
import { lerSituacaoCredito } from "@/lib/ia/consumo";
import { textoDoCredito } from "@/lib/ia/credito";
import { Casca } from "@/components/shell/casca";
import { ProvedorContadores } from "@/components/shell/contadores";
import { VigiaVersao } from "@/components/shell/versao";
import { SeloCreditoIa } from "./_credito/selo";

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const [inicial, credito] = await Promise.all([contarPendencias(usuario), lerSituacaoCredito().catch(() => null)]);
  const selo = credito ? <SeloCreditoIa nivel={credito.nivel} texto={textoDoCredito(credito)} /> : null;
  return (
    <ProvedorContadores inicial={inicial}>
      <VigiaVersao />
      <Casca usuario={{ nome: usuario.nome, papel: usuario.papel, fotoUrl: usuario.fotoUrl }} seloTopo={selo}>
        {children}
      </Casca>
    </ProvedorContadores>
  );
}
