"use client";

/**
 * Formulário de nova enquete (ou de um rascunho).
 * Opções: de 2 a 8, dá para acrescentar e remover. O servidor confere tudo de novo.
 * As datas valem no horário do condomínio.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { salvarEnquete } from "@/server/acoes/enquetes";
import { MAX_OPCOES, MIN_OPCOES, type RegraResultado } from "@/lib/enquetes";
import { cx } from "@/lib/cx";

export type ValoresEnquete = {
  id: string | null;
  pergunta: string;
  descricao: string;
  opcoes: string[];
  /** "AAAA-MM-DDTHH:MM" no horário do condomínio. */
  abreEm: string;
  fechaEm: string;
  resultado: RegraResultado;
};

type Linha = { chave: number; texto: string };
let contador = 0;
const comChave = (texto: string): Linha => ({ chave: ++contador, texto });

const classeEscolha = cx(
  "flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-3 shadow-relevo",
  "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
);

export function FormularioEnquete({ valores }: { valores: ValoresEnquete }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const iniciais = valores.opcoes.length >= MIN_OPCOES ? valores.opcoes : ["Sim", "Não"];
    return iniciais.map(comChave);
  });

  function alterar(chave: number, texto: string) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, texto } : l)));
  }

  return (
    <Formulario acao={salvarEnquete} limparAoSalvar={false} aoSalvar={() => router.push("/admin/enquetes")}>
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}

      <Campo id="pergunta" rotulo="Pergunta" dica="Escreva de um jeito que dê para responder só escolhendo uma opção.">
        <input
          id="pergunta"
          name="pergunta"
          required
          minLength={5}
          maxLength={200}
          defaultValue={valores.pergunta}
          className={classeEntrada}
          placeholder="Ex.: Qual a melhor data para a assembleia?"
          aria-describedby="pergunta-dica"
        />
      </Campo>

      <Campo id="descricao" rotulo="Explicação (opcional)" dica="Contexto, valores envolvidos, links de orçamento… Não coloque dados pessoais.">
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          maxLength={1000}
          defaultValue={valores.descricao}
          className={`${classeEntrada} py-3`}
          aria-describedby="descricao-dica"
        />
      </Campo>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1.5 font-bold">
          Opções <span className="font-normal text-muted">(de {MIN_OPCOES} a {MAX_OPCOES})</span>
        </legend>
        {linhas.map((l, i) => (
          <div key={l.chave} className="flex items-center gap-2">
            <label htmlFor={`opcao-${l.chave}`} className="sr-only">
              Opção {i + 1}
            </label>
            <span aria-hidden className="w-6 shrink-0 text-center font-bold text-muted">
              {i + 1}
            </span>
            <input
              id={`opcao-${l.chave}`}
              name="opcao"
              required={i < MIN_OPCOES}
              maxLength={120}
              value={l.texto}
              onChange={(e) => alterar(l.chave, e.target.value)}
              className={classeEntrada}
              placeholder={`Opção ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
              disabled={linhas.length <= MIN_OPCOES}
              className="grid size-11 shrink-0 place-items-center rounded-full text-danger hover:shadow-afundado disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Remover a opção ${i + 1}`}
            >
              <Trash2 aria-hidden className="size-5" />
            </button>
          </div>
        ))}
        {linhas.length < MAX_OPCOES ? (
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              icone={<Plus aria-hidden className="size-4" />}
              onClick={() => setLinhas((atual) => [...atual, comChave("")])}
            >
              Acrescentar opção
            </Botao>
          </div>
        ) : (
          <p className="text-[0.9rem] text-muted">Você chegou ao máximo de {MAX_OPCOES} opções.</p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="abreEm" rotulo="Abre em" dica="Data e hora do residencial.">
          <input id="abreEm" name="abreEm" type="datetime-local" required defaultValue={valores.abreEm} className={classeEntrada} aria-describedby="abreEm-dica" />
        </Campo>
        <Campo id="fechaEm" rotulo="Fecha em" dica="Depois disso ninguém mais vota.">
          <input id="fechaEm" name="fechaEm" type="datetime-local" required defaultValue={valores.fechaEm} className={classeEntrada} aria-describedby="fechaEm-dica" />
        </Campo>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">Quando os moradores veem o resultado?</legend>
        <label className={classeEscolha}>
          <input type="radio" name="resultado" value="apos_encerrar" defaultChecked={valores.resultado === "apos_encerrar"} className="mt-1 size-5 accent-pine" />
          <span className="flex flex-col leading-tight">
            <b>Só depois de encerrar</b>
            <span className="text-[0.88rem] text-muted">Ninguém é influenciado pela parcial. Recomendado.</span>
          </span>
        </label>
        <label className={classeEscolha}>
          <input type="radio" name="resultado" value="sempre" defaultChecked={valores.resultado === "sempre"} className="mt-1 size-5 accent-pine" />
          <span className="flex flex-col leading-tight">
            <b>Sempre (parcial ao vivo)</b>
            <span className="text-[0.88rem] text-muted">Os moradores acompanham os totais durante a votação.</span>
          </span>
        </label>
      </fieldset>

      <p className="text-[0.9rem] text-muted">
        A enquete é salva como <b>rascunho</b>: os moradores só veem depois que você tocar em “Publicar”. Depois de publicada, não
        dá mais para alterar. Cada casa vota uma vez e você vê só os totais, nunca o voto de cada casa.
      </p>

      <div>
        <BotaoEnviar largo textoEnviando="Salvando…">
          <Save aria-hidden className="size-5" /> {valores.id ? "Salvar alterações" : "Salvar rascunho"}
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}
