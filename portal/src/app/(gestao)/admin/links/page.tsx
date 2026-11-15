import type { Metadata } from "next";
import {
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FolderOpen,
  House,
  Landmark,
  LayoutDashboard,
  Link2,
  Map,
  Megaphone,
  Package,
  Phone,
  ShieldCheck,
  Store,
  UserCheck,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { enderecoBase } from "@/server/endereco";
import { idCondominioPadrao } from "@/lib/condominio-id";
import { linkWhatsApp } from "@/lib/portaria";
import { linkDoModulo, mensagemDoModulo, MODULOS, NOME_DA_AREA, type Grupo, type Modulo } from "@/lib/modulos";
import { Alerta, Cartao, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { TituloSecao } from "@/components/ui/painel";
import { LinkCopiavel } from "@/components/acesso/link-copiavel";

export const metadata: Metadata = { title: "Links de acesso" };

const ICONES: Record<string, LucideIcon> = {
  LayoutDashboard,
  ShieldCheck,
  DoorOpen,
  House,
  CalendarDays,
  UserCheck,
  Package,
  Landmark,
  Megaphone,
  ClipboardList,
  FolderOpen,
  Vote,
  Store,
  Map,
  Phone,
};

const ORDEM_AREAS: Grupo[] = ["morador", "portaria", "gestao"];
const ICONE_DA_AREA: Record<Grupo, LucideIcon> = { morador: House, portaria: DoorOpen, gestao: LayoutDashboard };

function CartaoModulo({ modulo, link, mensagem }: { modulo: Modulo; link: string; mensagem: string }) {
  const Icone = ICONES[modulo.icone] ?? Link2;
  const areas = ORDEM_AREAS.filter((a) => modulo.destinos[a]);
  return (
    <Cartao className="flex flex-col gap-3" aria-labelledby={`modulo-${modulo.chave}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-pine">
          <Icone aria-hidden className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={`modulo-${modulo.chave}`} className="text-[1.1rem] font-bold text-destaque">
            {modulo.nome}
          </h3>
          <p className="text-ink-2">{modulo.descricao}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[0.85rem] text-ink-2">
            <span>Abre para:</span>
            {areas.map((a) => (
              <Etiqueta key={a} icone={ICONE_DA_AREA[a]}>
                {NOME_DA_AREA[a]}
              </Etiqueta>
            ))}
          </div>
        </div>
      </div>
      <LinkCopiavel rotulo={`Link · ${modulo.nome}`} link={link} linkWhatsApp={linkWhatsApp(mensagem)} textoAbrir="Abrir" />
    </Cartao>
  );
}

/**
 * Links de cada módulo do portal, prontos para copiar ou mandar pelo WhatsApp.
 * Lista fixa em src/lib/modulos.ts. Os links só levam à tela de entrada: nada abre sem login.
 */
export default async function PaginaLinks() {
  const ctx = await exigirPermissao("area.gestao");
  const base = await enderecoBase();
  const padrao = idCondominioPadrao();

  const cartao = (m: Modulo) => {
    const link = linkDoModulo(base, m, ctx.condominioId, padrao);
    return <CartaoModulo key={m.chave} modulo={m} link={link} mensagem={mensagemDoModulo(ctx.condominioNome, m, link)} />;
  };

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Configurações"
        titulo="Links de acesso"
        descricao="Cada parte do portal tem o seu link. Mande para cada pessoa só o link que ela usa: o porteiro recebe o da Portaria, o conselho o do Conselho, os moradores o de Reservas, e assim por diante."
      />

      <Alerta tipo="info" titulo="O mesmo link serve para todo mundo">
        Todos os links pedem usuário e senha, e cada pessoa vê só o que o perfil dela permite. Ex.: o link de
        Reservas abre a agenda para o morador e as aprovações para o síndico.
      </Alerta>

      <Alerta tipo="sucesso" titulo="Tudo sincronizado">
        O que alguém faz num módulo aparece nos outros sozinho, em poucos segundos: o morador autoriza uma visita e a
        portaria já vê; a portaria registra uma encomenda e o morador já vê; o morador pede uma reserva e ela já aparece
        para aprovar.
      </Alerta>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-equipe">
        <TituloSecao id="titulo-equipe">Para a equipe</TituloSecao>
        {MODULOS.filter((m) => m.para === "equipe").map(cartao)}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-moradores">
        <TituloSecao id="titulo-moradores">Para os moradores</TituloSecao>
        {MODULOS.filter((m) => m.para === "moradores").map(cartao)}
      </section>
    </div>
  );
}
