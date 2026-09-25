"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Alternar, Campo, Entrada } from "@/components/ui/campos";
import { acaoGerarVerifyToken, acaoSalvarApiOficial, acaoTestarApiOficial } from "./acoes";

export type ApiOficial = {
  ativo: boolean;
  telefone: string;
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
  tokenSalvo: boolean;
  appSecretSalvo: boolean;
};

function Copiavel({ valor }: { valor: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-linha px-3 py-2 text-[13px]">{valor || "—"}</code>
      <Botao
        disabled={!valor}
        onClick={async () => {
          await navigator.clipboard.writeText(valor);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}
      >
        {ok ? <Check className="size-4" /> : <Copy className="size-4" />}
        {ok ? "Copiado" : "Copiar"}
      </Botao>
    </div>
  );
}

export function PainelApiOficial({ inicial, urlCallback }: { inicial: ApiOficial; urlCallback: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [f, setF] = useState({ ativo: inicial.ativo, telefone: inicial.telefone, phoneNumberId: inicial.phoneNumberId, wabaId: inicial.wabaId, token: "", appSecret: "" });
  const set = (k: keyof typeof f) => (x: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: x.target.value });

  return (
    <Painel className="p-5">
      <TituloSecao acao={inicial.ativo ? <Selo tom="bom">API Oficial ativa</Selo> : <Selo tom="atencao">Desativada (modo simulado)</Selo>}>WhatsApp — API Oficial (Meta)</TituloSecao>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">1. Credenciais (copie do painel da Meta)</p>
          <Campo rotulo="Número de telefone">
            <Entrada value={f.telefone} onChange={set("telefone")} placeholder="5511999999999" />
          </Campo>
          <Campo rotulo="ID do número de telefone">
            <Entrada value={f.phoneNumberId} onChange={set("phoneNumberId")} />
          </Campo>
          <Campo rotulo="ID da conta do WhatsApp Business">
            <Entrada value={f.wabaId} onChange={set("wabaId")} />
          </Campo>
          <Campo rotulo="Token permanente" dica={inicial.tokenSalvo ? "Já salvo e guardado com criptografia. Deixe vazio para manter." : "Fica criptografado e nunca volta para a tela."}>
            <Entrada type="password" autoComplete="off" value={f.token} onChange={set("token")} placeholder={inicial.tokenSalvo ? "••••••••••••••••" : "EAA..."} />
          </Campo>
          <Campo rotulo="Segredo do app (App Secret)" dica={inicial.appSecretSalvo ? "Já salvo. Deixe vazio para manter." : "Meta for Developers > Configurações do app > Básico. Serve para conferir que as mensagens recebidas vêm mesmo da Meta."}>
            <Entrada type="password" autoComplete="off" value={f.appSecret} onChange={set("appSecret")} placeholder={inicial.appSecretSalvo ? "••••••••••••••••" : ""} />
          </Campo>
          <Alternar marcado={f.ativo} aoMudar={(v) => setF({ ...f, ativo: v })} rotulo="Ativar a API Oficial" descricao="Ligado: as conversas passam a enviar e receber pelo WhatsApp de verdade. Desligado: continua o modo simulado." />
          <div className="flex flex-wrap justify-end gap-2">
            <Botao
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoTestarApiOficial();
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(`Conectado: ${r.dados}`);
                })
              }
            >
              Testar conexão
            </Botao>
            <Botao
              variante="primario"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoSalvarApiOficial(f);
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(r.mensagem);
                  setF({ ...f, token: "", appSecret: "" });
                  router.refresh();
                })
              }
            >
              Salvar API Oficial
            </Botao>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">2. Webhook (cole no Meta for Developers)</p>
          <Campo rotulo="URL de callback">
            <Copiavel valor={urlCallback} />
          </Campo>
          <Campo rotulo="Verificar token" dica="Cole igual na Meta, no campo Verificar token.">
            <Copiavel valor={inicial.verifyToken} />
          </Campo>
          <div>
            <Botao
              carregando={pendente}
              onClick={() => {
                if (inicial.verifyToken && !confirm("Gerar um token novo invalida o atual: será preciso colar o novo na Meta. Continuar?")) return;
                iniciar(async () => {
                  const r = await acaoGerarVerifyToken();
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(r.mensagem);
                  router.refresh();
                });
              }}
            >
              <RefreshCw className="size-4" />
              {inicial.verifyToken ? "Gerar novo token" : "Gerar token de verificação"}
            </Botao>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-ink-3">
            <li>Gere o token aqui e copie a URL e o token.</li>
            <li>Na Meta: WhatsApp &gt; Configuração &gt; Webhook &gt; Editar. Cole a URL e o token e clique em Verificar e salvar.</li>
            <li>Ainda na Meta, assine o campo <b>messages</b>.</li>
            <li>Volte aqui, preencha as credenciais, salve e ative.</li>
          </ol>
        </div>
      </div>
    </Painel>
  );
}
