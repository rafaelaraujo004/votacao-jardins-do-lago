/**
 * Regras da portaria que não dependem do banco (podem rodar no navegador e
 * no servidor, e são testadas em tests/unit/portaria.test.ts):
 * - código de acesso dos visitantes (gerar, normalizar, formatar, HMAC);
 * - período de validade das autorizações e a situação de cada uma;
 * - mensagem pronta para o WhatsApp;
 * - busca de casa por número;
 * - prazo de guarda dos nomes (LGPD).
 */
import { dataISOParaBR } from "./formato";

// ---------- Tipos de visita e de encomenda ----------

export const TIPOS_VISITA = {
  visita: "Visita",
  prestador: "Prestador de serviço",
  entrega: "Entrega / aplicativo",
  outro: "Outro",
} as const;
export type TipoVisita = keyof typeof TIPOS_VISITA;
export const CHAVES_TIPO_VISITA = Object.keys(TIPOS_VISITA) as [TipoVisita, ...TipoVisita[]];

export const TIPOS_ENCOMENDA = {
  caixa: "Caixa",
  envelope: "Envelope",
  delivery: "Delivery (comida)",
  outro: "Outro",
} as const;
export type TipoEncomenda = keyof typeof TIPOS_ENCOMENDA;
export const CHAVES_TIPO_ENCOMENDA = Object.keys(TIPOS_ENCOMENDA) as [TipoEncomenda, ...TipoEncomenda[]];

export function nomeTipoVisita(tipo: string): string {
  return (TIPOS_VISITA as Record<string, string>)[tipo] ?? "Outro";
}

export function nomeTipoEncomenda(tipo: string): string {
  return (TIPOS_ENCOMENDA as Record<string, string>)[tipo] ?? "Outro";
}

// ---------- Código de acesso ----------

/**
 * Letras e números SEM os que se confundem ao ditar ou ler:
 * sem 0/O, 1/I/L. Ficam 31 símbolos; 6 deles dão 31^6 ≈ 887 milhões de códigos.
 */
export const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TAMANHO_CODIGO = 6;

/** Gera um código aleatório (ex.: "K7M4PX"). Usa o sorteio seguro do sistema, sem viés. */
export function gerarCodigo(): string {
  const n = ALFABETO_CODIGO.length; // 31
  const limite = 256 - (256 % n); // descarta bytes acima de 248 para não favorecer nenhum símbolo
  let codigo = "";
  while (codigo.length < TAMANHO_CODIGO) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < limite && codigo.length < TAMANHO_CODIGO) codigo += ALFABETO_CODIGO[b % n];
    }
  }
  return codigo;
}

/** O que a portaria digitou → só os símbolos do código, em maiúsculas ("k7m-4px" → "K7M4PX"). */
export function normalizarCodigo(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** O código tem o tamanho certo e só símbolos permitidos? (recebe o código já normalizado) */
export function codigoValido(codigo: string): boolean {
  return codigo.length === TAMANHO_CODIGO && [...codigo].every((c) => ALFABETO_CODIGO.includes(c));
}

/** "K7M4PX" → "K7M-4PX" (mais fácil de ditar em dois pedaços). */
export function formatarCodigo(codigo: string): string {
  const c = normalizarCodigo(codigo);
  return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

/**
 * Segredo usado SÓ no computador local (simulador) quando PORTARIA_SEGREDO_CODIGO não existe.
 * Não é segredo de verdade: em produção o servidor recusa funcionar sem a variável.
 */
export const SEGREDO_CODIGO_DESENVOLVIMENTO = "dev-portaria-segredo-inseguro-nao-use-em-producao";

/**
 * HMAC-SHA256 do código, com um segredo do servidor.
 * No banco fica só este resultado: uma cópia do banco não revela códigos válidos.
 * O id do condomínio entra junto, então o mesmo código em outro condomínio vira outro hash.
 * Usa a criptografia padrão da web (funciona no Node e nos testes).
 */
export async function hashDoCodigo(segredo: string, condominioId: string, codigo: string): Promise<string> {
  if (!segredo) throw new Error("Segredo do código não configurado.");
  const codificador = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, codificador.encode(`${condominioId}:${normalizarCodigo(codigo)}`));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Datas e validade ----------

/** Validade máxima de uma autorização: 30 dias (contando o primeiro). */
export const MAX_DIAS_VALIDADE = 30;
/** Até quantos dias à frente o morador pode agendar o primeiro dia. */
export const MAX_DIAS_ANTECEDENCIA = 30;

const REGEX_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-14" + 3 → "2026-11-17" (conta em UTC só para somar dias; não depende do fuso). */
export function somarDias(iso: string, dias: number): string {
  if (!REGEX_ISO.test(iso)) throw new Error(`Data inválida: ${iso}`);
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dias entre duas datas "AAAA-MM-DD" (b − a). */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** A data existe de verdade? (recusa 2026-02-31) */
export function dataISOValida(iso: string): boolean {
  if (!REGEX_ISO.test(iso)) return false;
  return new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso;
}

/**
 * Confere o período pedido pelo morador. Devolve a mensagem de erro, ou null se estiver tudo certo.
 * `hoje` é o dia no fuso do condomínio (hojeISO).
 */
export function erroNoPeriodo(data: string, validaAte: string, hoje: string): string | null {
  if (!dataISOValida(data)) return "Informe o dia da visita.";
  if (!dataISOValida(validaAte)) return "Informe até quando a autorização vale.";
  if (data < hoje) return "O dia da visita não pode ser no passado.";
  if (diasEntre(hoje, data) > MAX_DIAS_ANTECEDENCIA) return `Só é possível autorizar com até ${MAX_DIAS_ANTECEDENCIA} dias de antecedência.`;
  if (validaAte < data) return "A data final não pode ser antes do primeiro dia.";
  if (diasEntre(data, validaAte) + 1 > MAX_DIAS_VALIDADE) return `A autorização pode valer no máximo ${MAX_DIAS_VALIDADE} dias.`;
  return null;
}

/**
 * Decisão do projeto sobre quantas vezes o código pode ser usado:
 * - autorização de UM dia (visita, entrega) = USO ÚNICO. É o caso comum e o mais seguro:
 *   se o código vazar depois da visita, não abre mais a portaria. Se a pessoa sair e
 *   voltar no mesmo dia, a portaria confirma com o morador pelo "Visitante sem código".
 * - autorização com PERÍODO (ex.: pedreiro a semana toda) = VÁRIOS USOS dentro do período,
 *   senão o morador teria de gerar um código novo todo dia.
 */
export function ehUsoUnico(data: string, validaAte: string): boolean {
  return data === validaAte;
}

export type StatusVisita = "ativa" | "usada" | "cancelada";
export type SituacaoVisita = "valida_hoje" | "agendada" | "usada" | "vencida" | "cancelada";

/** Situação de uma autorização num dia (o status do banco + as datas). */
export function situacaoDaVisita(v: { status: StatusVisita; data: string; validaAte: string }, hoje: string): SituacaoVisita {
  if (v.status === "cancelada") return "cancelada";
  if (v.status === "usada") return "usada";
  if (v.validaAte < hoje) return "vencida";
  if (v.data > hoje) return "agendada";
  return "valida_hoje";
}

/** Pode entrar hoje com este código? Devolve o motivo da recusa, ou null. */
export function motivoParaRecusarEntrada(
  v: { status: StatusVisita; data: string; validaAte: string },
  hoje: string,
): string | null {
  switch (situacaoDaVisita(v, hoje)) {
    case "cancelada":
      return "Esta autorização foi cancelada pelo morador.";
    case "usada":
      return "Este código já foi usado (era de uso único).";
    case "vencida":
      return `Esta autorização venceu em ${dataISOParaBR(v.validaAte)}.`;
    case "agendada":
      return `Esta autorização só vale a partir de ${dataISOParaBR(v.data)}.`;
    default:
      return null;
  }
}

/** "14/11/2026" ou "de 14/11/2026 até 20/11/2026". */
export function descreverPeriodo(data: string, validaAte: string): string {
  return data === validaAte ? dataISOParaBR(data) : `de ${dataISOParaBR(data)} até ${dataISOParaBR(validaAte)}`;
}

// ---------- WhatsApp ----------

/** Mensagem pronta que o morador manda ao visitante. */
export function mensagemWhatsApp(p: {
  nomeVisitante: string;
  codigo: string;
  data: string;
  validaAte: string;
  unidadeRotulo: string;
  endereco: string;
}): string {
  const quando = p.data === p.validaAte ? `no dia ${dataISOParaBR(p.data)}` : descreverPeriodo(p.data, p.validaAte);
  return [
    `Olá, ${p.nomeVisitante}! Sua entrada está autorizada ${quando}.`,
    `Endereço: ${p.endereco}.`,
    `Destino: ${p.unidadeRotulo}.`,
    `Na portaria, informe o código: ${formatarCodigo(p.codigo)}`,
  ].join("\n");
}

/** Link que abre o WhatsApp com a mensagem já escrita (a pessoa escolhe o contato). */
export function linkWhatsApp(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
}

/** Link que abre a conversa com UM telefone (formato 55DDNNNNNNNNN) e a mensagem já escrita. */
export function linkWhatsAppPara(telefone: string, mensagem: string): string {
  const numero = telefone.replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/** Primeiro nome para a saudação ("MARIA DAS GRAÇAS / JOÃO" → "Maria"). */
function primeiroNomeDe(nome: string): string {
  const p = nome.split(/[\s/\\]+/).find((x) => x.length > 1) ?? "";
  return p ? p[0].toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR") : "";
}

/**
 * Mensagem que a PORTARIA manda ao morador quando o visitante JÁ PASSOU pela portaria e está
 * indo para a casa. É o texto que a portaria do Jardins do Lago já usa (enviado pelo síndico em
 * 21/11/2026), sem mudar nada.
 */
export function mensagemVisitaACaminho(): string {
  return [
    "Olá, 👋",
    "A sua visita está a caminho.🙂",
    "Não esqueça de orientá-la quanto ao retorno, evitando infrações e até mesmo acidentes. 😀",
    "Desde já obrigado (a).",
  ].join("\n");
}

/** Mensagem que a PORTARIA manda ao morador avisando que chegou uma encomenda. */
export function mensagemEncomenda(p: {
  /** Nome de quem vai receber a mensagem (para a saudação). Pode ficar vazio. */
  nomeContato: string;
  destinatario: string;
  unidadeRotulo: string;
  tipo: string;
  observacao: string;
  condominio: string;
}): string {
  const primeiro = primeiroNomeDe(p.nomeContato);
  const ola = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const delivery = p.tipo === "delivery";
  const oQue = delivery ? "um delivery (comida)" : p.tipo === "envelope" ? "um envelope" : p.tipo === "caixa" ? "uma caixa" : "uma encomenda";
  return [
    `${ola} Aqui é a portaria do ${p.condominio || "Residencial Jardins do Lago"}.`,
    `📦 Chegou ${oQue} para *${p.destinatario}* (${p.unidadeRotulo}).`,
    ...(p.observacao ? [`Obs.: ${p.observacao}`] : []),
    delivery ? "Venha buscar na portaria, por favor." : "Pode retirar na portaria.",
  ].join("\n");
}

// ---------- Busca de casa ----------

export type CasaParaBusca = { id: string; rotulo: string; numero: number; quadra: string | null };

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Filtra as casas pelo que foi digitado.
 * Só números ("12"): número exato primeiro, depois os que começam com ele.
 * Texto ("casa 12", "quadra b"): procura no rótulo.
 */
export function filtrarCasas<T extends CasaParaBusca>(casas: readonly T[], termo: string, limite = 8): T[] {
  const t = semAcento(termo);
  if (!t) return casas.slice(0, limite);
  if (/^\d+$/.test(t)) {
    const exatas = casas.filter((c) => String(c.numero) === String(Number(t)));
    const comecam = casas.filter((c) => !exatas.includes(c) && String(c.numero).startsWith(t));
    return [...exatas, ...comecam].slice(0, limite);
  }
  return casas.filter((c) => semAcento(`${c.rotulo} ${c.quadra ?? ""}`).includes(t)).slice(0, limite);
}

// ---------- LGPD ----------

/** Nomes de visitantes ficam guardados por 90 dias; depois são apagados (o registro fica, sem o nome). */
export const DIAS_RETENCAO_VISITANTES = 90;
export const NOME_ANONIMIZADO = "Nome removido (LGPD)";

/** Registros com data ANTES deste dia devem ter o nome removido. */
export function limiteDeRetencao(hoje: string): string {
  return somarDias(hoje, -DIAS_RETENCAO_VISITANTES);
}

// ---------- Respostas das ações com dados (usadas pelas telas) ----------

export type ResultadoCodigoGerado =
  | { ok: true; vez: number; codigo: string; nome: string; data: string; validaAte: string; usoUnico: boolean }
  | { ok: false; vez: number; erro: string }
  | null;

export type VisitaConsultada = {
  nome: string;
  tipo: TipoVisita;
  unidadeRotulo: string;
  data: string;
  validaAte: string;
  usoUnico: boolean;
  observacao: string;
  autorizadoPor: string;
  /** null = pode entrar; texto = por que não pode. */
  recusa: string | null;
};

export type ResultadoConsulta = { ok: true; vez: number; codigo: string; visita: VisitaConsultada } | { ok: false; vez: number; erro: string } | null;
