"use client";
import { useEffect } from "react";
import { TelaErro } from "@/components/ui/tela-erro";

export default function ErroGeral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <TelaErro
      codigo="500"
      titulo="Algo deu errado do nosso lado"
      texto="Não foi culpa sua. Tente de novo em instantes; se continuar, avise a equipe informando o código abaixo."
      acoes={[
        { rotulo: "Tentar de novo", aoClicar: reset, primaria: true },
        { rotulo: "Ir para o início", href: "/" },
      ]}
      detalhe={error.digest ? `Código do erro: ${error.digest}` : undefined}
    />
  );
}
