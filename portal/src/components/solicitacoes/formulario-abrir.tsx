"use client";

/**
 * Formulário do morador para abrir uma solicitação.
 * A casa NÃO vai no formulário: o servidor usa a do cadastro de quem está logado.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { abrirSolicitacao } from "@/server/acoes/solicitacoes";
import { CATEGORIAS_SOLICITACAO, EXEMPLO_CATEGORIA, ROTULO_CATEGORIA } from "@/lib/solicitacoes";
import { cx } from "@/lib/cx";
import { ICONE_CATEGORIA } from "./pecas";

const MAX_DESCRICAO = 1000;

export function FormularioAbrirSolicitacao() {
  const router = useRouter();
  const [tamanho, setTamanho] = useState(0);

  return (
    <Formulario
      acao={abrirSolicitacao}
      aoSalvar={() => {
        setTamanho(0);
        router.refresh();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">Qual é o assunto?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIAS_SOLICITACAO.map((c) => {
            const Icone = ICONE_CATEGORIA[c];
            return (
              <label
                key={c}
                className={cx(
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-3 py-2 shadow-relevo",
                  "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
                  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
                )}
              >
                <input type="radio" name="categoria" value={c} required className="size-5 shrink-0 accent-pine" />
                <Icone aria-hidden className="size-5 shrink-0 text-plum" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <b>{ROTULO_CATEGORIA[c]}</b>
                  <span className="text-[0.82rem] text-muted">{EXEMPLO_CATEGORIA[c]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Campo id="local" rotulo="Onde é?" dica="Ex.: em frente à Casa 12, portão principal, quadra de esportes.">
        <input
          id="local"
          name="local"
          required
          minLength={2}
          maxLength={120}
          className={classeEntrada}
          aria-describedby="local-dica"
          autoComplete="off"
        />
      </Campo>

      <Campo
        id="descricao"
        rotulo="Conte o que está acontecendo"
        dica="Pelo menos 10 letras. Não coloque CPF, telefone nem dados bancários."
      >
        <textarea
          id="descricao"
          name="descricao"
          required
          minLength={10}
          maxLength={MAX_DESCRICAO}
          rows={4}
          className={`${classeEntrada} py-3`}
          aria-describedby="descricao-dica descricao-contador"
          onChange={(e) => setTamanho(e.target.value.length)}
        />
        <p id="descricao-contador" className="text-right text-[0.82rem] text-muted">
          {tamanho}/{MAX_DESCRICAO} caracteres
        </p>
      </Campo>

      <div>
        <BotaoEnviar largo textoEnviando="Enviando…">
          <Send aria-hidden className="size-5" /> Enviar solicitação
        </BotaoEnviar>
      </div>
      <p className="text-[0.9rem] text-muted">
        Você recebe um número de protocolo e acompanha a resposta da administração aqui no portal.
      </p>
    </Formulario>
  );
}
