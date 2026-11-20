import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList, House, Pencil, Search, UserPlus, Users } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarPessoas, totalDeContatosDaLista } from "@/server/dados/pessoas";
import { listarUnidades, rotulosDasUnidades } from "@/server/dados/unidades";
import { situacoesLoginMoradores } from "@/server/dados/acesso";
import { ehPapel, NOME_DO_PAPEL, PAPEIS, type Papel } from "@/lib/permissoes";
import { rotuloCasas } from "@/lib/importar-moradores";
import { contarCasas, ehOrdemPessoas, numeroDoRotulo, ordenarPessoas, type OrdemPessoas } from "@/lib/lista-pessoas";
import { BuscaAoDigitar } from "./busca-ao-digitar";
import { Cartao, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { SegmentoLinks } from "@/components/ui/painel";
import { EtiquetaSenhaProvisoria, EtiquetaSituacaoPessoa } from "./etiquetas";
import { EtiquetaLoginMorador } from "@/components/acesso/etiqueta-login";

export const metadata: Metadata = { title: "Pessoas" };

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Quantos atalhos "Casa N" mostrar na seção de casas sem morador (o resto vira "e mais N"). */
const ATALHOS_CASAS = 12;

/** Lê um número sem derrubar a página se a consulta falhar. */
async function semFalhar<T>(nome: string, ler: () => Promise<T>, padrao: T): Promise<T> {
  try {
    return await ler();
  } catch (erro) {
    console.error(`Pessoas: não foi possível carregar ${nome}`, erro);
    return padrao;
  }
}

export default async function PaginaPessoas({ searchParams }: PageProps<"/admin/pessoas">) {
  const ctx = await exigirPermissao("moradores.ver");
  const gerenciaMoradores = ctx.permissoes.has("moradores.gerenciar");
  const [pessoas, rotulos, logins, unidades, contatosNaLista] = await Promise.all([
    listarPessoas(ctx),
    rotulosDasUnidades(ctx),
    situacoesLoginMoradores(ctx),
    ctx.permissoes.has("unidades.ver") ? semFalhar("as casas", () => listarUnidades(ctx), []) : Promise.resolve([]),
    gerenciaMoradores ? semFalhar("a lista de contatos", () => totalDeContatosDaLista(ctx), 0) : Promise.resolve(0),
  ]);
  const { papel: papelBruto, busca: buscaBruta, ordem: ordemBruta } = await searchParams;
  const papel = ehPapel(papelBruto) ? papelBruto : null;
  const busca = typeof buscaBruta === "string" ? buscaBruta.trim().slice(0, 60) : "";
  const ordem: OrdemPessoas = ehOrdemPessoas(ordemBruta) ? ordemBruta : "nome";
  const podeAdicionar = gerenciaMoradores || ctx.permissoes.has("equipe.gerenciar");
  const gerencia = (p: Papel) => ctx.permissoes.has(p === "morador" ? "moradores.gerenciar" : "equipe.gerenciar");

  // Número de cada casa (para ordenar "Casa 2" antes de "Casa 10").
  const numeros = new Map(unidades.map((u) => [u.id, u.numero]));
  const numeroDaCasa = (unitId: string) => numeros.get(unitId) ?? numeroDoRotulo(rotulos.get(unitId));

  // Busca só com números = a casa com aquele número (135 não traz a 1350); com letras = nome ou casa.
  const buscaNumero = /^\d{1,4}$/.test(busca) ? Number(busca) : null;
  const confereBusca = (p: (typeof pessoas)[number]) =>
    !busca ||
    (buscaNumero !== null
      ? !!p.unitId && numeroDaCasa(p.unitId) === buscaNumero
      : normalizar(`${p.nome} ${p.unitId ? rotulos.get(p.unitId) ?? "" : ""}`).includes(normalizar(busca)));
  const filtradas = ordenarPessoas(
    pessoas.filter((p) => (!papel || p.papel === papel) && confereBusca(p)),
    ordem,
    numeroDaCasa,
  );
  const casasNaLista = contarCasas(filtradas);

  /** Link da lista mantendo filtro, busca e ordem (só muda o que for passado). */
  const linkLista = (muda: { papel?: Papel | null; ordem?: OrdemPessoas }) => {
    const qs = new URLSearchParams();
    const p = muda.papel === undefined ? papel : muda.papel;
    const o = muda.ordem ?? ordem;
    if (p) qs.set("papel", p);
    if (busca) qs.set("busca", busca);
    if (o !== "nome") qs.set("ordem", o);
    return `/admin/pessoas${qs.size ? `?${qs}` : ""}`;
  };

  // Casas ativas sem nenhum morador cadastrado (ex.: casas que não estavam na lista do Word).
  const casasComMorador = new Set(pessoas.filter((p) => p.papel === "morador" && p.unitId).map((p) => p.unitId));
  const casasSemMorador = unidades.filter((u) => u.status === "ativa" && !casasComMorador.has(u.id));
  const mostrarCasasSemMorador = casasSemMorador.length > 0 && !busca && (!papel || papel === "morador");

  const abas = [{ valor: null, rotulo: "Todos" }, ...PAPEIS.map((p) => ({ valor: p, rotulo: NOME_DO_PAPEL[p] }))];

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Pessoas"
        titulo="Moradores e equipe"
        descricao="Moradores de cada casa e a equipe do portal. Toque em uma pessoa para ver e editar o cadastro."
        acoes={
          podeAdicionar ? (
            <BotaoLink href="/admin/pessoas/nova" icone={<UserPlus aria-hidden className="size-5" />}>
              Adicionar pessoa
            </BotaoLink>
          ) : null
        }
      />

      {gerenciaMoradores && contatosNaLista > 0 ? (
        <Link
          href="/admin/pessoas/importar"
          className="saltado flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 text-ink transition-shadow active:shadow-afundado"
        >
          <ClipboardList aria-hidden className="size-6 shrink-0 text-pine" />
          <span className="flex min-w-0 flex-1 flex-col leading-snug">
            <b>Trazer moradores da lista de contatos</b>
            <span className="text-[0.9rem] text-muted">
              A lista do Word tem {contatosNaLista === 1 ? "1 casa" : `${contatosNaLista} casas`}. Confira quem ainda falta e
              cadastre todos de uma vez, sem repetir.
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
        </Link>
      ) : null}

      {/* Seletor em pílula (como no Modelo 3). Rola de lado só ele, se faltar espaço. */}
      <SegmentoLinks
        rotulo="Filtrar por perfil"
        rolavel
        ariaCurrent="page"
        opcoes={abas.map((a) => ({ rotulo: a.rotulo, href: linkLista({ papel: a.valor }), ativo: a.valor === papel }))}
      />

      <form role="search" className="flex gap-2">
        {papel ? <input type="hidden" name="papel" value={papel} /> : null}
        {ordem !== "nome" ? <input type="hidden" name="ordem" value={ordem} /> : null}
        <label htmlFor="busca" className="sr-only">Buscar pessoa pelo nome ou número da casa</label>
        <BuscaAoDigitar inicial={busca} papel={papel} ordem={ordem} />
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
            <h2 className="text-[0.9rem] font-bold text-muted">
              {filtradas.length === 1 ? "1 pessoa" : `${filtradas.length} pessoas`}
              {casasNaLista > 0 ? ` · ${casasNaLista === 1 ? "1 casa" : `${casasNaLista} casas`}` : ""}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[0.86rem] font-bold text-muted">Ordenar por</span>
              <SegmentoLinks
                rotulo="Ordenar a lista"
                ariaCurrent="page"
                opcoes={[
                  { rotulo: "Nome", href: linkLista({ ordem: "nome" }), ativo: ordem === "nome" },
                  { rotulo: "Nº da casa", href: linkLista({ ordem: "casa" }), ativo: ordem === "casa" },
                ]}
              />
            </div>
          </div>
          <ul className="divide-y divide-line">
            {filtradas.map((p) => (
              <li key={p.uid}>
                <Link
                  href={`/admin/pessoas/${p.uid}`}
                  className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  {/* basis: no celular o nome fica com a linha de cima e as etiquetas descem (nunca espremido). */}
                  <div className="min-w-0 flex-1 basis-[13rem]">
                    {/* Ordem por casa: a casa vem antes do nome, para achar pelo número. */}
                    {ordem === "casa" && p.unitId ? (
                      <p className="text-[0.86rem] font-bold text-pine">{rotulos.get(p.unitId) ?? p.unitId}</p>
                    ) : null}
                    <p className="truncate font-bold">{p.nome}</p>
                    <p className="text-[0.9rem] text-muted">
                      {NOME_DO_PAPEL[p.papel]}
                      {p.unitId && ordem !== "casa" ? ` · ${rotulos.get(p.unitId) ?? p.unitId}` : ""}
                    </p>
                  </div>
                  {/* Morador: situação do login (Sem acesso / Senha provisória / Acesso ativo). Equipe: só a senha provisória. */}
                  {p.papel === "morador" ? (
                    p.status === "ativo" ? <EtiquetaLoginMorador situacao={logins.get(p.uid) ?? "sem-acesso"} /> : null
                  ) : p.precisaTrocarSenha && p.status === "ativo" ? (
                    <EtiquetaSenhaProvisoria />
                  ) : null}
                  <EtiquetaSituacaoPessoa status={p.status} />
                  {/* Deixa claro que a linha abre o cadastro (e que dá para editar, se o perfil puder). */}
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[0.9rem] font-bold text-lake">
                    {gerencia(p.papel) ? (
                      <>
                        <Pencil aria-hidden className="size-4" />
                        <span className="max-sm:sr-only">Editar</span>
                      </>
                    ) : (
                      <span className="sr-only">Ver cadastro</span>
                    )}
                    <ChevronRight aria-hidden className="size-5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {mostrarCasasSemMorador ? (
        <section aria-labelledby="titulo-casas-sem-morador" className="flex flex-col gap-3">
          <h2 id="titulo-casas-sem-morador" className="flex items-center gap-2 text-lg font-bold">
            <House aria-hidden className="size-5 text-pine" /> Casas sem morador cadastrado
          </h2>
          <Cartao className="flex flex-col gap-3">
            <p className="text-ink-2">
              {casasSemMorador.length === 1 ? "1 casa ainda não tem" : `${casasSemMorador.length} casas ainda não têm`} nenhum
              morador: <b className="text-ink">{rotuloCasas(casasSemMorador.map((u) => u.numero))}</b>.
              {gerenciaMoradores ? " Toque em uma casa para cadastrar o morador." : ""}
            </p>
            {gerenciaMoradores ? (
              <ul className="flex flex-wrap gap-2">
                {casasSemMorador.slice(0, ATALHOS_CASAS).map((u) => (
                  <li key={u.id}>
                    <Link
                      href={`/admin/pessoas/nova?unidade=${encodeURIComponent(u.id)}`}
                      className="saltado inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.92rem] font-bold text-ink transition-shadow active:shadow-afundado"
                    >
                      <UserPlus aria-hidden className="size-4 text-pine" /> {u.rotulo}
                    </Link>
                  </li>
                ))}
                {casasSemMorador.length > ATALHOS_CASAS ? (
                  <li className="inline-flex min-h-11 items-center px-1 text-[0.92rem] text-muted">
                    e mais {casasSemMorador.length - ATALHOS_CASAS}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </Cartao>
        </section>
      ) : null}
    </div>
  );
}
