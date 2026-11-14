"use client";

/**
 * Formulário ligado a uma Server Action.
 * - Mostra "Salvando..." no botão enquanto envia.
 * - Sucesso: aviso verde e (opcional) limpa os campos.
 * - Erro: alerta vermelho com a explicação, sem perder o que foi digitado.
 */
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alerta } from "./basicos";
import { Botao } from "./botao";
import { useAvisos } from "./avisos";

export type ResultadoAcao = { ok: true; mensagem: string; vez: number } | { ok: false; erro: string; vez: number } | null;
type Acao = (anterior: ResultadoAcao, dados: FormData) => Promise<ResultadoAcao>;

export function Formulario({
  acao,
  children,
  limparAoSalvar = true,
  className,
  aoSalvar,
}: {
  acao: Acao;
  children: ReactNode;
  limparAoSalvar?: boolean;
  className?: string;
  aoSalvar?: () => void;
}) {
  const [estado, enviar] = useActionState(acao, null);
  const form = useRef<HTMLFormElement>(null);
  const { avisar } = useAvisos();

  useEffect(() => {
    if (!estado) return;
    if (estado.ok) {
      avisar("sucesso", estado.mensagem);
      if (limparAoSalvar) form.current?.reset();
      aoSalvar?.();
    }
  }, [estado, avisar, limparAoSalvar, aoSalvar]);

  return (
    <form ref={form} action={enviar} className={className ?? "flex flex-col gap-4"} noValidate={false}>
      {estado && !estado.ok ? (
        <Alerta tipo="erro" titulo="Não foi possível salvar">
          {estado.erro}
        </Alerta>
      ) : null}
      {children}
    </form>
  );
}

/** Botão de enviar que mostra o carregamento sozinho. */
export function BotaoEnviar({
  children,
  variante = "primario",
  largo,
  textoEnviando = "Salvando…",
}: {
  children: ReactNode;
  variante?: "primario" | "secundario" | "perigo";
  largo?: boolean;
  textoEnviando?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} largo={largo} carregando={pending}>
      {pending ? textoEnviando : children}
    </Botao>
  );
}
