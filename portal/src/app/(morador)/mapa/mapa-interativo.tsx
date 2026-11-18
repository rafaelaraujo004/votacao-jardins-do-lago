"use client";

/**
 * Mapa das casas — PLANTA REAL do condomínio (225 lotes, dados em src/lib/planta.ts).
 * - Digite o número da casa (ou toque nela) para destacá-la.
 * - "Como chegar": desenha o caminho pelas ruas desde a PORTARIA (embaixo, à
 *   esquerda) até a casa, com o passo a passo (src/lib/rotas.ts).
 * - Pinça com dois dedos para aproximar/afastar; um dedo (ou o mouse) arrasta.
 *   No computador: Ctrl + roda do mouse ou a pinça do touchpad.
 * - Botões +, − e "ver o condomínio inteiro".
 * O zoom da PÁGINA continua bloqueado (BloqueioZoom); só o mapa amplia.
 * As cores usam os tokens do portal (var(--...)), então funcionam no claro e no escuro.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type PointerEvent as EventoPonteiro,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { ChevronDown, MapPin, Maximize, Navigation, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { cx } from "@/lib/cx";
import { AREA_DESENHO, CONTORNO_TERRENO, LOTES, QUADRAS, TOTAL_LOTES, loteDoNumero, type Lote } from "@/lib/planta";
import { rotaAte, type Rota } from "@/lib/rotas";

/** 1 = a planta inteira cabe na moldura. Até 6x (números grandes no celular). */
const ESCALA_MIN = 1;
const ESCALA_MAX = 6;
/** Ao achar uma casa, aproxima pelo menos até aqui. */
const ESCALA_AO_ACHAR = 2.2;
/** Cada toque em + ou − muda o tamanho nesta proporção. */
const PASSO_BOTAO = 1.5;

// Cores (tokens do portal)
const COR = {
  fundo: "var(--surface-2)",
  rua: "var(--line)",
  gramado: "var(--ok-soft)",
  casa: "var(--sand)",
  casaBorda: "var(--line-strong)",
  casaTexto: "var(--texto-areia)",
  achada: "var(--plum)",
  achadaTexto: "var(--canvas)",
  rota: "var(--plum)",
  lago: "var(--petala-azul)",
  verde: "var(--pine)",
  arvore: "var(--petala-verde)",
  sobreVerde: "var(--canvas)",
  texto: "var(--ink)",
  suave: "var(--muted)",
};

const TELA_ESTREITA = "(max-width: 640px)";
function assinarTela(avisar: () => void) {
  const m = window.matchMedia(TELA_ESTREITA);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
}
const ehTelaEstreita = () => window.matchMedia(TELA_ESTREITA).matches;

const limitar = (v: number) => Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, v));
const pontos = (p: readonly (readonly [number, number])[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

// Árvores do parque (decoração).
const ARVORES: [number, number][] = [
  [330, 230], [420, 215], [455, 250], [500, 225], [430, 300], [470, 330], [520, 300],
  [330, 320], [360, 350], [545, 345], [600, 330], [310, 470], [620, 470],
];

/** Espaço interno da caixa: a busca (em cima) e o cartão (embaixo) não tapam o desenho. */
const RESPIRO = { cima: 68, baixo: 128, lados: 6 };

export function MapaInterativo() {
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [comoChegar, setComoChegar] = useState(false);
  // Passo a passo da rota: começa recolhido para não tapar o mapa.
  const [passosAbertos, setPassosAbertos] = useState(false);

  // null = a pessoa ainda não mexeu no zoom: no celular começa aproximado,
  // porque a planta inteira fica pequena demais numa tela estreita.
  const [escalaEscolhida, setEscalaEscolhida] = useState<number | null>(null);
  const celular = useSyncExternalStore(assinarTela, ehTelaEstreita, () => false);
  const escala = escalaEscolhida ?? (celular ? 2 : 1);

  const refCaixa = useRef<HTMLDivElement>(null);
  const refMoldura = useRef<HTMLDivElement>(null);
  const refSvg = useRef<SVGSVGElement>(null);
  // Largura (px) do desenho quando a planta inteira cabe na caixa (escala 1).
  const [base, setBase] = useState(0);

  const { x: vx, y: vy, w: vw, h: vh } = AREA_DESENHO;

  // O mapa ocupa exatamente o espaço livre da tela: do ponto onde começa até a
  // barra de baixo (celular) ou até o fim da janela (computador). O topo do
  // portal muda de altura (faixa de demonstração, nome em duas linhas...), por
  // isso é medido de verdade em vez de um número fixo.
  useEffect(() => {
    const moldura = refMoldura.current;
    const caixa = refCaixa.current;
    if (!moldura || !caixa) return;
    function ajustarAltura() {
      if (!moldura) return;
      const topo = moldura.getBoundingClientRect().top + window.scrollY;
      const barra = document.querySelector<HTMLElement>('nav[aria-label="Menu principal"]');
      const barraFixa = barra && getComputedStyle(barra).position === "fixed";
      const reserva = barraFixa ? barra.getBoundingClientRect().height + 12 : 24;
      moldura.style.height = `${Math.max(360, Math.round(window.innerHeight - topo - reserva))}px`;
    }
    // Tamanho "planta inteira": cabe na largura E na altura livres da caixa.
    const medirBase = () => {
      const largura = caixa.clientWidth - RESPIRO.lados * 2;
      const altura = caixa.clientHeight - RESPIRO.cima - RESPIRO.baixo;
      setBase(Math.max(200, Math.min(largura, (altura * vw) / vh)));
    };
    const observador = new ResizeObserver(medirBase);
    observador.observe(caixa);
    ajustarAltura();
    // Mede já na abertura (o observador pode demorar a avisar, ex.: aba em segundo plano).
    const primeira = setTimeout(medirBase, 0);
    window.addEventListener("resize", ajustarAltura);
    return () => {
      clearTimeout(primeira);
      observador.disconnect();
      window.removeEventListener("resize", ajustarAltura);
    };
  }, [vw, vh]);

  /**
   * Muda o zoom mantendo o ponto do desenho que está sob (telaX, telaY)
   * exatamente no mesmo lugar da tela (é o que faz a pinça parecer "presa" nos dedos).
   * `ancora`: fração (0 a 1) do desenho que deve ficar sob o ponto; se faltar,
   * usa o que está lá agora.
   */
  const zoomEm = useCallback(
    (nova: number, telaX: number, telaY: number, ancora?: { fx: number; fy: number }) => {
      const caixa = refCaixa.current;
      const svg = refSvg.current;
      if (!caixa || !svg) return;
      const antes = svg.getBoundingClientRect();
      const fx = ancora?.fx ?? (telaX - antes.left) / antes.width;
      const fy = ancora?.fy ?? (telaY - antes.top) / antes.height;
      flushSync(() => setEscalaEscolhida(limitar(nova)));
      const depois = svg.getBoundingClientRect();
      caixa.scrollLeft += depois.left + fx * depois.width - telaX;
      caixa.scrollTop += depois.top + fy * depois.height - telaY;
    },
    [],
  );

  /** Zoom pelos botões: em volta do centro da caixa. */
  function zoomBotao(fator: number) {
    const c = refCaixa.current?.getBoundingClientRect();
    if (!c) return;
    zoomEm(escala * fator, c.left + c.width / 2, c.top + c.height / 2);
  }

  // ---------- Toque, mouse e pinça ----------

  // Dedos (ou o mouse) apertados agora, pela identificação de cada um.
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  // Arraste com um dedo/mouse: onde começou e se já virou arraste (aí NÃO marca casa).
  const arraste = useRef<{ x: number; y: number; left: number; top: number; moveu: boolean } | null>(null);
  // Pinça com dois dedos: distância inicial, zoom inicial e o ponto do desenho entre os dedos.
  const pinca = useRef<{ dist: number; escala: number; fx: number; fy: number } | null>(null);
  const acabouDeArrastar = useRef(false);
  const [arrastando, setArrastando] = useState(false);

  /** "Segura" o dedo/mouse na caixa (continua recebendo o movimento fora dela). Nunca trava o gesto. */
  function segurar(id: number) {
    try {
      refCaixa.current?.setPointerCapture(id);
    } catch {
      // ponteiro que o navegador já soltou: segue sem segurar
    }
  }

  function comecarArraste(x: number, y: number) {
    const caixa = refCaixa.current;
    if (!caixa) return;
    arraste.current = { x, y, left: caixa.scrollLeft, top: caixa.scrollTop, moveu: false };
  }

  function dadosDaPinca() {
    const [a, b] = [...ponteiros.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), meioX: (a.x + b.x) / 2, meioY: (a.y + b.y) / 2 };
  }

  function aoApertar(e: EventoPonteiro<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Mexeu no mapa: recolhe o passo a passo para a rota aparecer inteira.
    setPassosAbertos(false);
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.current.size === 1) {
      comecarArraste(e.clientX, e.clientY);
    } else if (ponteiros.current.size === 2 && refSvg.current) {
      // Segundo dedo: vira pinça (e o toque não marca casa).
      segurar(e.pointerId);
      const { dist, meioX, meioY } = dadosDaPinca();
      const r = refSvg.current.getBoundingClientRect();
      pinca.current = { dist: Math.max(dist, 10), escala, fx: (meioX - r.left) / r.width, fy: (meioY - r.top) / r.height };
      arraste.current = null;
      acabouDeArrastar.current = true;
    }
  }

  function aoMover(e: EventoPonteiro<HTMLDivElement>) {
    if (!ponteiros.current.has(e.pointerId)) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const p = pinca.current;
    if (p && ponteiros.current.size >= 2) {
      const { dist, meioX, meioY } = dadosDaPinca();
      zoomEm(p.escala * (dist / p.dist), meioX, meioY, { fx: p.fx, fy: p.fy });
      return;
    }

    const a = arraste.current;
    const caixa = refCaixa.current;
    if (!a || !caixa) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.moveu && Math.hypot(dx, dy) < 6) return; // tremidinha do toque não conta
    if (!a.moveu) {
      a.moveu = true;
      setArrastando(true);
      segurar(e.pointerId);
    }
    caixa.scrollLeft = a.left - dx;
    caixa.scrollTop = a.top - dy;
  }

  function aoSoltar(e: EventoPonteiro<HTMLDivElement>) {
    ponteiros.current.delete(e.pointerId);
    try {
      if (refCaixa.current?.hasPointerCapture(e.pointerId)) refCaixa.current.releasePointerCapture(e.pointerId);
    } catch {
      // já solto
    }
    if (pinca.current) {
      if (ponteiros.current.size < 2) pinca.current = null;
      // Sobrou um dedo: continua arrastando a partir de onde ele está (sem pulo).
      const resto = [...ponteiros.current.values()][0];
      if (resto) {
        comecarArraste(resto.x, resto.y);
        if (arraste.current) arraste.current.moveu = true;
      }
      return;
    }
    const a = arraste.current;
    arraste.current = null;
    if (!a?.moveu) return;
    acabouDeArrastar.current = true; // o "click" que vem logo depois é ignorado
    setArrastando(false);
  }

  // Tamanho "planta inteira" sempre à mão para o ouvinte da roda do mouse.
  const baseRef = useRef(0);
  useEffect(() => {
    baseRef.current = base;
  }, [base]);

  // Computador: Ctrl + roda do mouse (e a pinça do touchpad) amplia o mapa.
  // O ouvinte precisa ser "não passivo" para impedir o zoom da página.
  useEffect(() => {
    const caixa = refCaixa.current;
    if (!caixa) return;
    const aoRolar = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // rolar normal continua rolando o mapa
      e.preventDefault();
      const svg = refSvg.current;
      if (!svg) return;
      const atual = svg.getBoundingClientRect().width / Math.max(1, baseRef.current);
      zoomEm(atual * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    caixa.addEventListener("wheel", aoRolar, { passive: false });
    return () => caixa.removeEventListener("wheel", aoRolar);
  }, [zoomEm]);

  // ---------- Casa escolhida e rota ----------

  const lote = selecionado ? loteDoNumero(selecionado) : null;
  const rota = useMemo(() => (comoChegar && selecionado ? rotaAte(selecionado) : null), [comoChegar, selecionado]);

  /** Centraliza na caixa um retângulo do desenho (coordenadas da planta). */
  const centralizar = useCallback(
    (x: number, y: number) => {
      const caixa = refCaixa.current;
      const svg = refSvg.current;
      if (!caixa || !svg) return;
      const r = svg.getBoundingClientRect();
      const c = caixa.getBoundingClientRect();
      const px = r.left + ((x - vx) / vw) * r.width;
      const py = r.top + ((y - vy) / vh) * r.height;
      caixa.scrollLeft += px - (c.left + c.width / 2);
      caixa.scrollTop += py - (c.top + c.height / 2 - (RESPIRO.baixo - RESPIRO.cima) / 2);
    },
    [vx, vy, vw, vh],
  );

  // Casa escolhida (sem rota): centraliza a casa.
  useEffect(() => {
    if (!lote || rota) return;
    const id = requestAnimationFrame(() => centralizar(lote.x + lote.w / 2, lote.y + lote.h / 2));
    return () => cancelAnimationFrame(id);
    // só quando a casa muda (não a cada passo da pinça)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote?.numero, rota, base]);

  // Rota ligada: enquadra o caminho inteiro (da portaria até a casa).
  useEffect(() => {
    if (!rota || !refCaixa.current || !base) return;
    const xs = [...rota.pontos.map((p) => p[0]), rota.casa[0]];
    const ys = [...rota.pontos.map((p) => p[1]), rota.casa[1]];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const caixa = refCaixa.current;
    const pxPorUnidade = base / vw;
    const cabeX = (caixa.clientWidth * 0.8) / ((x1 - x0 + 40) * pxPorUnidade);
    const cabeY = ((caixa.clientHeight - RESPIRO.cima - RESPIRO.baixo) * 0.82) / ((y1 - y0 + 60) * pxPorUnidade);
    setEscalaEscolhida(limitar(Math.min(cabeX, cabeY, 3)));
    const id = requestAnimationFrame(() => requestAnimationFrame(() => centralizar((x0 + x1) / 2, (y0 + y1) / 2)));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rota]);

  /** Lê o número digitado. Devolve null se não for uma casa válida. */
  function numeroValido(texto: string): number | null {
    if (!/^\d{1,3}$/.test(texto.trim())) return null;
    const n = Number(texto.trim());
    return n >= 1 && n <= TOTAL_LOTES ? n : null;
  }

  function escolher(n: number) {
    setSelecionado(n);
    if (escala < ESCALA_AO_ACHAR && !comoChegar) setEscalaEscolhida(ESCALA_AO_ACHAR); // aproxima para a casa aparecer bem
  }

  // A casa tocada no desenho chega aqui (função estável: o desenho não é refeito à toa).
  const refEscolher = useRef(escolher);
  useEffect(() => {
    refEscolher.current = escolher;
  });
  const tocouNaCasa = useCallback((n: number) => {
    if (acabouDeArrastar.current) {
      acabouDeArrastar.current = false;
      return;
    }
    refEscolher.current(n);
  }, []);

  function aoDigitar(valor: string) {
    const limpo = valor.replace(/\D/g, "").slice(0, 3);
    setBusca(limpo);
    if (!limpo) {
      setErro("");
      return;
    }
    const n = numeroValido(limpo);
    if (n) {
      setErro("");
      escolher(n);
    } else {
      setErro(`Digite um número de casa de 1 a ${TOTAL_LOTES}.`);
    }
  }

  function aoBuscar(e: FormEvent) {
    e.preventDefault();
    const n = numeroValido(busca);
    if (!n) {
      setErro(`Digite um número de casa de 1 a ${TOTAL_LOTES}.`);
      return;
    }
    setErro("");
    escolher(n);
  }

  function limpar() {
    setSelecionado(null);
    setComoChegar(false);
    setBusca("");
    setErro("");
  }

  const largura = base ? Math.round(base * escala) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Moldura do mapa: ocupa quase a tela toda; busca, zoom e a casa escolhida ficam POR CIMA. */}
      <div
        ref={refMoldura}
        className="afundado relative h-[calc(100dvh-24rem)] min-h-[360px] overflow-hidden rounded-[var(--radius-card)] lg:h-[calc(100dvh-11rem)]"
      >
        <div
          ref={refCaixa}
          onPointerDown={aoApertar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onClickCapture={() => {
            // clique que terminou um arraste ou pinça: some no próximo quadro
            if (acabouDeArrastar.current) requestAnimationFrame(() => (acabouDeArrastar.current = false));
          }}
          // touch-none: o próprio mapa cuida do dedo (arrastar e pinça), sem o navegador rolar a página.
          className={cx(
            "absolute inset-0 touch-none overflow-auto overscroll-contain select-none [scrollbar-width:thin]",
            arrastando ? "cursor-grabbing" : "cursor-grab",
          )}
          // Com a rota ligada, sobra espaço embaixo e em cima do desenho: assim dá para
          // rolar a rota (que costuma terminar perto da portaria, no pé do desenho) para
          // longe do cartão e da busca.
          style={{
            padding: rota
              ? `max(${RESPIRO.cima}px, 22vh) ${RESPIRO.lados}px max(${RESPIRO.baixo}px, 45vh)`
              : `${RESPIRO.cima}px ${RESPIRO.lados}px ${RESPIRO.baixo}px`,
          }}
        >
          <svg
            ref={refSvg}
            viewBox={`${vx} ${vy} ${vw} ${vh}`}
            role="img"
            aria-label={`Planta do condomínio com ${TOTAL_LOTES} casas, lago, área de lazer, quadra de esportes e portaria.`}
            className={cx("mx-auto block max-w-none", !base && "invisible")}
            style={{ width: largura || "100%", height: largura ? Math.round((largura * vh) / vw) : "auto" }}
          >
            <Desenho escolhida={lote} rota={rota} aoTocar={tocouNaCasa} />
          </svg>
        </div>

        {/* Busca (por cima do mapa) */}
        <form
          onSubmit={aoBuscar}
          role="search"
          aria-label="Encontre uma casa"
          className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col items-start gap-1.5"
        >
          <label htmlFor="busca-casa" className="sr-only">
            Encontre uma casa pelo número
          </label>
          <div className="pointer-events-auto flex w-full gap-1.5 rounded-full border border-borda-luz bg-surface/95 p-1 shadow-card backdrop-blur">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                id="busca-casa"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Nº da casa (ex.: 57)"
                value={busca}
                onChange={(e) => aoDigitar(e.target.value)}
                aria-invalid={erro ? true : undefined}
                aria-describedby="busca-erro"
                className="min-h-12 w-full rounded-full border-2 border-transparent bg-transparent pl-11 pr-3 text-[1.05rem] text-ink placeholder:text-muted focus:border-pine focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="botao-verde inline-flex min-h-12 shrink-0 items-center justify-center rounded-full px-5 font-bold active:shadow-afundado"
            >
              Achar
            </button>
          </div>
          <p
            id="busca-erro"
            role="status"
            className={cx(
              "pointer-events-auto rounded-full bg-surface/95 px-3 py-1 text-[0.9rem] font-bold text-plum shadow-card",
              !erro && "sr-only",
            )}
          >
            {erro}
          </p>
        </form>

        {/* Zoom (botões redondos à direita, por cima do mapa) */}
        <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2" role="group" aria-label="Tamanho do mapa">
          <BotaoMapa rotulo="Ampliar" onClick={() => zoomBotao(PASSO_BOTAO)} disabled={escala >= ESCALA_MAX - 0.01}>
            <ZoomIn aria-hidden className="size-5" />
          </BotaoMapa>
          <BotaoMapa rotulo="Reduzir" onClick={() => zoomBotao(1 / PASSO_BOTAO)} disabled={escala <= ESCALA_MIN + 0.01}>
            <ZoomOut aria-hidden className="size-5" />
          </BotaoMapa>
          <BotaoMapa rotulo="Ver o condomínio inteiro" onClick={() => setEscalaEscolhida(1)} disabled={escala <= ESCALA_MIN + 0.01}>
            <Maximize aria-hidden className="size-5" />
          </BotaoMapa>
        </div>
        <p className="sr-only" aria-live="polite">
          Tamanho do mapa: {Math.round(escala * 100)}%
        </p>

        {/* Casa escolhida: cartão baixo por cima do mapa. O passo a passo fica recolhido
            (abre só quando a pessoa pede) para nunca tapar a rota. */}
        <div aria-live="polite" className="pointer-events-none absolute inset-x-2 bottom-2 z-10">
          {lote ? (
            <div className="surgir pointer-events-auto flex flex-col rounded-[var(--radius-card)] border border-borda-luz border-l-[6px] border-l-plum bg-surface/95 px-2.5 py-2 shadow-card backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="hidden size-9 shrink-0 place-items-center rounded-full bg-plum-soft text-plum min-[400px]:grid">
                  <MapPin aria-hidden className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[1.1rem] font-bold leading-tight text-destaque">Casa {lote.numero}</p>
                  <p className="truncate text-[0.82rem] text-muted">{lote.trecho}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setComoChegar((v) => !v);
                    setPassosAbertos(false);
                  }}
                  aria-pressed={comoChegar}
                  className={cx(
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.9rem] font-bold active:shadow-afundado",
                    comoChegar ? "botao-verde" : "saltado text-pine",
                  )}
                >
                  <Navigation aria-hidden className="size-4" />
                  {comoChegar ? "Rota ligada" : "Como chegar"}
                </button>
                <button
                  type="button"
                  onClick={limpar}
                  aria-label="Fechar e tirar o destaque"
                  className="saltado grid size-11 shrink-0 place-items-center rounded-full text-ink active:shadow-afundado"
                >
                  <X aria-hidden className="size-5" />
                </button>
              </div>
              {rota ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPassosAbertos((v) => !v)}
                    aria-expanded={passosAbertos}
                    aria-controls="passos-rota"
                    className="mt-1 flex min-h-9 items-center justify-between gap-2 rounded-full px-1 text-left text-[0.88rem] font-bold text-pine"
                  >
                    <span>
                      {passosAbertos ? "Esconder o passo a passo" : `Passo a passo (${rota.passos.length})`}
                    </span>
                    <ChevronDown aria-hidden className={cx("size-4 transition-transform", passosAbertos && "rotate-180")} />
                  </button>
                  {passosAbertos ? (
                    <ol
                      id="passos-rota"
                      className="max-h-[30vh] list-decimal overflow-y-auto pb-1 pl-6 pr-1 text-[0.9rem] leading-snug text-ink-2"
                      aria-label={`Como chegar à casa ${lote.numero}`}
                    >
                      {rota.passos.map((passo, i) => (
                        <li key={i}>{passo}</li>
                      ))}
                    </ol>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Legenda (recolhida: o mapa é o principal) */}
      <details className="group rounded-2xl border border-borda-luz bg-surface px-4 py-1 shadow-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold text-ink">
          Legenda e dicas
          <ChevronDown aria-hidden className="size-5 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2 pb-2 text-[0.92rem]" aria-label="Legenda do mapa">
          <ItemLegenda cor={COR.casa} borda={COR.casaBorda}>
            Casa
          </ItemLegenda>
          <ItemLegenda cor={COR.achada}>Casa encontrada e rota</ItemLegenda>
          <ItemLegenda cor={COR.gramado} borda={COR.verde}>
            Áreas verdes
          </ItemLegenda>
          <ItemLegenda cor={COR.lago}>Lago</ItemLegenda>
          <ItemLegenda cor={COR.rua} borda={COR.casaBorda}>
            Ruas
          </ItemLegenda>
          <ItemLegenda cor="var(--petala-laranja)">Quadra de esportes</ItemLegenda>
        </ul>
        <p className="pb-3 text-[0.88rem] text-muted">
          Use dois dedos (pinça) para aproximar ou afastar e um dedo para andar pelo mapa. No computador: arraste com o mouse e
          use Ctrl + roda para o zoom. Toque numa casa e em <b>Como chegar</b> para ver o caminho desde a portaria. Desenho
          feito a partir da planta oficial, sem escala.
        </p>
      </details>
    </div>
  );
}

/**
 * O desenho da planta. Fica separado e "memorizado": durante a pinça só o
 * tamanho muda, então as 225 casas não são redesenhadas a cada movimento.
 */
const Desenho = memo(function Desenho({
  escolhida,
  rota,
  aoTocar,
}: {
  escolhida: Lote | null;
  rota: Rota | null;
  aoTocar: (n: number) => void;
}) {
  const { x: vx, y: vy, w: vw, h: vh } = AREA_DESENHO;
  return (
    <>
      <defs>
        {/* Pontilhado das áreas verdes (como na planta). */}
        <pattern id="pontilhado" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill={COR.gramado} />
          <circle cx="4" cy="4" r="1.3" fill={COR.arvore} opacity="0.45" />
          <circle cx="11" cy="11" r="1.3" fill={COR.arvore} opacity="0.45" />
        </pattern>
      </defs>

      <rect x={vx} y={vy} width={vw} height={vh} rx={18} fill={COR.fundo} />

      {/* Terreno: o que não é quadra nem área verde é rua. */}
      <polygon points={pontos(CONTORNO_TERRENO)} fill={COR.rua} />

      {/* APP (área de preservação) à esquerda do parque */}
      <rect x={112} y={292} width={164} height={212} rx={8} fill="url(#pontilhado)" />
      <text x={194} y={402} textAnchor="middle" fontSize={15} fontWeight={700} fill={COR.suave}>
        APP
      </text>
      <text x={194} y={420} textAnchor="middle" fontSize={10} fill={COR.suave}>
        área de preservação
      </text>

      {/* Parque, lago e área de lazer */}
      <path d="M298 214 L360 214 L560 214 L652 290 L652 410 L640 418 L640 505 L298 505 Z" fill="url(#pontilhado)" />
      <path
        d="M362 410 Q372 382 420 386 Q470 392 520 380 Q590 372 604 410 Q616 455 590 486 Q556 506 470 498 Q392 502 368 476 Q352 448 362 410 Z"
        fill={COR.lago}
        opacity={0.8}
      />
      <path d="M430 420 v52 M470 414 v62" stroke={COR.sobreVerde} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
      <text x={530} y={452} textAnchor="middle" fontSize={18} fontWeight={700} fill={COR.sobreVerde} className="font-display">
        Lago
      </text>

      {/* Trilha do parque */}
      <path
        d="M318 360 Q300 330 330 318 Q372 300 392 262 Q420 220 470 232 Q520 246 512 300 Q506 336 540 340"
        fill="none"
        stroke={COR.rua}
        strokeWidth={8}
        strokeLinecap="round"
      />
      {ARVORES.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={7} fill={COR.arvore} opacity={0.75} />
      ))}

      {/* Playground */}
      <rect x={350} y={222} width={48} height={40} rx={10} fill="var(--petala-amarelo)" opacity={0.85} />
      <text x={374} y={277} textAnchor="middle" fontSize={10} fontWeight={700} fill={COR.texto}>
        Playground
      </text>

      {/* Quiosque / salão */}
      <rect x={526} y={238} width={56} height={26} rx={4} fill="var(--petala-rosa)" opacity={0.85} />
      <text x={554} y={278} textAnchor="middle" fontSize={10} fontWeight={700} fill={COR.texto}>
        Quiosques
      </text>

      {/* Quadra de esportes (inclinada, como na planta) */}
      <g transform="rotate(37 610 335)">
        <rect x={572} y={312} width={78} height={46} rx={3} fill="var(--petala-laranja)" opacity={0.8} />
        <line x1={611} y1={312} x2={611} y2={358} stroke={COR.sobreVerde} strokeWidth={1.5} />
        <circle cx={611} cy={335} r={7} fill="none" stroke={COR.sobreVerde} strokeWidth={1.5} />
      </g>
      <text x={612} y={392} textAnchor="middle" fontSize={10} fontWeight={700} fill={COR.texto}>
        Quadra
      </text>

      {/* Quadras de casas */}
      {QUADRAS.map((q) => (
        <polygon key={q.id} points={pontos(q.contorno)} fill="url(#pontilhado)" stroke={COR.casaBorda} strokeWidth={1.5} />
      ))}

      {LOTES.map((l) => (
        <CasaNoMapa key={l.numero} lote={l} escolhida={false} aoTocar={aoTocar} />
      ))}

      {/* Portaria e entrada */}
      <rect x={268} y={895} width={56} height={100} fill={COR.rua} />
      <circle cx={296} cy={858} r={30} fill={COR.rua} />
      <circle cx={296} cy={858} r={17} fill={COR.arvore} opacity={0.85} />

      {/* Rota: da portaria até a frente da casa (contorno claro por baixo, para aparecer sobre qualquer cor). */}
      {rota ? (
        <g pointerEvents="none">
          <polyline points={pontos(rota.pontos)} fill="none" stroke={COR.sobreVerde} strokeWidth={13} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={pontos(rota.pontos)} fill="none" stroke={COR.rota} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
          <polyline
            points={pontos(rota.pontos)}
            fill="none"
            stroke={COR.sobreVerde}
            strokeWidth={2.5}
            strokeDasharray="2 16"
            strokeLinecap="round"
            className="rota-andando"
          />
          <line
            x1={rota.pontos.at(-1)![0]}
            y1={rota.pontos.at(-1)![1]}
            x2={rota.casa[0]}
            y2={rota.casa[1]}
            stroke={COR.rota}
            strokeWidth={4}
            strokeDasharray="5 5"
            strokeLinecap="round"
          />
        </g>
      ) : null}

      <rect x={272} y={918} width={48} height={26} rx={6} fill={COR.verde} />
      <text x={296} y={935} textAnchor="middle" fontSize={11} fontWeight={700} fill={COR.sobreVerde} className="font-display">
        Portaria
      </text>
      {rota ? (
        <text x={330} y={960} fontSize={12} fontWeight={700} fill={COR.rota}>
          Entrada
        </text>
      ) : null}
      <text x={366} y={985} textAnchor="middle" fontSize={12} fill={COR.suave}>
        ↓ PA-160
      </text>

      {/* A casa escolhida é desenhada por último para ficar por cima. */}
      {escolhida ? <CasaNoMapa lote={escolhida} escolhida aoTocar={aoTocar} /> : null}
    </>
  );
});

/** Botão redondo que fica por cima do mapa (zoom). */
function BotaoMapa({
  rotulo,
  onClick,
  disabled,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      className="grid size-12 place-items-center rounded-full border border-borda-luz bg-surface/95 text-ink shadow-card backdrop-blur active:shadow-afundado disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Um lote (casa) no desenho. Fica fora da navegação por teclado: a busca faz esse papel. */
const CasaNoMapa = memo(function CasaNoMapa({
  lote,
  escolhida,
  aoTocar,
}: {
  lote: Lote;
  escolhida: boolean;
  aoTocar: (n: number) => void;
}) {
  // Letra do tamanho do lote: cabe em lotes estreitos (rua de baixo) e nos largos.
  const fonte = Math.min(13, lote.w * 0.42, lote.h * 0.55);
  return (
    <g
      data-casa={escolhida ? lote.numero : undefined}
      onClick={escolhida ? undefined : () => aoTocar(lote.numero)}
      className={cx(!escolhida && "cursor-pointer")}
    >
      <title>{`Casa ${lote.numero} — ${lote.trecho}`}</title>
      <rect
        x={lote.x + 0.75}
        y={lote.y + 0.75}
        width={lote.w - 1.5}
        height={lote.h - 1.5}
        rx={2}
        fill={escolhida ? COR.achada : COR.casa}
        stroke={escolhida ? COR.texto : COR.casaBorda}
        strokeWidth={escolhida ? 2.5 : 0.8}
      />
      <text
        x={lote.x + lote.w / 2}
        y={lote.y + lote.h / 2 + fonte * 0.36}
        textAnchor="middle"
        fontSize={fonte}
        fontWeight={700}
        fill={escolhida ? COR.achadaTexto : COR.casaTexto}
        pointerEvents="none"
      >
        {lote.numero}
      </text>
    </g>
  );
});

function ItemLegenda({ cor, borda, children }: { cor: string; borda?: string; children: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block size-[18px] shrink-0 rounded-[5px] border"
        style={{ backgroundColor: cor, borderColor: borda ?? "transparent" }}
      />
      {children}
    </li>
  );
}
