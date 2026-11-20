import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardList, UserPlus } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { planoDeImportacao } from "@/server/dados/pessoas";
import { importarMoradoresDaLista } from "@/server/acoes/pessoas";
import { rotuloCasas } from "@/lib/importar-moradores";
import { formatarTelefone } from "@/lib/contatos-votacao";
import { Alerta, Cartao, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BlocoNumero } from "@/components/ui/painel";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";

export const metadata: Metadata = { title: "Trazer moradores da lista" };

/** Quantas pessoas novas mostrar como amostra antes de cadastrar. */
const AMOSTRA = 30;

/**
 * Conferir e trazer para "Moradores e equipe" as pessoas da lista de contatos da votação
 * (a lista do Word). Só quem cuida dos moradores (síndico). Nada é gravado só de abrir:
 * a página mostra o que VAI acontecer; o botão grava (e pode ser apertado de novo sem repetir ninguém).
 */
export default async function ImportarMoradores() {
  const ctx = await exigirPermissao("moradores.gerenciar", "/admin/pessoas/importar");
  const plano = await planoDeImportacao(ctx);
  const n = plano.novos.length;
  const amostra = plano.novos.slice(0, AMOSTRA);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/pessoas" className="flex w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Moradores e equipe
      </Link>
      <TituloPagina
        sobretitulo="Pessoas"
        titulo="Trazer moradores da lista"
        descricao="A lista de contatos da votação (a lista do Word) vira cadastro em Moradores e equipe: cada nome, uma pessoa na sua casa."
      />

      {plano.casasNaLista === 0 ? (
        <EstadoVazio
          icone={ClipboardList}
          titulo="A lista de contatos ainda não foi importada"
          acao={<BotaoLink href="/admin/votacao">Ir para Votação oficial</BotaoLink>}
        >
          Importe a lista do Word em Votação oficial → abra a eleição → Links de voto e WhatsApp → Importar contatos. Depois
          volte aqui.
        </EstadoVazio>
      ) : (
        <>
          <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <BlocoNumero rotulo="Pessoas novas" valor={n} detalhe="entram ao confirmar" cor={n > 0 ? "pine" : "ink"} />
            <BlocoNumero rotulo="Já cadastradas" valor={plano.jaCadastrados} detalhe="não serão repetidas" cor="lake" />
            <BlocoNumero
              rotulo="Casas sem contato"
              valor={plano.casasSemContato.length}
              detalhe="não estão na lista"
              cor={plano.casasSemContato.length > 0 ? "laranja" : "ink"}
              className="col-span-2 sm:col-span-1"
            />
          </section>

          <Alerta tipo="info" titulo="Como funciona">
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              <li>
                Cada nome vira um <b>Morador</b> na casa da linha. “Maria / João” vira duas pessoas.
              </li>
              <li>O 1º telefone vai para o 1º nome e o 2º telefone para o 2º nome. Com um nome só, ele fica com os dois.</li>
              <li>Nomes escritos todos em maiúsculas ficam no jeito normal (ex.: “Maria das Graças”).</li>
              <li>
                Todos entram <b>sem acesso</b> ao portal. Depois, em cada pessoa, crie o usuário e a senha e envie pelo
                WhatsApp.
              </li>
              <li>Ninguém é repetido: pode apertar o botão de novo quando a lista mudar.</li>
              <li>Dá para corrigir nome, casa e telefone de qualquer pessoa depois, na página dela.</li>
            </ul>
          </Alerta>

          {n > 0 ? (
            <Cartao className="flex flex-col gap-4">
              <h2 className="text-lg font-bold">
                {n === 1 ? "1 pessoa vai entrar" : `${n} pessoas vão entrar`}
                {n > AMOSTRA ? ` (mostrando as ${AMOSTRA} primeiras)` : ""}
              </h2>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {amostra.map((p) => (
                  <li key={p.uid} className="flex items-baseline gap-x-3 px-3 py-2.5">
                    <span className="w-20 shrink-0 font-bold text-ink-2">{p.rotulo}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="break-words font-bold">{p.nome}</span>
                      <span className="flex flex-wrap gap-x-2 text-[0.9rem] text-muted tabular-nums">
                        {p.telefone || p.telefone2 ? (
                          [p.telefone, p.telefone2]
                            .filter(Boolean)
                            .map((t) => (
                              <span key={t} className="whitespace-nowrap">
                                {formatarTelefone(t)}
                              </span>
                            ))
                        ) : (
                          <span>sem telefone</span>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {n > AMOSTRA ? (
                <p className="text-[0.92rem] text-muted">
                  … e mais {n - AMOSTRA === 1 ? "1 pessoa" : `${n - AMOSTRA} pessoas`}.
                </p>
              ) : null}
              <div>
                <AcaoConfirmada
                  acao={importarMoradoresDaLista}
                  campos={{}}
                  titulo={n === 1 ? "Cadastrar 1 pessoa da lista?" : `Cadastrar ${n} pessoas da lista?`}
                  mensagem="Elas entram em Moradores e equipe como Morador, sem acesso ao portal. Quem já está cadastrado não é repetido."
                  textoConfirmar="Sim, cadastrar"
                  variante="primario"
                >
                  <UserPlus aria-hidden className="size-5" /> {n === 1 ? "Cadastrar 1 pessoa" : `Cadastrar ${n} pessoas`}
                </AcaoConfirmada>
              </div>
            </Cartao>
          ) : (
            <Alerta tipo="sucesso" titulo="Todos da lista já estão cadastrados">
              Não há ninguém novo para trazer. Veja todos em{" "}
              <Link href="/admin/pessoas?papel=morador" className="font-bold text-lake underline">
                Moradores e equipe
              </Link>
              .
            </Alerta>
          )}

          {plano.excluidosAntes > 0 ? (
            <Alerta tipo="info" titulo="Quem você excluiu não volta">
              {plano.excluidosAntes === 1
                ? "1 pessoa da lista já foi excluída por você e não será trazida de novo."
                : `${plano.excluidosAntes} pessoas da lista já foram excluídas por você e não serão trazidas de novo.`}{" "}
              Se precisar de alguma delas, use “Adicionar pessoa” em Moradores e equipe.
            </Alerta>
          ) : null}

          {plano.casasSemContato.length > 0 ? (
            <Alerta tipo="aviso" titulo="Casas que não estão na lista">
              {rotuloCasas(plano.casasSemContato)}: cadastre{" "}
              {plano.casasSemContato.length === 1 ? "o morador" : "os moradores"} pelo botão “Adicionar pessoa” em Moradores e
              equipe.
            </Alerta>
          ) : null}

          {plano.casasInativas.length > 0 ? (
            <Alerta tipo="aviso" titulo="Casas inativas ficaram de fora">
              {rotuloCasas(plano.casasInativas)} {plano.casasInativas.length === 1 ? "está inativa" : "estão inativas"} no
              cadastro. Para trazer essas pessoas, reative em Unidades e volte aqui.
            </Alerta>
          ) : null}

          {plano.casasNaoEncontradas > 0 ? (
            <Alerta tipo="aviso" titulo="Linhas sem casa no cadastro">
              {plano.casasNaoEncontradas === 1
                ? "1 linha da lista é de uma casa que não existe no cadastro e ficou de fora."
                : `${plano.casasNaoEncontradas} linhas da lista são de casas que não existem no cadastro e ficaram de fora.`}
            </Alerta>
          ) : null}
        </>
      )}
    </div>
  );
}
