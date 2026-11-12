import type { Metadata } from "next";
import {
  CalendarDays,
  FileText,
  MapPinned,
  Megaphone,
  MessageSquareWarning,
  Package,
  Phone,
  UserCheck,
  Wallet,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { saudacao } from "@/lib/formato";
import { Atalho } from "@/components/ui/atalho";
import { Alerta } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Início" };

// Ordem pedida: o que o morador mais procura vem primeiro.
const ATALHOS = [
  { icone: Wallet, titulo: "Financeiro", descricao: "Veja as contas do condomínio", emBreve: "Fase 2", tom: "pine" },
  { icone: UserCheck, titulo: "Visitantes", descricao: "Autorize a entrada de alguém", emBreve: "Fase 3", tom: "lake" },
  { icone: CalendarDays, titulo: "Reservas", descricao: "Veja horários disponíveis", emBreve: "Fase 4", tom: "plum" },
  { icone: MapPinned, titulo: "Mapa", descricao: "Encontre ruas e áreas comuns", emBreve: "Fase 5", tom: "pine" },
  { icone: Package, titulo: "Encomendas", descricao: "Veja o que chegou para você", emBreve: "Fase 3", tom: "lake" },
  { icone: Megaphone, titulo: "Comunicados", descricao: "Avisos da administração", emBreve: "Fase 4", tom: "plum" },
  { icone: MessageSquareWarning, titulo: "Informar um problema", descricao: "Iluminação, vazamento, limpeza…", emBreve: "Fase 4", tom: "pine" },
  { icone: FileText, titulo: "Documentos", descricao: "Regimento, convenção e atas", emBreve: "Fase 4", tom: "lake" },
  { icone: Phone, titulo: "Contatos", descricao: "Telefones e horários úteis", emBreve: "Fase 2", tom: "plum" },
] as const;

export default async function InicioMorador() {
  const ctx = await exigirPermissao("area.morador");
  const primeiroNome = ctx.nome.split(" ")[0];

  return (
    <div className="flex flex-col gap-5">
      <section className="surgir rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-plum">
          {ctx.unidadeRotulo ?? "Sua casa"}
        </p>
        <h1 className="mt-1 text-[1.8rem] font-bold">
          {saudacao(new Date(), ctx.fuso)}, {primeiroNome}!
        </h1>
        <p className="mt-1 text-[1.05rem] text-ink-2">O que você precisa resolver hoje?</p>
      </section>

      <section aria-labelledby="titulo-atalhos" className="flex flex-col gap-3">
        <h2 id="titulo-atalhos" className="sr-only">
          Atalhos
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ATALHOS.map((a) => (
            <li key={a.titulo}>
              <Atalho {...a} />
            </li>
          ))}
        </ul>
      </section>

      <Alerta tipo="info" titulo="O portal está sendo construído por partes">
        Cada atalho será liberado quando a sua parte estiver pronta e testada. A etiqueta “Em breve” mostra em qual
        fase ele chega.
      </Alerta>
    </div>
  );
}
