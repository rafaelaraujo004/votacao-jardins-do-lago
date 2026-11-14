/** Logo do condomínio e as pétalas decorativas (cores da logo). */
import Image from "next/image";
import { cx } from "@/lib/cx";

export function Logo({ largura = 112, className }: { largura?: number; className?: string }) {
  return (
    <span className={cx("inline-flex rounded-[14px] bg-surface-clara px-2 py-1 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]", className)}>
      <Image
        src="/logo-jardins-do-lago.png"
        alt="Residencial Jardins do Lago"
        width={largura}
        height={Math.round((largura * 358) / 630)}
        priority
      />
    </span>
  );
}

const CORES_PETALAS = ["#f08a24", "#f5c518", "#8cc63f", "#3d8fd1", "#e6427a", "#8e5bb5"];

/** Flor de pétalas, só decorativa (escondida de leitores de tela). */
export function Petalas({ tamanho = 120, className }: { tamanho?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="-50 -50 100 100"
      width={tamanho}
      height={tamanho}
      className={cx("pointer-events-none", className)}
    >
      {CORES_PETALAS.map((cor, i) => (
        <path
          key={cor}
          d="M0 0 C 8 -12, 10 -30, 0 -46 C -6 -30, -8 -14, 0 0 Z"
          fill={cor}
          opacity={0.85}
          transform={`rotate(${i * 60 + 15})`}
        />
      ))}
      <circle r="4" fill="#fff" opacity={0.9} />
    </svg>
  );
}
