import type { Metadata } from "next";
import { Building2, Eye, House, Landmark, ShieldCheck, UserX, type LucideIcon } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { resumoDoCondominio } from "@/server/dados/gestao";
import { Alerta, Cartao, Etiqueta, TituloPagina } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Painel" };

function Numero({ icone: Icone, rotulo, valor }: { icone: LucideIcon; rotulo: string; valor: number }) {
  return (
    <Cartao className="flex items-center gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ok-soft text-pine">
        <Icone aria-hidden className="size-6" />
      </span>
      <div className="flex flex-col">
        <span className="font-display text-[1.9rem] font-bold leading-none tabular-nums">{valor}</span>
        <span className="text-[0.92rem] text-muted">{rotulo}</span>
      </div>
    </Cartao>
  );
}

export default async function PainelGestao() {
  const ctx = await exigirPermissao("area.gestao");
  const resumo = await resumoDoCondominio(ctx);
  const somenteConsulta = !ctx.permissoes.has("unidades.gerenciar");

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Visão geral"
        titulo="Painel do condomínio"
        descricao="Resumo do cadastro. Os módulos de gestão serão ligados fase a fase."
        acoes={somenteConsulta ? <Etiqueta tom="info" icone={Eye}>Somente consulta</Etiqueta> : null}
      />

      <section aria-label="Números do cadastro" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Numero icone={Building2} rotulo="unidades cadastradas" valor={resumo.unidades} />
        <Numero icone={House} rotulo="moradores com acesso" valor={resumo.pessoasPorPapel.morador} />
        <Numero icone={ShieldCheck} rotulo="pessoas da portaria" valor={resumo.pessoasPorPapel.portaria} />
        <Numero icone={Landmark} rotulo="administração e conselho" valor={resumo.pessoasPorPapel.admin + resumo.pessoasPorPapel.conselheiro} />
        <Numero icone={UserX} rotulo="acessos suspensos" valor={resumo.suspensos} />
      </section>

      <Alerta tipo="info" titulo="Fase 1 concluída nesta tela: base segura">
        Login, perfis, permissões, separação entre condomínios e auditoria já funcionam. Na Fase 2 entram o cadastro das
        220 unidades, dos moradores e a prestação de contas.
      </Alerta>
    </div>
  );
}
