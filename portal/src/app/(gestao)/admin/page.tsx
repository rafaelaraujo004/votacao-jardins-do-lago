import type { Metadata } from "next";
import { Building2, CalendarDays, DoorOpen, Eye, Landmark, Megaphone, ScrollText, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { resumoDoCondominio } from "@/server/dados/gestao";
import type { Permissao } from "@/lib/permissoes";
import { Alerta, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { AtalhoModulo, BlocoNumero, TituloSecao, type TomModulo } from "@/components/ui/painel";

export const metadata: Metadata = { title: "Painel" };

/** Atalhos do painel. Sem `href` = módulo ainda não pronto (aparece "Em breve" e não é clicável). */
const ATALHOS: { titulo: string; icone: LucideIcon; tom: TomModulo; permissao: Permissao; href?: string }[] = [
  { titulo: "Unidades", icone: Building2, tom: "verde", permissao: "unidades.ver", href: "/admin/unidades" },
  { titulo: "Moradores e equipe", icone: Users, tom: "lago", permissao: "moradores.ver", href: "/admin/pessoas" },
  { titulo: "Prestação de contas", icone: Landmark, tom: "areia", permissao: "financeiro.ver", href: "/admin/financeiro" },
  { titulo: "Auditoria", icone: ScrollText, tom: "vinho", permissao: "auditoria.ver", href: "/admin/auditoria" },
  { titulo: "Reservas e áreas", icone: CalendarDays, tom: "verde", permissao: "reservas.ver_todas", href: "/admin/reservas" },
  { titulo: "Portaria (operar)", icone: ShieldCheck, tom: "vinho", permissao: "portaria.operar", href: "/portaria" },
  { titulo: "Histórico da portaria", icone: DoorOpen, tom: "lago", permissao: "visitantes.ver_todos", href: "/admin/portaria" },
  { titulo: "Comunicados", icone: Megaphone, tom: "lago", permissao: "comunicados.ver" },
  { titulo: "Configurações", icone: Settings, tom: "areia", permissao: "areas.configurar" },
];

export default async function PainelGestao() {
  const ctx = await exigirPermissao("area.gestao");
  const resumo = await resumoDoCondominio(ctx);
  const somenteConsulta = !ctx.permissoes.has("unidades.gerenciar");
  // Só mostra os atalhos que o perfil pode usar.
  const atalhos = ATALHOS.filter((a) => ctx.permissoes.has(a.permissao));
  const gestao = resumo.pessoasPorPapel.admin + resumo.pessoasPorPapel.conselheiro;

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Visão geral"
        titulo="Painel do condomínio"
        descricao="Resumo do cadastro. Os módulos de gestão serão ligados fase a fase."
        acoes={somenteConsulta ? <Etiqueta tom="info" icone={Eye}>Somente consulta</Etiqueta> : null}
      />

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

      <Alerta tipo="info" titulo="O portal está sendo construído por partes">
        Já funcionam: login da equipe, perfis e permissões, auditoria, unidades e moradores, prestação de contas,
        portaria (visitantes e encomendas) e reservas das áreas de lazer. Comunicados e configurações chegam nas próximas fases.
      </Alerta>
    </div>
  );
}
