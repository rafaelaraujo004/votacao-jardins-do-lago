"use client";

/**
 * Formulário da comissão: nova votação (ou um rascunho), com os candidatos.
 * Padrão do Jardins do Lago: chapa única (integrantes com o cargo embaixo do nome), Sim ou Não,
 * das 7h às 17h. Também dá para fazer eleição entre candidatos (vagas, escolhas, branco). O servidor confere tudo de novo.
 * As datas valem no horário do condomínio.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { salvarEleicao } from "@/server/acoes/eleicoes";
import {
  MAX_CANDIDATOS,
  MAX_ESCOLHAS,
  MAX_FUNCAO,
  MAX_VAGAS,
  ROTULO_DESEMPATE,
  type ModoEleicao,
  type RegraDesempate,
} from "@/lib/eleicoes";
import { cx } from "@/lib/cx";

export type ValoresEleicao = {
  id: string | null;
  titulo: string;
  cargo: string;
  modo: ModoEleicao;
  vagas: number;
  escolhasPorCasa: number;
  permiteBranco: boolean;
  regraDesempate: RegraDesempate;
  /** "AAAA-MM-DDTHH:MM" no horário do condomínio. */
  abreEm: string;
  fechaEm: string;
  candidatos: {
    nome: string;
    funcao: string;
    casa: string;
    apresentacao: string;
    nascimento: string;
  }[];
};

type Linha = {
  chave: number;
  nome: string;
  funcao: string;
  casa: string;
  apresentacao: string;
  nascimento: string;
};
let contador = 0;
const nova = (v?: Partial<Linha>): Linha => ({
  chave: ++contador,
  nome: "",
  funcao: "",
  casa: "",
  apresentacao: "",
  nascimento: "",
  ...v,
});

const classeEscolha = cx(
  "flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-3 shadow-relevo",
  "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
);

export function FormularioEleicao({ valores }: { valores: ValoresEleicao }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    valores.candidatos.length
      ? valores.candidatos.map((c) => nova(c))
      : [nova(), nova()],
  );
  const [modo, setModo] = useState<ModoEleicao>(valores.modo);
  const simNao = modo === "chapa";
  const [vagas, setVagas] = useState(valores.vagas);
  const [escolhas, setEscolhas] = useState(
    Math.min(valores.escolhasPorCasa, valores.vagas),
  );

  function alterar(
    chave: number,
    campo: keyof Omit<Linha, "chave">,
    valor: string,
  ) {
    setLinhas((atual) =>
      atual.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)),
    );
  }

  return (
    <Formulario
      acao={salvarEleicao}
      limparAoSalvar={false}
      aoSalvar={() =>
        router.push(
          valores.id ? `/admin/votacao/${valores.id}` : "/admin/votacao",
        )
      }
    >
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="titulo" rotulo="Nome da eleição">
          <input
            id="titulo"
            name="titulo"
            required
            minLength={5}
            maxLength={120}
            defaultValue={valores.titulo}
            className={classeEntrada}
            placeholder="Ex.: Eleição da Comissão 2026"
          />
        </Campo>
        <Campo id="cargo" rotulo={simNao ? "Nome da chapa" : "Cargo"}>
          <input
            id="cargo"
            name="cargo"
            required
            minLength={3}
            maxLength={80}
            defaultValue={valores.cargo}
            className={classeEntrada}
            placeholder={
              simNao ? "Ex.: Chapa Jardins Unidos" : "Ex.: Comissão Eleitoral"
            }
          />
        </Campo>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">Como será a votação</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={classeEscolha}>
            <input
              type="radio"
              name="modo"
              value="chapa"
              checked={simNao}
              onChange={() => setModo("chapa")}
              className="mt-1 size-5 accent-pine"
            />
            <span className="leading-tight">
              <b>Chapa única: Sim ou Não</b>
              <span className="block text-[0.88rem] text-muted">
                Votando Sim, todos da chapa são eleitos. Precisa de metade mais
                1 dos votos.
              </span>
            </span>
          </label>
          <label className={classeEscolha}>
            <input
              type="radio"
              name="modo"
              value="candidatos"
              checked={!simNao}
              onChange={() => setModo("candidatos")}
              className="mt-1 size-5 accent-pine"
            />
            <span className="leading-tight">
              <b>Escolher entre candidatos</b>
              <span className="block text-[0.88rem] text-muted">
                Disputa por vagas: os mais votados vencem.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {!simNao ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="vagas"
            rotulo="Vagas"
            dica="Quantas pessoas serão eleitas."
          >
            <select
              id="vagas"
              name="vagas"
              value={vagas}
              onChange={(e) => {
                const n = Number(e.target.value);
                setVagas(n);
                setEscolhas((x) => Math.min(x, n));
              }}
              className={classeEntrada}
              aria-describedby="vagas-dica"
            >
              {Array.from({ length: MAX_VAGAS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "vaga" : "vagas"}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            id="escolhasPorCasa"
            rotulo="Cada casa escolhe"
            dica="O mais simples é 1 candidato por casa."
          >
            <select
              id="escolhasPorCasa"
              name="escolhasPorCasa"
              value={escolhas}
              onChange={(e) => setEscolhas(Number(e.target.value))}
              className={classeEntrada}
              aria-describedby="escolhasPorCasa-dica"
            >
              {Array.from(
                { length: Math.min(MAX_ESCOLHAS, vagas) },
                (_, i) => i + 1,
              ).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 candidato" : `até ${n} candidatos`}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="abreEm" rotulo="Abre em" dica="Data e hora do residencial.">
          <input
            id="abreEm"
            name="abreEm"
            type="datetime-local"
            required
            defaultValue={valores.abreEm}
            className={classeEntrada}
            aria-describedby="abreEm-dica"
          />
        </Campo>
        <Campo
          id="fechaEm"
          rotulo="Encerra em"
          dica="Depois disso ninguém mais vota e o resultado aparece."
        >
          <input
            id="fechaEm"
            name="fechaEm"
            type="datetime-local"
            required
            defaultValue={valores.fechaEm}
            className={classeEntrada}
            aria-describedby="fechaEm-dica"
          />
        </Campo>
      </div>

      {!simNao ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 font-bold">Voto em branco</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={classeEscolha}>
                <input
                  type="radio"
                  name="permiteBranco"
                  value="sim"
                  defaultChecked={valores.permiteBranco}
                  className="mt-1 size-5 accent-pine"
                />
                <span className="leading-tight">
                  <b>Aceitar</b>
                  <span className="block text-[0.88rem] text-muted">
                    Recomendado.
                  </span>
                </span>
              </label>
              <label className={classeEscolha}>
                <input
                  type="radio"
                  name="permiteBranco"
                  value="nao"
                  defaultChecked={!valores.permiteBranco}
                  className="mt-1 size-5 accent-pine"
                />
                <span className="leading-tight">
                  <b>Não aceitar</b>
                  <span className="block text-[0.88rem] text-muted">
                    A casa precisa escolher alguém.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 font-bold">
              Desempate na última vaga
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["idade", "comissao"] as const).map((r) => (
                <label key={r} className={classeEscolha}>
                  <input
                    type="radio"
                    name="regraDesempate"
                    value={r}
                    defaultChecked={valores.regraDesempate === r}
                    className="mt-1 size-5 accent-pine"
                  />
                  <span className="leading-tight">
                    <b>{r === "idade" ? "Pela idade" : "A comissão decide"}</b>
                    <span className="block text-[0.88rem] text-muted">
                      {ROTULO_DESEMPATE[r]}.
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 font-bold">
          {simNao ? "Integrantes da chapa" : "Candidatos"}{" "}
          <span className="font-normal text-muted">
            (a cédula segue esta ordem)
          </span>
        </legend>
        {linhas.map((l, i) => (
          <div
            key={l.chave}
            className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-item p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-destaque">Candidato {i + 1}</p>
              <button
                type="button"
                onClick={() =>
                  setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))
                }
                disabled={linhas.length <= 1}
                className="grid size-11 shrink-0 place-items-center rounded-full text-danger hover:shadow-afundado disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Remover o candidato ${i + 1}`}
              >
                <Trash2 aria-hidden className="size-5" />
              </button>
            </div>
            <div
              className={cx(
                "grid gap-2.5",
                simNao
                  ? "sm:grid-cols-[2fr_1.3fr_1fr]"
                  : "sm:grid-cols-[2fr_1.2fr_1fr_1fr]",
              )}
            >
              <label className="flex flex-col gap-1 text-[0.9rem] font-bold">
                Nome
                <input
                  name="candNome"
                  required={i === 0}
                  maxLength={80}
                  value={l.nome}
                  onChange={(e) => alterar(l.chave, "nome", e.target.value)}
                  className={classeEntrada}
                  placeholder="Nome completo"
                />
              </label>
              <label className="flex flex-col gap-1 text-[0.9rem] font-bold">
                Cargo <span className="sr-only">(aparece embaixo do nome)</span>
                <input
                  name="candFuncao"
                  maxLength={MAX_FUNCAO}
                  value={l.funcao}
                  onChange={(e) => alterar(l.chave, "funcao", e.target.value)}
                  className={classeEntrada}
                  placeholder="Ex.: Síndico, Fiscal"
                />
              </label>
              <label className="flex flex-col gap-1 text-[0.9rem] font-bold">
                Casa <span className="sr-only">(opcional)</span>
                <input
                  name="candCasa"
                  maxLength={20}
                  value={l.casa}
                  onChange={(e) => alterar(l.chave, "casa", e.target.value)}
                  className={classeEntrada}
                  placeholder="Ex.: Casa 12"
                />
              </label>
              {simNao ? (
                <input type="hidden" name="candNascimento" value="" />
              ) : (
                <label className="flex flex-col gap-1 text-[0.9rem] font-bold">
                  Nascimento{" "}
                  <span className="sr-only">(opcional, para o desempate)</span>
                  <input
                    name="candNascimento"
                    type="date"
                    value={l.nascimento}
                    onChange={(e) =>
                      alterar(l.chave, "nascimento", e.target.value)
                    }
                    className={classeEntrada}
                  />
                </label>
              )}
            </div>
            <label className="flex flex-col gap-1 text-[0.9rem] font-bold">
              Apresentação{" "}
              <span className="font-normal text-muted">
                (opcional, até 280 letras)
              </span>
              <textarea
                name="candApresentacao"
                rows={2}
                maxLength={280}
                value={l.apresentacao}
                onChange={(e) =>
                  alterar(l.chave, "apresentacao", e.target.value)
                }
                className={`${classeEntrada} py-2.5`}
              />
            </label>
          </div>
        ))}
        {linhas.length < MAX_CANDIDATOS ? (
          <div>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              icone={<UserPlus aria-hidden className="size-4" />}
              onClick={() => setLinhas((atual) => [...atual, nova()])}
            >
              {simNao ? "Acrescentar integrante" : "Acrescentar candidato"}
            </Botao>
          </div>
        ) : (
          <p className="text-[0.9rem] text-muted">
            Você chegou ao máximo de {MAX_CANDIDATOS} candidatos.
          </p>
        )}
        {!simNao ? (
          <p className="text-[0.88rem] text-muted">
            A data de nascimento só é usada no desempate pela idade e não
            aparece para os moradores.
          </p>
        ) : null}
      </fieldset>

      <div>
        <BotaoEnviar>
          {valores.id ? "Salvar rascunho" : "Criar rascunho"}
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}
