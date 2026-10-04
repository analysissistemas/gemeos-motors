"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, FileText, MessageSquare, Pencil, Plus, Wrench } from "lucide-react";
import type { PerfilCliente } from "@/lib/consultas/clientes";
import {
  CANAIS_INTERACAO,
  MOTIVOS_PERDA,
  ORIGENS,
  STATUS_CONVERSA,
  STATUS_VENDA,
  TIPOS_OS,
  ETAPAS_ABERTAS,
  rotuloEtapa,
  rotuloStatusOs,
} from "@/lib/dominio";
import { brl, data, dataHora, formatarCep, formatarCpf, formatarTelefone, numeroDoc, relativo, telefoneWhatsapp } from "@/lib/formato";
import { Abas, LinhaDoTempo } from "@/components/ui/abas";
import { Avatar, EstadoVazio, ItemInfo, Painel, PontoEtapa, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao, classesBotao } from "@/components/ui/botao";
import { AreaTexto, Campo, Selecao } from "@/components/ui/campos";
import { Dialogo } from "@/components/ui/dialogo";
import { EditorFoto } from "@/components/ui/editor-foto";
import { FormularioCliente } from "@/components/clientes/formulario-cliente";
import { acaoFotoCliente, acaoRemoverFotoCliente, registrarInteracao } from "../acoes";

type AbaId = "resumo" | "negocios" | "vendas" | "atendimento" | "assistencia" | "historico";

export function PerfilClienteTela({
  perfil,
  equipe,
  permissoes,
}: {
  perfil: PerfilCliente;
  equipe: { id: number; nome: string }[];
  permissoes: { editar: boolean; funil: boolean; vendas: boolean; os: boolean; conversas: boolean };
}) {
  const { cliente: c, responsavel, responsavelFoto } = perfil;
  const [aba, setAba] = useState<AbaId>("resumo");
  const [editando, setEditando] = useState(false);
  const [interacao, setInteracao] = useState(false);
  const router = useRouter();

  const abertos = perfil.negocios.filter((n) => (ETAPAS_ABERTAS as string[]).includes(n.etapa));
  const vendasFinal = perfil.vendas.filter((v) => v.status === "finalizada");
  const totalComprado = vendasFinal.reduce((s, v) => s + (v.valorVendido ?? 0), 0);
  const osAbertas = perfil.ordens.filter((o) => !["entregue", "cancelada"].includes(o.status));
  const proximoFollow = perfil.followups.filter((f) => f.status === "pendente").sort((a, b) => +new Date(a.agendadoPara) - +new Date(b.agendadoPara))[0];
  const endereco = [c.endereco, c.numero, c.complemento, c.bairro].filter(Boolean).join(", ");
  const veiculosInteresse = Array.from(new Set(perfil.negocios.map((n) => n.veiculo ?? n.veiculoInteresse).filter(Boolean))) as string[];

  return (
    <>
      {/* cabeçalho */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        {permissoes.editar ? (
          <EditorFoto
            nome={c.nome}
            foto={c.fotoUrl}
            titulo="Foto do cliente"
            aoEnviar={(dados) => acaoFotoCliente(c.id, dados)}
            aoRemover={() => acaoRemoverFotoCliente(c.id)}
            aoMudar={() => router.refresh()}
          />
        ) : (
          <Avatar nome={c.nome} foto={c.fotoUrl} tamanho="lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-bold leading-tight tracking-tight">{c.nome}</h1>
            {c.demo && <Selo tom="atencao">Dados simulados</Selo>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-2">
            <span>
              Cliente nº {c.id} · desde {data(c.criadoEm)}
            </span>
            {responsavel && (
              <span className="inline-flex items-center gap-1.5">
                · responsável: <Avatar nome={responsavel} foto={responsavelFoto} tamanho="xs" /> {responsavel}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissoes.editar && (
            <Botao onClick={() => setEditando(true)}>
              <Pencil className="size-4" /> Editar
            </Botao>
          )}
          {permissoes.conversas && (c.whatsapp || c.telefone) && (
            <Link href={`/sistema/conversas?cliente=${c.id}`} className={classesBotao("secundario")}>
              <MessageSquare className="size-4" /> Conversa
            </Link>
          )}
          {permissoes.funil && (
            <Link href={`/sistema/funil?novo=${c.id}`} className={classesBotao("primario")}>
              <Plus className="size-4" /> Novo negócio
            </Link>
          )}
        </div>
      </div>

      {/* números que importam */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Negócios em aberto" valor={String(abertos.length)} />
        <Indicador rotulo="Compras" valor={String(vendasFinal.length)} detalhe={vendasFinal.length ? brl(totalComprado) : undefined} />
        <Indicador rotulo="Assistências em andamento" valor={String(osAbertas.length)} />
        <Indicador rotulo="Próximo follow-up" valor={proximoFollow ? dataHora(proximoFollow.agendadoPara) : "—"} pequeno />
      </div>

      <Abas<AbaId>
        className="mb-4"
        atual={aba}
        aoMudar={setAba}
        abas={[
          { id: "resumo", rotulo: "Dados" },
          { id: "negocios", rotulo: "Negociações", contador: perfil.negocios.length },
          { id: "vendas", rotulo: "Vendas e documentos", contador: perfil.vendas.length },
          { id: "atendimento", rotulo: "Atendimento", contador: perfil.interacoes.length + perfil.conversas.length },
          { id: "assistencia", rotulo: "Assistência", contador: perfil.ordens.length },
          { id: "historico", rotulo: "Histórico de alterações" },
        ]}
      />

      {aba === "resumo" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Painel className="p-5 lg:col-span-2">
            <TituloSecao>Dados pessoais</TituloSecao>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <ItemInfo rotulo="CPF">{c.cpf ? formatarCpf(c.cpf) : null}</ItemInfo>
              <ItemInfo rotulo="Aniversário">{c.nascimento ? data(c.nascimento) : null}</ItemInfo>
              <ItemInfo rotulo="WhatsApp">
                {c.whatsapp ? (
                  <a className="hover:underline" href={`https://wa.me/${telefoneWhatsapp(c.whatsapp)}`} target="_blank" rel="noreferrer">
                    {formatarTelefone(c.whatsapp)}
                  </a>
                ) : null}
              </ItemInfo>
              <ItemInfo rotulo="Telefone">{c.telefone ? formatarTelefone(c.telefone) : null}</ItemInfo>
              <ItemInfo rotulo="E-mail">{c.email}</ItemInfo>
              <ItemInfo rotulo="Origem">{c.origem ? ORIGENS[c.origem as keyof typeof ORIGENS] : null}</ItemInfo>
              <ItemInfo rotulo="Endereço" className="sm:col-span-2">
                {endereco ? `${endereco}${c.cidade ? ` — ${c.cidade}` : ""}${c.estado ? `/${c.estado}` : ""}${c.cep ? ` · CEP ${formatarCep(c.cep)}` : ""}` : null}
              </ItemInfo>
            </dl>
          </Painel>
          <Painel className="p-5">
            <TituloSecao>Observações</TituloSecao>
            {c.observacoes ? (
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{c.observacoes}</p>
            ) : (
              <p className="text-[13px] text-ink-3">Nenhuma observação. Use &quot;Editar&quot; para anotar preferências do cliente.</p>
            )}
            {veiculosInteresse.length > 0 && (
              <>
                <TituloSecao className="mt-5">Veículos de interesse</TituloSecao>
                <ul className="flex flex-wrap gap-1.5">
                  {veiculosInteresse.map((v) => (
                    <li key={v}>
                      <Selo tom="info" ponto={false}>
                        {v}
                      </Selo>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Painel>
        </div>
      )}

      {aba === "negocios" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Painel className="overflow-hidden lg:col-span-2">
            {perfil.negocios.length === 0 ? (
              <EstadoVazio compacto titulo="Nenhuma negociação" texto="Crie um negócio para acompanhar este cliente no funil." />
            ) : (
              <ul>
                {perfil.negocios.map((n) => (
                  <li key={n.id} className="border-b border-linha last:border-0">
                    <Link href={`/sistema/funil?negocio=${n.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-trilho sm:flex-row sm:items-center sm:gap-4">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <PontoEtapa etapa={n.etapa} />
                        <span className="truncate font-semibold">{n.veiculo ?? n.veiculoInteresse ?? "Veículo não definido"}</span>
                      </span>
                      <span className="text-[12.5px] text-ink-2">{rotuloEtapa(n.etapa)}</span>
                      <span className="num text-[12.5px] text-ink-2">
                        {n.valorProposta ? `Proposta ${brl(n.valorProposta)}` : n.valorAnunciado ? `Anunciado ${brl(n.valorAnunciado)}` : "Sem valor"}
                      </span>
                      <span className="text-[12px] text-ink-3">{data(n.criadoEm)}</span>
                    </Link>
                    {n.etapa === "perdida" && n.perdaMotivo && (
                      <p className="-mt-2 px-5 pb-3 text-[12px] text-ink-3">Motivo: {MOTIVOS_PERDA[n.perdaMotivo as keyof typeof MOTIVOS_PERDA] ?? n.perdaMotivo}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          <Painel className="p-5">
            <TituloSecao>Propostas</TituloSecao>
            <LinhaDoTempo
              vazio="Nenhuma proposta registrada."
              itens={perfil.eventosProposta.map((e, i) => ({ id: i, titulo: e.descricao, quando: dataHora(e.criadoEm), quem: e.usuario }))}
            />
          </Painel>
        </div>
      )}

      {aba === "vendas" && (
        <Painel className="overflow-hidden">
          {perfil.vendas.length === 0 ? (
            <EstadoVazio compacto icone={<FileText />} titulo="Nenhuma venda" texto="Quando uma venda for criada para este cliente, o documento e a assinatura aparecem aqui." />
          ) : (
            <ul>
              {perfil.vendas.map((v) => {
                const ass = perfil.assinaturas.filter((a) => a.documentoId === v.id).sort((a, b) => +new Date(b.assinadoEm ?? 0) - +new Date(a.assinadoEm ?? 0))[0];
                return (
                  <li key={v.id} className="flex flex-col gap-2 border-b border-linha px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <Link href={`/sistema/vendas/${v.id}`} className="font-semibold hover:underline">
                        {numeroDoc("V", v.id)} · {v.veiculo || "Veículo"}
                      </Link>
                      <span className="block text-[12.5px] text-ink-2">
                        {v.vendedor ?? "—"} · {data(v.finalizadaEm ?? v.criadoEm)}
                      </span>
                    </span>
                    <Selo tom={v.status === "finalizada" ? "bom" : v.status === "cancelada" ? "critico" : "atencao"}>{STATUS_VENDA[v.status as keyof typeof STATUS_VENDA]}</Selo>
                    {ass?.status === "assinado" && <Selo tom="bom">Assinado {ass.assinadoEm ? data(ass.assinadoEm) : ""}</Selo>}
                    <span className="num font-semibold">{brl(v.valorVendido)}</span>
                    {v.documentoGeradoEm && (
                      <a className={classesBotao("secundario", "sm")} href={`/api/documentos/venda/${v.id}`} target="_blank" rel="noreferrer">
                        <FileText className="size-4" /> PDF
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>
      )}

      {aba === "atendimento" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Painel className="p-5 lg:col-span-2">
            <TituloSecao
              acao={
                permissoes.editar && (
                  <Botao tamanho="sm" onClick={() => setInteracao(true)}>
                    <Plus className="size-4" /> Registrar interação
                  </Botao>
                )
              }
            >
              Interações
            </TituloSecao>
            <LinhaDoTempo
              vazio="Nenhuma ligação, visita ou mensagem registrada."
              itens={perfil.interacoes.map((i) => ({
                id: i.id,
                titulo: CANAIS_INTERACAO[i.canal as keyof typeof CANAIS_INTERACAO] ?? i.canal,
                detalhe: i.resumo,
                quando: dataHora(i.criadoEm),
                quem: i.usuario,
              }))}
            />
          </Painel>
          <div className="flex flex-col gap-4">
            <Painel className="p-5">
              <TituloSecao>Conversas</TituloSecao>
              {perfil.conversas.length === 0 ? (
                <p className="text-[13px] text-ink-3">Nenhuma conversa pelo atendimento.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {perfil.conversas.map((cv) => (
                    <li key={cv.id}>
                      <Link href={`/sistema/conversas?c=${cv.id}`} className="block rounded-xl border border-linha px-3 py-2 hover:border-linha-forte">
                        <span className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="font-semibold">WhatsApp{cv.demo ? " (simulado)" : ""}</span>
                          <span className="text-ink-3">{relativo(cv.ultimaMensagemEm)}</span>
                        </span>
                        <span className="block truncate text-[12.5px] text-ink-2">{cv.ultimaMensagemTexto ?? "—"}</span>
                        <span className="text-[11.5px] text-ink-3">{STATUS_CONVERSA[cv.status as keyof typeof STATUS_CONVERSA]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
            <Painel className="p-5">
              <TituloSecao>Follow-ups</TituloSecao>
              {perfil.followups.length === 0 ? (
                <p className="text-[13px] text-ink-3">Nenhum follow-up agendado.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {perfil.followups.map((f) => (
                    <li key={f.id} className="flex items-start gap-2 text-[13px]">
                      <CalendarClock className="mt-0.5 size-4 shrink-0 text-ink-3" />
                      <span className="min-w-0">
                        <span className="block">{dataHora(f.agendadoPara)}</span>
                        <span className="block text-[12px] text-ink-3">
                          {f.status === "pendente" ? "Pendente" : f.status === "concluido" ? "Concluído" : "Cancelado"}
                          {f.usuario ? ` · ${f.usuario}` : ""}
                          {f.notas ? ` · ${f.notas}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          </div>
        </div>
      )}

      {aba === "assistencia" && (
        <Painel className="overflow-hidden">
          {perfil.ordens.length === 0 ? (
            <EstadoVazio
              compacto
              icone={<Wrench />}
              titulo="Nenhuma ordem de serviço"
              acao={
                permissoes.os && (
                  <Link href={`/sistema/assistencia/nova?cliente=${c.id}`} className={classesBotao("secundario")}>
                    Abrir OS
                  </Link>
                )
              }
            />
          ) : (
            <ul>
              {perfil.ordens.map((o) => (
                <li key={o.id} className="border-b border-linha last:border-0">
                  <Link href={`/sistema/assistencia/${o.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-trilho sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">
                        {numeroDoc("OS", o.id)} · {o.veiculoDescricao}
                      </span>
                      <span className="block truncate text-[12.5px] text-ink-2">{o.problemaRelatado}</span>
                    </span>
                    <Selo tom="info" ponto={false}>
                      {TIPOS_OS[o.tipo as keyof typeof TIPOS_OS]}
                    </Selo>
                    <Selo tom={o.status === "entregue" ? "bom" : o.status === "cancelada" ? "critico" : "atencao"}>{rotuloStatusOs(o.status)}</Selo>
                    <span className="text-[12px] text-ink-3">{data(o.abertaEm)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Painel>
      )}

      {aba === "historico" && (
        <Painel className="p-5">
          <LinhaDoTempo
            vazio="Nenhuma alteração registrada."
            itens={perfil.historico.map((h) => ({ id: h.id, titulo: h.descricao, quando: dataHora(h.criadoEm), quem: h.usuarioNome }))}
          />
        </Painel>
      )}

      <FormularioCliente aberto={editando} aoMudar={setEditando} inicial={c} equipe={equipe} aoSalvar={() => router.refresh()} />
      <DialogoInteracao aberto={interacao} aoMudar={setInteracao} clienteId={c.id} negocios={abertos.map((n) => ({ id: n.id, rotulo: n.veiculo ?? n.veiculoInteresse ?? `Negócio ${n.id}` }))} />
    </>
  );
}

function Indicador({ rotulo, valor, detalhe, pequeno }: { rotulo: string; valor: string; detalhe?: string; pequeno?: boolean }) {
  return (
    <Painel className="p-4">
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <p className={pequeno ? "mt-1 text-[14px] font-semibold" : "num mt-1 text-[24px] font-bold tracking-tight"}>{valor}</p>
      {detalhe && <p className="num text-[12px] text-ink-2">{detalhe}</p>}
    </Painel>
  );
}

function DialogoInteracao({ aberto, aoMudar, clienteId, negocios }: { aberto: boolean; aoMudar: (v: boolean) => void; clienteId: number; negocios: { id: number; rotulo: string }[] }) {
  const [canal, setCanal] = useState("ligacao");
  const [resumo, setResumo] = useState("");
  const [negocioId, setNegocioId] = useState<string>(negocios[0] ? String(negocios[0].id) : "");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Registrar interação"
      descricao="Ligação, visita ou mensagem fora do sistema. Atualiza a última interação do negócio."
      largura="sm"
      rodape={
        <Botao
          variante="primario"
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await registrarInteracao({ clienteId, canal, resumo, negocioId });
              if (!r.ok) {
                setErro(r.campos?.resumo ?? r.erro);
                return;
              }
              toast.success(r.mensagem);
              setResumo("");
              aoMudar(false);
              router.refresh();
            })
          }
        >
          Registrar
        </Botao>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Canal">
          <Selecao value={canal} onChange={(e) => setCanal(e.target.value)}>
            {Object.entries(CANAIS_INTERACAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        </Campo>
        {negocios.length > 0 && (
          <Campo rotulo="Negócio relacionado">
            <Selecao value={negocioId} onChange={(e) => setNegocioId(e.target.value)}>
              <option value="">Nenhum</option>
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>
        )}
        <Campo rotulo="O que foi conversado" erro={erro} obrigatorio>
          <AreaTexto value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Ex.: cliente ligou perguntando sobre financiamento da T1." />
        </Campo>
      </div>
    </Dialogo>
  );
}
