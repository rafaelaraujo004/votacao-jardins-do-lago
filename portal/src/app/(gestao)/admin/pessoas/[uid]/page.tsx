import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CirclePause, CirclePlay, KeyRound, ShieldCheck } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterPessoa } from "@/server/dados/pessoas";
import { situacaoDoAcesso } from "@/server/dados/acesso";
import { listarUnidades } from "@/server/dados/unidades";
import { alterarSituacao, salvarPermissoes, salvarPessoa } from "@/server/acoes/pessoas";
import { idDocumento } from "@/lib/validacao";
import {
  calcularPermissoes,
  DESCRICAO_PERMISSAO,
  NOME_DO_PAPEL,
  PAPEIS,
  PERMISSOES_PADRAO,
  TETO_EXTRAS,
  type Papel,
} from "@/lib/permissoes";
import { Alerta, Cartao, TituloPagina } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { BotaoLink } from "@/components/ui/botao";
import { CamposPessoa } from "../campos-pessoa";
import { EtiquetaSituacaoPessoa } from "../etiquetas";
import { AcessoSenha } from "./acesso-senha";

export const metadata: Metadata = { title: "Pessoa" };

export default async function PaginaPessoa({ params, searchParams }: PageProps<"/admin/pessoas/[uid]">) {
  const ctx = await exigirPermissao("moradores.ver");
  const { uid } = await params;
  if (!idDocumento.safeParse(uid).success) notFound();
  const pessoa = await obterPessoa(ctx, uid);
  if (!pessoa) notFound();
  const { criado } = await searchParams;

  const gerencia = (p: Papel) => ctx.permissoes.has(p === "morador" ? "moradores.gerenciar" : "equipe.gerenciar");
  const podeEditar = gerencia(pessoa.papel);
  const papeisPermitidos = PAPEIS.filter(gerencia);
  const ehVoce = pessoa.uid === ctx.uid;
  const podePermissoes = ctx.permissoes.has("permissoes.gerenciar") && !ehVoce;
  const unidades = podeEditar ? (await listarUnidades(ctx)).filter((u) => u.status === "ativa" || u.id === pessoa.unitId) : [];
  // Equipe (não morador) entra com e-mail e senha; quem cuida da equipe cria esse acesso.
  const ehEquipe = pessoa.papel !== "morador";
  const podeCriarSenha = ehEquipe && !ehVoce && pessoa.status === "ativo" && ctx.permissoes.has("equipe.gerenciar");
  const situacaoSenha = podeCriarSenha ? await situacaoDoAcesso(ctx, pessoa.uid) : null;
  const efetivas = calcularPermissoes(pessoa.papel, pessoa.permissoesExtras, pessoa.permissoesNegadas);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/pessoas" className="flex w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Moradores e equipe
      </Link>
      <TituloPagina
        sobretitulo={NOME_DO_PAPEL[pessoa.papel]}
        titulo={pessoa.nome}
        acoes={<EtiquetaSituacaoPessoa status={pessoa.status} />}
      />

      {criado ? (
        <Alerta tipo="sucesso" titulo="Pessoa adicionada.">
          {ehEquipe
            ? "O cadastro está pronto. Agora crie o acesso com e-mail e senha no cartão “Entrar com e-mail e senha”."
            : "O cadastro está pronto. O acesso dos moradores será liberado em breve pela administração."}
        </Alerta>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Dados</h2>
          {podeEditar ? (
            <Formulario acao={salvarPessoa} limparAoSalvar={false}>
              <input type="hidden" name="uid" value={pessoa.uid} />
              <CamposPessoa
                papeis={papeisPermitidos.includes(pessoa.papel) ? papeisPermitidos : [pessoa.papel, ...papeisPermitidos]}
                unidades={unidades.map((u) => ({ id: u.id, rotulo: u.rotulo }))}
                inicial={pessoa}
                papelTravado={ehVoce}
              />
              <div>
                <BotaoEnviar>Salvar alterações</BotaoEnviar>
              </div>
            </Formulario>
          ) : (
            <p className="text-ink-2">Seu perfil pode consultar este cadastro, mas não alterar.</p>
          )}
        </Cartao>

        <div className="flex flex-col gap-5">
          {podeEditar && !ehVoce ? (
            <Cartao className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">Acesso ao portal</h2>
              {pessoa.status === "ativo" ? (
                <>
                  <p className="text-ink-2">Suspender impede o acesso na hora e desconecta a pessoa de todos os aparelhos. Os registros dela continuam guardados.</p>
                  <div>
                    <AcaoConfirmada
                      acao={alterarSituacao}
                      campos={{ uid: pessoa.uid, status: "suspenso" }}
                      titulo={`Suspender o acesso de ${pessoa.nome}?`}
                      mensagem="A pessoa não vai mais conseguir entrar no portal até que o acesso seja reativado."
                      textoConfirmar="Sim, suspender"
                      perigo
                      variante="perigo"
                    >
                      <CirclePause aria-hidden className="size-5" /> Suspender acesso
                    </AcaoConfirmada>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-ink-2">O acesso está suspenso. Reative para a pessoa voltar a entrar.</p>
                  <div>
                    <AcaoConfirmada
                      acao={alterarSituacao}
                      campos={{ uid: pessoa.uid, status: "ativo" }}
                      titulo={`Reativar o acesso de ${pessoa.nome}?`}
                      mensagem="A pessoa volta a entrar no portal com o mesmo perfil de antes."
                      textoConfirmar="Sim, reativar"
                      variante="primario"
                    >
                      <CirclePlay aria-hidden className="size-5" /> Reativar acesso
                    </AcaoConfirmada>
                  </div>
                </>
              )}
            </Cartao>
          ) : null}

          {situacaoSenha ? (
            <Cartao className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <KeyRound aria-hidden className="size-5 text-pine" /> Entrar com e-mail e senha
              </h2>
              <AcessoSenha uid={pessoa.uid} nome={pessoa.nome} situacao={situacaoSenha} />
            </Cartao>
          ) : null}

          {ehEquipe && ehVoce ? (
            <Cartao className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <KeyRound aria-hidden className="size-5 text-pine" /> Sua senha
              </h2>
              <p className="text-ink-2">Para trocar a sua própria senha, confirme a senha atual e escolha uma nova.</p>
              <div>
                <BotaoLink href="/conta/senha" variante="secundario" icone={<KeyRound aria-hidden className="size-5" />}>
                  Trocar senha
                </BotaoLink>
              </div>
            </Cartao>
          ) : null}

          <Cartao className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ShieldCheck aria-hidden className="size-5 text-pine" /> Permissões
            </h2>
            {podePermissoes ? (
              <Formulario acao={salvarPermissoes} limparAoSalvar={false}>
                <input type="hidden" name="uid" value={pessoa.uid} />
                <p className="text-ink-2">
                  O perfil {NOME_DO_PAPEL[pessoa.papel]} já inclui as marcadas como “padrão”. Você pode retirar qualquer uma ou
                  acrescentar as poucas que este perfil aceita.
                </p>
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 font-bold">Do perfil (desmarque para retirar)</legend>
                  {PERMISSOES_PADRAO[pessoa.papel].map((p) => (
                    <label key={p} className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" className="size-5 accent-[var(--pine)]" defaultChecked={!pessoa.permissoesNegadas.includes(p)} name="manter" value={p} />
                      <span>{DESCRICAO_PERMISSAO[p]}</span>
                    </label>
                  ))}
                </fieldset>
                {TETO_EXTRAS[pessoa.papel].filter((p) => !PERMISSOES_PADRAO[pessoa.papel].includes(p)).length ? (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 font-bold">Extras que este perfil pode receber</legend>
                    {TETO_EXTRAS[pessoa.papel]
                      .filter((p) => !PERMISSOES_PADRAO[pessoa.papel].includes(p))
                      .map((p) => (
                        <label key={p} className="flex min-h-11 items-center gap-3">
                          <input type="checkbox" className="size-5 accent-[var(--pine)]" name="extras" value={p} defaultChecked={pessoa.permissoesExtras.includes(p)} />
                          <span>{DESCRICAO_PERMISSAO[p]}</span>
                        </label>
                      ))}
                  </fieldset>
                ) : null}
                <div>
                  <BotaoEnviar>Salvar permissões</BotaoEnviar>
                </div>
              </Formulario>
            ) : (
              <ul className="flex flex-col gap-1 text-ink-2">
                {[...efetivas].map((p) => (
                  <li key={p}>• {DESCRICAO_PERMISSAO[p]}</li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </div>
  );
}
