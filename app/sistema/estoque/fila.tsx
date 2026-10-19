"use client";
import Link from "next/link";
import type { LinhaFila } from "@/lib/consultas/estoque";
import { dataHora, formatarTelefone, relativo } from "@/lib/formato";
import { EstadoVazio, Painel, Selo } from "@/components/ui/basicos";

/* Fila de espera (dono, 18/10/2026: "uma fila de pessoas que perguntou moto e queria ser lembrada de quando vai chegar
   no estoque"). Por modelo: quem está esperando, desde quando e o que aconteceu. Quando uma unidade do modelo fica
   disponível, quem aceitou ser avisado recebe a mensagem da IA sozinho; quem só perguntou vira tarefa em Follow-ups. */
export function FilaEspera({ linhas }: { linhas: LinhaFila[] }) {
  if (!linhas.length)
    return (
      <EstadoVazio
        titulo="Ninguém na fila ainda"
        texto="Quando um cliente pedir uma moto que não tem no estoque, a IA pergunta se ele quer ser avisado. Quem aceitar aparece aqui e recebe a mensagem sozinho quando a moto chegar."
      />
    );
  const porModelo = new Map<string, LinhaFila[]>();
  for (const l of linhas) porModelo.set(l.modelo, [...(porModelo.get(l.modelo) ?? []), l]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-2">
        Quem <strong>aceitou ser avisado</strong> recebe a mensagem da IA sozinho quando você cadastrar uma unidade disponível do modelo. Quem só perguntou vira uma tarefa em Follow-ups para a equipe.
      </p>
      {[...porModelo.entries()].map(([modelo, ls]) => {
        const esperando = ls.filter((l) => !l.avisadoEm);
        return (
          <Painel key={modelo} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-linha px-5 py-3">
              <p className="text-[15px] font-semibold">{modelo}</p>
              <Selo tom={esperando.length ? "atencao" : "neutro"}>{esperando.length} esperando</Selo>
              {ls.length > esperando.length && <Selo tom="bom">{ls.length - esperando.length} já avisado(s)</Selo>}
            </div>
            <ul className="divide-y divide-linha">
              {ls.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[13px]">
                  <Link href={`/sistema/conversas?c=${l.conversaId}`} className="min-w-[10rem] font-medium hover:underline">
                    {l.cliente ?? l.contato ?? formatarTelefone(l.telefone)}
                  </Link>
                  <span className="num text-ink-3">{formatarTelefone(l.telefone)}</span>
                  <span className="text-ink-3" title={dataHora(l.criadoEm)}>
                    pediu {relativo(l.criadoEm)}
                  </span>
                  <span className="ml-auto">
                    {l.mensagemEm ? (
                      <Selo tom="bom">Avisado pela IA {relativo(l.mensagemEm)}</Selo>
                    ) : l.avisadoEm ? (
                      <Selo tom="info">Chegou: tarefa para a equipe</Selo>
                    ) : l.consentiuEm ? (
                      <Selo tom="marca">Aceitou ser avisado</Selo>
                    ) : (
                      <Selo tom="neutro">Só perguntou</Selo>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Painel>
        );
      })}
    </div>
  );
}
