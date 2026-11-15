import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterUnidade } from "@/server/dados/unidades";
import { moradoresDaUnidade } from "@/server/dados/pessoas";
import { situacoesLoginMoradores } from "@/server/dados/acesso";
import { salvarUnidade } from "@/server/acoes/unidades";
import { idDocumento } from "@/lib/validacao";
import { Campo, Cartao, classeEntrada, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { EtiquetaSituacaoPessoa } from "../../pessoas/etiquetas";
import { EtiquetaLoginMorador } from "@/components/acesso/etiqueta-login";
import { AcessoMorador } from "@/components/acesso/acesso-morador";

export const metadata: Metadata = { title: "Unidade" };

export default async function PaginaUnidade({ params }: PageProps<"/admin/unidades/[id]">) {
  const ctx = await exigirPermissao("unidades.ver");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();
  const unidade = await obterUnidade(ctx, id);
  if (!unidade) notFound();

  const podeEditar = ctx.permissoes.has("unidades.gerenciar");
  const podeVerMoradores = ctx.permissoes.has("moradores.ver");
  const [moradores, logins] = podeVerMoradores
    ? await Promise.all([moradoresDaUnidade(ctx, id), situacoesLoginMoradores(ctx)])
    : [[], new Map<string, never>()];
  const podeCriarAcesso = ctx.permissoes.has("moradores.gerenciar");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/unidades" className="flex w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Todas as unidades
      </Link>
      <TituloPagina sobretitulo="Unidade" titulo={unidade.rotulo} descricao={unidade.quadra ? `Quadra ${unidade.quadra}` : undefined} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Dados da unidade</h2>
          {podeEditar ? (
            <Formulario acao={salvarUnidade} limparAoSalvar={false}>
              <input type="hidden" name="id" value={unidade.id} />
              <Campo id="rotulo" rotulo="Nome da unidade" dica="Como aparece para todos (ex.: Casa 12).">
                <input id="rotulo" name="rotulo" required maxLength={60} defaultValue={unidade.rotulo} className={classeEntrada} aria-describedby="rotulo-dica" />
              </Campo>
              <Campo id="quadra" rotulo="Quadra (opcional)">
                <input id="quadra" name="quadra" maxLength={20} defaultValue={unidade.quadra ?? ""} className={classeEntrada} />
              </Campo>
              <Campo id="status" rotulo="Situação">
                <select id="status" name="status" defaultValue={unidade.status} className={classeEntrada}>
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa (não aparece para autorizações e reservas)</option>
                </select>
              </Campo>
              <Campo id="observacao" rotulo="Observação interna (opcional)">
                <textarea id="observacao" name="observacao" maxLength={300} rows={3} defaultValue={unidade.observacao} className={`${classeEntrada} py-3`} />
              </Campo>
              <div>
                <BotaoEnviar>Salvar alterações</BotaoEnviar>
              </div>
            </Formulario>
          ) : (
            <dl className="grid gap-3">
              <div><dt className="rotulo-caixa">Situação</dt><dd className="font-bold">{unidade.status === "ativa" ? "Ativa" : "Inativa"}</dd></div>
              {unidade.observacao ? <div><dt className="rotulo-caixa">Observação</dt><dd>{unidade.observacao}</dd></div> : null}
            </dl>
          )}
        </Cartao>

        {podeVerMoradores ? (
          <Cartao className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Moradores</h2>
              {ctx.permissoes.has("moradores.gerenciar") ? (
                <BotaoLink href={`/admin/pessoas/nova?unidade=${unidade.id}`} variante="secundario" tamanho="pequeno" icone={<UserPlus aria-hidden className="size-4" />}>
                  Adicionar morador
                </BotaoLink>
              ) : null}
            </div>
            {moradores.length === 0 ? (
              <EstadoVazio icone={Users} titulo="Nenhum morador ligado a esta casa" />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {moradores.map((p) => (
                  <li key={p.uid} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <Link href={`/admin/pessoas/${p.uid}`} className="flex min-h-11 min-w-0 flex-1 items-center font-bold transition-colors hover:text-pine">
                      <span className="truncate">{p.nome}</span>
                    </Link>
                    {p.status !== "ativo" ? (
                      <EtiquetaSituacaoPessoa status={p.status} />
                    ) : p.papel === "morador" && podeCriarAcesso ? (
                      // Atalho "Criar acesso" (ou a situação, se já tiver). Fica sempre montado para
                      // o usuário e a senha continuarem na tela depois que a página atualizar.
                      <AcessoMorador
                        uid={p.uid}
                        nome={p.nome}
                        situacao={{ usuario: null, situacao: logins.get(p.uid) ?? "sem-acesso", ultimoAcesso: null }}
                        compacto
                      />
                    ) : p.papel === "morador" ? (
                      <EtiquetaLoginMorador situacao={logins.get(p.uid) ?? "sem-acesso"} />
                    ) : (
                      <EtiquetaSituacaoPessoa status={p.status} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        ) : null}
      </div>
    </div>
  );
}
