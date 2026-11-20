import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CirclePause, CirclePlay, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { loginDaCasa, obterPessoa } from "@/server/dados/pessoas";
import { situacaoAcessoMorador, situacaoDoAcesso } from "@/server/dados/acesso";
import { listarUnidades, obterUnidade } from "@/server/dados/unidades";
import { removerAcessoMorador } from "@/server/acoes/acesso";
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
import { BotaoExcluirPessoa } from "./botao-excluir";
import { AcessoMorador } from "@/components/acesso/acesso-morador";

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
  // Morador entra com usuário (código) + senha; quem cuida dos moradores cria esse acesso.
  // O LOGIN É UM SÓ POR CASA: se outra pessoa da casa já tem, este cadastro só mostra com quem está.
  const ehMorador = pessoa.papel === "morador";
  const gerenciaMoradores = ctx.permissoes.has("moradores.gerenciar");
  const donoDoLogin = ehMorador && pessoa.unitId ? await loginDaCasa(ctx, pessoa.unitId, pessoa.uid) : null;
  const ehDonoDoLogin = donoDoLogin?.uid === pessoa.uid;
  const loginComOutro = donoDoLogin && !ehDonoDoLogin ? donoDoLogin : null;
  const rotuloDaCasa =
    ehMorador && pessoa.unitId && ctx.permissoes.has("unidades.ver")
      ? ((await obterUnidade(ctx, pessoa.unitId))?.rotulo ?? "casa")
      : "casa";
  const podeCriarAcessoMorador = ehMorador && !ehVoce && pessoa.status === "ativo" && gerenciaMoradores && !loginComOutro;
  const situacaoMorador = podeCriarAcessoMorador ? await situacaoAcessoMorador(ctx, pessoa.uid) : null;
  // Remover o login: de quem tem o login da casa (mesmo suspenso), para passar a outra pessoa.
  const podeRemoverLogin = ehMorador && !ehVoce && gerenciaMoradores && ehDonoDoLogin;
  const efetivas = calcularPermissoes(pessoa.papel, pessoa.permissoesExtras, pessoa.permissoesNegadas);
  // Excluir de vez: só a administração (síndico), nunca o próprio cadastro.
  const podeExcluir = ctx.papel === "admin" && podeEditar && !ehVoce;

  // Suspender: o login é da casa toda, então o efeito depende de quem tem o login.
  const textoSuspender = ehDonoDoLogin
    ? `${pessoa.nome} tem o login da ${rotuloDaCasa}: suspender bloqueia o login na hora e desconecta todos da casa de todos os aparelhos. Os registros continuam guardados.`
    : loginComOutro
      ? `${pessoa.nome} não tem login próprio: entra com o login da casa, que está com ${loginComOutro.nome}. Suspender só marca este cadastro; a casa continua entrando. Para bloquear a entrada da casa, suspenda o cadastro de ${loginComOutro.nome}.`
      : ehMorador
        ? "A casa ainda não tem login. Suspender marca este cadastro como suspenso (enquanto isso, não dá para criar o login em nome desta pessoa). Os registros continuam guardados."
        : "Suspender impede o acesso na hora e desconecta a pessoa de todos os aparelhos. Os registros dela continuam guardados.";
  const mensagemSuspender = ehDonoDoLogin
    ? `Ninguém da ${rotuloDaCasa} vai conseguir entrar até o acesso ser reativado. Para só passar o login a outra pessoa da casa, use “Remover login”.`
    : loginComOutro
      ? `O cadastro fica suspenso, mas a casa continua entrando com o login que está com ${loginComOutro.nome}.`
      : ehMorador
        ? "O cadastro fica suspenso até ser reativado."
        : "A pessoa não vai mais conseguir entrar no portal até que o acesso seja reativado.";
  const textoReativar = ehDonoDoLogin
    ? `O acesso está suspenso: o login da ${rotuloDaCasa} está bloqueado para todos da casa. Reative para a casa voltar a entrar.`
    : ehMorador
      ? "Este cadastro está suspenso. Reative para voltar ao normal."
      : "O acesso está suspenso. Reative para a pessoa voltar a entrar.";
  const mensagemReativar = ehDonoDoLogin
    ? `Todos da ${rotuloDaCasa} voltam a entrar com o login da casa.`
    : ehMorador
      ? "O cadastro volta a ficar ativo."
      : "A pessoa volta a entrar no portal com o mesmo perfil de antes.";

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
            : "O cadastro está pronto. Se a casa ainda não tem login, crie no cartão “Login da casa” e envie pelo WhatsApp."}
        </Alerta>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">{podeEditar ? "Editar dados" : "Dados"}</h2>
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
                  <p className="text-ink-2">{textoSuspender}</p>
                  <div>
                    <AcaoConfirmada
                      acao={alterarSituacao}
                      campos={{ uid: pessoa.uid, status: "suspenso" }}
                      titulo={`Suspender o acesso de ${pessoa.nome}?`}
                      mensagem={mensagemSuspender}
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
                  <p className="text-ink-2">{textoReativar}</p>
                  <div>
                    <AcaoConfirmada
                      acao={alterarSituacao}
                      campos={{ uid: pessoa.uid, status: "ativo" }}
                      titulo={`Reativar o acesso de ${pessoa.nome}?`}
                      mensagem={mensagemReativar}
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

          {ehMorador && pessoa.unitId && (situacaoMorador || donoDoLogin) ? (
            <Cartao id="acesso-morador" className="flex scroll-mt-24 flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <KeyRound aria-hidden className="size-5 text-pine" /> Login da casa
              </h2>
              <p className="text-[0.92rem] text-muted">
                O login é um só por casa: todos da {rotuloDaCasa} entram com o mesmo usuário e senha.
              </p>
              {loginComOutro ? (
                <>
                  <p className="text-ink-2">
                    O login da {rotuloDaCasa} está com{" "}
                    <Link href={`/admin/pessoas/${loginComOutro.uid}`} className="font-bold text-lake underline">
                      {loginComOutro.nome}
                    </Link>
                    . {pessoa.nome} entra com ele.
                  </p>
                  {loginComOutro.status !== "ativo" ? (
                    <p className="font-bold text-danger">
                      O cadastro de {loginComOutro.nome} está suspenso: ninguém da casa consegue entrar até reativar ou passar o
                      login para outra pessoa.
                    </p>
                  ) : null}
                  {gerenciaMoradores ? (
                    <p className="text-[0.92rem] text-ink-2">
                      Para passar o login para {pessoa.nome}: abra o cadastro de {loginComOutro.nome}, use “Remover login” e
                      depois volte aqui para criar o login.
                    </p>
                  ) : null}
                </>
              ) : situacaoMorador ? (
                <AcessoMorador uid={pessoa.uid} nome={pessoa.nome} situacao={situacaoMorador} />
              ) : ehDonoDoLogin && pessoa.status !== "ativo" ? (
                <p className="font-bold text-danger">
                  O login da {rotuloDaCasa} está em nome de {pessoa.nome}, e este cadastro está suspenso: ninguém da casa
                  consegue entrar até reativar.
                </p>
              ) : ehDonoDoLogin ? (
                <p className="text-ink-2">O login da {rotuloDaCasa} está em nome de {pessoa.nome}.</p>
              ) : null}
              {podeRemoverLogin ? (
                <div className="border-t border-line pt-3">
                  <AcaoConfirmada
                    acao={removerAcessoMorador}
                    campos={{ uid: pessoa.uid }}
                    titulo={`Remover o login da ${rotuloDaCasa}?`}
                    mensagem={`O cadastro de ${pessoa.nome} continua na casa, mas o usuário e a senha deixam de funcionar na hora, para todos da casa. Depois você pode criar o login para outra pessoa da casa e enviar pelo WhatsApp.`}
                    textoConfirmar="Sim, remover o login"
                    perigo
                  >
                    <KeyRound aria-hidden className="size-4" /> Remover login
                  </AcaoConfirmada>
                </div>
              ) : null}
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

          {podeExcluir ? (
            <Cartao className="flex flex-col gap-3 border-danger">
              <h2 className="flex items-center gap-2 text-lg font-bold text-danger">
                <Trash2 aria-hidden className="size-5" /> Excluir cadastro
              </h2>
              <p className="text-ink-2">
                {ehDonoDoLogin
                  ? `Apaga o cadastro de ${pessoa.nome} e o login da ${rotuloDaCasa}: ninguém da casa entra até você criar o login para outra pessoa. Não dá para desfazer.`
                  : `Apaga o cadastro e o acesso de ${pessoa.nome}. Não dá para desfazer.`}{" "}
                {pessoa.status === "suspenso"
                  ? "O acesso já está suspenso: só exclua se este cadastro não deve mais existir."
                  : "Para afastar a pessoa só por um tempo, use “Suspender acesso”."}
              </p>
              <div>
                <BotaoExcluirPessoa uid={pessoa.uid} nome={pessoa.nome} suspenso={pessoa.status === "suspenso"} />
              </div>
            </Cartao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
