"use client";

/**
 * Acesso do MORADOR (usuário com código + senha provisória).
 * - Sem acesso: botão "Criar acesso do morador".
 * - Com acesso: mostra o usuário e permite "Gerar nova senha provisória" (com confirmação).
 * - Depois de gerar: mostra usuário e senha UMA vez (CartaoCredenciais).
 * `compacto` = só o botão de criar (usado na página da unidade).
 */
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheck, Clock, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { criarAcessoMorador, redefinirSenhaMorador, type ResultadoAcessoMorador } from "@/server/acoes/acesso";
import { useAvisos } from "@/components/ui/avisos";
import { Alerta } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { usuarioParaLeitura, type SituacaoLoginMorador } from "@/lib/usuario-morador";
import { EtiquetaLoginMorador } from "./etiqueta-login";
import { CartaoCredenciais } from "./cartao-credenciais";

export type SituacaoMorador = {
  usuario: string | null;
  situacao: SituacaoLoginMorador;
  ultimoAcesso: string | null;
};

function BotaoEnviarAcesso({ texto, textoCarregando, perigo, pequeno }: { texto: string; textoCarregando: string; perigo?: boolean; pequeno?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Botao
      type="submit"
      variante={perigo ? "perigo" : "primario"}
      tamanho={pequeno ? "pequeno" : "normal"}
      carregando={pending}
      icone={perigo ? <RefreshCw aria-hidden className="size-5" /> : <KeyRound aria-hidden className="size-5" />}
    >
      {pending ? textoCarregando : texto}
    </Botao>
  );
}

export function AcessoMorador({
  uid,
  nome,
  situacao,
  compacto = false,
}: {
  uid: string;
  nome: string;
  situacao: SituacaoMorador;
  compacto?: boolean;
}) {
  const [criado, criar] = useActionState<ResultadoAcessoMorador, FormData>(criarAcessoMorador, null);
  const [refeito, refazer] = useActionState<ResultadoAcessoMorador, FormData>(redefinirSenhaMorador, null);
  const { avisar } = useAvisos();
  const [confirmando, setConfirmando] = useState(false);
  // "Já anotei" esconde as credenciais desta resposta (guardamos a vez dela).
  const [dispensada, setDispensada] = useState<number | null>(null);

  // A resposta mais recente das duas ações é a que vale.
  const ultimo = [criado, refeito].filter((r) => r !== null).sort((a, b) => (b?.vez ?? 0) - (a?.vez ?? 0))[0] ?? null;
  const visivel = ultimo?.ok && ultimo.vez !== dispensada ? ultimo : null;
  const erro = ultimo && !ultimo.ok ? ultimo.erro : null;

  useEffect(() => {
    if (ultimo?.ok) avisar("sucesso", ultimo.mensagem);
  }, [ultimo, avisar]);

  if (visivel) {
    const cartao = (
      <CartaoCredenciais
        dados={visivel}
        aoFechar={() => {
          setDispensada(visivel.vez);
          setConfirmando(false);
        }}
      />
    );
    // Na lista da unidade, o cartão ocupa a linha inteira.
    return compacto ? <div className="basis-full rounded-2xl bg-surface-2 p-4">{cartao}</div> : cartao;
  }

  const alertaErro = erro ? (
    <Alerta tipo="erro" titulo="Não foi possível gerar o acesso">
      {erro}
    </Alerta>
  ) : null;

  // Página da unidade: só a situação ou o atalho para criar.
  if (compacto) {
    if (situacao.situacao !== "sem-acesso") return <EtiquetaLoginMorador situacao={situacao.situacao} />;
    return (
      <div className="flex flex-col gap-2">
        {alertaErro}
        <form action={criar}>
          <input type="hidden" name="uid" value={uid} />
          <BotaoEnviarAcesso texto="Criar o login da casa" textoCarregando="Criando…" pequeno />
        </form>
      </div>
    );
  }

  if (situacao.situacao === "sem-acesso" || !situacao.usuario) {
    return (
      <form action={criar} className="flex flex-col gap-4">
        <input type="hidden" name="uid" value={uid} />
        {alertaErro}
        <div>
          <EtiquetaLoginMorador situacao="sem-acesso" />
        </div>
        <p className="text-ink-2">
          A casa ainda não tem login. O portal gera um <strong className="text-ink">usuário</strong> (código de 6 letras e
          números) e uma <strong className="text-ink">senha provisória</strong> em nome de {nome}, para você enviar pelo
          WhatsApp. No primeiro acesso, a casa escolhe a própria senha.
        </p>
        <div>
          <BotaoEnviarAcesso texto="Criar o login da casa" textoCarregando="Gerando…" />
        </div>
      </form>
    );
  }

  return (
    <form action={refazer} className="flex flex-col gap-4">
      <input type="hidden" name="uid" value={uid} />
      {alertaErro}
      <div className="flex flex-wrap gap-2">
        <EtiquetaLoginMorador situacao={situacao.situacao} />
      </div>
      <dl className="flex flex-col gap-1.5">
        <dt className="rotulo-caixa">Usuário</dt>
        <dd className="afundado w-fit select-all rounded-2xl px-4 py-2 font-mono text-[1.4rem] font-bold tracking-[0.25em]">
          {usuarioParaLeitura(situacao.usuario)}
        </dd>
      </dl>
      <p className="flex items-start gap-2 text-ink-2">
        {situacao.situacao === "provisoria" ? (
          <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
        ) : (
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-pine" />
        )}
        <span>
          {situacao.situacao === "provisoria"
            ? "Ainda não escolheu a própria senha."
            : "Já escolheu a própria senha."}
          {situacao.ultimoAcesso ? ` Último acesso: ${situacao.ultimoAcesso}.` : " Ainda não entrou."}
        </span>
      </p>
      <p className="text-[0.9rem] text-muted">
        Esqueceu a senha? Gere uma nova senha provisória. O usuário continua o mesmo.
      </p>

      {confirmando ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-danger-soft px-4 py-3">
          <p className="flex items-start gap-2 font-bold">
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            O login é um só por casa: a senha atual deixa de funcionar para todos da casa, e quem estiver com o portal
            aberto é desconectado de todos os aparelhos.
          </p>
          <div className="flex flex-wrap gap-2">
            <BotaoEnviarAcesso texto="Sim, gerar nova senha" textoCarregando="Gerando…" perigo />
            <Botao variante="secundario" onClick={() => setConfirmando(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <div>
          <Botao variante="secundario" onClick={() => setConfirmando(true)} icone={<RefreshCw aria-hidden className="size-5" />}>
            Gerar nova senha provisória
          </Botao>
        </div>
      )}
    </form>
  );
}
