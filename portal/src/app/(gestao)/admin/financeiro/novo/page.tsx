import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { configFinanceira, listarCategorias } from "@/server/dados/financeiro";
import { lancar } from "@/server/acoes/financeiro";
import { hojeISO } from "@/lib/formato";
import { Cartao, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { CamposLancamento } from "./campos-lancamento";
import { Tags } from "lucide-react";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NovoLancamento() {
  const ctx = await exigirPermissao("financeiro.lancar");
  const [categorias, config] = await Promise.all([listarCategorias(ctx), configFinanceira(ctx)]);
  const ativas = categorias.filter((c) => c.ativa).map(({ id, nome, tipo }) => ({ id, nome, tipo }));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/admin/financeiro" className="flex w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Prestação de contas
      </Link>
      <TituloPagina sobretitulo="Finanças" titulo="Novo lançamento" descricao="Depois de salvo, o lançamento não pode ser apagado; se errar, use o estorno." />
      {ativas.length === 0 ? (
        <EstadoVazio icone={Tags} titulo="Nenhuma categoria criada" acao={<BotaoLink href="/admin/financeiro">Criar categorias</BotaoLink>} />
      ) : (
        <Cartao>
          <Formulario acao={lancar}>
            <CamposLancamento
              categorias={ativas}
              hoje={hojeISO(new Date(), ctx.fuso)}
              dataMinima={config.mesInicial ? `${config.mesInicial}-01` : undefined}
            />
            <div className="flex flex-wrap gap-2">
              <BotaoEnviar>Salvar lançamento</BotaoEnviar>
              <BotaoLink href="/admin/financeiro" variante="secundario">Ver lançamentos</BotaoLink>
            </div>
          </Formulario>
        </Cartao>
      )}
    </div>
  );
}
