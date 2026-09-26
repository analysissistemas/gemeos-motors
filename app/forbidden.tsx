import { TelaErro } from "@/components/ui/tela-erro";

export default function AcessoNegado() {
  return (
    <TelaErro
      codigo="403"
      titulo="Você não tem acesso a esta área"
      texto="Se você precisa dela para trabalhar, peça ao administrador para ajustar o seu perfil de acesso."
      acoes={[{ rotulo: "Voltar ao início", href: "/sistema", primaria: true }]}
    />
  );
}
