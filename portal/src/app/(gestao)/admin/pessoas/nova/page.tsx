import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirContexto } from "@/server/contexto";
import { redirect } from "next/navigation";
import { listarUnidades } from "@/server/dados/unidades";
import { adicionarPessoa } from "@/server/acoes/pessoas";
import { PAPEIS, type Papel } from "@/lib/permissoes";
import { Alerta, Cartao, TituloPagina } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { CamposPessoa } from "../campos-pessoa";

export const metadata: Metadata = { title: "Adicionar pessoa" };

export default async function NovaPessoa({ searchParams }: PageProps<"/admin/pessoas/nova">) {
  const ctx = await exigirContexto();
  const papeis: Papel[] = PAPEIS.filter((p) =>
    ctx.permissoes.has(p === "morador" ? "moradores.gerenciar" : "equipe.gerenciar"),
  );
  if (papeis.length === 0) redirect("/sem-acesso");

  const unidades = (await listarUnidades(ctx)).filter((u) => u.status === "ativa");
  const { unidade } = await searchParams;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/admin/pessoas" className="flex w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Moradores e equipe
      </Link>
      <TituloPagina sobretitulo="Pessoas" titulo="Adicionar pessoa" />
      <Cartao>
        <Formulario acao={adicionarPessoa} limparAoSalvar={false}>
          <CamposPessoa
            papeis={papeis}
            unidades={unidades.map((u) => ({ id: u.id, rotulo: u.rotulo }))}
            inicial={{ unitId: typeof unidade === "string" ? unidade : null }}
          />
          <Alerta tipo="info" titulo="Como a pessoa vai entrar?">
            O jeito de entrar no portal (login) ainda será definido. O cadastro fica pronto e o acesso é liberado quando o
            login estiver ativo.
          </Alerta>
          <div>
            <BotaoEnviar>Adicionar</BotaoEnviar>
          </div>
        </Formulario>
      </Cartao>
    </div>
  );
}
