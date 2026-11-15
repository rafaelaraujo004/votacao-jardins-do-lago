import type { Metadata } from "next";
import { CircleCheck, CirclePause, Eye, EyeOff, FolderOpen, Pencil, Plus, Users } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { documentosVisiveis, todosOsDocumentos } from "@/server/dados/documentos";
import { mudarSituacaoDocumento } from "@/server/acoes/documentos";
import { agruparPorCategoria, descreverVisibilidade } from "@/lib/documentos";
import { Cartao, EstadoVazio, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { BlocoNumero, TituloSecao } from "@/components/ui/painel";
import { AvisoComoCompartilhar, LinkDocumento } from "@/components/documentos/pecas";
import { ListaDocumentos } from "@/components/documentos/lista-documentos";

export const metadata: Metadata = { title: "Documentos" };

/**
 * Documentos do condomínio na área da gestão.
 * - Quem gerencia ("documentos.gerenciar"): vê todos (inclusive desativados), cadastra, edita, ativa e desativa.
 * - Quem só pode ver (ex.: conselho): a mesma lista que o morador vê para o seu perfil.
 */
export default async function DocumentosGestao() {
  const ctx = await exigirPermissao("documentos.ver", "/admin/documentos");

  if (!ctx.permissoes.has("documentos.gerenciar")) {
    const docs = await documentosVisiveis(ctx);
    return (
      <div className="flex flex-col gap-6">
        <TituloPagina sobretitulo="Comunicação" titulo="Documentos" descricao="Regimento, convenção, atas e outros documentos do condomínio." />
        <ListaDocumentos documentos={docs} fuso={ctx.fuso} />
      </div>
    );
  }

  const docs = await todosOsDocumentos(ctx);
  const ativos = docs.filter((d) => d.ativo).length;

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Documentos"
        descricao="Cadastre os documentos por link. Desativar tira o documento da lista sem apagar nada."
        acoes={
          <BotaoLink href="/admin/documentos/novo" icone={<Plus aria-hidden className="size-5" />}>
            Novo documento
          </BotaoLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <BlocoNumero rotulo="Visíveis" valor={ativos} cor="pine" />
        <BlocoNumero rotulo="Desativados" valor={docs.length - ativos} cor="ink" />
      </div>

      {docs.length === 0 ? (
        <>
          <EstadoVazio
            icone={FolderOpen}
            titulo="Nenhum documento cadastrado"
            acao={
              <BotaoLink href="/admin/documentos/novo" icone={<Plus aria-hidden className="size-5" />}>
                Cadastrar o primeiro
              </BotaoLink>
            }
          >
            Comece pelo regimento interno e pela convenção: são os mais procurados pelos moradores.
          </EstadoVazio>
          <AvisoComoCompartilhar />
        </>
      ) : (
        agruparPorCategoria(docs).map((g) => (
          <section key={g.categoria} aria-labelledby={`grupo-${g.categoria}`} className="flex flex-col gap-3">
            <TituloSecao id={`grupo-${g.categoria}`}>{g.nome}</TituloSecao>
            <ul className="grid gap-3 md:grid-cols-2">
              {g.itens.map((d) => (
                <li key={d.id}>
                  <Cartao className="flex h-full flex-col gap-3">
                    <LinkDocumento doc={d} fuso={ctx.fuso} />
                    <div className="flex flex-wrap items-center gap-2">
                      {d.ativo ? (
                        <Etiqueta tom="ok" icone={CircleCheck}>Visível</Etiqueta>
                      ) : (
                        <Etiqueta tom="neutro" icone={CirclePause}>Desativado</Etiqueta>
                      )}
                      <Etiqueta tom="neutro" icone={Users}>{descreverVisibilidade(d.visivelPara)}</Etiqueta>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <BotaoLink
                        href={`/admin/documentos/${d.id}`}
                        variante="secundario"
                        tamanho="pequeno"
                        icone={<Pencil aria-hidden className="size-4" />}
                      >
                        Editar
                      </BotaoLink>
                      {d.ativo ? (
                        <AcaoConfirmada
                          acao={mudarSituacaoDocumento}
                          campos={{ id: d.id, ativo: "nao" }}
                          titulo="Desativar este documento?"
                          mensagem={
                            <>
                              <b>{d.titulo}</b> deixa de aparecer para os moradores e a equipe. Nada é apagado: você pode ativar de novo
                              quando quiser.
                            </>
                          }
                          textoConfirmar="Desativar"
                          perigo
                        >
                          <EyeOff aria-hidden className="size-4" /> Desativar
                        </AcaoConfirmada>
                      ) : (
                        <AcaoConfirmada
                          acao={mudarSituacaoDocumento}
                          campos={{ id: d.id, ativo: "sim" }}
                          titulo="Ativar este documento?"
                          mensagem={
                            <>
                              <b>{d.titulo}</b> volta a aparecer para: {descreverVisibilidade(d.visivelPara)}.
                            </>
                          }
                          textoConfirmar="Ativar"
                        >
                          <Eye aria-hidden className="size-4" /> Ativar
                        </AcaoConfirmada>
                      )}
                    </div>
                  </Cartao>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
