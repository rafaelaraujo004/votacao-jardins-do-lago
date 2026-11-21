"use client";

/**
 * REVELAÇÃO ANIMADA DO RESULTADO da votação oficial (depois do encerramento).
 *
 * Um botão "Ver a revelação do resultado" abre uma janela em tela cheia com uma sequência
 * curta (~5 s), pensada para o momento em que o condomínio inteiro descobre o resultado:
 * 1. "Apurando…" com as cédulas sendo contadas (suspense);
 * 2. as barras Sim / Não / Nulos crescem e os números sobem;
 * 3. a manchete: "CHAPA ELEITA!" carimbada, com confetes — ou, se não foi eleita, uma
 *    revelação calma "Chapa NÃO eleita", sem confete;
 * 4. o placar final, a regra (metade mais 1 dos votos válidos) e a participação.
 *
 * - Abre SOZINHA uma vez por aparelho em cada eleição (`autoAbrir`, padrão true), guardando
 *   "revelacao-vista:{eleicaoId}" no navegador. Se o navegador não deixar guardar, abre no
 *   máximo uma vez por carregamento da página. Só abre com a aba visível.
 * - Quem pede menos movimento no aparelho vê direto o resultado final, sem confete.
 * - Esc ou o botão Fechar fecham; o foco vai para o Fechar ao abrir.
 * - Enquanto a janela está aberta, o <Sincronizar> não recarrega a tela.
 * SIGILO: só mostra totais do condomínio (o mesmo que o painel público).
 */
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { CircleX, LoaderCircle, RotateCcw, Scale, Sparkles, Trophy, X } from "lucide-react";
import type { ResultadoPainel } from "@/lib/eleicoes";
import { cx } from "@/lib/cx";
import { classesDoBotao } from "@/components/ui/botao";
import { FaixaPetalas } from "@/components/ui/painel";
import { GraficoResultado, NumeroAnimado, RegraDoResultado, useMenosMovimento } from "./grafico-resultado";

export type PropsRevelacao = {
  eleicaoId: string;
  /** Título da eleição. */
  titulo: string;
  resultado: ResultadoPainel;
  casasAptas: number;
  votaram: number;
  /** Abre sozinha uma vez por aparelho (padrão true). */
  autoAbrir?: boolean;
  /** Classe extra do botão "Ver a revelação do resultado". */
  className?: string;
};

type Etapa = "fechada" | "apurando" | "barras" | "manchete" | "final";

/** Quanto cada etapa fica na tela antes da próxima (total ~5 s). */
const ESPERA: Partial<Record<Etapa, { ms: number; proxima: Etapa }>> = {
  apurando: { ms: 1600, proxima: "barras" },
  barras: { ms: 1700, proxima: "manchete" },
  manchete: { ms: 1500, proxima: "final" },
};

// Eleições cuja revelação já abriu sozinha neste carregamento (vale mesmo sem o armazenamento).
const abertasNestaCarga = new Set<string>();
const chaveVista = (id: string) => `revelacao-vista:${id}`;

function jaViuNoAparelho(id: string): boolean {
  try {
    return window.localStorage.getItem(chaveVista(id)) !== null;
  } catch {
    return false; // sem armazenamento: vale só a lista deste carregamento
  }
}

function marcarVistaNoAparelho(id: string) {
  try {
    window.localStorage.setItem(chaveVista(id), String(Date.now()));
  } catch {
    // Navegador sem armazenamento (aba anônima, bloqueado): abre de novo na próxima visita.
  }
}

/** Texto curto do resultado (leitor de tela e manchete). */
function resumoResultado(r: ResultadoPainel): string {
  if (r.modo === "chapa") {
    const titulo = r.eleita ? "Chapa eleita!" : "Chapa não eleita.";
    return `${titulo} Sim ${r.sim}, Não ${r.nao}, Nulos ${r.nulos}.`;
  }
  const eleitos = r.ranking.filter((l) => l.eleito).map((l) => l.nome);
  const base = eleitos.length ? `Eleitos: ${eleitos.join(", ")}.` : "Nenhum eleito definido.";
  return r.empate ? `${base} Houve empate na última vaga: a comissão decide.` : base;
}

export function RevelacaoResultado({
  eleicaoId,
  titulo,
  resultado,
  casasAptas,
  votaram,
  autoAbrir = true,
  className,
}: PropsRevelacao) {
  const janela = useRef<HTMLDialogElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const manchete = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const menosMovimento = useMenosMovimento();
  const [etapa, setEtapa] = useState<Etapa>("fechada");
  // Muda a cada abertura: recomeça as animações do zero.
  const [rodada, setRodada] = useState(0);
  // Cada disparo de confete (0 = nenhum).
  const [confete, setConfete] = useState(0);

  const comemorar =
    resultado.modo === "chapa" ? resultado.eleita : resultado.ranking.some((l) => l.eleito);

  const abrir = useCallback(() => {
    const d = janela.current;
    if (!d) return;
    if (!d.open) d.showModal();
    botaoFechar.current?.focus();
    setRodada((n) => n + 1);
    setConfete(0);
    setEtapa(menosMovimento ? "final" : "apurando");
  }, [menosMovimento]);

  // Abre sozinha uma vez por aparelho (e só com a aba visível, para ninguém perder o momento).
  useEffect(() => {
    if (!autoAbrir) return;
    if (abertasNestaCarga.has(eleicaoId) || jaViuNoAparelho(eleicaoId)) return;
    let espera = 0;
    const tentar = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", tentar);
      espera = window.setTimeout(() => {
        if (abertasNestaCarga.has(eleicaoId)) return;
        abertasNestaCarga.add(eleicaoId);
        marcarVistaNoAparelho(eleicaoId);
        abrir();
      }, 700);
    };
    if (document.visibilityState === "visible") tentar();
    else document.addEventListener("visibilitychange", tentar);
    return () => {
      window.clearTimeout(espera);
      document.removeEventListener("visibilitychange", tentar);
    };
  }, [eleicaoId, autoAbrir, abrir]);

  // A sequência: cada etapa chama a próxima depois de um tempinho.
  useEffect(() => {
    const passo = ESPERA[etapa];
    if (!passo) return;
    const t = window.setTimeout(() => {
      setEtapa(passo.proxima);
      if (passo.proxima === "manchete" && comemorar) setConfete((n) => n + 1);
    }, passo.ms);
    return () => window.clearTimeout(t);
  }, [etapa, comemorar]);

  // A manchete entra "carimbada" (eleita) ou com calma (não eleita).
  useEffect(() => {
    if (etapa !== "manchete" || menosMovimento) return;
    const el = manchete.current;
    if (!el || typeof el.animate !== "function") return;
    const animacao = comemorar
      ? el.animate(
          [
            { transform: "rotate(-14deg) scale(2.6)", opacity: 0 },
            { transform: "rotate(-2deg) scale(0.9)", opacity: 1, offset: 0.65 },
            { transform: "rotate(-3deg) scale(1.04)", opacity: 1, offset: 0.85 },
            { transform: "rotate(-3deg) scale(1)", opacity: 1 },
          ],
          { duration: 620, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)", fill: "backwards" },
        )
      : el.animate(
          [
            { transform: "translateY(10px)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 800, easing: "ease-out", fill: "backwards" },
        );
    return () => animacao.cancel();
  }, [etapa, comemorar, menosMovimento]);

  const fechar = () => janela.current?.close();
  const aberta = etapa !== "fechada";
  const depois = (e: Etapa) => {
    const ordem: Etapa[] = ["apurando", "barras", "manchete", "final"];
    return aberta && ordem.indexOf(etapa) >= ordem.indexOf(e);
  };
  const anuncio =
    etapa === "apurando" ? "Apurando os votos." : depois("manchete") ? resumoResultado(resultado) : "";

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={cx(classesDoBotao("secundario", "normal"), className)}
      >
        <Sparkles aria-hidden className="size-5 text-plum" />
        Ver a revelação do resultado
      </button>

      <dialog
        ref={janela}
        aria-labelledby={idTitulo}
        aria-modal="true"
        onClose={() => {
          setEtapa("fechada");
          setConfete(0);
        }}
        className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overflow-x-hidden overscroll-contain bg-canvas p-0 text-ink backdrop:bg-black/60"
      >
        <FaixaPetalas />
        <div className="mx-auto flex min-h-[calc(100%-5px)] w-full max-w-lg flex-col gap-5 px-4 pb-10 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-plum">Resultado da votação</p>
              <h2 id={idTitulo} className="break-words text-[1.35rem] font-bold text-destaque">
                {titulo}
              </h2>
            </div>
            <button
              ref={botaoFechar}
              type="button"
              onClick={fechar}
              className={cx(classesDoBotao("secundario", "normal"), "shrink-0 px-4")}
            >
              <X aria-hidden className="size-5" />
              Fechar
            </button>
          </div>

          <p className="sr-only" aria-live="polite">
            {anuncio}
          </p>

          {aberta ? (
            <div key={rodada} className="flex flex-col gap-5">
              {/* Espaço fixo: primeiro o "Apurando…", depois a manchete (a tela não pula). */}
              <div className="grid min-h-[9.5rem] place-items-center text-center">
                {depois("manchete") ? (
                  <Manchete refManchete={manchete} resultado={resultado} />
                ) : (
                  <div aria-hidden className="flex flex-col items-center gap-2">
                    <LoaderCircle className="size-12 text-plum motion-safe:animate-spin" />
                    <p className="font-display text-[1.7rem] font-extrabold text-destaque">
                      {etapa === "apurando" ? "Apurando…" : "E o resultado é…"}
                    </p>
                    <p className="text-ink-2">
                      Cédulas contadas:{" "}
                      <b className="text-ink">
                        <NumeroAnimado valor={votaram} desde={0} duracaoMs={1300} />
                      </b>
                    </p>
                  </div>
                )}
              </div>

              {depois("barras") ? (
                <GraficoResultado resultado={resultado} casasAptas={casasAptas} animar={!menosMovimento} />
              ) : null}

              {etapa === "final" ? (
                <>
                  <RegraDoResultado
                    resultado={resultado}
                    casasAptas={casasAptas}
                    votaram={votaram}
                    className="saltado rounded-2xl p-4"
                  />
                  <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
                    <button type="button" onClick={fechar} className={cx(classesDoBotao("primario", "grande", true), "sm:flex-1")}>
                      Fechar
                    </button>
                    {!menosMovimento ? (
                      <button type="button" onClick={abrir} className={cx(classesDoBotao("secundario", "normal", true), "sm:w-auto")}>
                        <RotateCcw aria-hidden className="size-5" />
                        Ver de novo
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEtapa("final")}
                  className={cx(classesDoBotao("discreto", "pequeno"), "self-center")}
                >
                  Pular a animação
                </button>
              )}
            </div>
          ) : null}
        </div>
        {aberta && confete > 0 && !menosMovimento ? <Confetes key={confete} /> : null}
      </dialog>
    </>
  );
}

/** A manchete do resultado: carimbo de festa (eleita) ou aviso calmo (não eleita). */
function Manchete({
  refManchete,
  resultado,
}: {
  refManchete: RefObject<HTMLDivElement | null>;
  resultado: ResultadoPainel;
}) {
  if (resultado.modo === "chapa") {
    return resultado.eleita ? (
      <div
        ref={refManchete}
        style={{ transform: "rotate(-3deg)" }}
        className="flex max-w-full flex-col items-center gap-1 rounded-[22px] border-4 border-pine bg-ok-soft px-5 py-3 text-pine shadow-card"
      >
        <Trophy aria-hidden className="size-10" />
        <p className="font-display text-[clamp(1.45rem,7.2vw,2.3rem)] font-extrabold uppercase leading-none tracking-wide">
          Chapa eleita!
        </p>
      </div>
    ) : (
      <div
        ref={refManchete}
        className="flex max-w-full flex-col items-center gap-1 rounded-[22px] border-2 border-danger bg-danger-soft px-5 py-3 text-danger"
      >
        <CircleX aria-hidden className="size-10" />
        <p className="font-display text-[clamp(1.35rem,6.6vw,1.9rem)] font-extrabold leading-tight">Chapa NÃO eleita</p>
        <p className="text-[0.92rem] text-ink-2">
          {resultado.validos > 0 ? "O Sim não chegou à metade mais 1 dos votos válidos." : "Nenhuma casa votou."}
        </p>
      </div>
    );
  }
  const eleitos = resultado.ranking.filter((l) => l.eleito);
  if (eleitos.length === 0) {
    return (
      <div ref={refManchete} className="flex max-w-full flex-col items-center gap-1 rounded-[22px] border-2 border-warn bg-warn-soft px-5 py-3 text-warn">
        <Scale aria-hidden className="size-10" />
        <p className="font-display text-[1.6rem] font-extrabold leading-tight">Empate</p>
        <p className="text-[0.92rem] text-ink-2">A comissão decide quem fica com a vaga e registra na ata.</p>
      </div>
    );
  }
  return (
    <div
      ref={refManchete}
      style={{ transform: "rotate(-3deg)" }}
      className="flex max-w-full flex-col items-center gap-1.5 rounded-[22px] border-4 border-pine bg-ok-soft px-5 py-3 text-pine shadow-card"
    >
      <Trophy aria-hidden className="size-10" />
      <p className="font-display text-[clamp(1.45rem,7.2vw,2.2rem)] font-extrabold uppercase leading-none tracking-wide">
        {eleitos.length === 1 ? "Eleito!" : "Eleitos!"}
      </p>
      <p className="break-words font-bold text-ink">{eleitos.map((l) => l.nome).join(", ")}</p>
      {resultado.empate ? (
        <p className="text-[0.88rem] text-ink-2">Empate na última vaga: a comissão decide e registra na ata.</p>
      ) : null}
    </div>
  );
}

/**
 * Confetes desenhados num canvas (~120 peças, ~3 s), nas cores das pétalas da logo
 * (lidas do tema, então combinam com o claro e o escuro). Sem biblioteca.
 */
function Confetes() {
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = tela.current;
    const pincel = canvas?.getContext("2d");
    if (!canvas || !pincel) return;
    const estilo = getComputedStyle(document.documentElement);
    const cores = ["--petala-laranja", "--petala-amarelo", "--petala-rosa", "--petala-verde", "--petala-azul", "--petala-roxo", "--pine"]
      .map((v) => estilo.getPropertyValue(v).trim())
      .filter(Boolean);
    if (cores.length === 0) cores.push("#d9701c", "#e3ad17", "#d13f78", "#4f9a3c");

    const escala = Math.min(2, window.devicePixelRatio || 1);
    let largura = 0;
    let altura = 0;
    const medir = () => {
      largura = canvas.clientWidth;
      altura = canvas.clientHeight;
      canvas.width = Math.round(largura * escala);
      canvas.height = Math.round(altura * escala);
      pincel.setTransform(escala, 0, 0, escala, 0, 0);
    };
    medir();
    window.addEventListener("resize", medir);

    // Metade estoura do meio da manchete para cima; a outra metade cai do alto.
    const pecas = Array.from({ length: 120 }, (_, i) => {
      const estouro = i % 2 === 0;
      const angulo = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      const velocidade = 7 + Math.random() * 8;
      return {
        x: estouro ? largura / 2 : Math.random() * largura,
        y: estouro ? Math.min(altura * 0.3, 260) : -20 - Math.random() * altura * 0.4,
        vx: estouro ? Math.cos(angulo) * velocidade : (Math.random() - 0.5) * 2,
        vy: estouro ? Math.sin(angulo) * velocidade : 1.5 + Math.random() * 2.5,
        larg: 6 + Math.random() * 5,
        alt: 9 + Math.random() * 7,
        giro: Math.random() * Math.PI,
        vGiro: (Math.random() - 0.5) * 0.35,
        balanco: Math.random() * Math.PI * 2,
        cor: cores[i % cores.length],
      };
    });

    const DURACAO = 3200;
    let inicio = 0;
    let anterior = 0;
    let quadro = 0;
    const desenhar = (t: number) => {
      if (!inicio) inicio = anterior = t;
      const passado = t - inicio;
      // Passo proporcional ao tempo (o mesmo em telas de 60 Hz e 120 Hz).
      const k = Math.min(3, (t - anterior) / 16.7);
      anterior = t;
      pincel.clearRect(0, 0, largura, altura);
      if (passado >= DURACAO) return;
      pincel.globalAlpha = passado > DURACAO - 700 ? Math.max(0, (DURACAO - passado) / 700) : 1;
      for (const p of pecas) {
        p.vy = Math.min(p.vy + 0.22 * k, 6);
        p.vx *= Math.pow(0.985, k);
        p.x += (p.vx + Math.sin(p.balanco + passado / 280) * 0.7) * k;
        p.y += p.vy * k;
        p.giro += p.vGiro * k;
        pincel.save();
        pincel.translate(p.x, p.y);
        pincel.rotate(p.giro);
        pincel.fillStyle = p.cor;
        // O "achatamento" faz a peça parecer girar no ar.
        pincel.fillRect(-p.larg / 2, -p.alt / 2, p.larg, p.alt * (0.35 + 0.65 * Math.abs(Math.cos(p.giro * 1.7))));
        pincel.restore();
      }
      quadro = requestAnimationFrame(desenhar);
    };
    quadro = requestAnimationFrame(desenhar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", medir);
    };
  }, []);

  return <canvas ref={tela} aria-hidden className="pointer-events-none fixed inset-0 z-10 size-full" />;
}
