"use client";

/**
 * CENTRAL DA PORTARIA (pedido de 21/11/2026: "os botões abrem seções, para não ficar tudo na
 * mesma página").
 *
 * - Celular: uma grade de botões grandes (com os números do momento). Tocar num botão abre a
 *   seção na tela inteira, com "← Portaria" para voltar. O botão "voltar" do celular também volta.
 * - Computador/tablet deitado: os botões ficam numa coluna à esquerda e a seção aberta à direita
 *   (abre em "Validar código").
 * - A seção aberta fica no endereço (?secao=encomendas): atualizar a página ou a sincronização
 *   automática não tiram a pessoa de onde ela está.
 * - As seções ficam montadas (só escondidas): o que foi digitado num formulário não se perde ao
 *   trocar de seção.
 * Os conteúdos são desenhados no servidor e chegam prontos (props `conteudo`).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, DoorOpen, KeyRound, Package, PhoneCall, UserCheck, Users, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";

export const SECOES_PORTARIA = ["codigo", "sem-codigo", "encomendas", "dentro", "esperados"] as const;
export type IdSecaoPortaria = (typeof SECOES_PORTARIA)[number];

const ICONES = { KeyRound, PhoneCall, Package, Users, UserCheck, DoorOpen } satisfies Record<string, LucideIcon>;
export type IconePortaria = keyof typeof ICONES;

type Tom = "verde" | "lago" | "vinho" | "areia";
const TOM: Record<Tom, { chip: string; numero: string; barra: string }> = {
  verde: { chip: "bg-ok-soft text-pine", numero: "text-destaque", barra: "bg-pine" },
  lago: { chip: "bg-lake-soft text-lake", numero: "text-lake", barra: "bg-lake" },
  vinho: { chip: "bg-plum-soft text-plum", numero: "text-plum", barra: "bg-plum" },
  areia: { chip: "bg-sand text-texto-areia", numero: "text-texto-areia", barra: "bg-texto-areia" },
};

export type SecaoPortaria = {
  id: IdSecaoPortaria;
  titulo: string;
  /** Uma linha embaixo do título no botão (ex.: "ligar e registrar entrada"). */
  resumo: string;
  icone: IconePortaria;
  tom: Tom;
  /** Número grande do botão (null = sem número, ex.: Validar código). */
  numero: number | null;
  /** Pede atenção (ponto pulsando + texto), ex.: "3 sem aviso". */
  alerta?: string | null;
  conteudo: ReactNode;
};

const PADRAO: IdSecaoPortaria = "codigo";
const ehSecao = (v: string | null): v is IdSecaoPortaria => !!v && (SECOES_PORTARIA as readonly string[]).includes(v);

/** Número que "conta" até o valor (e anima quando muda). Sem animação para quem pede menos movimento. */
function NumeroAnimado({ valor }: { valor: number }) {
  const [mostrado, setMostrado] = useState(0);
  const anterior = useRef(0);
  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || de === valor) {
      setMostrado(valor);
      return;
    }
    const inicio = performance.now();
    const duracao = 650;
    let quadro = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracao);
      const suave = 1 - Math.pow(1 - p, 3);
      setMostrado(Math.round(de + (valor - de) * suave));
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor]);
  return <span className="tabular-nums">{mostrado}</span>;
}

function PontoAlerta() {
  return (
    <span aria-hidden className="relative flex size-2.5 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-texto-laranja opacity-70" />
      <span className="relative inline-flex size-2.5 rounded-full bg-texto-laranja" />
    </span>
  );
}

export function CentralPortaria({ secoes }: { secoes: SecaoPortaria[] }) {
  const params = useSearchParams();
  const pedida = params.get("secao");
  const aberta: IdSecaoPortaria | null = ehSecao(pedida) ? pedida : null;
  // No computador sempre há uma seção à direita; no celular, sem ?secao aparece a grade.
  const mostrada: IdSecaoPortaria = aberta ?? PADRAO;
  const abriuAqui = useRef(false);
  const topo = useRef<HTMLDivElement>(null);

  const abrir = useCallback((id: IdSecaoPortaria) => {
    if (id === aberta) return;
    // pushState (sem ir ao servidor): o Next acompanha o ?secao= e o "voltar" do celular funciona.
    window.history.pushState(null, "", `?secao=${id}`);
    abriuAqui.current = true;
    // Celular: a seção abre no topo da tela.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const y = (topo.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 90;
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" as ScrollBehavior });
    }
  }, [aberta]);

  const fechar = useCallback(() => {
    if (abriuAqui.current) {
      abriuAqui.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Esc fecha a seção no celular.
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]") && window.matchMedia("(max-width: 1023px)").matches) fechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberta, fechar]);

  return (
    <div ref={topo} className="grid items-start gap-5 lg:grid-cols-[minmax(270px,330px)_1fr]">
      {/* Botões: grade no celular (some com uma seção aberta), coluna fixa no computador. */}
      <nav aria-label="Seções da portaria" className={cx("lg:sticky lg:top-24", aberta ? "hidden lg:block" : "block")}>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-2.5">
          {secoes.map((s, i) => {
            const Icone = ICONES[s.icone];
            const tom = TOM[s.tom];
            const heroi = s.id === PADRAO;
            const ativa = mostrada === s.id;
            return (
              <li key={s.id} className={cx(heroi && "col-span-2 lg:col-span-1")}>
                <button
                  type="button"
                  onClick={() => abrir(s.id)}
                  aria-current={ativa ? "page" : undefined}
                  style={{ animationDelay: `${i * 45}ms`, ...(heroi ? { backgroundImage: "linear-gradient(135deg, var(--pine), var(--pine-strong))" } : {}) }}
                  className={cx(
                    "surgir group relative flex w-full overflow-hidden rounded-[22px] text-left transition-[box-shadow,transform] duration-150 active:shadow-afundado",
                    heroi
                      ? "min-h-[112px] items-center gap-4 px-5 py-4 text-on-pine shadow-card lg:min-h-0 lg:px-4 lg:py-3.5"
                      : "saltado min-h-[132px] flex-col items-start justify-between gap-2 px-3.5 py-3.5 lg:min-h-0 lg:flex-row lg:items-center lg:gap-3 lg:py-3",
                    ativa && "lg:ring-3 lg:ring-lake lg:ring-offset-2 lg:ring-offset-canvas",
                  )}
                >
                  {heroi ? (
                    // Brilho que passa devagar pelo botão principal.
                    <span aria-hidden className="brilho-portaria pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-white/15 blur-md" />
                  ) : null}
                  <span
                    className={cx(
                      "grid shrink-0 place-items-center rounded-2xl transition-transform duration-200 group-hover:scale-105",
                      heroi ? "size-14 bg-white/15 lg:size-11" : cx("size-12 lg:size-11", tom.chip),
                    )}
                  >
                    <Icone aria-hidden className={heroi ? "size-7 lg:size-6" : "size-6"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block font-display font-extrabold leading-tight", heroi ? "text-[1.35rem] lg:text-[1.1rem]" : "text-[1.02rem] text-ink")}>
                      {s.titulo}
                    </span>
                    <span className={cx("mt-0.5 block text-[0.8rem] leading-snug", heroi ? "text-on-pine/85" : "text-muted")}>{s.resumo}</span>
                    {s.alerta ? (
                      <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2 py-0.5 text-[0.74rem] font-bold text-texto-laranja">
                        <PontoAlerta /> {s.alerta}
                      </span>
                    ) : null}
                  </span>
                  {s.numero !== null ? (
                    <span
                      className={cx(
                        "font-display text-[2.1rem] font-extrabold leading-none lg:text-[1.7rem]",
                        "absolute right-3.5 top-3 lg:static",
                        tom.numero,
                      )}
                      aria-label={`${s.numero}`}
                    >
                      <NumeroAnimado valor={s.numero} />
                    </span>
                  ) : (
                    <ChevronRight
                      aria-hidden
                      className={cx("size-6 shrink-0", heroi ? "text-on-pine/80" : "absolute right-3 top-3.5 text-muted lg:static")}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Seção aberta. No celular só aparece com ?secao=; no computador, sempre (padrão: Validar código). */}
      <div className={cx(aberta ? "block" : "hidden lg:block")}>
        {secoes.map((s) => {
          const Icone = ICONES[s.icone];
          const tom = TOM[s.tom];
          return (
            <section
              key={s.id}
              hidden={mostrada !== s.id}
              aria-labelledby={`secao-${s.id}`}
              className="secao-portaria overflow-hidden rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card"
            >
              <header className="relative flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
                <span aria-hidden className={cx("absolute inset-x-0 top-0 h-1", tom.barra)} />
                <button
                  type="button"
                  onClick={fechar}
                  className="saltado inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.9rem] font-bold text-lake lg:hidden"
                >
                  <ArrowLeft aria-hidden className="size-4" /> Portaria
                </button>
                <span className={cx("hidden size-11 shrink-0 place-items-center rounded-2xl sm:grid", tom.chip)}>
                  <Icone aria-hidden className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={`secao-${s.id}`} className="truncate text-[1.25rem] font-bold text-destaque">
                    {s.titulo}
                  </h2>
                  <p className="truncate text-[0.85rem] text-muted">{s.resumo}</p>
                </div>
                {s.numero !== null ? (
                  <span className={cx("font-display text-[1.6rem] font-extrabold tabular-nums", tom.numero)}>{s.numero}</span>
                ) : null}
              </header>
              <div className="flex flex-col gap-4 p-4 sm:p-5">{s.conteudo}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
