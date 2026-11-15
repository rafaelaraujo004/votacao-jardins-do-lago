"use client";

/**
 * Mapa das casas — PLANTA REAL do condomínio (225 lotes, dados em src/lib/planta.ts).
 * - Digite o número da casa para destacá-la.
 * - Toque numa casa para ver o número e onde ela fica.
 * - Ampliar / Reduzir mudam o tamanho do desenho.
 * - Clique e arraste (mouse) ou deslize o dedo para mover o mapa.
 * As cores usam os tokens do portal (var(--...)), então funcionam no claro e no escuro.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type PointerEvent as EventoPonteiro } from "react";
import { MapPin, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { cx } from "@/lib/cx";
import { AREA_DESENHO, CONTORNO_TERRENO, LOTES, QUADRAS, TOTAL_LOTES, loteDoNumero, type Lote } from "@/lib/planta";

// Tamanhos do desenho: 100% (planta inteira) até 400% (números bem legíveis no celular).
const ZOOMS = [1, 2, 3, 4];
/** Ao achar uma casa, aproxima pelo menos até este nível. */
const ZOOM_AO_ACHAR = 2;

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

const pontos = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(" ");

// Árvores do parque (decoração).
const ARVORES: [number, number][] = [
  [330, 230], [420, 215], [455, 250], [500, 225], [430, 300], [470, 330], [520, 300],
  [330, 320], [360, 350], [545, 345], [600, 330], [310, 470], [620, 470],
];

export function MapaInterativo() {
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState<number | null>(null);
  // null = a pessoa ainda não mexeu no zoom: no celular começa aproximado (200%),
  // porque a planta inteira fica pequena demais numa tela estreita.
  const [nivelEscolhido, setNivelEscolhido] = useState<number | null>(null);
  const celular = useSyncExternalStore(assinarTela, ehTelaEstreita, () => false);
  const nivelZoom = nivelEscolhido ?? (celular ? 1 : 0);
  const setNivelZoom = (novo: number | ((atual: number) => number)) =>
    setNivelEscolhido(typeof novo === "function" ? novo(nivelZoom) : novo);
  const refCaixa = useRef<HTMLDivElement>(null);
  // Arrastar com o mouse: guarda onde o clique começou e se virou "arraste"
  // (aí o clique NÃO escolhe casa, para não marcar uma casa sem querer).
  const arraste = useRef<{ x: number; y: number; left: number; top: number; moveu: boolean } | null>(null);
  const acabouDeArrastar = useRef(false);
  const [arrastando, setArrastando] = useState(false);


  function aoApertar(e: EventoPonteiro<HTMLDivElement>) {
    // O dedo já rola a caixa sozinho; o arraste manual é para mouse e caneta.
    if (e.pointerType === "touch" || e.button !== 0 || !refCaixa.current) return;
    arraste.current = { x: e.clientX, y: e.clientY, left: refCaixa.current.scrollLeft, top: refCaixa.current.scrollTop, moveu: false };
  }

  function aoMover(e: EventoPonteiro<HTMLDivElement>) {
    const a = arraste.current;
    const caixa = refCaixa.current;
    if (!a || !caixa) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.moveu && Math.hypot(dx, dy) < 5) return; // tremidinha do clique não conta
    if (!a.moveu) {
      a.moveu = true;
      setArrastando(true);
      caixa.setPointerCapture(e.pointerId);
    }
    caixa.scrollLeft = a.left - dx;
    caixa.scrollTop = a.top - dy;
  }

  function aoSoltar(e: EventoPonteiro<HTMLDivElement>) {
    const a = arraste.current;
    arraste.current = null;
    if (!a?.moveu) return;
    acabouDeArrastar.current = true; // o "click" que vem logo depois é ignorado
    setArrastando(false);
    if (refCaixa.current?.hasPointerCapture(e.pointerId)) refCaixa.current.releasePointerCapture(e.pointerId);
  }

  function tocouNaCasa(n: number) {
    if (acabouDeArrastar.current) {
      acabouDeArrastar.current = false;
      return;
    }
    escolher(n);
  }

  const lote = selecionado ? loteDoNumero(selecionado) : null;
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
    return n >= 1 && n <= TOTAL_LOTES ? n : null;
  }

  function escolher(n: number) {
    setSelecionado(n);
    if (nivelZoom < ZOOM_AO_ACHAR) setNivelZoom(ZOOM_AO_ACHAR); // aproxima para a casa aparecer bem
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
    setBusca("");
    setErro("");
  }

  const { x: vx, y: vy, w: vw, h: vh } = AREA_DESENHO;

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
              <p className="font-display text-[1.2rem] font-bold leading-tight text-destaque">Casa {lote.numero}</p>
              <p className="text-[0.88rem] text-muted">{lote.trecho}</p>
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
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClickCapture={() => {
          // clique que terminou um arraste: some no próximo quadro
          if (acabouDeArrastar.current) requestAnimationFrame(() => (acabouDeArrastar.current = false));
        }}
        className={cx(
          "afundado h-[72dvh] min-h-[420px] overflow-auto overscroll-contain rounded-[var(--radius-card)] p-1.5 select-none [-webkit-overflow-scrolling:touch] lg:h-[78dvh]",
          arrastando ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <svg
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          role="img"
          aria-label={`Planta do condomínio com ${TOTAL_LOTES} casas, lago, área de lazer, quadra de esportes e portaria.`}
          className="block h-auto max-w-none transition-[width] duration-200"
          style={{ width: `${zoom * 100}%` }}
        >
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
          <path
            d="M298 214 L360 214 L560 214 L652 290 L652 410 L640 418 L640 505 L298 505 Z"
            fill="url(#pontilhado)"
          />
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
            <CasaNoMapa key={l.numero} lote={l} escolhida={false} aoTocar={() => tocouNaCasa(l.numero)} />
          ))}
          {/* A casa escolhida é desenhada por último para ficar por cima. */}
          {lote ? <CasaNoMapa lote={lote} escolhida aoTocar={() => undefined} /> : null}

          {/* Portaria e entrada */}
          <rect x={268} y={895} width={56} height={100} fill={COR.rua} />
          <circle cx={296} cy={858} r={30} fill={COR.rua} />
          <circle cx={296} cy={858} r={17} fill={COR.arvore} opacity={0.85} />
          <rect x={272} y={918} width={48} height={26} rx={6} fill={COR.verde} />
          <text x={296} y={935} textAnchor="middle" fontSize={11} fontWeight={700} fill={COR.sobreVerde} className="font-display">
            Portaria
          </text>
          <text x={366} y={972} textAnchor="middle" fontSize={12} fill={COR.suave}>
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
          Áreas verdes
        </ItemLegenda>
        <ItemLegenda cor={COR.lago}>Lago</ItemLegenda>
        <ItemLegenda cor={COR.rua} borda={COR.casaBorda}>
          Ruas
        </ItemLegenda>
        <ItemLegenda cor="var(--petala-laranja)">Quadra de esportes</ItemLegenda>
      </ul>
    </div>
  );
}

/** Um lote (casa) no desenho. Fica fora da navegação por teclado: a busca faz esse papel. */
function CasaNoMapa({ lote, escolhida, aoTocar }: { lote: Lote; escolhida: boolean; aoTocar: () => void }) {
  // Letra do tamanho do lote: cabe em lotes estreitos (rua de baixo) e nos largos.
  const fonte = Math.min(13, lote.w * 0.42, lote.h * 0.55);
  return (
    <g data-casa={escolhida ? lote.numero : undefined} onClick={aoTocar} className={cx(!escolhida && "cursor-pointer")}>
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
