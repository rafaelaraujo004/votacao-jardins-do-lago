import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, CircleCheck, CirclePause, Search, Users } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarUnidades } from "@/server/dados/unidades";
import { contarMoradoresPorUnidade } from "@/server/dados/pessoas";
import { cadastrarSequencia } from "@/server/acoes/unidades";
import { Campo, Cartao, classeEntrada, EstadoVazio, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";

export const metadata: Metadata = { title: "Unidades" };

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default async function PaginaUnidades({ searchParams }: PageProps<"/admin/unidades">) {
  const ctx = await exigirPermissao("unidades.ver");
  const [unidades, moradores] = await Promise.all([listarUnidades(ctx), contarMoradoresPorUnidade(ctx)]);
  const podeEditar = ctx.permissoes.has("unidades.gerenciar");

  const { busca: buscaBruta } = await searchParams;
  const busca = typeof buscaBruta === "string" ? buscaBruta.trim().slice(0, 40) : "";
  const filtradas = busca
    ? unidades.filter((u) => normalizar(`${u.rotulo} ${u.quadra ?? ""} ${u.numero}`).includes(normalizar(busca)))
    : unidades;

  const ativas = unidades.filter((u) => u.status === "ativa").length;
  const semMorador = unidades.filter((u) => u.status === "ativa" && !moradores.get(u.id)?.cadastrados).length;
  const semAcesso = unidades.filter((u) => u.status === "ativa" && !moradores.get(u.id)?.comAcesso).length;

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Pessoas"
        titulo="Unidades"
        descricao={
          unidades.length
            ? `${unidades.length} unidades cadastradas · ${ativas} ativas · ${semMorador} sem morador cadastrado · ${semAcesso} sem ninguém com acesso ao portal`
            : "Cadastre as casas do condomínio para depois ligar os moradores a elas."
        }
      />

      {podeEditar ? (
        <details open={unidades.length === 0} className="group rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-bold">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ok-soft text-pine">
              <Building2 aria-hidden className="size-5" />
            </span>
            <span className="flex-1">Cadastrar casas em sequência</span>
            <ChevronRight aria-hidden className="size-5 text-muted transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-line p-5">
            <Formulario acao={cadastrarSequencia}>
              <p className="text-ink-2">
                Ex.: de 1 até 220 cria “Casa 1”, “Casa 2”… “Casa 220”. Casas que já existem não são alteradas. Use a quadra só
                se o condomínio repetir números em quadras diferentes.
              </p>
              <div className="grid gap-4 sm:grid-cols-4">
                <Campo id="de" rotulo="Do número">
                  <input id="de" name="de" type="number" inputMode="numeric" min={1} required className={classeEntrada} defaultValue={1} />
                </Campo>
                <Campo id="ate" rotulo="Até o número">
                  <input id="ate" name="ate" type="number" inputMode="numeric" min={1} required className={classeEntrada} placeholder="220" />
                </Campo>
                <Campo id="prefixo" rotulo="Nome">
                  <input id="prefixo" name="prefixo" required maxLength={20} className={classeEntrada} defaultValue="Casa" />
                </Campo>
                <Campo id="quadra" rotulo="Quadra (opcional)">
                  <input id="quadra" name="quadra" maxLength={20} className={classeEntrada} placeholder="Ex.: B" />
                </Campo>
              </div>
              <div>
                <BotaoEnviar>Cadastrar unidades</BotaoEnviar>
              </div>
            </Formulario>
          </div>
        </details>
      ) : null}

      {unidades.length === 0 ? (
        <EstadoVazio icone={Building2} titulo="Nenhuma unidade cadastrada ainda">
          {podeEditar ? "Use o cadastro em sequência acima para criar as casas de uma vez." : "A administração ainda não cadastrou as casas."}
        </EstadoVazio>
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-lista">
          <h2 id="titulo-lista" className="sr-only">Lista de unidades</h2>
          <form role="search" className="flex gap-2">
            <label htmlFor="busca" className="sr-only">Buscar unidade</label>
            <input id="busca" name="busca" defaultValue={busca} placeholder="Buscar pelo número ou nome" className={classeEntrada} />
            <Botao type="submit" variante="secundario" icone={<Search aria-hidden className="size-5" />}>
              <span className="max-sm:sr-only">Buscar</span>
            </Botao>
          </form>

          {filtradas.length === 0 ? (
            <EstadoVazio icone={Search} titulo="Nenhuma unidade encontrada">Confira o número digitado.</EstadoVazio>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtradas.map((u) => {
                const { cadastrados: qtd, comAcesso } = moradores.get(u.id) ?? { cadastrados: 0, comAcesso: 0 };
                return (
                  <li key={u.id}>
                    <Link
                      href={`/admin/unidades/${u.id}`}
                      className="saltado flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 transition-[box-shadow,color] hover:text-pine active:shadow-afundado"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{u.rotulo}</p>
                        <p className="flex items-center gap-1 text-[0.9rem] text-muted">
                          <Users aria-hidden className="size-4" />
                          {qtd === 0
                            ? "Sem morador cadastrado"
                            : `${qtd === 1 ? "1 morador" : `${qtd} moradores`} · ${comAcesso === 0 ? "sem acesso" : `${comAcesso} com acesso`}`}
                        </p>
                      </div>
                      {u.status === "ativa" ? (
                        <Etiqueta tom="ok" icone={CircleCheck}>Ativa</Etiqueta>
                      ) : (
                        <Etiqueta tom="neutro" icone={CirclePause}>Inativa</Etiqueta>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!podeEditar ? (
        <Cartao className="text-ink-2">Seu perfil pode consultar as unidades, mas não alterar.</Cartao>
      ) : null}
    </div>
  );
}
