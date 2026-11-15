/**
 * Peças das solicitações: etiquetas (ícone + texto, nunca só cor),
 * cartão da lista e a linha do tempo.
 */
import Link from "next/link";
import {
  ArrowRightLeft,
  Brush,
  ChevronRight,
  CircleCheck,
  CircleDot,
  CircleQuestionMark,
  CircleSlash,
  Hammer,
  Lightbulb,
  Lock,
  MapPin,
  MessageSquare,
  MessageSquarePlus,
  ShieldExclamationPoint,
  Volume2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";
import { formatarData, formatarDataHora } from "@/lib/formato";
import { cx } from "@/lib/cx";
import {
  ROTULO_CATEGORIA,
  ROTULO_STATUS_SOLICITACAO,
  descreverMudanca,
  type AtualizacaoSolicitacao,
  type CategoriaSolicitacao,
  type Solicitacao,
  type StatusSolicitacao,
} from "@/lib/solicitacoes";

type Tom = "ok" | "info" | "aviso" | "erro" | "neutro" | "destaque";

const ESTILO_STATUS: Record<StatusSolicitacao, { tom: Tom; icone: LucideIcon }> = {
  aberta: { tom: "aviso", icone: CircleDot },
  em_andamento: { tom: "info", icone: Hammer },
  resolvida: { tom: "ok", icone: CircleCheck },
  cancelada: { tom: "neutro", icone: CircleSlash },
};

export const ICONE_CATEGORIA: Record<CategoriaSolicitacao, LucideIcon> = {
  manutencao: Wrench,
  limpeza: Brush,
  iluminacao: Lightbulb,
  convivencia: Volume2,
  seguranca: ShieldExclamationPoint,
  sugestao: MessageSquarePlus,
  outro: CircleQuestionMark,
};

export function EtiquetaSolicitacao({ status }: { status: StatusSolicitacao }) {
  const { tom, icone } = ESTILO_STATUS[status];
  return (
    <Etiqueta tom={tom} icone={icone}>
      {ROTULO_STATUS_SOLICITACAO[status]}
    </Etiqueta>
  );
}

export function EtiquetaCategoria({ categoria }: { categoria: CategoriaSolicitacao }) {
  return (
    <Etiqueta tom="destaque" icone={ICONE_CATEGORIA[categoria]}>
      {ROTULO_CATEGORIA[categoria]}
    </Etiqueta>
  );
}

/**
 * Um item da lista (vira link para o detalhe).
 * `mostrarCasa`: só a administração vê a casa (o morador só vê as da própria casa).
 */
export function ItemSolicitacao({
  s,
  href,
  fuso,
  mostrarCasa = false,
}: {
  s: Solicitacao;
  href: string;
  fuso: string;
  mostrarCasa?: boolean;
}) {
  const Icone = ICONE_CATEGORIA[s.categoria];
  return (
    <Link href={href} className="saltado flex items-center gap-3 rounded-2xl p-4 transition-shadow active:shadow-afundado">
      <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-plum-soft text-plum">
        <Icone aria-hidden className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="font-display tabular-nums text-ink">Nº {s.protocolo}</b>
          <EtiquetaSolicitacao status={s.status} />
        </span>
        <span className="truncate text-[0.95rem] text-ink-2">
          {ROTULO_CATEGORIA[s.categoria]}
          {mostrarCasa ? ` · ${s.unidadeRotulo}` : ""} · {s.local}
        </span>
        <span className="line-clamp-2 text-[0.88rem] text-muted">{s.descricao}</span>
        <span className="text-[0.8rem] text-muted">
          Aberta em {s.criadoEm ? formatarData(s.criadoEm, fuso) : "—"}
          {s.atualizadoEm && s.criadoEm && s.atualizadoEm.getTime() - s.criadoEm.getTime() > 60_000
            ? ` · atualizada em ${formatarData(s.atualizadoEm, fuso)}`
            : ""}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
    </Link>
  );
}

/** Quadro com os dados principais da solicitação (detalhe). */
export function ResumoSolicitacao({ s, fuso, mostrarCasa = false }: { s: Solicitacao; fuso: string; mostrarCasa?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <EtiquetaSolicitacao status={s.status} />
        <EtiquetaCategoria categoria={s.categoria} />
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-[0.95rem] sm:grid-cols-2">
        {mostrarCasa ? (
          <div>
            <dt className="rotulo-caixa">Casa</dt>
            <dd className="font-bold text-ink">{s.unidadeRotulo}</dd>
          </div>
        ) : null}
        <div>
          <dt className="rotulo-caixa">Local</dt>
          <dd className="flex items-start gap-1.5 text-ink">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
            {s.local}
          </dd>
        </div>
        <div>
          <dt className="rotulo-caixa">Aberta em</dt>
          <dd className="text-ink">{s.criadoEm ? formatarDataHora(s.criadoEm, fuso) : "—"}</dd>
        </div>
        {s.resolvidoEm ? (
          <div>
            <dt className="rotulo-caixa">Resolvida em</dt>
            <dd className="text-ink">{formatarDataHora(s.resolvidoEm, fuso)}</dd>
          </div>
        ) : null}
      </dl>
      <div>
        <p className="rotulo-caixa">Descrição</p>
        <p className="mt-1 whitespace-pre-line break-words text-ink">{s.descricao}</p>
      </div>
    </div>
  );
}

/**
 * Linha do tempo. A tela do morador já recebe a lista SEM notas internas
 * (o filtro é feito no servidor); aqui só se desenha.
 */
export function LinhaDoTempo({
  itens,
  fuso,
  criadoEm,
}: {
  itens: AtualizacaoSolicitacao[];
  fuso: string;
  /** Primeiro ponto da linha: quando a solicitação foi aberta. */
  criadoEm: Date | null;
}) {
  return (
    <ol className="flex flex-col">
      <PontoLinha icone={CircleDot} titulo="Solicitação aberta" quando={criadoEm ? formatarDataHora(criadoEm, fuso) : "—"} />
      {itens.map((a) => (
        <PontoLinha
          key={a.id}
          icone={!a.publico ? Lock : a.tipo === "status" ? ArrowRightLeft : MessageSquare}
          titulo={a.tipo === "status" ? descreverMudanca(a) : a.autorPapel === "morador" ? "Mensagem do morador" : "Resposta da administração"}
          quando={a.criadoEm ? formatarDataHora(a.criadoEm, fuso) : "agora"}
          autor={a.autorNome}
          texto={a.texto}
          interno={!a.publico}
        />
      ))}
    </ol>
  );
}

function PontoLinha({
  icone: Icone,
  titulo,
  quando,
  autor,
  texto,
  interno = false,
}: {
  icone: LucideIcon;
  titulo: string;
  quando: string;
  autor?: string;
  texto?: string;
  interno?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* traço vertical ligando os pontos */}
      <span aria-hidden className="absolute bottom-0 left-[19px] top-10 w-0.5 bg-line" />
      <span
        className={cx(
          "relative grid size-10 shrink-0 place-items-center rounded-full",
          interno ? "bg-warn-soft text-warn" : "bg-ok-soft text-pine",
        )}
      >
        <Icone aria-hidden className="size-5" />
      </span>
      <div
        className={cx(
          "min-w-0 flex-1 rounded-2xl px-3 py-2",
          interno ? "border-2 border-dashed border-warn bg-warn-soft/40" : "border border-line",
        )}
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-ink">{titulo}</b>
          {interno ? (
            <Etiqueta tom="aviso" icone={Lock}>
              Nota interna: o morador não vê
            </Etiqueta>
          ) : null}
        </p>
        <p className="text-[0.82rem] text-muted">
          {quando}
          {autor ? ` · ${autor}` : ""}
        </p>
        {texto ? <p className="mt-1 whitespace-pre-line break-words text-ink-2">{texto}</p> : null}
      </div>
    </li>
  );
}
