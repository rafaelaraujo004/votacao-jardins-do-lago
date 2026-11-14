# Roteiro por fases

Uma fase só é "concluída" com: tela funcionando, validação, integração real com o Firebase, permissões, tratamento de erros e testes.

| Fase | Entrega | Situação |
|---|---|---|
| **1 — Fundação** | Projeto, identidade visual, Firebase, sessão, multi-condomínio, permissões, regras + testes, auditoria, documentação | **Concluída** |
| **2 — Portal** | Login da equipe e dos moradores (nada abre sem login), início do morador, painel admin, unidades e moradores, financeiro (lançar, estornar, resumo mensal, PDF/Excel), contatos e informações do condomínio | **Entregue** (login dos moradores: aguardando teste no Firebase real) |
| **3 — Portaria** | Visitantes com código de validade e uso único, entradas e saídas, encomendas, retenção LGPD | **Entregue** (aguardando sua validação no navegador) |
| 4 — Serviços | Reservas (sem conflito, via transação), solicitações com protocolo, comunicados, documentos | **Parcial**: reservas entregues; faltam solicitações, comunicados e documentos (documentos dependem do plano Blaze) |
| 5 — Experiência | Mapa interativo (com a planta real), enquetes, classificados, relatórios | Precisa da planta |
| 6 — Produção | Testes de segurança e concorrência, CSP com nonce, importação da planilha, treinamento, deploy definitivo | |

## Fase 1 — o que foi entregue

- Projeto Next.js 16 + TypeScript + Tailwind 4 em `portal/`.
- Identidade visual (claro/escuro) e peças reutilizáveis; vitrine em `/identidade`.
- Firebase: cliente (só login), Admin SDK (só servidor), App Check opcional, simulador local.
- Sessão por cookie seguro; proxy de triagem; contexto do usuário calculado no servidor.
- Permissões por papel com extras/retiradas e teto.
- Regras do Firestore para todas as coleções planejadas (gravação do cliente sempre negada).
- Auditoria (entrar/sair já registrados) e tela de auditoria para o síndico.
- Limite de tentativas; cabeçalhos de segurança.
- Login de demonstração apenas local; script para criar o condomínio real.

## Fase 2 — login da equipe (e-mail e senha)

- `/entrar` tem o formulário **"Equipe do condomínio"** (e-mail e senha). As mensagens de erro não revelam se o e-mail existe.
- O síndico cria o acesso de cada pessoa da equipe em **Pessoas → (pessoa) → "Entrar com e-mail e senha"**. O portal mostra uma **senha provisória uma única vez**.
- No primeiro acesso, o portal **obriga a trocar a senha** (`/conta/senha`). Enquanto a senha for provisória, nenhuma página abre e nenhuma ação grava nada.
- Qualquer pessoa da equipe pode trocar a senha pelo botão com a chave (menu da gestão e topo da portaria).
- O primeiro administrador é criado pelo script (veja [PRIMEIRO-ACESSO.md](PRIMEIRO-ACESSO.md)).

## Fase 2b — login dos moradores (14/11/2026)

- **Tudo exige login** (decisão do dono: os dados são sensíveis e o síndico controla usuários e senhas). A área pública que existia por pouco tempo foi **retirada**: `/inicio`, `/financeiro` (só meses publicados), `/mapa`, `/contatos`, `/mais`, `/reservas`, `/visitas`, `/encomendas` e as exportações (PDF e Excel) só abrem com sessão. Mesmo logado, o morador não vê dados de outras casas (agenda mostra só "Ocupado"; financeiro sem quem lançou). O condomínio vem sempre da sessão.
- **Informações do condomínio** (`/admin/informacoes`, permissão `informacoes.gerenciar`): telefones da portaria e da administração, WhatsApp, horário e aviso; o **link de acesso dos moradores** (`/entrar`) pronto para copiar ou mandar no grupo.
- **Cada morador tem login próprio**: **usuário** = código de 6 caracteres gerado pelo portal (ex.: `K7M4PX`, sem 0/O/1/I) + **senha provisória** gerada pelo portal. O síndico gera os dois na página da pessoa (ou da unidade), vê **uma vez** e manda com **Copiar** ou **Enviar pelo WhatsApp** (mensagem pronta). No primeiro acesso o morador é **obrigado a escolher a própria senha**.
- `/entrar` tem as abas **"Sou morador"** (usuário + senha) e **"Sou da equipe"** (e-mail + senha). Sem login, qualquer página manda para `/entrar?volta=...`; o endereço principal (`/`) leva à entrada ou ao início do papel. O topo do morador mostra **"Casa 12 · Sair"**.
- Veja como o síndico cria o acesso em [PRIMEIRO-ACESSO.md](PRIMEIRO-ACESSO.md), item 6.

## Fase 3 — Portaria (entregue)

- **Morador** (`/visitas`): autoriza visita (um dia ou vários dias), recebe um código de 6 caracteres (ex.: `K7M-4PX`) para copiar ou mandar pelo WhatsApp; cancela autorizações. `/encomendas`: vê o que chegou e o que já retirou.
- **Portaria** (`/portaria`): valida código, registra entrada (com ou sem código, confirmando com o morador por telefone), quem está dentro, saída, esperados hoje, encomendas (registrar e entregar) e **reservas de hoje**. Atualiza sozinha a cada 60 s.
- **Administração** (`/admin/portaria`): histórico de entradas, saídas e encomendas; botão **"Remover nomes antigos agora"** (LGPD, 90 dias).
- **Decisão do uso do código**: autorização de **um dia** vale **uma vez só** (vira "usada" na entrada); autorização com **período** (ex.: pedreiro a semana toda) vale várias vezes dentro do período, mas a mesma pessoa não "entra" duas vezes sem ter saído.
- No banco fica só o HMAC do código (segredo `PORTARIA_SEGREDO_CODIGO`).

## Fase 4 — Reservas (entregue)

- **Áreas** (`/admin/reservas/areas`): cadastro com regras, capacidade, aprovação, antecedência, limite por casa/mês e faixas de horário. Botão "Criar áreas sugeridas" (salão, churrasqueira, quadra; sem taxas). A piscina é de uso livre, fica fora.
- **Agenda da administração** (`/admin/reservas`): pedidos aguardando aprovação (aprovar/recusar com motivo), calendário do mês por área, reservar para uma casa, bloquear horário, cancelar/desbloquear com motivo.
- **Morador** (`/reservas`): escolhe a área, o dia e uma faixa livre; vê "Ocupado" sem saber de qual casa; acompanha e cancela as próprias reservas.
- **Agenda do Início**: mostra as reservas reais (sem a casa dos outros) e os bloqueios.
- Conflito impossível: trava por horário + conferência de sobreposição dentro da mesma transação.

## O que falta

- **Login dos moradores**: pronto no código; falta testar no Firebase real com um morador de teste (o simulador já aceitou o e-mail sintético `.invalid`).
- **"Esqueci minha senha" sozinho**: hoje o morador pede uma senha nova ao síndico (o portal mostra o WhatsApp da administração).
- **Fase 4**: solicitações com protocolo, comunicados, documentos (estes precisam de arquivos → plano Blaze).
- **Limpeza LGPD automática**: hoje é pelo botão em `/admin/portaria`; falta a tarefa agendada (Vercel Cron) chamar `limparVisitantesAntigos`.
- **Fases 5 e 6** como na tabela.

## Decisões em aberto

1. **Método de login**: **decidido (14/11/2026).** Equipe: e-mail e senha. Moradores: usuário (código gerado pelo portal) + senha provisória enviada pelo WhatsApp; o morador escolhe a própria senha no primeiro acesso. Informações gerais continuam abertas pelo link.
2. **Plano Blaze** (arquivos, backup automático, SMS).
3. **Retenção LGPD** de visitantes: implementada com 90 dias — confirmar o prazo com o síndico.
4. **Planta** do condomínio para o mapa.
