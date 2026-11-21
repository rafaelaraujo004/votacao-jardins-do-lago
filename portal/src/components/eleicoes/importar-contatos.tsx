"use client";

/**
 * Comissão: enviar a lista do Word (CASA, NOME, CONTATOS) para importar os telefones.
 *
 * O resultado (quantas casas entraram, quais ficaram de fora e por quê) aparece numa caixa
 * FIXA embaixo do formulário e fica lá até a próxima importação: o aviso rápido some em
 * segundos e é muita coisa para ler. O aviso rápido mostra só a primeira linha (o resumo).
 * Por isso este formulário cuida da própria resposta (não usa o <Formulario> comum).
 */
import { useActionState, useEffect, useRef } from "react";
import { CircleCheck, ClipboardList, Upload } from "lucide-react";
import { Alerta } from "@/components/ui/basicos";
import { BotaoEnviar, type ResultadoAcao } from "@/components/ui/formulario";
import { useAvisos } from "@/components/ui/avisos";
import { importarContatosVotacao } from "@/server/acoes/votacao-links";

/**
 * Linhas do resultado da importação. A ação manda uma linha por assunto, separadas por "\n";
 * se vier tudo num texto só (frases seguidas), separa em cada frase que começa com maiúscula.
 */
function linhasDoResultado(texto: string): string[] {
  const separado = texto.includes("\n")
    ? texto
    : texto.replace(/\.\s+(?=[A-ZÀ-Ý])/g, ".\n");
  return separado
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Agrupa as linhas depois do resumo: uma linha que termina em ":" (ex.: "Avisos da lista (12):")
 * vira título, e as linhas seguintes ficam embaixo dela.
 */
function agruparLinhas(
  linhas: string[],
): { titulo: string | null; itens: string[] }[] {
  const grupos: { titulo: string | null; itens: string[] }[] = [];
  for (const l of linhas) {
    if (l.endsWith(":")) grupos.push({ titulo: l, itens: [] });
    else if (grupos.length) grupos[grupos.length - 1].itens.push(l);
    else grupos.push({ titulo: null, itens: [l] });
  }
  return grupos;
}

/** "14:32" na hora do aparelho (a resposta só existe no navegador, depois de importar). */
function horaCurta(vez: number): string {
  return new Date(vez).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ImportarContatos({ eleicaoId }: { eleicaoId: string }) {
  const [estado, enviar] = useActionState<ResultadoAcao, FormData>(
    importarContatosVotacao,
    null,
  );
  const form = useRef<HTMLFormElement>(null);
  const { avisar } = useAvisos();
  // Cada resposta é tratada UMA vez só (como no <Formulario>).
  const jaTratado = useRef<ResultadoAcao>(null);
  const linhas = estado?.ok ? linhasDoResultado(estado.mensagem) : [];
  const grupos = agruparLinhas(linhas.slice(1));

  useEffect(() => {
    if (!estado || jaTratado.current === estado) return;
    jaTratado.current = estado;
    if (estado.ok) {
      avisar(
        "sucesso",
        linhasDoResultado(estado.mensagem)[0] ?? estado.mensagem,
      );
      form.current?.reset();
    }
  }, [estado, avisar]);

  return (
    <div className="flex flex-col gap-4">
      <form ref={form} action={enviar} className="flex flex-col gap-4">
        {estado && !estado.ok ? (
          <Alerta tipo="erro" titulo="Não foi possível importar">
            {estado.erro}
          </Alerta>
        ) : null}
        <input type="hidden" name="id" value={eleicaoId} />
        <p className="text-[0.92rem] text-ink-2">
          Envie a lista do Word com as colunas <b>CASA</b>, <b>NOME</b> e{" "}
          <b>CONTATOS</b>. Casas com dois telefones recebem o link nos dois.
          Enviar de novo atualiza os contatos.
        </p>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface-item px-4 py-3">
          <Upload aria-hidden className="size-5 shrink-0 text-lake" />
          <span className="min-w-0 flex-1 text-[0.92rem]">
            <b>Escolher arquivo .docx</b>
            <input
              type="file"
              name="arquivo"
              required
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-1 block w-full text-[0.85rem] text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1.5 file:font-bold"
            />
          </span>
        </label>
        <div>
          <BotaoEnviar textoEnviando="Importando…">
            Importar contatos
          </BotaoEnviar>
        </div>
      </form>

      {estado?.ok && linhas.length ? (
        <section
          aria-label="Resultado da importação"
          className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-item p-3.5"
        >
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-bold text-destaque">
              <ClipboardList aria-hidden className="size-5 shrink-0" />
              Resultado da importação
            </span>
            <span className="text-[0.82rem] text-muted">
              às {horaCurta(estado.vez)}
            </span>
          </p>
          <p className="flex items-start gap-1.5 font-bold text-ink">
            <CircleCheck
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-pine"
            />
            <span className="min-w-0 break-words">{linhas[0]}</span>
          </p>
          {grupos.map((g, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {g.titulo ? (
                <p className="mt-1 break-words text-[0.92rem] font-bold text-ink">
                  {g.titulo}
                </p>
              ) : null}
              {g.itens.length ? (
                <ul className="flex list-disc flex-col gap-1.5 pl-6 text-[0.92rem] text-ink-2 marker:text-muted">
                  {g.itens.map((l, j) => (
                    <li key={j} className="break-words">
                      {l}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <p className="text-[0.82rem] text-muted">
            Este resultado fica aqui até a próxima importação.
          </p>
        </section>
      ) : null}
    </div>
  );
}
