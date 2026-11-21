import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import { resumoDoCondominio } from "@/server/dados/gestao";
import { numerosDasSolicitacoes } from "@/server/dados/solicitacoes";
import { numerosClassificados } from "@/server/dados/classificados";
import { numerosDaAgenda } from "@/server/dados/reservas";
import { contarMoradoresPorUnidade } from "@/server/dados/pessoas";
import { listarUnidades } from "@/server/dados/unidades";
import { informacoesDoCondominio } from "@/server/dados/informacoes";
import { configFinanceira, mesesComSaldo } from "@/server/dados/financeiro";
import type { Permissao } from "@/lib/permissoes";
import { hojeISO } from "@/lib/formato";
import { cx } from "@/lib/cx";
import { InformacoesUteisPainel } from "@/components/informacoes/informacoes-uteis-painel";
import { PainelEleicaoInicio } from "@/components/eleicoes/painel-inicio";
import { ResumoFinanceiroPainel } from "@/components/financeiro/resumo-painel";
import { Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { BlocoNumero, TituloSecao, type TomModulo } from "@/components/ui/painel";
import { AtalhoComAjuda } from "@/components/ui/atalho-com-ajuda";
import type { NomeIconeAtalho } from "@/components/ui/icones-atalho";

export const metadata: Metadata = { title: "Painel" };

/** Atalhos do painel (só aparecem os que o perfil pode usar). Cada um tem um "i" com a explicação. */
const ATALHOS: { titulo: string; icone: NomeIconeAtalho; tom: TomModulo; permissao: Permissao; alemDe?: Permissao; href: string; ajuda: string }[] = [
  { titulo: "Votação oficial", icone: "Award", tom: "vinho", permissao: "eleicoes.gerenciar", href: "/admin/votacao", ajuda: "Eleição do Residencial Jardins do Lago com voto secreto. Aqui a comissão cria a votação, cadastra a chapa, publica, envia os links de voto pelo WhatsApp, bloqueia casas e acompanha no mapa quem já votou. O resultado aparece só depois do encerramento." },
  { titulo: "Unidades", icone: "Building2", tom: "verde", permissao: "unidades.ver", href: "/admin/unidades", ajuda: "Lista das casas do Residencial Jardins do Lago (número, quadra e se está ativa). É a base para moradores, votação, portaria e cobranças." },
  { titulo: "Moradores e equipe", icone: "Users", tom: "lago", permissao: "moradores.ver", href: "/admin/pessoas", ajuda: "Moradores de cada casa (com ou sem acesso ao portal), portaria, conselho e administração. Aqui você edita e exclui cadastros, traz a lista de contatos, cria acessos, gera senha nova e ajusta permissões." },
  { titulo: "Lançar no caixa", icone: "ReceiptText", tom: "areia", permissao: "financeiro.lancar", href: "/admin/financeiro/novo", ajuda: "Atalho para registrar uma receita ou despesa do Residencial Jardins do Lago agora mesmo (taxa recebida, conta paga, compra)." },
  { titulo: "Prestação de contas", icone: "Landmark", tom: "areia", permissao: "financeiro.ver", href: "/admin/financeiro", ajuda: "Entradas e saídas de cada mês, saldo e categorias. Quando o mês estiver conferido, publique para os moradores verem." },
  { titulo: "Relatórios", icone: "ChartColumn", tom: "lago", permissao: "relatorios.ver", href: "/admin/relatorios", ajuda: "Gráficos e números do Residencial Jardins do Lago: financeiro, solicitações, reservas e portaria. Dá para baixar planilha." },
  { titulo: "Reservas e áreas", icone: "CalendarDays", tom: "verde", permissao: "reservas.ver_todas", href: "/admin/reservas", ajuda: "Pedidos de reserva da área de lazer e dos equipamentos. Aprove ou recuse e configure as regras de cada área." },
  { titulo: "Solicitações", icone: "ClipboardList", tom: "vinho", permissao: "solicitacoes.gerenciar", href: "/admin/solicitacoes", ajuda: "Pedidos e reclamações dos moradores (lâmpada, vazamento, barulho…). Responda e acompanhe até resolver." },
  { titulo: "Novo comunicado", icone: "SquarePen", tom: "areia", permissao: "comunicados.publicar", href: "/admin/comunicados/novo", ajuda: "Atalho para escrever um aviso agora. Ele aparece no Início de todos os moradores e pode ser compartilhado no WhatsApp." },
  { titulo: "Comunicados", icone: "Megaphone", tom: "areia", permissao: "comunicados.ver", href: "/admin/comunicados", ajuda: "Todos os avisos do Residencial Jardins do Lago: publicados, rascunhos e arquivados." },
  { titulo: "Documentos", icone: "FolderOpen", tom: "lago", permissao: "documentos.ver", href: "/admin/documentos", ajuda: "Regimento, atas, convenção e outros arquivos. Escolha quem pode ver cada documento." },
  { titulo: "Enquetes", icone: "Vote", tom: "vinho", permissao: "enquetes.gerenciar", href: "/admin/enquetes", ajuda: "Perguntas rápidas para os moradores opinarem (um voto por casa). Diferente da votação oficial: serve para consultas do dia a dia." },
  { titulo: "Classificados", icone: "Store", tom: "areia", permissao: "classificados.moderar", href: "/admin/classificados", ajuda: "Anúncios de compra, venda e serviços entre vizinhos. Aprove ou recuse antes de aparecerem para todos." },
  { titulo: "Portaria", icone: "ShieldCheck", tom: "vinho", permissao: "portaria.operar", alemDe: "area.portaria", href: "/portaria", ajuda: "Tela de trabalho da portaria: conferir o código de visitas autorizadas, registrar entrada e saída e receber encomendas." },
  { titulo: "Histórico da portaria", icone: "DoorOpen", tom: "lago", permissao: "visitantes.ver_todos", href: "/admin/portaria", ajuda: "Quem entrou e saiu, visitas autorizadas e encomendas. Também faz a limpeza dos dados antigos (LGPD)." },
  { titulo: "Links de acesso", icone: "Link2", tom: "lago", permissao: "area.gestao", href: "/admin/links", ajuda: "Links prontos para mandar aos moradores e à equipe entrarem no portal." },
  { titulo: "Informações do residencial", icone: "Settings", tom: "areia", permissao: "informacoes.gerenciar", href: "/admin/informacoes", ajuda: "PIX da taxa, telefone da ronda, responsável pelas reservas e outros dados que aparecem para os moradores." },
  { titulo: "Auditoria", icone: "ScrollText", tom: "vinho", permissao: "auditoria.ver", href: "/admin/auditoria", ajuda: "Registro de tudo que foi feito no portal: quem fez, o quê e quando. Na votação, registra que a casa votou — nunca em quem." },
];

type Pendencia = { rotulo: string; valor: number; detalhe: string; href: string };

/** Lê um número sem derrubar o painel se a consulta falhar. */
async function semFalhar<T>(nome: string, ler: () => Promise<T>): Promise<T | null> {
  try {
    return await ler();
  } catch (erro) {
    console.error(`Painel: não foi possível carregar ${nome}`, erro);
    return null;
  }
}

/** O que está esperando uma decisão da administração (só o que o perfil pode ver). */
/** Casas ativas que ainda não têm nenhum login para entrar no portal (o síndico precisa gerar). */
async function casasSemAcesso(ctx: Contexto): Promise<{ sem: number; ativas: number }> {
  const [unidades, porCasa] = await Promise.all([listarUnidades(ctx), contarMoradoresPorUnidade(ctx)]);
  const ativas = unidades.filter((u) => u.status === "ativa");
  return { sem: ativas.filter((u) => (porCasa.get(u.id)?.comAcesso ?? 0) === 0).length, ativas: ativas.length };
}

async function pendenciasDo(ctx: Contexto): Promise<Pendencia[]> {
  const podeDarAcesso = ctx.permissoes.has("moradores.gerenciar") && ctx.permissoes.has("unidades.ver");
  const [solicitacoes, classificados, agenda, acesso] = await Promise.all([
    ctx.permissoes.has("solicitacoes.gerenciar") ? semFalhar("as solicitações", () => numerosDasSolicitacoes(ctx)) : null,
    ctx.permissoes.has("classificados.moderar") ? semFalhar("os classificados", () => numerosClassificados(ctx)) : null,
    ctx.permissoes.has("reservas.ver_todas") ? semFalhar("as reservas", () => numerosDaAgenda(ctx)) : null,
    podeDarAcesso ? semFalhar("as casas sem acesso", () => casasSemAcesso(ctx)) : null,
  ]);
  const lista: Pendencia[] = [];
  if (solicitacoes) {
    lista.push({
      rotulo: "Solicitações abertas",
      valor: solicitacoes.abertas,
      detalhe: `${solicitacoes.emAndamento} em andamento`,
      href: "/admin/solicitacoes",
    });
  }
  if (agenda) {
    lista.push({ rotulo: "Reservas pendentes", valor: agenda.pendentes, detalhe: `${agenda.hoje} reserva(s) hoje`, href: "/admin/reservas" });
  }
  if (classificados) {
    lista.push({
      rotulo: "Anúncios para aprovar",
      valor: classificados.pendentes,
      detalhe: `${classificados.publicados} no ar`,
      href: "/admin/classificados",
    });
  }
  if (acesso) {
    lista.push({ rotulo: "Casas sem acesso", valor: acesso.sem, detalhe: `de ${acesso.ativas} casas ativas`, href: "/admin/pessoas" });
  }
  return lista;
}

/** Prestação de contas do painel: completa para quem vê tudo, só os meses publicados para os demais. */
async function financeiroDo(ctx: Contexto) {
  const completa = ctx.permissoes.has("financeiro.ver");
  if (!completa && !ctx.permissoes.has("financeiro.ver_publicado")) return null;
  const [meses, config] = await Promise.all([mesesComSaldo(ctx), configFinanceira(ctx)]);
  return {
    meses,
    saldoInicialCentavos: config.saldoInicialCentavos,
    completa,
    // A tela completa (/admin/financeiro) exige "financeiro.ver"; sem ela, o painel não mostra o link.
    href: completa ? "/admin/financeiro" : null,
  };
}

export default async function PainelGestao() {
  const ctx = await exigirPermissao("area.gestao");
  const [resumo, pendencias, info, financeiro] = await Promise.all([
    resumoDoCondominio(ctx),
    pendenciasDo(ctx),
    // Se uma destas leituras falhar, o painel continua abrindo sem o bloco.
    ctx.permissoes.has("informacoes.ver") ? semFalhar("as informações do residencial", () => informacoesDoCondominio(ctx)) : null,
    semFalhar("a prestação de contas", () => financeiroDo(ctx)),
  ]);
  const mesAtual = hojeISO(new Date(), ctx.fuso).slice(0, 7);
  const somenteConsulta = !ctx.permissoes.has("unidades.gerenciar");
  // Só mostra os atalhos que o perfil pode usar.
  const atalhos = ATALHOS.filter((a) => ctx.permissoes.has(a.permissao) && (!a.alemDe || ctx.permissoes.has(a.alemDe)));
  const gestao = resumo.pessoasPorPapel.admin + resumo.pessoasPorPapel.conselheiro;

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Visão geral"
        titulo="Painel do residencial"
        descricao="Resumo do cadastro e o que está esperando a administração."
        acoes={somenteConsulta ? <Etiqueta tom="info" icone={Eye}>Somente consulta</Etiqueta> : null}
      />

      {/* Votação oficial em destaque (toda a equipe acompanha QUANTAS casas votaram, nunca quais).
          O link para acompanhar no mapa aparece só para quem gerencia a votação. */}
      {/* Sem Suspense de propósito: vem junto com o topo (não empurra a tela depois). */}
      <PainelEleicaoInicio ctx={ctx} perfil="gestao" />

      {/* Pendências: cada número leva à tela onde se resolve. */}
      {pendencias.length ? (
        <section aria-labelledby="titulo-pendencias" className="flex flex-col gap-3">
          <TituloSecao id="titulo-pendencias">Esperando a administração</TituloSecao>
          {/* Sem buraco na grade: 4 cartões = 2×2 no celular e 4 lado a lado; número ímpar no
              celular = o último ocupa a linha toda. */}
          <ul className={cx("grid grid-cols-2 gap-3", pendencias.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
            {pendencias.map((p, i) => (
              <li key={p.rotulo} className={cx(pendencias.length % 2 === 1 && i === pendencias.length - 1 && "col-span-2 sm:col-span-1")}>
                <Link href={p.href} className="block rounded-[18px] transition-shadow active:shadow-afundado">
                  <BlocoNumero rotulo={p.rotulo} valor={p.valor} detalhe={p.detalhe} cor={p.valor > 0 ? "laranja" : "ink"} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Números reais do cadastro (contados no servidor). */}
      <section aria-labelledby="titulo-numeros" className="flex flex-col gap-3">
        <h2 id="titulo-numeros" className="sr-only">Números do cadastro</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <BlocoNumero rotulo="Unidades" valor={resumo.unidades} detalhe="cadastradas" cor="pine" />
          <BlocoNumero
            rotulo="Moradores"
            valor={resumo.pessoasPorPapel.morador}
            detalhe={`cadastrados · ${resumo.moradoresComAcesso} com acesso`}
            cor="lake"
          />
          <BlocoNumero rotulo="Portaria" valor={resumo.pessoasPorPapel.portaria} detalhe="pessoas da equipe" cor="ink" />
          <BlocoNumero rotulo="Gestão" valor={gestao} detalhe="administração e conselho" cor="plum" />
          <BlocoNumero
            rotulo="Suspensos"
            valor={resumo.suspensos}
            detalhe="acessos suspensos"
            cor={resumo.suspensos > 0 ? "laranja" : "ink"}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      </section>

      {info ? <InformacoesUteisPainel info={info} podeEditar={ctx.permissoes.has("informacoes.gerenciar")} /> : null}

      {financeiro ? (
        <ResumoFinanceiroPainel
          meses={financeiro.meses}
          mesAtual={mesAtual}
          saldoInicialCentavos={financeiro.saldoInicialCentavos}
          visaoCompleta={financeiro.completa}
          href={financeiro.href}
        />
      ) : null}

      {atalhos.length ? (
        <section aria-labelledby="titulo-atalhos" className="flex flex-col gap-3">
          <TituloSecao id="titulo-atalhos">Módulos</TituloSecao>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {atalhos.map((a) => (
              <li key={a.titulo}>
                <AtalhoComAjuda icone={a.icone} titulo={a.titulo} href={a.href} tom={a.tom} ajuda={a.ajuda} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
