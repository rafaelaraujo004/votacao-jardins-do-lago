import type { Metadata } from "next";
import { Megaphone, Plus } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { contarPorStatus, listarParaGestao, listarPublicados } from "@/server/dados/comunicados";
import { ehNovo, ehStatusComunicado, type StatusComunicado } from "@/lib/comunicados";
import { formatarData } from "@/lib/formato";
import { Alerta, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BlocoNumero, SegmentoLinks } from "@/components/ui/painel";
import { CartaoComunicado, EtiquetaStatusComunicado } from "@/components/comunicados/pecas";

export const metadata: Metadata = { title: "Comunicados" };

const FILTROS: { valor: StatusComunicado | "todos"; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "publicado", rotulo: "Publicados" },
  { valor: "rascunho", rotulo: "Rascunhos" },
  { valor: "arquivado", rotulo: "Arquivados" },
];

export default async function ComunicadosGestao({ searchParams }: { searchParams: Promise<{ situacao?: string | string[] }> }) {
  const ctx = await exigirPermissao("comunicados.ver");
  const podePublicar = ctx.permissoes.has("comunicados.publicar");
  const agora = new Date();

  // ----- Só consulta (ex.: conselho): vê o que está publicado -----
  if (!podePublicar) {
    const publicados = await listarPublicados(ctx);
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <TituloPagina sobretitulo="Comunicação" titulo="Comunicados" descricao="Comunicados publicados para os moradores." />
        <Alerta tipo="info" titulo="Somente consulta">
          Seu perfil vê os comunicados publicados, mas não escreve nem publica.
        </Alerta>
        {publicados.length === 0 ? (
          <EstadoVazio icone={Megaphone} titulo="Nenhum comunicado publicado" />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {publicados.map((c) => (
              <li key={c.id}>
                <CartaoComunicado
                  foto={c.fotos[0]}
                  href={`/admin/comunicados/${c.id}`}
                  titulo={c.titulo}
                  texto={c.texto}
                  prioridade={c.prioridade}
                  fixado={c.fixado}
                  novo={ehNovo(c.publicadoEm, agora)}
                  data={c.publicadoEm ? `Publicado em ${formatarData(c.publicadoEm, ctx.fuso)}` : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ----- Síndico: todos, com filtro por situação -----
  const params = await searchParams;
  const pedido = Array.isArray(params.situacao) ? params.situacao[0] : params.situacao;
  const filtro: StatusComunicado | "todos" = ehStatusComunicado(pedido) ? pedido : "todos";

  const todos = await listarParaGestao(ctx);
  const numeros = contarPorStatus(todos);
  const lista = filtro === "todos" ? todos : todos.filter((c) => c.status === filtro);

  const dataDe = (c: (typeof todos)[number]) => {
    if (c.status === "publicado" && c.publicadoEm) return `Publicado em ${formatarData(c.publicadoEm, ctx.fuso)}`;
    const quando = c.atualizadoEm ?? c.criadoEm;
    const por = c.criadoPorNome ? ` · escrito por ${c.criadoPorNome}` : "";
    return quando ? `Alterado em ${formatarData(quando, ctx.fuso)}${por}` : por.slice(3);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Comunicados"
        descricao="Escreva avisos para os moradores. Salve como rascunho, confira a pré-visualização e publique quando estiver pronto."
        acoes={
          <BotaoLink href="/admin/comunicados/novo" icone={<Plus aria-hidden className="size-5" />}>
            Novo comunicado
          </BotaoLink>
        }
      />

      <div className="grid grid-cols-3 gap-2.5">
        <BlocoNumero rotulo="Publicados" valor={numeros.publicado} cor="pine" />
        <BlocoNumero rotulo="Rascunhos" valor={numeros.rascunho} cor="laranja" />
        <BlocoNumero rotulo="Arquivados" valor={numeros.arquivado} cor="ink" />
      </div>

      <SegmentoLinks
        rotulo="Filtrar por situação"
        rolavel
        ariaCurrent="page"
        opcoes={FILTROS.map((f) => ({
          rotulo: f.rotulo,
          href: f.valor === "todos" ? "/admin/comunicados" : `/admin/comunicados?situacao=${f.valor}`,
          ativo: f.valor === filtro,
        }))}
      />

      {lista.length === 0 ? (
        <EstadoVazio
          icone={Megaphone}
          titulo={filtro === "todos" ? "Nenhum comunicado ainda" : "Nada nesta situação"}
          acao={
            filtro === "todos" ? (
              <BotaoLink href="/admin/comunicados/novo" icone={<Plus aria-hidden className="size-5" />}>
                Escrever o primeiro
              </BotaoLink>
            ) : undefined
          }
        >
          {filtro === "todos"
            ? "Comece com um aviso simples, por exemplo o horário da coleta de lixo."
            : "Escolha outra situação no filtro acima."}
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((c) => (
            <li key={c.id}>
              <CartaoComunicado
                foto={c.fotos[0]}
                href={`/admin/comunicados/${c.id}`}
                titulo={c.titulo}
                texto={c.texto}
                prioridade={c.prioridade}
                fixado={c.fixado && c.status === "publicado"}
                novo={c.status === "publicado" && ehNovo(c.publicadoEm, agora)}
                data={dataDe(c)}
                extra={<EtiquetaStatusComunicado status={c.status} />}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
