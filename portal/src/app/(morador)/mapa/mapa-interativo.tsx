"use client";

/**
 * Mapa das casas (planta ILUSTRATIVA, ainda não é a planta oficial).
 * - Digite o número da casa para destacá-la.
 * - Toque numa casa para ver o número e a quadra.
 * - Ampliar / Reduzir mudam o tamanho do desenho (dá para arrastar para os lados).
 * As cores usam os tokens do portal (var(--...)), então funcionam no claro e no escuro.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { cx } from "@/lib/cx";

// ---------- Dados do desenho ----------

type Quadra = { letra: string; qtd: number; x: number; y: number };

// 4 quadras com 28 casas + 4 com 27 = 220 casas. A numeração segue a ordem A, B, C... H.
const QUADRAS: Quadra[] = [
  { letra: "A", qtd: 28, x: 24, y: 120 },
  { letra: "B", qtd: 28, x: 216, y: 120 },
  { letra: "C", qtd: 28, x: 24, y: 210 },
  { letra: "D", qtd: 28, x: 216, y: 210 },
  { letra: "E", qtd: 27, x: 24, y: 300 },
  { letra: "F", qtd: 27, x: 216, y: 300 },
  { letra: "G", qtd: 27, x: 24, y: 390 },
  { letra: "H", qtd: 27, x: 216, y: 390 },
];
const LARGURA_QUADRA = 160;
const ALTURA_QUADRA = 72;
const TOTAL_CASAS = QUADRAS.reduce((soma, q) => soma + q.qtd, 0);

type Lote = { numero: number; quadra: string; x: number; y: number; w: number; h: number };

/** Calcula a posição de cada casa (metade em cima, metade embaixo em cada quadra). */
function montarLotes(): Lote[] {
  const lotes: Lote[] = [];
  let numero = 1;
  for (const q of QUADRAS) {
    const cima = Math.ceil(q.qtd / 2);
    const linhas: [number, number][] = [
      [cima, 0],
      [q.qtd - cima, ALTURA_QUADRA / 2],
    ];
    for (const [qtd, deslocY] of linhas) {
      const lw = LARGURA_QUADRA / qtd;
      for (let i = 0; i < qtd; i++) {
        lotes.push({ numero, quadra: q.letra, x: q.x + i * lw, y: q.y + deslocY + 1, w: lw - 1, h: ALTURA_QUADRA / 2 - 2 });
        numero++;
      }
    }
  }
  return lotes;
}
const LOTES = montarLotes();

// Tamanhos do desenho: 100% (inteiro) até 300%.
const ZOOMS = [1, 1.5, 2, 3];

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
  lago: "var(--petala-azul)",
  verde: "var(--pine)",
  sobreVerde: "var(--canvas)",
  texto: "var(--ink)",
  suave: "var(--muted)",
};

export function MapaInterativo() {
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [nivelZoom, setNivelZoom] = useState(0);
  const refCaixa = useRef<HTMLDivElement>(null);

  const lote = selecionado ? LOTES[selecionado - 1] : null;
  const zoom = ZOOMS[nivelZoom];

  // Sempre que a casa escolhida (ou o zoom) muda, centraliza a casa na caixa do mapa.
  useEffect(() => {
    if (!selecionado || !refCaixa.current) return;
    const caixa = refCaixa.current;
    const alvo = caixa.querySelector<SVGGElement>(`[data-casa="${selecionado}"]`);
    if (!alvo) return;
    // Espera o navegador redesenhar com o novo tamanho antes de rolar.
    const id = requestAnimationFrame(() => {
      const r = alvo.getBoundingClientRect();
      const c = caixa.getBoundingClientRect();
      caixa.scrollLeft += r.left + r.width / 2 - (c.left + c.width / 2);
      caixa.scrollTop += r.top + r.height / 2 - (c.top + c.height / 2);
    });
    return () => cancelAnimationFrame(id);
  }, [selecionado, zoom]);

  /** Lê o número digitado. Devolve null se não for uma casa válida. */
  function numeroValido(texto: string): number | null {
    if (!/^\d{1,3}$/.test(texto.trim())) return null;
    const n = Number(texto.trim());
    return n >= 1 && n <= TOTAL_CASAS ? n : null;
  }

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
      setSelecionado(n);
      if (nivelZoom === 0) setNivelZoom(1); // aproxima um pouco para a casa aparecer bem
    } else {
      setErro(`Digite um número de casa de 1 a ${TOTAL_CASAS}.`);
    }
  }

  function aoBuscar(e: FormEvent) {
    e.preventDefault();
    const n = numeroValido(busca);
    if (!n) {
      setErro(`Digite um número de casa de 1 a ${TOTAL_CASAS}.`);
      return;
    }
    setErro("");
    setSelecionado(n);
    if (nivelZoom === 0) setNivelZoom(1);
  }

  function limpar() {
    setSelecionado(null);
    setBusca("");
    setErro("");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Busca */}
      <form onSubmit={aoBuscar} role="search" aria-label="Encontre uma casa" className="flex flex-col gap-2">
        <label htmlFor="busca-casa" className="font-display text-[1.05rem] font-bold text-destaque">
          Encontre uma casa
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input
              id="busca-casa"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Nº da casa (ex.: 57)"
              value={busca}
              onChange={(e) => aoDigitar(e.target.value)}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? "busca-erro" : undefined}
              className="afundado min-h-[52px] w-full rounded-full border-2 border-transparent pl-12 pr-4 text-[1.05rem] text-ink placeholder:text-muted focus:border-pine focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="botao-verde inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-full px-5 font-bold active:shadow-afundado"
          >
            Achar
          </button>
        </div>
        <p id="busca-erro" role="status" className="min-h-[1.2em] text-[0.92rem] font-bold text-plum">
          {erro}
        </p>
      </form>

      {/* Mini cartão da casa escolhida */}
      <div aria-live="polite">
        {lote ? (
          <div className="surgir flex items-center gap-3 rounded-[var(--radius-card)] border border-borda-luz border-l-[6px] border-l-plum bg-surface p-3 shadow-card">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-plum-soft text-plum">
              <MapPin aria-hidden className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[1.2rem] font-bold leading-tight text-destaque">
                Casa {lote.numero} — Quadra {lote.quadra}
              </p>
              <p className="text-[0.88rem] text-muted">Toque em outra casa para trocar</p>
            </div>
            <button
              type="button"
              onClick={limpar}
              aria-label="Fechar e tirar o destaque"
              className="saltado grid size-11 shrink-0 place-items-center rounded-full text-ink active:shadow-afundado"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* O desenho */}
      <div
        ref={refCaixa}
        className="afundado max-h-[62vh] overflow-auto rounded-[var(--radius-card)] p-2 [-webkit-overflow-scrolling:touch]"
      >
        <svg
          viewBox="0 0 400 600"
          role="img"
          aria-label={`Planta ilustrativa do condomínio com ${TOTAL_CASAS} casas nas quadras A a H, lago, área de lazer e portaria.`}
          className="block h-auto max-w-none transition-[width] duration-200"
          style={{ width: `${zoom * 100}%` }}
        >
          <rect x={0} y={0} width={400} height={600} rx={12} fill={COR.fundo} />

          {/* Lago */}
          <path d="M0 0 H400 V62 Q330 92 240 76 Q150 60 80 84 Q30 98 0 86Z" fill={COR.lago} opacity={0.85} />
          <path d="M60 36 h40 M170 24 h50 M280 44 h44 M120 58 h30" stroke={COR.sobreVerde} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          <text x={200} y={46} textAnchor="middle" fontSize={15} fontWeight={700} fill={COR.sobreVerde} className="font-display">
            Lago
          </text>

          {/* Ruas */}
          <rect x={190} y={96} width={20} height={470} fill={COR.rua} />
          {[104, 194, 284, 374, 464].map((y) => (
            <rect key={y} x={14} y={y} width={372} height={12} fill={COR.rua} />
          ))}

          {/* Quadras e casas */}
          {QUADRAS.map((q) => {
            const lx = q.x < 200 ? q.x - 12 : q.x + LARGURA_QUADRA + 12;
            return (
              <g key={q.letra}>
                <rect x={q.x - 2} y={q.y - 2} width={LARGURA_QUADRA + 4} height={ALTURA_QUADRA + 4} rx={6} fill={COR.gramado} />
                <circle cx={lx} cy={q.y + ALTURA_QUADRA / 2} r={9} fill={COR.verde} />
                <text
                  x={lx}
                  y={q.y + ALTURA_QUADRA / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={COR.sobreVerde}
                  className="font-display"
                >
                  {q.letra}
                </text>
              </g>
            );
          })}

          {LOTES.map((l) => (
            <CasaNoMapa key={l.numero} lote={l} escolhida={false} aoTocar={() => setSelecionado(l.numero)} />
          ))}
          {/* A casa escolhida é desenhada por último para ficar por cima. */}
          {lote ? <CasaNoMapa lote={lote} escolhida aoTocar={() => undefined} /> : null}

          {/* Área de lazer */}
          <rect x={14} y={480} width={172} height={72} rx={8} fill={COR.gramado} stroke={COR.verde} strokeWidth={1} />
          <rect x={214} y={480} width={172} height={72} rx={8} fill={COR.gramado} stroke={COR.verde} strokeWidth={1} />
          <rect x={24} y={490} width={70} height={36} rx={10} fill={COR.lago} opacity={0.75} />
          <text x={59} y={512} textAnchor="middle" fontSize={9} fontWeight={700} fill={COR.texto}>
            Piscina
          </text>
          <rect x={102} y={490} width={76} height={36} rx={4} fill={COR.fundo} stroke={COR.achada} strokeWidth={1.5} />
          <text x={140} y={511} textAnchor="middle" fontSize={8} fontWeight={700} fill={COR.achada}>
            Salão de festas
          </text>
          <text x={100} y={545} textAnchor="middle" fontSize={9} fontWeight={700} fill={COR.texto}>
            Área de lazer
          </text>
          <rect x={224} y={488} width={86} height={46} rx={3} fill="var(--petala-laranja)" opacity={0.75} />
          <line x1={267} y1={488} x2={267} y2={534} stroke={COR.fundo} strokeWidth={1.2} />
          <text x={267} y={546} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={COR.texto}>
            Quadra
          </text>
          <circle cx={348} cy={510} r={22} fill="var(--petala-amarelo)" opacity={0.8} />
          <text x={348} y={513} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={COR.texto}>
            Playground
          </text>

          {/* Árvores decorativas */}
          {[
            [30, 98],
            [380, 98],
            [188, 470],
            [212, 470],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={COR.verde} />
          ))}

          {/* Portaria */}
          <rect x={170} y={562} width={60} height={30} rx={6} fill={COR.verde} />
          <text x={200} y={581} textAnchor="middle" fontSize={10} fontWeight={700} fill={COR.sobreVerde} className="font-display">
            Portaria
          </text>
          <text x={262} y={584} textAnchor="middle" fontSize={9} fill={COR.suave}>
            ↓ PA-160
          </text>
        </svg>
      </div>

      {/* Ampliar / Reduzir */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setNivelZoom((z) => Math.min(z + 1, ZOOMS.length - 1))}
          disabled={nivelZoom === ZOOMS.length - 1}
          className="saltado inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-3 font-bold text-ink active:shadow-afundado disabled:opacity-50"
        >
          <ZoomIn aria-hidden className="size-5" /> Ampliar
        </button>
        <button
          type="button"
          onClick={() => setNivelZoom((z) => Math.max(z - 1, 0))}
          disabled={nivelZoom === 0}
          className="saltado inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-3 font-bold text-ink active:shadow-afundado disabled:opacity-50"
        >
          <ZoomOut aria-hidden className="size-5" /> Reduzir
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        Tamanho do mapa: {Math.round(zoom * 100)}%
      </p>

      {/* Legenda (cor + texto) */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.92rem]" aria-label="Legenda do mapa">
        <ItemLegenda cor={COR.casa} borda={COR.casaBorda}>
          Casa
        </ItemLegenda>
        <ItemLegenda cor={COR.achada}>Casa encontrada</ItemLegenda>
        <ItemLegenda cor={COR.gramado} borda={COR.verde}>
          Lazer e jardins
        </ItemLegenda>
        <ItemLegenda cor={COR.lago}>Lago</ItemLegenda>
      </ul>
    </div>
  );
}

/** Um lote (casa) no desenho. Fica fora da navegação por teclado: a busca faz esse papel. */
function CasaNoMapa({ lote, escolhida, aoTocar }: { lote: Lote; escolhida: boolean; aoTocar: () => void }) {
  return (
    <g data-casa={escolhida ? lote.numero : undefined} onClick={aoTocar} className={cx(!escolhida && "cursor-pointer")}>
      <title>{`Casa ${lote.numero} — Quadra ${lote.quadra}`}</title>
      <rect
        x={lote.x}
        y={lote.y}
        width={lote.w}
        height={lote.h}
        rx={1.5}
        fill={escolhida ? COR.achada : COR.casa}
        stroke={escolhida ? COR.texto : COR.casaBorda}
        strokeWidth={escolhida ? 1.2 : 0.6}
      />
      <text
        x={lote.x + lote.w / 2}
        y={lote.y + lote.h / 2 + 2}
        textAnchor="middle"
        fontSize={5}
        fontWeight={700}
        fill={escolhida ? COR.achadaTexto : COR.casaTexto}
        pointerEvents="none"
      >
        {lote.numero}
      </text>
    </g>
  );
}

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
