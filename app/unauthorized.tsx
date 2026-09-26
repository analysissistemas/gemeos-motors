import { TelaErro } from "@/components/ui/tela-erro";

export default function NaoAutenticado() {
  return <TelaErro codigo="401" titulo="Sua sessão expirou" texto="Por segurança a sessão dura até 2 horas. Entre de novo para continuar." acoes={[{ rotulo: "Entrar", href: "/login", primaria: true }]} />;
}
