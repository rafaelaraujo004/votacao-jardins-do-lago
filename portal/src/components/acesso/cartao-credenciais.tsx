"use client";

/**
 * Mostra o usuário e a senha provisória do morador UMA única vez,
 * com botões para copiar e para enviar pelo WhatsApp com a mensagem pronta.
 * Nada disto é guardado: ao clicar em "Já anotei" (ou sair da página), some.
 */
import { useState } from "react";
import { Check, ClipboardList, Copy, MessageCircle } from "lucide-react";
import { useAvisos } from "@/components/ui/avisos";
import { Alerta } from "@/components/ui/basicos";
import { Botao, classesDoBotao } from "@/components/ui/botao";
import { linkWhatsAppAcesso, mensagemAcessoMorador, numeroParaWhatsApp, usuarioParaLeitura } from "@/lib/usuario-morador";

export type Credenciais = {
  nome: string;
  usuario: string;
  senha: string;
  telefone: string;
  condominioNome: string;
  linkEntrar: string;
};

type Copiado = "usuario" | "senha" | "tudo" | null;

export function CartaoCredenciais({ dados, aoFechar }: { dados: Credenciais; aoFechar: () => void }) {
  const { avisar } = useAvisos();
  const [copiado, setCopiado] = useState<Copiado>(null);
  const mensagem = mensagemAcessoMorador(dados);
  const temWhats = numeroParaWhatsApp(dados.telefone) !== null;

  async function copiar(qual: Exclude<Copiado, null>) {
    const texto = qual === "usuario" ? dados.usuario : qual === "senha" ? dados.senha : mensagem;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      avisar("sucesso", qual === "tudo" ? "Mensagem copiada." : qual === "usuario" ? "Usuário copiado." : "Senha copiada.");
    } catch {
      avisar("erro", "Não foi possível copiar. Anote à mão.");
    }
  }

  const iconeCopiar = (qual: Exclude<Copiado, null>) =>
    copiado === qual ? <Check aria-hidden className="size-5" /> : <Copy aria-hidden className="size-5" />;

  return (
    <div className="flex flex-col gap-4">
      <Alerta tipo="aviso" titulo="Anote ou envie agora: a senha não aparece de novo">
        No primeiro acesso, {dados.nome} vai escolher a própria senha.
      </Alerta>

      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <dt className="rotulo-caixa">Usuário</dt>
          <dd
            className="afundado select-all rounded-2xl px-4 py-3 text-center font-mono text-[2rem] font-bold tracking-[0.3em] text-destaque"
            aria-label={`Usuário: ${dados.usuario.split("").join(" ")}`}
          >
            {usuarioParaLeitura(dados.usuario)}
          </dd>
        </div>
        <div className="flex flex-col gap-1.5">
          <dt className="rotulo-caixa">Senha provisória</dt>
          <dd className="afundado select-all break-all rounded-2xl px-4 py-3 text-center font-mono text-[1.5rem] font-bold tracking-wider text-destaque">
            {dados.senha}
          </dd>
        </div>
      </dl>

      <div className="grid gap-2 sm:grid-cols-2">
        <Botao variante="secundario" onClick={() => copiar("usuario")} icone={iconeCopiar("usuario")}>
          {copiado === "usuario" ? "Usuário copiado" : "Copiar usuário"}
        </Botao>
        <Botao variante="secundario" onClick={() => copiar("senha")} icone={iconeCopiar("senha")}>
          {copiado === "senha" ? "Senha copiada" : "Copiar senha"}
        </Botao>
        <Botao
          variante="secundario"
          onClick={() => copiar("tudo")}
          icone={copiado === "tudo" ? <Check aria-hidden className="size-5" /> : <ClipboardList aria-hidden className="size-5" />}
          className="sm:col-span-2"
        >
          {copiado === "tudo" ? "Mensagem copiada" : "Copiar tudo (mensagem pronta)"}
        </Botao>
        <a
          href={linkWhatsAppAcesso(mensagem, dados.telefone)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${classesDoBotao("primario")} sm:col-span-2`}
        >
          <MessageCircle aria-hidden className="size-5" />
          {temWhats ? "Enviar pelo WhatsApp" : "Enviar pelo WhatsApp (escolher contato)"}
        </a>
      </div>

      <p className="text-[0.9rem] text-muted">
        A mensagem leva o link {dados.linkEntrar}, o usuário e a senha provisória.
        {temWhats ? " O WhatsApp abre direto na conversa com o telefone cadastrado." : " Sem telefone cadastrado: você escolhe o contato no WhatsApp."}
      </p>

      <div>
        <Botao variante="secundario" onClick={aoFechar} icone={<Check aria-hidden className="size-5" />}>
          Já anotei ou enviei
        </Botao>
      </div>
    </div>
  );
}
