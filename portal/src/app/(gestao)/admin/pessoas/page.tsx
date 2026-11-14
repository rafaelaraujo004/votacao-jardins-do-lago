import type { Metadata } from "next";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarPessoas } from "@/server/dados/pessoas";
import { rotulosDasUnidades } from "@/server/dados/unidades";
import { ehPapel, NOME_DO_PAPEL, PAPEIS } from "@/lib/permissoes";
import { Cartao, classeEntrada, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { SegmentoLinks } from "@/components/ui/painel";
import { EtiquetaSituacaoPessoa } from "./etiquetas";

export const metadata: Metadata = { title: "Pessoas" };

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function PaginaPessoas({ searchParams }: PageProps<"/admin/pessoas">) {
  const ctx = await exigirPermissao("moradores.ver");
  const [pessoas, rotulos] = await Promise.all([listarPessoas(ctx), rotulosDasUnidades(ctx)]);
  const { papel: papelBruto, busca: buscaBruta } = await searchParams;
  const papel = ehPapel(papelBruto) ? papelBruto : null;
  const busca = typeof buscaBruta === "string" ? buscaBruta.trim().slice(0, 60) : "";
  const podeAdicionar = ctx.permissoes.has("moradores.gerenciar") || ctx.permissoes.has("equipe.gerenciar");

  const filtradas = pessoas.filter(
    (p) =>
      (!papel || p.papel === papel) &&
      (!busca || normalizar(`${p.nome} ${p.unitId ? rotulos.get(p.unitId) ?? "" : ""}`).includes(normalizar(busca))),
  );

  const abas = [{ valor: null, rotulo: "Todos" }, ...PAPEIS.map((p) => ({ valor: p, rotulo: NOME_DO_PAPEL[p] }))];

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Pessoas"
        titulo="Moradores e equipe"
        descricao="Quem tem acesso ao portal, com o perfil e a casa de cada um."
        acoes={
          podeAdicionar ? (
            <BotaoLink href="/admin/pessoas/nova" icone={<UserPlus aria-hidden className="size-5" />}>
              Adicionar pessoa
            </BotaoLink>
          ) : null
        }
      />

      {/* Seletor em pílula (como no Modelo 3). Rola de lado só ele, se faltar espaço. */}
      <SegmentoLinks
        rotulo="Filtrar por perfil"
        rolavel
        ariaCurrent="page"
        opcoes={abas.map((a) => {
          const qs = new URLSearchParams();
          if (a.valor) qs.set("papel", a.valor);
          if (busca) qs.set("busca", busca);
          return { rotulo: a.rotulo, href: `/admin/pessoas${qs.size ? `?${qs}` : ""}`, ativo: a.valor === papel };
        })}
      />

      <form role="search" className="flex gap-2">
        {papel ? <input type="hidden" name="papel" value={papel} /> : null}
        <label htmlFor="busca" className="sr-only">Buscar pessoa</label>
        <input id="busca" name="busca" defaultValue={busca} placeholder="Buscar pelo nome ou casa" className={classeEntrada} />
        <Botao type="submit" variante="secundario" icone={<Search aria-hidden className="size-5" />}>
          <span className="max-sm:sr-only">Buscar</span>
        </Botao>
      </form>

      {filtradas.length === 0 ? (
        <EstadoVazio icone={Users} titulo={pessoas.length ? "Ninguém encontrado" : "Ninguém cadastrado ainda"}>
          {pessoas.length ? "Tente outro nome ou outro filtro." : "Comece adicionando os moradores de cada casa."}
        </EstadoVazio>
      ) : (
        <Cartao semEspaco className="overflow-hidden">
          <h2 className="sr-only">Pessoas encontradas</h2>
          <ul className="divide-y divide-line">
            {filtradas.map((p) => (
              <li key={p.uid}>
                <Link href={`/admin/pessoas/${p.uid}`} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.nome}</p>
                    <p className="text-[0.9rem] text-muted">
                      {NOME_DO_PAPEL[p.papel]}
                      {p.unitId ? ` · ${rotulos.get(p.unitId) ?? p.unitId}` : ""}
                    </p>
                  </div>
                  <EtiquetaSituacaoPessoa status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
