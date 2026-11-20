import type { NextConfig } from "next";

const emDesenvolvimento = process.env.NODE_ENV !== "production";

// Endereços externos que o navegador pode acessar. Tudo o mais é bloqueado.
// - googleapis: login do Firebase (Auth) e App Check
// - google.com / gstatic: reCAPTCHA usado pelo App Check
// - firebasestorage: envio dos arquivos dos documentos
// - 127.0.0.1:9099 / 9199: simuladores de login e de arquivos (só no computador local)
const conexoes = [
  "'self'",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firebaseappcheck.googleapis.com",
  "https://content-firebaseappcheck.googleapis.com",
  "https://www.google.com",
  // Envio de arquivos dos documentos (Firebase Storage)
  "https://firebasestorage.googleapis.com",
  ...(emDesenvolvimento ? ["http://127.0.0.1:9099", "http://127.0.0.1:9199", "ws://localhost:*", "ws://127.0.0.1:*"] : []),
];

const scripts = [
  "'self'",
  // O Next.js injeta pequenos scripts na página; trocar por "nonce" fica para a Fase 6.
  "'unsafe-inline'",
  "https://www.google.com/recaptcha/",
  "https://www.gstatic.com/recaptcha/",
  ...(emDesenvolvimento ? ["'unsafe-eval'"] : []),
];

const politicaDeConteudo = [
  "default-src 'self'",
  `script-src ${scripts.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  // storage.googleapis.com: fotos de anúncios e comunicados (link temporário entregue por /api/fotos/...)
  "img-src 'self' data: blob: https://storage.googleapis.com",
  "font-src 'self'",
  `connect-src ${conexoes.join(" ")}`,
  "frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const cabecalhosDeSeguranca = [
  { key: "Content-Security-Policy", value: politicaDeConteudo },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Câmera liberada só para o próprio site (leitura de QR Code na portaria, Fase 3).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Quase todas as telas mudam por pessoa logada; por isso não usamos o cache de componentes.
  cacheComponents: false,
  poweredByHeader: false,
  experimental: {
    // Voltar a uma tela visitada há pouco é instantâneo (sem ir ao servidor de novo).
    // Qualquer gravação (Server Action com revalidatePath) limpa essa memória na hora.
    staleTimes: { dynamic: 30, static: 180 },
    // Lista do Word dos contatos (até 4 MB; a Vercel aceita no máximo 4,5 MB por envio).
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca }];
  },
};

export default nextConfig;
