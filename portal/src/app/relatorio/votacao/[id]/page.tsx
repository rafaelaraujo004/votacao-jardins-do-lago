import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/server/contexto";
import { obterEleicaoGestao } from "@/server/dados/eleicoes";
import { participacao } from "@/lib/enquetes";
import {
  ROTULO_DESEMPATE,
  textoEscolhas,
  vagasTexto,
  type Apuracao,
} from "@/lib/eleicoes";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";
import { Logo } from "@/components/ui/marca";
import { BotaoImprimir } from "../../financeiro/botao-imprimir";

export const metadata: Metadata = { title: "Ata da votação" };

/**
 * ATA da votação oficial, pronta para imprimir ou "Salvar como PDF".
 * Só para a comissão (eleicoes.gerenciar) e só depois do encerramento.
 * Traz totais e eleitos — nunca o voto de uma casa.
 */
export default async function AtaVotacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const valido = idDocumento.safeParse(id).success;
  const ctx = await exigirPermissao(
    "eleicoes.gerenciar",
    valido ? `/relatorio/votacao/${id}` : undefined,
  );
  if (!valido) notFound();
  const e = await obterEleicaoGestao(ctx, id);
  if (!e || !e.apuracao) notFound();
  const resultado = e.apuracao;
  const chapa = resultado.modo === "chapa" ? resultado : null;
  const a: Apuracao | null = resultado.modo === "candidatos" ? resultado : null;
  const eleitos = new Set(a?.eleitos ?? []);
  const nomeDe = (cid: string) =>
    a?.ranking.find((l) => l.candidato.id === cid)?.candidato.nome ?? "";
  const linha = "flex justify-between gap-4 border-b border-[#d0d6d2] py-1.5";

  return (
    <main
      className="mx-auto max-w-3xl bg-white px-6 py-8 text-[#14211b] print:max-w-none print:px-0 print:py-0"
      style={{ colorScheme: "light" }}
    >
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <p className="text-[0.95rem] text-[#3d4e45]">
          Use o botão para imprimir ou escolher “Salvar como PDF”.
        </p>
        <BotaoImprimir />
      </div>

      <header className="flex items-center gap-4 border-b-2 border-[#1d6b4e] pb-4">
        <Logo largura={110} className="shadow-none" />
        <div>
          <h1 className="text-2xl font-bold">Ata da votação — {e.titulo}</h1>
          <p className="text-[#3d4e45]">{ctx.condominioNome}</p>
          <p className="text-[0.85rem] text-[#5e6e65]">
            Gerada em {formatarDataHora(new Date(), ctx.fuso)}
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-1">
        <h2 className="mb-1 text-lg font-bold">Dados da votação</h2>
        <div className={linha}>
          <span>Cargo</span>
          <strong>{e.cargo}</strong>
        </div>
        {chapa ? (
          <div className={linha}>
            <span>Cédula</span>
            <strong>Sim ou Não para a chapa</strong>
          </div>
        ) : (
          <>
            <div className={linha}>
              <span>Vagas</span>
              <strong>{vagasTexto(e.vagas)}</strong>
            </div>
            <div className={linha}>
              <span>Cédula</span>
              <strong>{textoEscolhas(e.escolhasPorCasa)} por casa</strong>
            </div>
          </>
        )}
        <div className={linha}>
          <span>Período</span>
          <strong>
            {formatarDataHora(e.abreEm, ctx.fuso)} a{" "}
            {formatarDataHora(e.fechaEm, ctx.fuso)}
          </strong>
        </div>
        <div className={linha}>
          <span>Casas aptas</span>
          <strong>{e.casasAptas}</strong>
        </div>
        <div className={linha}>
          <span>Casas que votaram</span>
          <strong>
            {e.votaram} ({participacao(e.votaram, e.casasAptas)}%)
          </strong>
        </div>
        {a ? (
          <>
            <div className={linha}>
              <span>Votos em branco</span>
              <strong>{a.brancos}</strong>
            </div>
            <div className={linha}>
              <span>Desempate</span>
              <strong>{ROTULO_DESEMPATE[e.regraDesempate]}</strong>
            </div>
          </>
        ) : (
          <div className={linha}>
            <span>Regra</span>
            <strong>Eleita com metade mais 1 dos votos</strong>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">Resultado</h2>
        {chapa ? (
          <>
            <p className="mb-2 text-xl font-bold">
              {chapa.eleita ? "CHAPA ELEITA" : "CHAPA NÃO ELEITA"} — Sim:{" "}
              {chapa.sim} · Não: {chapa.nao} (mínimo para eleger: {chapa.minimo}
              )
            </p>
            <table className="w-full border-collapse text-[0.95rem]">
              <thead>
                <tr className="border-b-2 border-[#14211b] text-left">
                  <th className="py-1.5 pr-2">Integrante</th>
                  <th className="py-1.5 pr-2">Cargo</th>
                  <th className="py-1.5 text-right">Casa</th>
                </tr>
              </thead>
              <tbody>
                {e.candidatos.map((c) => (
                  <tr key={c.id} className="border-b border-[#d0d6d2]">
                    <td className="py-1.5 pr-2">{c.nome}</td>
                    <td className="py-1.5 pr-2">{c.funcao}</td>
                    <td className="py-1.5 text-right">{c.casa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : a ? (
          <table className="w-full border-collapse text-[0.95rem]">
            <thead>
              <tr className="border-b-2 border-[#14211b] text-left">
                <th className="py-1.5 pr-2">Nº</th>
                <th className="py-1.5 pr-2">Candidato</th>
                <th className="py-1.5 pr-2 text-right">Votos</th>
                <th className="py-1.5 text-right">Situação</th>
              </tr>
            </thead>
            <tbody>
              {a.ranking.map((l) => (
                <tr key={l.candidato.id} className="border-b border-[#d0d6d2]">
                  <td className="py-1.5 pr-2">{l.candidato.numero}</td>
                  <td className="py-1.5 pr-2">
                    {l.candidato.nome}
                    {l.candidato.casa ? (
                      <span className="text-[#5e6e65]">
                        {" "}
                        · {l.candidato.casa}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{l.votos}</td>
                  <td className="py-1.5 text-right font-bold">
                    {eleitos.has(l.candidato.id) ? "Eleito" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {a?.empate ? (
          <p className="mt-3 text-[0.95rem]">
            <b>Empate na {a.empate.vaga}ª vaga</b> ({a.empate.votos} votos):{" "}
            {a.empate.ids.map(nomeDe).join(", ")}.{" "}
            {a.empate.decididos
              ? `Decidido pela idade: ${a.empate.decididos.map(nomeDe).join(", ")}.`
              : "A comissão decide e registra abaixo: ____________________________________________"}
          </p>
        ) : null}
      </section>

      <p className="mt-6 text-[0.9rem] text-[#3d4e45]">
        Voto secreto: o portal registrou apenas quais casas votaram e a soma dos
        votos de cada candidato. Nenhuma cédula individual foi guardada.
      </p>

      <section className="mt-12 grid gap-10 sm:grid-cols-2 print:grid-cols-2">
        {[
          "Comissão eleitoral",
          "Comissão eleitoral",
          "Síndico(a)",
          "Testemunha",
        ].map((r, i) => (
          <div
            key={i}
            className="border-t border-[#14211b] pt-1.5 text-center text-[0.9rem]"
          >
            {r}
          </div>
        ))}
      </section>
    </main>
  );
}
