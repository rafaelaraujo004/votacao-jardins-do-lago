import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  DoorOpen,
  Eye,
  FolderOpen,
  Landmark,
  Link2,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import { resumoDoCondominio } from "@/server/dados/gestao";
import { numerosDasSolicitacoes } from "@/server/dados/solicitacoes";
import { numerosClassificados } from "@/server/dados/classificados";
import { numerosDaAgenda } from "@/server/dados/reservas";
import type { Permissao } from "@/lib/permissoes";
import { Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { AtalhoModulo, BlocoNumero, TituloSecao, type TomModulo } from "@/components/ui/painel";

export const metadata: Metadata = { title: "Painel" };

/** Atalhos do painel (só aparecem os que o perfil pode usar). */
const ATALHOS: { titulo: string; icone: LucideIcon; tom: TomModulo; permissao: Permissao; href: string }[] = [
  { titulo: "Unidades", icone: Building2, tom: "verde", permissao: "unidades.ver", href: "/admin/unidades" },
  { titulo: "Moradores e equipe", icone: Users, tom: "lago", permissao: "moradores.ver", href: "/admin/pessoas" },
  { titulo: "Prestação de contas", icone: Landmark, tom: "areia", permissao: "financeiro.ver", href: "/admin/financeiro" },
  { titulo: "Relatórios", icone: ChartColumn, tom: "lago", permissao: "relatorios.ver", href: "/admin/relatorios" },
  { titulo: "Reservas e áreas", icone: CalendarDays, tom: "verde", permissao: "reservas.ver_todas", href: "/admin/reservas" },
  { titulo: "Solicitações", icone: ClipboardList, tom: "vinho", permissao: "solicitacoes.gerenciar", href: "/admin/solicitacoes" },
  { titulo: "Comunicados", icone: Megaphone, tom: "areia", permissao: "comunicados.ver", href: "/admin/comunicados" },
  { titulo: "Documentos", icone: FolderOpen, tom: "lago", permissao: "documentos.ver", href: "/admin/documentos" },
  { titulo: "Enquetes", icone: Vote, tom: "vinho", permissao: "enquetes.gerenciar", href: "/admin/enquetes" },
  { titulo: "Classificados", icone: Store, tom: "areia", permissao: "classificados.moderar", href: "/admin/classificados" },
  { titulo: "Portaria (operar)", icone: ShieldCheck, tom: "vinho", permissao: "portaria.operar", href: "/portaria" },
  { titulo: "Histórico da portaria", icone: DoorOpen, tom: "lago", permissao: "visitantes.ver_todos", href: "/admin/portaria" },
  { titulo: "Links de acesso", icone: Link2, tom: "lago", permissao: "area.gestao", href: "/admin/links" },
  { titulo: "Informações do condomínio", icone: Settings, tom: "areia", permissao: "informacoes.gerenciar", href: "/admin/informacoes" },
  { titulo: "Auditoria", icone: ScrollText, tom: "vinho", permissao: "auditoria.ver", href: "/admin/auditoria" },
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
async function pendenciasDo(ctx: Contexto): Promise<Pendencia[]> {
  const [solicitacoes, classificados, agenda] = await Promise.all([
    ctx.permissoes.has("solicitacoes.gerenciar") ? semFalhar("as solicitações", () => numerosDasSolicitacoes(ctx)) : null,
    ctx.permissoes.has("classificados.moderar") ? semFalhar("os classificados", () => numerosClassificados(ctx)) : null,
    ctx.permissoes.has("reservas.ver_todas") ? semFalhar("as reservas", () => numerosDaAgenda(ctx)) : null,
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
  return lista;
}

export default async function PainelGestao() {
  const ctx = await exigirPermissao("area.gestao");
  const [resumo, pendencias] = await Promise.all([resumoDoCondominio(ctx), pendenciasDo(ctx)]);
  const somenteConsulta = !ctx.permissoes.has("unidades.gerenciar");
  // Só mostra os atalhos que o perfil pode usar.
  const atalhos = ATALHOS.filter((a) => ctx.permissoes.has(a.permissao));
  const gestao = resumo.pessoasPorPapel.admin + resumo.pessoasPorPapel.conselheiro;

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Visão geral"
        titulo="Painel do condomínio"
        descricao="Resumo do cadastro e o que está esperando a administração."
        acoes={somenteConsulta ? <Etiqueta tom="info" icone={Eye}>Somente consulta</Etiqueta> : null}
      />

      {/* Pendências: cada número leva à tela onde se resolve. */}
      {pendencias.length ? (
        <section aria-labelledby="titulo-pendencias" className="flex flex-col gap-3">
          <TituloSecao id="titulo-pendencias">Esperando a administração</TituloSecao>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pendencias.map((p) => (
              <li key={p.rotulo}>
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
          <BlocoNumero rotulo="Moradores" valor={resumo.pessoasPorPapel.morador} detalhe="com acesso" cor="lake" />
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

      {atalhos.length ? (
        <section aria-labelledby="titulo-atalhos" className="flex flex-col gap-3">
          <TituloSecao id="titulo-atalhos">Módulos</TituloSecao>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {atalhos.map((a) => (
              <li key={a.titulo}>
                <AtalhoModulo icone={a.icone} titulo={a.titulo} href={a.href} tom={a.tom} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
