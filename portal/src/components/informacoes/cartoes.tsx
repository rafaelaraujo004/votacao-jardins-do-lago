/**
 * Cartões das informações do condomínio, prontos para o Início e para Contatos:
 * PIX da taxa, ronda noturna, responsável pelas reservas e atalho da votação.
 * Recebem os dados prontos (já lidos no servidor com a permissão conferida).
 * Só aparecem botões que funcionam: sem número válido, sem botão.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  ChevronRight,
  Clock,
  ExternalLink,
  Landmark,
  MessageCircle,
  Phone,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { Cartao } from "@/components/ui/basicos";
import { classesDoBotao } from "@/components/ui/botao";
import {
  chavePixParaCopiar,
  ehCelular,
  formatarChavePix,
  formatarTelefone,
  linkConversaWhatsApp,
  linkLigar,
  TIPOS_CHAVE_PIX,
  type ChavePix,
  type ResponsavelReservas,
} from "@/lib/validacao-informacoes";
import { ChavePixCopiavel } from "./chave-pix-copiavel";

/** Cabeçalho comum: ícone redondo + título + linhas de apoio. */
function Cabecalho({
  icone: Icone,
  titulo,
  idTitulo,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  idTitulo: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft text-pine">
        <Icone aria-hidden className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={idTitulo} className="text-[1.1rem] font-bold text-destaque">
          {titulo}
        </h3>
        {children}
      </div>
    </div>
  );
}

/** Botões "Ligar" e (se for celular) "WhatsApp". */
function BotoesTelefone({ telefone, quem }: { telefone: string; quem: string }) {
  const celular = ehCelular(telefone);
  return (
    <div className={celular ? "grid grid-cols-2 gap-2.5" : "grid"}>
      <a href={linkLigar(telefone)} aria-label={`Ligar para ${quem}`} className={classesDoBotao("primario")}>
        <Phone aria-hidden className="size-5" /> Ligar
      </a>
      {celular ? (
        <a
          href={linkConversaWhatsApp(telefone)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp de ${quem} (abre em outra aba)`}
          className={classesDoBotao("secundario")}
        >
          <MessageCircle aria-hidden className="size-5" /> WhatsApp
        </a>
      ) : null}
    </div>
  );
}

// ---------- PIX da taxa condominial ----------

export function CartaoPix({ pix }: { pix: ChavePix }) {
  return (
    <Cartao aria-labelledby="titulo-cartao-pix" className="flex flex-col gap-3">
      <Cabecalho icone={Landmark} titulo="PIX da taxa condominial" idTitulo="titulo-cartao-pix">
        <p className="text-[0.95rem] text-ink-2">
          Favorecido: <b className="text-ink">{pix.favorecido}</b>
        </p>
      </Cabecalho>
      <ChavePixCopiavel
        rotulo={`Chave PIX (${TIPOS_CHAVE_PIX[pix.tipo]})`}
        exibicao={formatarChavePix(pix)}
        paraCopiar={chavePixParaCopiar(pix)}
      />
      <p className="text-[0.88rem] text-muted">
        {pix.tipo === "cnpj" || pix.tipo === "cpf" ? "O botão copia só os números, do jeito que o banco aceita. " : null}
        Antes de confirmar o pagamento, confira se o favorecido é <b>{pix.favorecido}</b>.
      </p>
    </Cartao>
  );
}

// ---------- Ronda noturna ----------

export function CartaoRonda({ telefone }: { telefone: string }) {
  return (
    <Cartao aria-labelledby="titulo-cartao-ronda" className="flex flex-col gap-3">
      <Cabecalho icone={ShieldCheck} titulo="Ronda noturna" idTitulo="titulo-cartao-ronda">
        <p className="text-[0.95rem] tabular-nums text-ink-2">{formatarTelefone(telefone)}</p>
      </Cabecalho>
      <BotoesTelefone telefone={telefone} quem="a ronda noturna" />
    </Cartao>
  );
}

// ---------- Responsável pelas reservas ----------

export function CartaoResponsavelReservas({ responsavel }: { responsavel: ResponsavelReservas }) {
  return (
    <Cartao aria-labelledby="titulo-cartao-reservas" className="flex flex-col gap-3">
      <Cabecalho icone={CalendarCheck} titulo="Responsável pelas reservas" idTitulo="titulo-cartao-reservas">
        <p className="text-[0.95rem] text-ink">
          <b>{responsavel.nome}</b>
          <span className="tabular-nums text-ink-2"> · {formatarTelefone(responsavel.telefone)}</span>
        </p>
        {responsavel.horario ? (
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-[0.88rem] text-muted">
            <Clock aria-hidden className="size-4 shrink-0" /> {responsavel.horario}
          </p>
        ) : null}
      </Cabecalho>
      <BotoesTelefone telefone={responsavel.telefone} quem={`${responsavel.nome}, responsável pelas reservas`} />
    </Cartao>
  );
}

// ---------- Votação oficial ----------

/** Atalho para a votação oficial (site externo): abre em nova aba. */
export function AtalhoVotacao({ link }: { link: string }) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Votação oficial (abre em nova aba)"
      className="flex min-h-[72px] items-center gap-3.5 rounded-[var(--radius-card)] bg-linear-135 from-vinho-de to-vinho-ate p-4 text-white shadow-card transition-shadow active:shadow-afundado"
    >
      <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-[rgb(255_255_255/0.16)]">
        <Vote aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block font-display text-[1.1rem]">Votação oficial</b>
        <span className="inline-flex items-center gap-1 text-[0.9rem] text-vinho-fg-suave">
          <ExternalLink aria-hidden className="size-4 shrink-0" /> Abre em nova aba
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0" />
    </a>
  );
}
