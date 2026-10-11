"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Painel, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Entrada } from "@/components/ui/campos";
import { FAIXAS, simularCartao, type TaxasMaquineta } from "@/lib/ia/simulacao-cartao";
import { acaoRestaurarTaxas, acaoSalvarTaxas } from "./acoes";

/* Taxas da maquineta (dono, 10/10/2026): a simulação de parcelas que a IA manda usa estes números.
   Campo como texto ("4,9"): vazio ou com letra não salva (nunca vira 0%). */
type Texto = { visaMaster: Record<number, string>; eloAmex: Record<number, string>; debito: { visaMaster: string; eloAmex: string } };

const mostrar = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const ler = (s: string): number | null => {
  const t = s.trim().replace("%", "").replace(",", ".");
  return /^\d{1,2}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
};
const brl = (x: number) => x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function paraTexto(t: TaxasMaquineta): Texto {
  return {
    visaMaster: Object.fromEntries(FAIXAS.map((n) => [n, mostrar(t.visaMaster[n])])),
    eloAmex: Object.fromEntries(FAIXAS.map((n) => [n, mostrar(t.eloAmex[n])])),
    debito: { visaMaster: mostrar(t.debito.visaMaster), eloAmex: mostrar(t.debito.eloAmex) },
  };
}

export function PainelTaxas({ inicial }: { inicial: TaxasMaquineta }) {
  const router = useRouter();
  const [t, setT] = useState<Texto>(() => paraTexto(inicial));
  const [pendente, iniciar] = useTransition();
  const numeros = useMemo(
    () => ({
      visaMaster: Object.fromEntries(FAIXAS.map((n) => [n, ler(t.visaMaster[n])])),
      eloAmex: Object.fromEntries(FAIXAS.map((n) => [n, ler(t.eloAmex[n])])),
      debito: { visaMaster: ler(t.debito.visaMaster), eloAmex: ler(t.debito.eloAmex) },
    }),
    [t],
  );
  const invalidos = [...Object.values(numeros.visaMaster), ...Object.values(numeros.eloAmex), numeros.debito.visaMaster, numeros.debito.eloAmex].filter((x) => x === null).length;
  /* o exemplo do relatório do dono: R$ 1.000 em 21x no Master */
  const exemplo = invalidos ? null : simularCartao({ preco: 1000, parcelas: 21, bandeira: "Mastercard" }, numeros as TaxasMaquineta);
  const mudou = JSON.stringify(t) !== JSON.stringify(paraTexto(inicial));

  const celula = (grupo: "visaMaster" | "eloAmex", n: number) => (
    <Entrada
      aria-label={`${grupo === "visaMaster" ? "Master/Visa" : "Elo/Amex"} ${n}x`}
      inputMode="decimal"
      value={t[grupo][n]}
      invalido={numeros[grupo][n] === null}
      onChange={(e) => setT({ ...t, [grupo]: { ...t[grupo], [n]: e.target.value } })}
      className="h-9 text-right"
    />
  );

  return (
    <Painel className="p-5">
      <TituloSecao>Taxas da maquineta (simulação de parcelas)</TituloSecao>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
        A IA usa estas taxas para simular as parcelas para o cliente. O cliente paga a taxa: valor × (1 + taxa) ÷ parcelas, com a parcela arredondada para cima. 1x no crédito não tem taxa.
        American Express acima de 12x só depois do cliente confirmar que o cartão permite.
      </p>

      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {[FAIXAS.slice(0, 10), FAIXAS.slice(10)].map((faixas, i) => (
          <table key={i} className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3">
                <th className="py-1 font-medium">Parcelas</th>
                <th className="py-1 text-right font-medium">Master/Visa (%)</th>
                <th className="py-1 text-right font-medium">Elo/Amex (%)</th>
              </tr>
            </thead>
            <tbody>
              {faixas.map((n) => (
                <tr key={n}>
                  <td className="num py-0.5 pr-2">{n}x</td>
                  <td className="py-0.5 pl-2">{celula("visaMaster", n)}</td>
                  <td className="py-0.5 pl-2">{celula("eloAmex", n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>Débito Master/Visa (%)</span>
          <Entrada inputMode="decimal" value={t.debito.visaMaster} invalido={numeros.debito.visaMaster === null} onChange={(e) => setT({ ...t, debito: { ...t.debito, visaMaster: e.target.value } })} className="h-9 w-24 text-right" />
        </label>
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>Débito Elo/Amex (%)</span>
          <Entrada inputMode="decimal" value={t.debito.eloAmex} invalido={numeros.debito.eloAmex === null} onChange={(e) => setT({ ...t, debito: { ...t.debito, eloAmex: e.target.value } })} className="h-9 w-24 text-right" />
        </label>
      </div>

      <p className="mt-4 text-[12.5px] text-ink-3">
        {invalidos
          ? `${invalidos} campo(s) em vermelho: use um número de 0 a 99,99 (ex.: 4,9).`
          : exemplo?.tipo === "ok"
            ? `Conferência: R$ 1.000,00 em 21x no Master (${mostrar(exemplo.taxa)}%) = 21x de ${brl(exemplo.parcela)}, total ${brl(exemplo.total)}.`
            : null}
      </p>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Botao
          variante="fantasma"
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              if (!confirm("Voltar todas as taxas para as do relatório de 10/10/2026?")) return;
              const r = await acaoRestaurarTaxas();
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              router.refresh();
            })
          }
        >
          Restaurar taxas do relatório
        </Botao>
        <Botao
          variante="primario"
          carregando={pendente}
          disabled={!!invalidos || !mudou}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoSalvarTaxas(numeros);
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              router.refresh();
            })
          }
        >
          Salvar taxas
        </Botao>
      </div>
    </Painel>
  );
}
