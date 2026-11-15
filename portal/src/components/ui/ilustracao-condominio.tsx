/**
 * Ilustração do condomínio (desenho, não foto): céu, lago, casas, árvores
 * e a flor da logo. As cores são fixas porque é uma "pintura": fica igual
 * nos modos claro e escuro.
 */
import { cx } from "@/lib/cx";

const PETALAS = ["#f08a24", "#f5c518", "#e6427a", "#8cc63f", "#3d8fd1", "#8e5bb5"];

function Casa({ x, y, telhado, parede = "#fbf7ea", escala = 1 }: { x: number; y: number; telhado: string; parede?: string; escala?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <rect x="0" y="14" width="34" height="22" rx="2" fill={parede} />
      <path d="M-4 16 L17 0 L38 16 Z" fill={telhado} />
      <rect x="13" y="24" width="8" height="12" rx="1" fill="#7a5a3a" />
      <rect x="4" y="19" width="6" height="6" rx="1" fill="#9cc7dd" />
      <rect x="24" y="19" width="6" height="6" rx="1" fill="#9cc7dd" />
    </g>
  );
}

function Arvore({ x, y, r = 11, cor = "#3f8a4f" }: { x: number; y: number; r?: number; cor?: string }) {
  return (
    <g>
      <rect x={x - 1.5} y={y} width="3" height={r} fill="#6b4f33" />
      <circle cx={x} cy={y - r * 0.2} r={r} fill={cor} />
      <circle cx={x - r * 0.35} cy={y - r * 0.5} r={r * 0.45} fill="#ffffff" opacity="0.12" />
    </g>
  );
}

export function IlustracaoCondominio({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden", className)}>
      <svg viewBox="0 0 360 190" role="img" aria-label="Ilustração do Residencial Jardins do Lago: casas, árvores e o lago" className="block h-auto w-full">
        <defs>
          <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cfe6e4" />
            <stop offset="1" stopColor="#f3eed8" />
          </linearGradient>
          <linearGradient id="lago" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4f97b5" />
            <stop offset="1" stopColor="#2e6f8e" />
          </linearGradient>
        </defs>

        {/* céu e sol */}
        <rect width="360" height="190" fill="url(#ceu)" />
        {/* o sol fica no meio do céu, longe do nome (que fica à direita) */}
        <circle cx="168" cy="40" r="17" fill="#f6d77a" opacity="0.9" />

        {/* morros ao fundo */}
        <path d="M0 110 Q60 70 130 98 T260 92 T360 100 V190 H0 Z" fill="#a9c99a" />
        <path d="M0 122 Q90 96 180 116 T360 112 V190 H0 Z" fill="#86b47a" />

        {/* casas */}
        <Casa x={30} y={96} telhado="#8b2a5c" />
        <Casa x={78} y={92} telhado="#c46a2b" />
        <Casa x={232} y={94} telhado="#1d6b4e" />
        <Casa x={280} y={98} telhado="#8b2a5c" />
        <Casa x={146} y={98} telhado="#2e6f8e" escala={0.85} />

        {/* árvores */}
        <Arvore x={20} y={124} r={12} />
        <Arvore x={124} y={122} r={10} cor="#4f9a3c" />
        <Arvore x={198} y={124} r={13} />
        <Arvore x={334} y={126} r={12} cor="#4f9a3c" />

        {/* gramado e lago */}
        <path d="M0 140 Q180 128 360 140 V190 H0 Z" fill="#6fa564" />
        <ellipse cx="190" cy="168" rx="150" ry="20" fill="url(#lago)" />
        <path d="M100 166 h26 M170 172 h34 M236 164 h22" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />

        {/* flor da logo, como um cata-vento no jardim */}
        <g transform="translate(46 50)">
          {PETALAS.map((cor, i) => (
            <path key={cor} d="M0 0 C 5 -8, 6 -19, 0 -29 C -4 -19, -5 -9, 0 0 Z" fill={cor} transform={`rotate(${i * 60 + 15})`} />
          ))}
          <circle r="3" fill="#ffffff" />
        </g>
      </svg>

      {/* nome do condomínio sobre o céu */}
      <div className="pointer-events-none absolute right-4 top-3 text-right leading-none">
        <span className="block font-display text-[clamp(0.78rem,3.4vw,0.95rem)] font-semibold text-[#8a7340]">Residencial</span>
        <span className="block font-display text-[clamp(1.4rem,6.6vw,1.75rem)] font-extrabold tracking-tight text-[#8b2a5c]">Jardins</span>
        <span className="block font-display text-[clamp(0.78rem,3.4vw,0.95rem)] font-semibold text-[#8a7340]">do Lago</span>
      </div>
    </div>
  );
}
