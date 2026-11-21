"use client";

/**
 * PAINEL DA VOTAÇÃO OFICIAL no topo do Início (moradores e equipe), AO VIVO.
 *
 * É a primeira coisa da tela enquanto houver votação (e o resultado nos dias seguintes):
 * - agendada: quando abre (contagem regressiva), quem está na chapa e o botão para vê-la;
 * - aberta: QUANTAS casas já votaram e quantas faltam (anel, barra, números que sobem),
 *   quando encerra e, para o morador, a situação da própria casa ou o botão "Votar agora";
 * - apurando: "Apurando os votos…" e a hora em que o resultado sai;
 * - resultado: chapa eleita ou não, o gráfico, a regra (metade mais 1 dos válidos), a
 *   participação e a revelação animada (abre sozinha uma vez por aparelho).
 *
 * Como fica em dia sem recarregar a tela (pergunta GET /api/eleicao/destaque):
 * 1. quando o <Sincronizar> avisa que a votação mudou (a cada voto muda "eleicoes");
 * 2. ao voltar para a aba (no máximo uma vez a cada 3 s);
 * 3. nas viradas de fase (abriu, encerrou, saiu o resultado), pelo relógio do SERVIDOR
 *    (a diferença entre a hora do servidor e a do aparelho é descontada). Se a diferença
 *    muda (ex.: aparelho com o relógio errado, corrigido na primeira pergunta), a espera é
 *    refeita com a hora certa. Passou do horário e a fase ainda não virou: pergunta de novo
 *    a cada 5 a 10 s enquanto a aba estiver aberta na tela, até virar.
 * Erro de rede: ignora e tenta na próxima. Sessão encerrada (401/403): para de perguntar.
 * Painel vazio na resposta (votação saiu de cena): o cartão some.
 *
 * MODO "link" (página do link de voto, SEM login): pergunta GET /api/votar/{código}/painel a
 * cada `intervaloSegundos` enquanto a votação está aberta ou apurando — e também nos últimos
 * 15 minutos antes de abrir — (não há <Sincronizar> nessa página) e, quando a fase vira
 * (abriu, encerrou, saiu o resultado), atualiza a página inteira para a cédula e os avisos
 * acompanharem. O botão leva à cédula da própria página.
 *
 * SIGILO: só números do condomínio inteiro. Nunca QUAIS casas votaram, nunca parcial de votos.
 * Da casa da pessoa, só "votou" / "não liberada" — nunca o voto.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  Hourglass,
  LoaderCircle,
  Lock,
  Scale,
  ShieldCheck,
  Trophy,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";
import type { FasePainel, PainelEleicao, ResultadoPainel } from "@/lib/eleicoes";
import { EVENTO_SINAIS } from "@/lib/sincronizacao";
import { FUSO_PADRAO, hojeISO } from "@/lib/formato";
import { cx } from "@/lib/cx";
import { classesDoBotao } from "@/components/ui/botao";
import { GraficoResultado, NumeroAnimado, RegraDoResultado } from "./grafico-resultado";
import { RevelacaoResultado } from "./revelacao-resultado";

/** Situação da PRÓPRIA casa (nunca o voto). */
export type SituacaoCasaPainel = { votou: boolean; bloqueada: boolean };

export type PropsPainelVivo = {
  inicial: PainelEleicao;
  casaInicial: SituacaoCasaPainel | null;
  /** Tela de detalhe (votar / acompanhar). null = o perfil não tem para onde ir. */
  hrefDetalhe: string | null;
  /** "link": página do link de voto, sem login (veja o modo "link" no começo do arquivo). */
  perfil: "morador" | "gestao" | "link";
  /** Hora do servidor quando a tela foi montada (para descontar o relógio do aparelho). */
  agoraServidor: number;
  /** Fuso do condomínio (ex.: "America/Belem"): todas as datas e horas são mostradas nele. */
  fuso: string;
  /** De onde vêm os números (padrão: /api/eleicao/destaque, do Início com login). */
  endereco?: string;
  /** Pergunta sozinho a cada N segundos com a votação aberta ou apurando (página sem <Sincronizar>). */
  intervaloSegundos?: number;
  /** Ao virar de fase, atualiza a página inteira (página do link: cédula e avisos acompanham). */
  atualizarPaginaNaVirada?: boolean;
};

type RespostaDestaque = {
  painel?: PainelEleicao | null;
  casa?: SituacaoCasaPainel | null;
  agora?: number;
};

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
/** Ao voltar para a aba, pergunta na hora (mas não mais que uma vez a cada 3 s). */
const INTERVALO_MINIMO_MS = 3000;
/** Viradas de fase muito distantes: o relógio do navegador só aceita esperas menores. */
const ESPERA_MAXIMA_MS = 6 * HORA;
/** Passou do horário e o servidor ainda não virou a fase: pergunta de novo a cada 5 a 10 s. */
const REPETIR_VIRADA_MIN_MS = 5000;
const REPETIR_VIRADA_SORTEIO_MS = 5000;
/** A diferença de relógio mudou mais que isto: refaz a espera da virada de fase. */
const MUDANCA_DESVIO_MS = 2000;
/** Página do link: começa a perguntar sozinha quando falta menos que isto para abrir. */
const ANTES_DE_ABRIR_MS = 15 * MINUTO;

// ---------- Datas e horas no fuso do condomínio ----------

type Formatos = { hora: Intl.DateTimeFormat; dia: Intl.DateTimeFormat; diaCurto: Intl.DateTimeFormat };
const formatosPorFuso = new Map<string, Formatos>();

function formatosDo(fuso: string): Formatos {
  const guardado = formatosPorFuso.get(fuso);
  if (guardado) return guardado;
  const criar = (opcoes: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, ...opcoes });
    } catch {
      return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_PADRAO, ...opcoes }); // fuso inválido
    }
  };
  const f: Formatos = {
    hora: criar({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    dia: criar({ weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
    diaCurto: criar({ day: "2-digit", month: "2-digit" }),
  };
  formatosPorFuso.set(fuso, f);
  return f;
}

/** "17:00" */
function hora(ms: number, fuso: string): string {
  return formatosDo(fuso).hora.format(new Date(ms));
}

/** "Sábado, 22/11/2026 às 07:00" */
function dataCompleta(ms: number, fuso: string): string {
  const dia = formatosDo(fuso).dia.format(new Date(ms));
  return `${dia.charAt(0).toLocaleUpperCase("pt-BR")}${dia.slice(1)} às ${hora(ms, fuso)}`;
}

function mesmoDia(a: number, b: number, fuso: string): boolean {
  return hojeISO(new Date(a), fuso) === hojeISO(new Date(b), fuso);
}

/** "2 dias e 3 h" / "3 h 12 min" / "12 min" / "menos de 1 minuto" */
function duracao(ms: number): string {
  if (ms < MINUTO) return "menos de 1 minuto";
  const minutos = Math.ceil(ms / MINUTO);
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const resto = minutos % 60;
  if (dias > 0) {
    const d = `${dias} ${dias === 1 ? "dia" : "dias"}`;
    return horas ? `${d} e ${horas} h` : d;
  }
  if (horas > 0) return resto ? `${horas} h ${resto} min` : `${horas} h`;
  return `${resto} min`;
}

/** "Abre em 2 dias e 3 h" / "Abre amanhã às 07:00" / "Abre hoje às 07:00" / "Abre em 12 min (às 07:00)" */
function textoAbre(abreEm: number, agora: number, fuso: string): string {
  const falta = abreEm - agora;
  if (falta <= 0) return "Abrindo agora…";
  if (mesmoDia(abreEm, agora, fuso)) {
    return falta < HORA ? `Abre em ${duracao(falta)} (às ${hora(abreEm, fuso)})` : `Abre hoje às ${hora(abreEm, fuso)}`;
  }
  if (mesmoDia(abreEm, agora + DIA, fuso)) return `Abre amanhã às ${hora(abreEm, fuso)}`;
  return `Abre em ${duracao(falta)}`;
}

/** "Encerra em 3 h 12 min (às 17:00)" */
function textoEncerra(fechaEm: number, agora: number, fuso: string): string {
  const falta = fechaEm - agora;
  if (falta <= 0) return "Encerrando…";
  const quando = mesmoDia(fechaEm, agora, fuso)
    ? `às ${hora(fechaEm, fuso)}`
    : `dia ${formatosDo(fuso).diaCurto.format(new Date(fechaEm))} às ${hora(fechaEm, fuso)}`;
  return `Encerra em ${duracao(falta)} (${quando})`;
}

// ---------- O componente ----------

export function PainelEleicaoVivo({
  inicial,
  casaInicial,
  hrefDetalhe: hrefDoServidor,
  perfil,
  agoraServidor,
  fuso,
  endereco = "/api/eleicao/destaque",
  intervaloSegundos,
  atualizarPaginaNaVirada = false,
}: PropsPainelVivo) {
  const idTitulo = useId();
  const router = useRouter();
  const [estado, setEstado] = useState<{ painel: PainelEleicao | null; casa: SituacaoCasaPainel | null }>({
    painel: inicial,
    casa: casaInicial,
  });

  // A tela foi redesenhada pelo servidor (ex.: o <Sincronizar> atualizou o Início):
  // adota o painel novo, se for mais recente do que o que já está na tela.
  const [doServidor, setDoServidor] = useState(inicial);
  if (doServidor !== inicial) {
    setDoServidor(inicial);
    if (!estado.painel || inicial.geradoEm >= estado.painel.geradoEm) setEstado({ painel: inicial, casa: casaInicial });
  }

  // Relógio da contagem regressiva, já na hora do servidor.
  const [agora, setAgora] = useState(agoraServidor);
  /** Hora do servidor menos a hora do aparelho. */
  const desvio = useRef(0);
  /**
   * Muda quando a diferença de relógio muda de verdade (mais de 2 s): está nas dependências da
   * espera da virada de fase, que então é refeita com a hora certa.
   */
  const [versaoDesvio, setVersaoDesvio] = useState(0);
  const ajustarDesvio = useCallback((novo: number) => {
    const antes = desvio.current;
    desvio.current = novo;
    if (Math.abs(novo - antes) > MUDANCA_DESVIO_MS) setVersaoDesvio((v) => v + 1);
  }, []);
  const parado = useRef(false);
  const buscando = useRef(false);
  const buscarDeNovo = useRef(false);
  const ultimaBusca = useRef(0);
  const faseAtual = useRef("");

  /** Pergunta ao servidor como está a votação agora. */
  const buscar = useCallback(async () => {
    if (parado.current) return;
    if (buscando.current) {
      // Já está perguntando: pergunta de novo assim que acabar (para não perder um voto).
      buscarDeNovo.current = true;
      return;
    }
    buscando.current = true;
    try {
      do {
        buscarDeNovo.current = false;
        ultimaBusca.current = Date.now();
        let resposta: Response;
        try {
          resposta = await fetch(endereco, { cache: "no-store", credentials: "same-origin" });
        } catch {
          return; // sem internet: tenta na próxima
        }
        if (resposta.status === 401 || resposta.status === 403 || resposta.status === 404) {
          // Sessão terminou (a próxima navegação leva para a entrada) ou o link deixou de valer.
          parado.current = true;
          return;
        }
        if (!resposta.ok) return;
        const dados = (await resposta.json()) as RespostaDestaque;
        if (typeof dados.agora === "number" && Number.isFinite(dados.agora)) ajustarDesvio(dados.agora - Date.now());
        const painel = dados.painel && typeof dados.painel === "object" ? dados.painel : null;
        const casa = dados.casa && typeof dados.casa === "object" ? dados.casa : null;
        setEstado((antes) => {
          // Resposta guardada no servidor mais velha do que a tela: mantém os números, atualiza a casa.
          if (painel && antes.painel && painel.id === antes.painel.id && painel.geradoEm < antes.painel.geradoEm) {
            return { painel: antes.painel, casa: casa ?? antes.casa };
          }
          return { painel, casa: painel ? casa : null };
        });
      } while (buscarDeNovo.current && !parado.current);
    } catch {
      // Resposta estranha: tenta na próxima.
    } finally {
      buscando.current = false;
    }
  }, [endereco, ajustarDesvio]);

  // Diferença entre o relógio do servidor e o do aparelho.
  // (Roda ANTES do efeito da virada de fase, que também depende de agoraServidor: quando a
  // tela é redesenhada pelo servidor, a espera é refeita já com a diferença nova.)
  useEffect(() => {
    const diferenca = agoraServidor - Date.now();
    ultimaBusca.current = Date.now();
    if (Math.abs(diferenca) > 15_000) {
      // Tela que veio da memória do navegador (botão Voltar): a hora "do servidor" está velha.
      // Usa o relógio do aparelho e pergunta já a hora certa e os números de agora.
      desvio.current = 0;
      const t = window.setTimeout(() => void buscar(), 0);
      return () => window.clearTimeout(t);
    }
    desvio.current = diferenca;
  }, [agoraServidor, buscar]);

  // (1) Aviso do <Sincronizar> e (2) volta para a aba.
  useEffect(() => {
    const aoSinal = (e: Event) => {
      const modulos = (e as CustomEvent<{ modulos?: string[] }>).detail?.modulos ?? [];
      if (modulos.includes("eleicoes")) void buscar();
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca.current >= INTERVALO_MINIMO_MS) void buscar();
    };
    window.addEventListener(EVENTO_SINAIS, aoSinal);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener(EVENTO_SINAIS, aoSinal);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [buscar]);

  const painel = estado.painel;
  const marcaFase = painel ? `${painel.id}:${painel.fase}` : "";
  const alvo = !painel
    ? null
    : painel.fase === "agendada"
      ? painel.abreEm
      : painel.fase === "aberta"
        ? painel.fechaEm
        : painel.fase === "apurando"
          ? painel.resultadoEm
          : null;

  useEffect(() => {
    faseAtual.current = marcaFase;
  }, [marcaFase]);

  // (3) Viradas de fase: pergunta 1 a 3 s depois do horário (sorteado, para as telas do
  // condomínio não perguntarem todas no mesmo segundo). Se ainda não virou, pergunta de novo a
  // cada 5 a 10 s — sem limite de tentativas — enquanto a aba estiver na tela.
  // Refeita quando a diferença de relógio muda (versaoDesvio) ou a tela vem do servidor
  // (agoraServidor): uma espera calculada com o relógio errado do aparelho nunca fica valendo.
  useEffect(() => {
    if (alvo === null) return;
    let espera = 0;
    let cancelado = false;
    const tentar = async () => {
      // Aba escondida: não pergunta (ao voltar para a aba, o painel pergunta na hora).
      if (document.visibilityState === "visible") await buscar();
      if (cancelado || parado.current) return;
      if (faseAtual.current === marcaFase) {
        espera = window.setTimeout(() => void tentar(), REPETIR_VIRADA_MIN_MS + Math.random() * REPETIR_VIRADA_SORTEIO_MS);
      }
    };
    const agendar = () => {
      const falta = alvo - (Date.now() + desvio.current);
      if (falta > ESPERA_MAXIMA_MS) {
        espera = window.setTimeout(agendar, ESPERA_MAXIMA_MS);
        return;
      }
      espera = window.setTimeout(() => void tentar(), Math.max(0, falta) + 1000 + Math.random() * 2000);
    };
    agendar();
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, [alvo, marcaFase, buscar, versaoDesvio, agoraServidor]);

  // Página sem <Sincronizar> (link de voto): pergunta sozinha de tempos em tempos enquanto os
  // números mudam (aberta), o resultado está para sair (apurando) e, no link, também nos
  // últimos 15 minutos antes de abrir — só com a aba visível.
  const fase = painel?.fase ?? null;
  const quaseAbrindo = perfil === "link" && !!painel && fase === "agendada" && painel.abreEm - agora < ANTES_DE_ABRIR_MS;
  const perguntarSozinho = !!intervaloSegundos && (fase === "aberta" || fase === "apurando" || quaseAbrindo);
  useEffect(() => {
    if (!perguntarSozinho || !intervaloSegundos) return;
    const relogio = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca.current >= intervaloSegundos * 1000 - 500) void buscar();
    }, 1000);
    return () => window.clearInterval(relogio);
  }, [perguntarSozinho, intervaloSegundos, buscar]);

  // Página do link: quando a fase vira, atualiza a página inteira (a cédula some no encerramento,
  // o resultado aparece etc.). Não roda na primeira montagem.
  const faseVista = useRef(marcaFase);
  useEffect(() => {
    if (!atualizarPaginaNaVirada || !marcaFase) return;
    if (faseVista.current && faseVista.current !== marcaFase) router.refresh();
    faseVista.current = marcaFase;
  }, [marcaFase, atualizarPaginaNaVirada, router]);

  // Relógio de 1 s só para a contagem regressiva (parado com a aba escondida e no resultado).
  const precisaRelogio = !!painel && painel.fase !== "resultado";
  useEffect(() => {
    if (!precisaRelogio) return;
    let relogio = 0;
    const tique = () => setAgora(Date.now() + desvio.current);
    const ligar = () => {
      if (relogio || document.visibilityState !== "visible") return;
      relogio = window.setInterval(tique, 1000);
      window.setTimeout(tique, 0);
    };
    const desligar = () => {
      window.clearInterval(relogio);
      relogio = 0;
    };
    const aoMudar = () => (document.visibilityState === "visible" ? ligar() : desligar());
    ligar();
    document.addEventListener("visibilitychange", aoMudar);
    return () => {
      desligar();
      document.removeEventListener("visibilitychange", aoMudar);
    };
  }, [precisaRelogio]);

  if (!painel) return null;
  const casa = perfil !== "gestao" ? estado.casa : null;
  // O link veio do servidor para a eleição da tela; se outra eleição entrou em destaque
  // sem recarregar (ex.: saiu o resultado e outra foi agendada), troca o final do link.
  const hrefDetalhe =
    hrefDoServidor && painel.id !== inicial.id
      ? `${hrefDoServidor.slice(0, hrefDoServidor.lastIndexOf("/") + 1)}${encodeURIComponent(painel.id)}`
      : hrefDoServidor;

  return (
    <section
      aria-labelledby={idTitulo}
      className="surgir overflow-hidden rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card"
    >
      <Cabecalho painel={painel} idTitulo={idTitulo} />
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {painel.fase === "agendada" ? (
          <CorpoAgendada painel={painel} casa={casa} hrefDetalhe={hrefDetalhe} agora={agora} fuso={fuso} />
        ) : painel.fase === "aberta" ? (
          <CorpoAberta painel={painel} casa={casa} perfil={perfil} hrefDetalhe={hrefDetalhe} agora={agora} fuso={fuso} />
        ) : painel.fase === "apurando" ? (
          <CorpoApurando painel={painel} casa={casa} agora={agora} fuso={fuso} />
        ) : painel.resultado ? (
          <CorpoResultado painel={painel} resultado={painel.resultado} hrefDetalhe={perfil === "link" ? null : hrefDetalhe} />
        ) : (
          // Resultado ainda sendo lido (raro): mostra como apuração.
          <CorpoApurando painel={painel} casa={casa} agora={agora} fuso={fuso} />
        )}
      </div>
    </section>
  );
}

// ---------- Partes do cartão ----------

const FASE: Record<FasePainel, { rotulo: string; icone: LucideIcon }> = {
  agendada: { rotulo: "Agendada", icone: CalendarClock },
  aberta: { rotulo: "Votação aberta", icone: Vote },
  apurando: { rotulo: "Apurando", icone: Hourglass },
  resultado: { rotulo: "Resultado", icone: Trophy },
};

/** Faixa vinho do topo: título, cargo e a etiqueta da fase (ícone + texto). */
function Cabecalho({ painel, idTitulo }: { painel: PainelEleicao; idTitulo: string }) {
  const { rotulo, icone: Icone } = FASE[painel.fase];
  return (
    <div className="bg-linear-135 from-vinho-de to-vinho-ate px-4 pb-4 pt-3.5 text-white sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-bold uppercase tracking-[0.1em] text-vinho-fg-suave">
          <Vote aria-hidden className="size-4" />
          Votação oficial
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {painel.fase === "aberta" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(255_255_255/0.16)] px-2.5 py-1 text-[0.74rem] font-bold uppercase tracking-wide">
              <span aria-hidden className="relative flex size-2.5">
                <span className="absolute inline-flex size-full rounded-full bg-band-ok opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2.5 rounded-full bg-band-ok" />
              </span>
              Ao vivo
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(255_255_255/0.2)] px-2.5 py-1 text-[0.8rem] font-bold">
            <Icone aria-hidden className="size-4" />
            {rotulo}
          </span>
        </span>
      </div>
      <h2 id={idTitulo} className="mt-2 break-words text-[1.4rem] font-bold leading-tight sm:text-[1.6rem]">
        {painel.titulo}
      </h2>
      {painel.cargo ? <p className="mt-0.5 break-words text-[0.95rem] text-vinho-fg-suave">{painel.cargo}</p> : null}
    </div>
  );
}

/** Aviso para a casa que a comissão não liberou. */
function AvisoCasaBloqueada() {
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border-[1.5px] border-warn bg-warn-soft px-4 py-3 text-ink">
      <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
      <span>Sua casa não está liberada para votar. Fale com a comissão.</span>
    </p>
  );
}

/** Selo "Sua casa já votou" (nunca diz em quem). */
function SeloCasaVotou({ hrefDetalhe }: { hrefDetalhe: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-ok-soft px-4 py-3 text-pine">
      <span className="flex items-center gap-2 font-bold">
        <CircleCheck aria-hidden className="size-6 shrink-0" />
        Sua casa já votou
      </span>
      {hrefDetalhe ? (
        <Link href={hrefDetalhe} className="inline-flex min-h-11 items-center gap-0.5 text-[0.92rem] font-bold underline underline-offset-4">
          Ver detalhes
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

const classeBotaoSecundario = cx(classesDoBotao("secundario", "normal", true), "sm:w-auto sm:self-start");

function CorpoAgendada({
  painel,
  casa,
  hrefDetalhe,
  agora,
  fuso,
}: {
  painel: PainelEleicao;
  casa: SituacaoCasaPainel | null;
  hrefDetalhe: string | null;
  agora: number;
  fuso: string;
}) {
  const fecha = mesmoDia(painel.fechaEm, painel.abreEm, fuso)
    ? `Fica aberta até as ${hora(painel.fechaEm, fuso)}.`
    : `Encerra em ${dataCompleta(painel.fechaEm, fuso)}.`;
  const integrantes = painel.integrantes.slice(0, 12);
  const sobram = painel.integrantes.length - integrantes.length;
  const chapa = painel.modo === "chapa";
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-plum-soft text-plum">
          <CalendarClock aria-hidden className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[1.4rem] font-bold leading-tight text-destaque">
            {textoAbre(painel.abreEm, agora, fuso)}
          </p>
          <p className="mt-1 text-ink-2">{dataCompleta(painel.abreEm, fuso)}</p>
          <p className="text-[0.9rem] text-muted">{fecha} Um voto por casa, secreto.</p>
        </div>
      </div>

      {integrantes.length ? (
        <div>
          <h3 className="rotulo-caixa">{chapa ? "Quem está na chapa" : "Candidatos"}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {integrantes.map((c, i) => (
              <li
                key={`${i}-${c.nome}`}
                className={cx(
                  "inline-flex max-w-full items-center gap-1.5 rounded-2xl border border-line bg-surface-item py-1 pl-3 text-[0.9rem]",
                  c.funcao ? "pr-1.5" : "pr-3",
                )}
              >
                <span className="min-w-0 break-words font-bold text-ink">{c.nome}</span>
                {c.funcao ? (
                  <span className="shrink-0 rounded-full bg-ok-soft px-2 py-px text-[0.7rem] font-bold uppercase tracking-wide text-pine">
                    {c.funcao}
                  </span>
                ) : null}
              </li>
            ))}
            {sobram > 0 ? (
              <li className="inline-flex items-center rounded-2xl border border-line bg-surface-item px-3 py-1 text-[0.9rem] text-ink-2">
                e mais {sobram}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {casa?.bloqueada ? <AvisoCasaBloqueada /> : null}

      {hrefDetalhe ? (
        <Link href={hrefDetalhe} className={classeBotaoSecundario}>
          <Users aria-hidden className="size-5" />
          {chapa ? "Ver a chapa" : "Ver os candidatos"}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </>
  );
}

/** Anel (donut) com a participação no meio. */
function Anel({ porcentagem, votaram, semAptas }: { porcentagem: number; votaram: number; semAptas: boolean }) {
  const raio = 50;
  const volta = 2 * Math.PI * raio;
  const p = Math.max(0, Math.min(100, porcentagem));
  return (
    <div aria-hidden className="relative grid size-[7.25rem] shrink-0 place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90">
        <circle cx="60" cy="60" r={raio} fill="none" strokeWidth="13" className="stroke-line" />
        <circle
          cx="60"
          cy="60"
          r={raio}
          fill="none"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - p / 100)}
          className="stroke-pine transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          style={{ opacity: p > 0 ? 1 : 0 }}
        />
      </svg>
      <span className="flex flex-col items-center leading-none">
        <b className="font-display text-[1.6rem] font-extrabold text-destaque">
          {semAptas ? <NumeroAnimado valor={votaram} /> : <><NumeroAnimado valor={p} />%</>}
        </b>
        <span className="mt-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted">votaram</span>
      </span>
    </div>
  );
}

function BarraParticipacao({ porcentagem }: { porcentagem: number }) {
  return (
    <div aria-hidden className="afundado h-3 overflow-hidden rounded-full">
      <div
        className="h-full rounded-full bg-pine transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(0, Math.min(100, porcentagem))}%` }}
      />
    </div>
  );
}

function CorpoAberta({
  painel,
  casa,
  perfil,
  hrefDetalhe,
  agora,
  fuso,
}: {
  painel: PainelEleicao;
  casa: SituacaoCasaPainel | null;
  perfil: "morador" | "gestao" | "link";
  hrefDetalhe: string | null;
  agora: number;
  fuso: string;
}) {
  const semAptas = painel.casasAptas <= 0;
  const resumo = semAptas
    ? `${painel.votaram} ${painel.votaram === 1 ? "casa já votou" : "casas já votaram"}.`
    : `${painel.votaram} de ${painel.casasAptas} casas já votaram (${painel.participacao}%). Faltam ${painel.faltam}.`;

  let acao: ReactNode = null;
  if (perfil !== "gestao") {
    // No link de voto, a casa já está na própria página: o selo não leva a outra tela.
    if (casa?.votou) acao = <SeloCasaVotou hrefDetalhe={perfil === "link" ? null : hrefDetalhe} />;
    else if (casa?.bloqueada) acao = <AvisoCasaBloqueada />;
    else if (casa && hrefDetalhe)
      acao = (
        <Link href={hrefDetalhe} className={classesDoBotao("primario", "grande", true)}>
          <Vote aria-hidden className="size-6" />
          Votar agora
        </Link>
      );
    else if (hrefDetalhe)
      acao = (
        <Link href={hrefDetalhe} className={classeBotaoSecundario}>
          Ver a votação
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      );
  } else if (hrefDetalhe) {
    acao = (
      <Link href={hrefDetalhe} className={classeBotaoSecundario}>
        <Eye aria-hidden className="size-5" />
        Acompanhar
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    );
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Anel porcentagem={painel.participacao} votaram={painel.votaram} semAptas={semAptas} />
        <div aria-hidden className="min-w-0 flex-1">
          <p className="leading-none">
            <NumeroAnimado valor={painel.votaram} className="font-display text-[2.1rem] font-extrabold text-destaque" />
            {semAptas ? null : <span className="ml-1.5 text-[1.05rem] text-ink-2">de {painel.casasAptas}</span>}
          </p>
          <p className="mt-1 font-bold leading-snug text-ink">
            {painel.votaram === 1 && semAptas ? "casa já votou" : "casas já votaram"}
          </p>
          {semAptas ? null : (
            <p className="mt-2 inline-flex items-baseline gap-1 rounded-full bg-surface-item px-3 py-0.5 text-[0.92rem] text-ink-2">
              Faltam
              <b className="text-ink">
                <NumeroAnimado valor={painel.faltam} />
              </b>
            </p>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {resumo}
      </p>
      {semAptas ? null : <BarraParticipacao porcentagem={painel.participacao} />}

      <p className="flex items-start gap-2 font-bold text-ink">
        <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-plum" />
        <span>{textoEncerra(painel.fechaEm, agora, fuso)}</span>
      </p>

      {acao}

      <p className="flex items-start gap-2 text-[0.88rem] text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
        <span>
          Aqui aparece só QUANTAS casas já votaram — nunca quais, nem os votos. O resultado sai no encerramento.
        </span>
      </p>
    </>
  );
}

function CorpoApurando({
  painel,
  casa,
  agora,
  fuso,
}: {
  painel: PainelEleicao;
  casa: SituacaoCasaPainel | null;
  agora: number;
  fuso: string;
}) {
  const falta = painel.resultadoEm - agora;
  const quando =
    falta <= 0
      ? "O resultado sai em instantes."
      : falta < 10 * MINUTO
        ? `O resultado sai às ${hora(painel.resultadoEm, fuso)} (em ${duracao(falta)}).`
        : `O resultado sai às ${hora(painel.resultadoEm, fuso)}.`;
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-surface-item p-4">
        <LoaderCircle aria-hidden className="size-9 shrink-0 text-plum motion-safe:animate-spin" />
        <div className="min-w-0">
          <p className="font-display text-[1.2rem] font-bold leading-snug text-ink">Votação encerrada. Apurando os votos…</p>
          <p className="mt-0.5 text-ink-2">{quando}</p>
        </div>
      </div>
      <Participacao painel={painel} />
      {casa?.votou ? <SeloCasaVotou hrefDetalhe={null} /> : null}
    </>
  );
}

/** "V de A casas votaram (p%)" com a barra. */
function Participacao({ painel }: { painel: PainelEleicao }) {
  if (painel.casasAptas <= 0) {
    return (
      <p className="text-ink-2">
        <b className="text-ink">{painel.votaram}</b> {painel.votaram === 1 ? "casa votou" : "casas votaram"}.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-2">
        <b className="text-ink">{painel.votaram}</b> de <b className="text-ink">{painel.casasAptas}</b> casas votaram (
        {painel.participacao}%).
      </p>
      <BarraParticipacao porcentagem={painel.participacao} />
    </div>
  );
}

function CorpoResultado({
  painel,
  resultado,
  hrefDetalhe,
}: {
  painel: PainelEleicao;
  resultado: ResultadoPainel;
  hrefDetalhe: string | null;
}) {
  return (
    <>
      <MancheteResultado resultado={resultado} />
      {/* Sem animar: o número final já sai do servidor (a animação fica na revelação). */}
      <GraficoResultado resultado={resultado} casasAptas={painel.casasAptas} />
      <RegraDoResultado resultado={resultado} casasAptas={painel.casasAptas} votaram={painel.votaram} />
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <RevelacaoResultado
          eleicaoId={painel.id}
          titulo={painel.titulo}
          resultado={resultado}
          casasAptas={painel.casasAptas}
          votaram={painel.votaram}
          autoAbrir
          className="w-full sm:w-auto"
        />
        {hrefDetalhe ? (
          <Link href={hrefDetalhe} className={cx(classesDoBotao("discreto", "normal", true), "sm:w-auto")}>
            Ver detalhes
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
    </>
  );
}

/** Manchete do resultado: ícone + texto (nunca só a cor). */
function MancheteResultado({ resultado }: { resultado: ResultadoPainel }) {
  if (resultado.modo === "chapa") {
    const eleita = resultado.eleita;
    return (
      <div className={cx("flex items-center gap-3 rounded-2xl p-4", eleita ? "bg-ok-soft text-pine" : "bg-danger-soft text-danger")}>
        <span
          className={cx(
            "grid size-14 shrink-0 place-items-center rounded-2xl",
            eleita ? "bg-pine text-on-pine" : "bg-danger text-on-danger",
          )}
        >
          {eleita ? <Trophy aria-hidden className="size-8" /> : <CircleX aria-hidden className="size-8" />}
        </span>
        <div className="min-w-0">
          <p className="font-display text-[clamp(1.3rem,6.4vw,1.75rem)] font-extrabold leading-none">
            {eleita ? "Chapa ELEITA" : "Chapa NÃO eleita"}
          </p>
          <p className="mt-1 text-[0.92rem] text-ink-2">
            {resultado.validos > 0
              ? `O Sim teve ${resultado.sim} de ${resultado.validos} ${resultado.validos === 1 ? "voto válido" : "votos válidos"} (${eleita ? "mais da metade" : "não passou da metade"}).`
              : "Nenhuma casa votou."}
          </p>
        </div>
      </div>
    );
  }
  const eleitos = resultado.ranking.filter((l) => l.eleito);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-2xl bg-ok-soft p-4 text-pine">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-pine text-on-pine">
          <Trophy aria-hidden className="size-8" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[1.4rem] font-extrabold leading-none">
            {eleitos.length === 1 ? "Eleito" : eleitos.length ? "Eleitos" : "Resultado"}
          </p>
          <p className="mt-1 break-words font-bold text-ink">
            {eleitos.length ? eleitos.map((l) => l.nome).join(", ") : "Ninguém eleito ainda."}
          </p>
        </div>
      </div>
      {resultado.empate ? (
        <p className="flex items-start gap-2.5 rounded-2xl border-[1.5px] border-warn bg-warn-soft px-4 py-3 text-ink">
          <Scale aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
          <span>Empate na última vaga: a comissão decide quem fica e registra na ata.</span>
        </p>
      ) : null}
    </div>
  );
}
