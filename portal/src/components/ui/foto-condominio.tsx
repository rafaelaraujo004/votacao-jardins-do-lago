/**
 * Foto real da portaria do condomínio (tratada: recorte, cor, contraste e nitidez),
 * no topo do Início do morador, no lugar do desenho. WebP com JPEG de reserva.
 * Fica acima da dobra: carrega na hora (sem "lazy"), com tamanho fixo (a tela não pula).
 */
export function FotoCondominio() {
  return (
    <div className="relative">
      <picture>
        <source type="image/webp" srcSet="/condominio-portaria.webp" />
        <img
          src="/condominio-portaria.jpg"
          alt="Portaria do Residencial Jardins do Lago"
          width={1127}
          height={490}
          fetchPriority="high"
          decoding="async"
          className="block aspect-[1127/490] h-auto w-full object-cover"
        />
      </picture>
      <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-[rgb(18_56_42/0.82)] px-3 py-1 text-[0.8rem] font-bold text-white shadow-[0_2px_8px_rgb(0_0_0/0.25)] sm:bottom-3 sm:left-3 sm:text-[0.86rem]">
        <svg aria-hidden viewBox="-80 -80 160 160" className="size-4">
          {["#8E5BAA", "#A9C93F", "#F5C02E", "#E9732D", "#E0457B", "#3D8BCD"].map((cor, i) => (
            <path key={cor} d="M0,0 C 4.4,-21 19.8,-42 -19.8,-70 C -11,-52.5 -26.4,-24.5 0,0 Z" fill={cor} transform={`rotate(${i * 60 + 20})`} />
          ))}
        </svg>
        Residencial Jardins do Lago
      </span>
    </div>
  );
}
