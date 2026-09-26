import { TelaErro } from "@/components/ui/tela-erro";

export default function NaoEncontrado() {
  return (
    <TelaErro
      codigo="404"
      titulo="Página não encontrada"
      texto="O endereço pode estar incompleto ou o conteúdo foi removido. Volte para o início e continue de lá."
      acoes={[
        { rotulo: "Ver as motos", href: "/vitrine", primaria: true },
        { rotulo: "Entrar no sistema", href: "/sistema" },
      ]}
    />
  );
}
