"use client";

/**
 * Formulários do detalhe da solicitação:
 * - FormularioComentario: o morador escreve na solicitação da casa dele;
 * - FormularioResposta: a administração responde (público) ou anota (interno);
 * - FormularioStatus: a administração muda a situação, com comentário (obrigatório e
 *   visível para o morador quando a solicitação é cancelada, isto é, não será atendida).
 * O servidor confere tudo de novo (casa, permissão, situação permitida).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Lock, MessageSquare, Send } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { comentarSolicitacao, mudarStatusSolicitacao, responderSolicitacao } from "@/server/acoes/solicitacoes";
import { ROTULO_STATUS_SOLICITACAO, type StatusSolicitacao } from "@/lib/solicitacoes";
import { cx } from "@/lib/cx";

const classeOpcao = cx(
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-3 py-2 shadow-relevo",
  "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
);

export function FormularioComentario({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Formulario acao={comentarSolicitacao} aoSalvar={() => router.refresh()}>
      <input type="hidden" name="id" value={id} />
      <Campo id="texto-comentario" rotulo="Escrever para a administração" dica="Ex.: o problema piorou, mais detalhes, uma foto que você pode mostrar pessoalmente.">
        <textarea
          id="texto-comentario"
          name="texto"
          required
          minLength={2}
          maxLength={1000}
          rows={3}
          className={`${classeEntrada} py-3`}
          aria-describedby="texto-comentario-dica"
        />
      </Campo>
      <div>
        <BotaoEnviar textoEnviando="Enviando…">
          <Send aria-hidden className="size-5" /> Enviar mensagem
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}

/** Escolha "o morador vê" × "só a equipe vê". */
function EscolhaVisibilidade({ nome, padrao }: { nome: string; padrao: "sim" | "nao" }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-bold">Quem pode ver?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={classeOpcao}>
          <input type="radio" name={nome} value="sim" defaultChecked={padrao === "sim"} className="size-5 shrink-0 accent-pine" />
          <MessageSquare aria-hidden className="size-5 shrink-0 text-pine" />
          <span className="leading-tight">
            <b className="block">Resposta ao morador</b>
            <span className="text-[0.82rem] text-muted">A casa vê no portal</span>
          </span>
        </label>
        <label className={classeOpcao}>
          <input type="radio" name={nome} value="nao" defaultChecked={padrao === "nao"} className="size-5 shrink-0 accent-pine" />
          <Lock aria-hidden className="size-5 shrink-0 text-warn" />
          <span className="leading-tight">
            <b className="block">Nota interna</b>
            <span className="text-[0.82rem] text-muted">Só a administração vê</span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

export function FormularioResposta({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Formulario acao={responderSolicitacao} aoSalvar={() => router.refresh()}>
      <input type="hidden" name="id" value={id} />
      <Campo id="texto-resposta" rotulo="Mensagem">
        <textarea id="texto-resposta" name="texto" required minLength={2} maxLength={1000} rows={3} className={`${classeEntrada} py-3`} />
      </Campo>
      <EscolhaVisibilidade nome="publico" padrao="sim" />
      <div>
        <BotaoEnviar textoEnviando="Salvando…">
          <Send aria-hidden className="size-5" /> Salvar mensagem
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}

export function FormularioStatus({ id, opcoes }: { id: string; opcoes: readonly StatusSolicitacao[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const naoAtender = status === "cancelada";
  return (
    <Formulario acao={mudarStatusSolicitacao} aoSalvar={() => router.refresh()}>
      <input type="hidden" name="id" value={id} />
      <Campo id="novo-status" rotulo="Nova situação">
        <select
          id="novo-status"
          name="status"
          required
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={classeEntrada}
        >
          <option value="" disabled>
            Escolha a situação
          </option>
          {opcoes.map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_SOLICITACAO[s]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo
        id="comentario-status"
        rotulo={naoAtender ? "Comentário para o morador (obrigatório)" : "Comentário (opcional)"}
        dica={
          naoAtender
            ? "Explique por que a solicitação não será atendida. O morador vai ler (aparece no sino dele)."
            : "Ex.: equipe de manutenção agendada para sexta. A mudança de situação sempre aparece para o morador."
        }
      >
        <textarea
          id="comentario-status"
          name="comentario"
          required={naoAtender}
          minLength={naoAtender ? 3 : undefined}
          maxLength={1000}
          rows={naoAtender ? 3 : 2}
          className={`${classeEntrada} py-3`}
          aria-describedby="comentario-status-dica"
        />
      </Campo>
      {/* Cancelamento: o comentário vai sempre para o morador. */}
      {naoAtender ? <input type="hidden" name="publico" value="sim" /> : <EscolhaVisibilidade nome="publico" padrao="sim" />}
      <div>
        <BotaoEnviar textoEnviando="Salvando…">
          <ArrowRightLeft aria-hidden className="size-5" /> Mudar situação
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}
