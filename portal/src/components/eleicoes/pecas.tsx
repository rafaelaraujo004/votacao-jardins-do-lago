/**
 * Peças da votação oficial: etiqueta de situação (ícone + texto, nunca só cor),
 * lista de candidatos, quadro do resultado e o aviso de sigilo.
 */
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  Lock,
  PencilLine,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { Alerta, Etiqueta } from "@/components/ui/basicos";
import {
  ROTULO_SITUACAO_ELEICAO,
  type Apuracao,
  type ApuracaoChapa,
  type Candidato,
  type ResultadoApuracao,
  type SituacaoEleicao,
} from "@/lib/eleicoes";
import { cx } from "@/lib/cx";

type Tom = "ok" | "info" | "aviso" | "erro" | "neutro" | "destaque";

const ESTILO: Record<SituacaoEleicao, { tom: Tom; icone: LucideIcon }> = {
  rascunho: { tom: "aviso", icone: PencilLine },
  agendada: { tom: "info", icone: CalendarClock },
  aberta: { tom: "ok", icone: Vote },
  encerrada: { tom: "neutro", icone: Lock },
};

export function EtiquetaEleicao({ situacao }: { situacao: SituacaoEleicao }) {
  const { tom, icone } = ESTILO[situacao];
  return (
    <Etiqueta tom={tom} icone={icone}>
      {ROTULO_SITUACAO_ELEICAO[situacao]}
    </Etiqueta>
  );
}

export function EtiquetaCasaVotou() {
  return (
    <Etiqueta tom="destaque" icone={CircleCheck}>
      Sua casa votou
    </Etiqueta>
  );
}

/** Número do candidato num círculo (igual à cédula). */
export function NumeroCandidato({
  numero,
  destaque = false,
}: {
  numero: number;
  destaque?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-10 shrink-0 place-items-center rounded-full font-display text-[1.05rem] font-extrabold",
        destaque ? "bg-pine text-canvas" : "afundado text-destaque",
      )}
    >
      {numero}
    </span>
  );
}

/** Lista dos candidatos (só leitura). */
export function ListaCandidatos({
  candidatos,
  numerado = true,
}: {
  candidatos: Candidato[];
  numerado?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {candidatos.map((c) => (
        <li
          key={c.id}
          className="flex items-start gap-3 rounded-2xl border border-line bg-surface-item p-3"
        >
          {numerado ? <NumeroCandidato numero={c.numero} /> : null}
          <div className="min-w-0">
            <p className="break-words font-bold leading-tight">{c.nome}</p>
            <FuncaoCandidato funcao={c.funcao} casa={c.casa} />
            {c.apresentacao ? (
              <p className="mt-1 break-words text-[0.92rem] text-ink-2">
                {c.apresentacao}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Cargo embaixo do nome (como no cartaz da chapa) e a casa, se houver. */
export function FuncaoCandidato({
  funcao,
  casa,
}: {
  funcao: string;
  casa: string;
}) {
  if (!funcao && !casa) return null;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.85rem]">
      {funcao ? (
        <span className="rounded-full bg-ok-soft px-2 py-px font-bold uppercase tracking-wide text-pine">
          {funcao}
        </span>
      ) : null}
      {casa ? <span className="text-muted">{casa}</span> : null}
    </p>
  );
}

/** Explica, em linguagem simples, por que o voto é secreto. */
export function NotaSigilo({ className }: { className?: string }) {
  return (
    <p
      className={cx(
        "flex items-start gap-2 text-[0.9rem] text-muted",
        className,
      )}
    >
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
      <span>
        <b className="text-ink-2">Voto secreto:</b> o portal registra só que a
        casa votou. O voto de cada casa não fica guardado em lugar nenhum — só a
        soma dos votos, que aparece depois do encerramento. Nem a comissão nem o
        síndico conseguem ver o voto de uma casa.
      </span>
    </p>
  );
}

/**
 * Quadro do resultado (depois do encerramento): votos de cada candidato,
 * eleitos (com ícone, não só cor), brancos e o aviso de empate.
 */
export function ResultadoEleicao({
  apuracao,
  vagas,
}: {
  apuracao: ResultadoApuracao;
  vagas: number;
}) {
  return apuracao.modo === "chapa" ? (
    <ResultadoChapa apuracao={apuracao} />
  ) : (
    <ResultadoCandidatos apuracao={apuracao} vagas={vagas} />
  );
}

/** Chapa: Sim e Não, o mínimo para eleger (metade mais 1) e se foi eleita. */
function ResultadoChapa({ apuracao: a }: { apuracao: ApuracaoChapa }) {
  const total = a.sim + a.nao;
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cx(
          "flex items-center gap-3 rounded-2xl p-4",
          a.eleita ? "bg-ok-soft text-pine" : "bg-danger-soft text-danger",
        )}
      >
        {a.eleita ? (
          <CircleCheck aria-hidden className="size-8 shrink-0" />
        ) : (
          <CircleX aria-hidden className="size-8 shrink-0" />
        )}
        <div>
          <p className="font-display text-[1.25rem] font-extrabold leading-tight">
            {a.eleita ? "Chapa eleita" : "Chapa não eleita"}
          </p>
          <p className="text-[0.9rem] text-ink-2">
            Precisava de {a.minimo} {a.minimo === 1 ? "voto" : "votos"} Sim
            (metade mais 1 de {total}) e teve {a.sim}.
          </p>
        </div>
      </div>
      <div
        className="afundado flex h-4 overflow-hidden rounded-full"
        aria-hidden
      >
        <div
          className="h-full bg-pine"
          style={{ width: `${total ? (a.sim * 100) / total : 0}%` }}
        />
        <div
          className="h-full bg-danger/70"
          style={{ width: `${total ? (a.nao * 100) / total : 0}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <p className="flex items-center gap-2 rounded-2xl bg-surface-item p-3">
          <ThumbsUp aria-hidden className="size-5 text-pine" />
          <span>
            <b className="block font-display text-[1.4rem] leading-none tabular-nums">
              {a.sim}
            </b>
            <span className="text-[0.88rem] text-ink-2">
              Sim ({a.porcentagemSim}%)
            </span>
          </span>
        </p>
        <p className="flex items-center gap-2 rounded-2xl bg-surface-item p-3">
          <ThumbsDown aria-hidden className="size-5 text-danger" />
          <span>
            <b className="block font-display text-[1.4rem] leading-none tabular-nums">
              {a.nao}
            </b>
            <span className="text-[0.88rem] text-ink-2">
              Não ({total ? 100 - a.porcentagemSim : 0}%)
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}

function ResultadoCandidatos({
  apuracao,
  vagas,
}: {
  apuracao: Apuracao;
  vagas: number;
}) {
  const eleitos = new Set(apuracao.eleitos);
  const nomeDe = (id: string) =>
    apuracao.ranking.find((l) => l.candidato.id === id)?.candidato.nome ?? "";
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3" aria-label="Resultado da votação">
        {apuracao.ranking.map((l) => {
          const eleito = eleitos.has(l.candidato.id);
          const empatado =
            apuracao.empate?.ids.includes(l.candidato.id) &&
            !eleito &&
            !apuracao.empate.decididos;
          return (
            <li key={l.candidato.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cx(
                    "min-w-0 break-words",
                    eleito ? "font-bold text-destaque" : "text-ink",
                  )}
                >
                  {eleito ? (
                    <Trophy
                      aria-hidden
                      className="mr-1.5 inline size-4 align-[-2px] text-texto-laranja"
                    />
                  ) : null}
                  {l.candidato.numero} · {l.candidato.nome}
                  {eleito ? (
                    <span className="ml-1.5 whitespace-nowrap rounded-full bg-ok-soft px-2 py-px text-[0.72rem] font-bold text-pine">
                      eleito
                    </span>
                  ) : empatado ? (
                    <span className="ml-1.5 whitespace-nowrap rounded-full bg-sand px-2 py-px text-[0.72rem] font-bold text-ink">
                      empate
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[0.92rem] tabular-nums text-ink-2">
                  <b className="text-ink">{l.votos}</b>{" "}
                  {l.votos === 1 ? "voto" : "votos"}
                </span>
              </div>
              <div
                className="afundado h-3.5 overflow-hidden rounded-full"
                aria-hidden
              >
                <div
                  className={cx(
                    "h-full rounded-full",
                    eleito ? "bg-pine" : "bg-lake",
                  )}
                  style={{
                    width: `${apuracao.cedulas ? Math.max(l.porcentagem, l.votos ? 2 : 0) : 0}%`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[0.92rem] text-ink-2">
        <b className="text-ink">{apuracao.cedulas}</b>{" "}
        {apuracao.cedulas === 1 ? "cédula" : "cédulas"} ·{" "}
        <b className="text-ink">{apuracao.brancos}</b>{" "}
        {apuracao.brancos === 1 ? "voto em branco" : "votos em branco"} ·{" "}
        {vagas} {vagas === 1 ? "vaga" : "vagas"}
      </p>

      {apuracao.empate ? (
        apuracao.empate.decididos ? (
          <Alerta
            tipo="info"
            titulo={`Empate na ${apuracao.empate.vaga}ª vaga — decidido pela idade`}
          >
            Empataram com {apuracao.empate.votos}{" "}
            {apuracao.empate.votos === 1 ? "voto" : "votos"}:{" "}
            {apuracao.empate.ids.map(nomeDe).join(", ")}. Pela regra, fica com a
            vaga quem é mais velho:{" "}
            <b>{apuracao.empate.decididos.map(nomeDe).join(", ")}</b>.
          </Alerta>
        ) : (
          <Alerta
            tipo="aviso"
            titulo={`Empate na ${apuracao.empate.vaga}ª vaga — a comissão decide`}
          >
            Empataram com {apuracao.empate.votos}{" "}
            {apuracao.empate.votos === 1 ? "voto" : "votos"}:{" "}
            {apuracao.empate.ids.map(nomeDe).join(", ")}. A comissão decide quem
            fica com a vaga e registra na ata.
          </Alerta>
        )
      ) : null}
    </div>
  );
}
