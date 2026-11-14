"use client";

/**
 * Cartão "Entrar com e-mail e senha" da página da pessoa (só equipe).
 * - Cria o acesso (ou gera nova senha provisória, com confirmação).
 * - Mostra a senha provisória UMA vez, com botão copiar. Ao sair da página ela some.
 */
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, CircleCheck, Clock, Copy, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { criarAcessoComSenha, type ResultadoAcesso } from "@/server/acoes/acesso";
import { useAvisos } from "@/components/ui/avisos";
import { Alerta, Campo, classeEntrada, Etiqueta } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";

type Situacao = {
  email: string | null;
  temSenha: boolean;
  precisaTrocarSenha: boolean;
  ultimoAcesso: string | null;
};

function BotaoGerar({ temSenha }: { temSenha: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Botao
      type="submit"
      variante={temSenha ? "perigo" : "primario"}
      carregando={pending}
      icone={temSenha ? <RefreshCw aria-hidden className="size-5" /> : <KeyRound aria-hidden className="size-5" />}
    >
      {pending ? "Gerando…" : temSenha ? "Sim, gerar nova senha" : "Criar acesso com senha"}
    </Botao>
  );
}

export function AcessoSenha({ uid, nome, situacao }: { uid: string; nome: string; situacao: Situacao }) {
  const [estado, enviar] = useActionState<ResultadoAcesso, FormData>(criarAcessoComSenha, null);
  const { avisar } = useAvisos();
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  // "Já anotei" esconde a senha desta resposta (guardamos a vez dela).
  const [dispensada, setDispensada] = useState<number | null>(null);
  const senhaVisivel = estado?.ok && estado.vez !== dispensada ? estado : null;

  useEffect(() => {
    if (estado?.ok) avisar("sucesso", estado.mensagem);
  }, [estado, avisar]);

  function jaAnotei() {
    if (estado) setDispensada(estado.vez);
    setConfirmando(false);
    setCopiado(false);
  }

  async function copiar() {
    if (!senhaVisivel) return;
    try {
      await navigator.clipboard.writeText(senhaVisivel.senha);
      setCopiado(true);
      avisar("sucesso", "Senha copiada.");
    } catch {
      avisar("erro", "Não foi possível copiar. Anote a senha à mão.");
    }
  }

  // Depois de gerar: mostra a senha uma única vez.
  if (senhaVisivel) {
    return (
      <div className="flex flex-col gap-4">
        <Alerta tipo="aviso" titulo="Anote agora: esta senha não aparece de novo">
          Repasse a {nome} pessoalmente ou por mensagem privada. No primeiro acesso, o portal vai pedir para criar uma
          senha nova.
        </Alerta>
        <dl className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <dt className="rotulo-caixa">E-mail</dt>
            <dd className="break-all font-bold">{senhaVisivel.email}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="rotulo-caixa">Senha provisória</dt>
            <dd className="afundado select-all break-all rounded-2xl px-4 py-3 text-center font-mono text-[1.5rem] font-bold tracking-wider text-destaque">
              {senhaVisivel.senha}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Botao
            variante="secundario"
            onClick={copiar}
            icone={copiado ? <Check aria-hidden className="size-5" /> : <Copy aria-hidden className="size-5" />}
          >
            {copiado ? "Copiada" : "Copiar senha"}
          </Botao>
          <Botao variante="primario" onClick={jaAnotei} icone={<Check aria-hidden className="size-5" />}>
            Já anotei
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="uid" value={uid} />

      {estado && !estado.ok ? (
        <Alerta tipo="erro" titulo="Não foi possível criar o acesso">
          {estado.erro}
        </Alerta>
      ) : null}

      {situacao.temSenha ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {situacao.precisaTrocarSenha ? (
              <Etiqueta tom="aviso" icone={Clock}>Ainda não trocou a senha provisória</Etiqueta>
            ) : (
              <Etiqueta tom="ok" icone={CircleCheck}>Senha própria criada</Etiqueta>
            )}
          </div>
          <p className="text-ink-2">
            Entra com <strong className="break-all text-ink">{situacao.email}</strong>.
            {situacao.ultimoAcesso ? ` Último acesso: ${situacao.ultimoAcesso}.` : " Ainda não entrou."}
          </p>
        </div>
      ) : (
        <p className="text-ink-2">
          {nome} ainda não tem como entrar. Informe o e-mail e o portal gera uma senha provisória para você repassar.
        </p>
      )}

      <Campo
        id="email-acesso"
        rotulo="E-mail para entrar"
        dica={situacao.temSenha ? "Pode corrigir o e-mail aqui, se precisar." : "Use um e-mail que a pessoa consulte."}
      >
        <input
          id="email-acesso"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          defaultValue={situacao.email ?? ""}
          aria-describedby="email-acesso-dica"
          className={classeEntrada}
        />
      </Campo>

      {situacao.temSenha ? (
        confirmando ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-danger-soft px-4 py-3">
            <p className="flex items-start gap-2 font-bold">
              <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
              A senha atual de {nome} vai parar de funcionar e a pessoa será desconectada de todos os aparelhos.
            </p>
            <div className="flex flex-wrap gap-2">
              <BotaoGerar temSenha />
              <Botao variante="secundario" onClick={() => setConfirmando(false)}>
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <div>
            <Botao variante="secundario" onClick={() => setConfirmando(true)} icone={<RefreshCw aria-hidden className="size-5" />}>
              Gerar nova senha provisória
            </Botao>
          </div>
        )
      ) : (
        <div>
          <BotaoGerar temSenha={false} />
        </div>
      )}
    </form>
  );
}
