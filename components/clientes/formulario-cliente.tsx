"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialogo } from "@/components/ui/dialogo";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada, Selecao } from "@/components/ui/campos";
import { ESTADOS_BR, ORIGENS } from "@/lib/dominio";
import { formatarCep, formatarCpf, formatarTelefone, soDigitos } from "@/lib/formato";
import { salvarCliente } from "@/app/sistema/clientes/acoes";

export type ClienteForm = {
  id?: number;
  nome?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  nascimento?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  origem?: string | null;
  responsavelId?: number | null;
  observacoes?: string | null;
};

const mascaraTelefone = (v: string) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const mascaraCpf = (v: string) => {
  const d = soDigitos(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
};

export function FormularioCliente({
  aberto,
  aoMudar,
  inicial,
  equipe,
  aoSalvar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  inicial?: ClienteForm;
  equipe: { id: number; nome: string }[];
  aoSalvar?: (id: number, nome: string) => void;
}) {
  const [pendente, setPendente] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      titulo={inicial?.id ? "Editar cliente" : "Novo cliente"}
      descricao="Campos com * são obrigatórios. O WhatsApp é usado para achar o cliente quando ele manda mensagem."
      largura="lg"
      rodape={
        <>
          <Botao type="button" variante="fantasma" onClick={() => aoMudar(false)}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-cliente" variante="primario" carregando={pendente}>
            {inicial?.id ? "Salvar alterações" : "Cadastrar cliente"}
          </Botao>
        </>
      }
    >
      {/* o corpo monta a cada abertura (o diálogo desmonta ao fechar), então o
          estado nasce do `inicial` sem efeito nenhum e não reseta no meio da digitação */}
      <CorpoCliente inicial={inicial} equipe={equipe} aoPendente={setPendente} aoConcluir={(id, nome) => {
        aoMudar(false);
        aoSalvar?.(id, nome);
      }} />
    </Dialogo>
  );
}

/** O mesmo formulário, aberto direto na tela (passo Cliente da venda: dono, 15/10/2026, "a venda fica completa e não
 *  precisa ir para outra aba para colocar CPF e endereço"). */
export function ClienteNaTela({ inicial, equipe, aoSalvar, aoCancelar }: { inicial: ClienteForm; equipe: { id: number; nome: string }[]; aoSalvar: () => void; aoCancelar?: () => void }) {
  const [pendente, setPendente] = useState(false);
  return (
    <div>
      <CorpoCliente idForm="form-cliente-tela" inicial={inicial} equipe={equipe} aoPendente={setPendente} aoConcluir={() => aoSalvar()} />
      <div className="mt-4 flex justify-end gap-2">
        {aoCancelar && (
          <Botao type="button" variante="fantasma" onClick={aoCancelar}>
            Cancelar
          </Botao>
        )}
        <Botao type="submit" form="form-cliente-tela" variante="primario" carregando={pendente}>
          Salvar dados do cliente
        </Botao>
      </div>
    </div>
  );
}

function CorpoCliente({
  idForm = "form-cliente",
  inicial,
  equipe,
  aoPendente,
  aoConcluir,
}: {
  idForm?: string;
  inicial?: ClienteForm;
  equipe: { id: number; nome: string }[];
  aoPendente: (v: boolean) => void;
  aoConcluir: (id: number, nome: string) => void;
}) {
  const [f, setF] = useState<ClienteForm>(() => {
    const i = inicial ?? {};
    return {
      ...i,
      cpf: i.cpf ? formatarCpf(i.cpf) : "",
      telefone: i.telefone ? formatarTelefone(i.telefone) : "",
      whatsapp: i.whatsapp ? formatarTelefone(i.whatsapp) : "",
      cep: i.cep ? formatarCep(i.cep) : "",
    };
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const [buscandoCep, setBuscandoCep] = useState(false);

  useEffect(() => aoPendente(pendente), [pendente, aoPendente]);

  const muda = (k: keyof ClienteForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  /* CEP completo preenche endereço pelo ViaCEP; se o serviço falhar, a pessoa digita */
  async function aoSairDoCep() {
    const d = soDigitos(f.cep);
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) {
        setErros((e) => ({ ...e, cep: "CEP não encontrado" }));
      } else {
        setF((x) => ({ ...x, endereco: x.endereco || j.logradouro, bairro: x.bairro || j.bairro, cidade: j.localidade, estado: j.uf }));
        setErros((e) => ({ ...e, cep: "" }));
      }
    } catch {
      /* sem internet ou serviço fora: segue manual */
    } finally {
      setBuscandoCep(false);
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarCliente({ ...f, id: inicial?.id });
      if (!r.ok) {
        setErros(r.campos ?? {});
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      aoConcluir(r.dados.id, String(f.nome ?? "").trim());
    });
  }

  return (
      <form id={idForm} onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-6" noValidate>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3 sm:col-span-6">Dados pessoais</p>
        <Campo rotulo="Nome completo" obrigatorio erro={erros.nome} className="sm:col-span-4" htmlFor="c-nome">
          <Entrada id="c-nome" value={f.nome ?? ""} onChange={muda("nome")} invalido={!!erros.nome} autoFocus autoComplete="off" />
        </Campo>
        <Campo rotulo="CPF" erro={erros.cpf} className="sm:col-span-2" htmlFor="c-cpf">
          <Entrada id="c-cpf" inputMode="numeric" value={f.cpf ?? ""} onChange={(e) => setF((x) => ({ ...x, cpf: mascaraCpf(e.target.value) }))} invalido={!!erros.cpf} />
        </Campo>
        <Campo rotulo="WhatsApp" erro={erros.whatsapp} className="sm:col-span-2" htmlFor="c-zap">
          <Entrada id="c-zap" inputMode="tel" value={f.whatsapp ?? ""} onChange={(e) => setF((x) => ({ ...x, whatsapp: mascaraTelefone(e.target.value) }))} invalido={!!erros.whatsapp} placeholder="(81) 99999-9999" />
        </Campo>
        <Campo rotulo="Telefone" erro={erros.telefone} className="sm:col-span-2" htmlFor="c-tel">
          <Entrada id="c-tel" inputMode="tel" value={f.telefone ?? ""} onChange={(e) => setF((x) => ({ ...x, telefone: mascaraTelefone(e.target.value) }))} invalido={!!erros.telefone} />
        </Campo>
        <Campo rotulo="Aniversário" erro={erros.nascimento} className="sm:col-span-2" htmlFor="c-nasc">
          <Entrada id="c-nasc" type="date" value={f.nascimento ?? ""} onChange={muda("nascimento")} invalido={!!erros.nascimento} />
        </Campo>
        <Campo rotulo="E-mail" erro={erros.email} className="sm:col-span-6" htmlFor="c-email">
          <Entrada id="c-email" type="email" inputMode="email" value={f.email ?? ""} onChange={muda("email")} invalido={!!erros.email} />
        </Campo>

        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3 sm:col-span-6">Endereço</p>
        <Campo rotulo="CEP" erro={erros.cep} dica={buscandoCep ? "Buscando endereço…" : undefined} className="sm:col-span-2" htmlFor="c-cep">
          <Entrada
            id="c-cep"
            inputMode="numeric"
            value={f.cep ?? ""}
            onChange={(e) => setF((x) => ({ ...x, cep: soDigitos(e.target.value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2") }))}
            onBlur={aoSairDoCep}
            invalido={!!erros.cep}
          />
        </Campo>
        <Campo rotulo="Endereço" erro={erros.endereco} className="sm:col-span-3" htmlFor="c-end">
          <Entrada id="c-end" value={f.endereco ?? ""} onChange={muda("endereco")} />
        </Campo>
        <Campo rotulo="Número" className="sm:col-span-1" htmlFor="c-num">
          <Entrada id="c-num" value={f.numero ?? ""} onChange={muda("numero")} />
        </Campo>
        <Campo rotulo="Bairro" className="sm:col-span-2" htmlFor="c-bairro">
          <Entrada id="c-bairro" value={f.bairro ?? ""} onChange={muda("bairro")} />
        </Campo>
        <Campo rotulo="Cidade" className="sm:col-span-2" htmlFor="c-cidade">
          <Entrada id="c-cidade" value={f.cidade ?? ""} onChange={muda("cidade")} />
        </Campo>
        <Campo rotulo="Estado" erro={erros.estado} className="sm:col-span-1" htmlFor="c-uf">
          <Selecao id="c-uf" value={f.estado ?? ""} onChange={muda("estado")}>
            <option value="">—</option>
            {ESTADOS_BR.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Complemento" className="sm:col-span-1" htmlFor="c-comp">
          <Entrada id="c-comp" value={f.complemento ?? ""} onChange={muda("complemento")} />
        </Campo>

        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3 sm:col-span-6">Relacionamento</p>
        <Campo rotulo="Origem do cliente" className="sm:col-span-3" htmlFor="c-origem">
          <Selecao id="c-origem" value={f.origem ?? ""} onChange={muda("origem")}>
            <option value="">Não informada</option>
            {Object.entries(ORIGENS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Consultor responsável" dica={!inicial?.id ? "Em branco, fica com você." : undefined} className="sm:col-span-3" htmlFor="c-resp">
          <Selecao id="c-resp" value={f.responsavelId ?? ""} onChange={(e) => setF((x) => ({ ...x, responsavelId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">—</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Observações" erro={erros.observacoes} className="sm:col-span-6" htmlFor="c-obs">
          <AreaTexto id="c-obs" value={f.observacoes ?? ""} onChange={muda("observacoes")} placeholder="Preferências, restrições, como gosta de ser atendido…" />
        </Campo>
      </form>
  );
}
