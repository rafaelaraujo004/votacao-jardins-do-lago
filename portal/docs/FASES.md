# Roteiro por fases

Uma fase só é "concluída" com: tela funcionando, validação, integração real com o Firebase, permissões, tratamento de erros e testes.

| Fase | Entrega | Situação |
|---|---|---|
| **1 — Fundação** | Projeto, identidade visual, Firebase, sessão, multi-condomínio, permissões, regras + testes, auditoria, documentação | **Concluída** |
| **2 — Portal** | Login da equipe e dos moradores (nada abre sem login), início do morador, painel admin, unidades e moradores, financeiro (lançar, estornar, resumo mensal, PDF/Excel), contatos e informações do condomínio | **Entregue** (login dos moradores: aguardando teste no Firebase real) |
| **3 — Portaria** | Visitantes com código de validade e uso único, entradas e saídas, encomendas, retenção LGPD | **Entregue** (aguardando sua validação no navegador) |
| **4 — Serviços** | Reservas com as regras reais, solicitações com protocolo, comunicados, documentos (arquivo ou link), informações reais (PIX, ronda, responsável pelas reservas) | **Entregue** (aguardando sua validação no navegador) |
| **5 — Experiência** | Enquetes (1 voto por casa), classificados com aprovação, relatórios do síndico | **Entregue**, exceto o **mapa real**, que depende da planta do condomínio |
| 6 — Produção | Testes de segurança e concorrência, CSP com nonce, importação da planilha, treinamento, deploy definitivo | **Não implementada** (decisão do dono: parar na Fase 5) |

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

## Fase 4 — Regras reais das reservas e informações do condomínio (entregue)

- **Áreas reais** (gravadas pelo script `configurar-jardins-do-lago`, veja [PRIMEIRO-ACESSO.md](PRIMEIRO-ACESSO.md)):
  - **Área de lazer** (salão de festas, quiosques e churrasqueira): faixa única 8h–20h, aprovação, **48 h** de antecedência, desistência até **24 h** antes (depois, "fora do prazo", sujeita a multa), 1 reserva por casa por dia, regras com **"Li e concordo"** obrigatório e avisos em destaque.
  - **Quadra**: faixas de 1 h (19h–22h), sem aprovação, **uso livre 17h–19h** (aparece na agenda, não se reserva), 1 h por casa por dia — ou mais, se ninguém mais reservou no dia.
  - **Roçadeira** e **carrinho de mão** (equipamentos): dia inteiro 8h–20h, aprovação, 24 h de antecedência.
- Antecedência em **horas**, prazo de desistência, limite por casa por dia, uso livre, exigências e avisos — tudo editável em `/admin/reservas/areas`. O síndico vê as **canceladas fora do prazo** em `/admin/reservas?ver=fora-do-prazo`.
- **Informações** (`/admin/informacoes` → `/contatos` e Início): **PIX da taxa** (chave CNPJ com botão "Copiar"; só o papel admin altera, contra golpe), **ronda noturna** e **responsável pelas reservas** (Ligar e WhatsApp), **link da votação oficial** (opcional).

## Fase 4 — Solicitações, comunicados e documentos (entregue)

- **Solicitações** (`/solicitacoes` e `/admin/solicitacoes`): protocolo `AAAA-NNNN` por ano (transação), situação aberta → em andamento → resolvida/cancelada, linha do tempo com **notas internas** que o morador não vê. "Pedidos" no menu de baixo do morador.
- **Comunicados** (`/comunicados` e `/admin/comunicados`): rascunho, publicar, fixar, urgente, arquivar (nada é apagado); pré-visualização e texto pronto para o WhatsApp. Os mais recentes aparecem no topo do Início.
- **Documentos** (`/documentos` e `/admin/documentos`): regimento, convenção, atas, prestações. Dois jeitos:
  - **Arquivo enviado ao portal** (PDF, foto, Word, Excel, até 20 MB), guardado no **Firebase Storage** (exige o plano **Blaze**). O navegador do síndico envia direto ao Storage com uma autorização de uso único (token com `envioDoc` = caminho exato); o servidor confere tipo e tamanho antes de salvar. O morador abre por `/api/documentos/{id}/arquivo`, que confere login e "Quem pode ver" e entrega um link temporário de 5 minutos. Regras em `storage.rules` (testadas em `tests/regras/storage.test.ts`).
  - **Link** https (Google Drive etc.), como antes. Atenção: quem tiver o link abre sem login.

## Fase 5 — Enquetes, classificados e relatórios (entregue)

- **Enquetes** (`/enquetes` e `/admin/enquetes`): **1 voto por casa**, sem troca; resultado "sempre" ou "só depois de encerrar"; o síndico vê só totais (nunca o voto de cada casa).
- **Votação oficial** (`/votacao` e `/admin/votacao`, 19/11/2026): a eleição é **dentro do portal**, com **voto secreto** — nenhuma cédula é guardada, só "a casa votou" e a soma dos votos, na mesma transação. Padrão do Jardins do Lago: **chapa única, Sim ou Não**, eleita com **metade mais 1 dos votos** (mandato 2026/2027); também há o modo "escolher entre candidatos". 1 voto por casa; publicada não muda; sem parcial; **bloqueio de casas** pela comissão (casa que já votou não pode ser bloqueada); **mapa** de quem votou e quem falta.
- **Link de voto por casa** (`/votar/{código}`, sem login) + **senha de 6 números** na mesma mensagem do WhatsApp (passo a passo). Senha errada 5× trava o link por 15 min. A comissão importa os contatos da **lista do Word** (CASA, NOME, CONTATOS; DDD padrão 94), gera os links e envia pelo WhatsApp (1º e 2º contato) em `/admin/votacao/[id]/links`; "Trocar link" invalida o antigo. Depois do voto: **comprovante em PDF** (casa, data/hora e código — nunca o voto). Ata para imprimir em `/relatorio/votacao/[id]`.
- **Classificados** (`/classificados` e `/admin/classificados`): anúncio nasce "aguardando aprovação"; aprovado fica 30 dias no ar; mostra só o **primeiro nome** e o WhatsApp que o próprio autor quis mostrar (nunca a casa). Morador com a permissão extra `classificados.moderar` modera em `/classificados/moderar`.
- **Relatórios** (`/admin/relatorios`): financeiro, reservas, portaria e solicitações por ano, com gráfico e **CSV para o Excel**. Só totais, sem dados pessoais.
- **Mapa real**: continua o mapa provisório; o interativo depende da planta do condomínio.

## Fotos, sino de notificações e responsável pelas reservas (entregue em 20/11/2026)

- **Fotos** (até 4, reduzidas no próprio celular, sem a localização GPS) em **classificados**, **comunicados** e **áreas de lazer** (a 1ª é a miniatura na lista de reservas). Só quem pode ver o item vê a foto (`/api/fotos/...`). Storage: `classifieds/`, `announcements/`, `amenities/` com autorização de uso único (`envioFoto`).
- **Sino de notificações** no topo do morador, da gestão e da portaria: o síndico vê o que precisa aprovar (anúncios, reservas, solicitações); o morador vê votação oficial marcada/aberta, enquetes, comunicados, documentos e as respostas aos pedidos da casa; a portaria vê as visitas autorizadas e os comunicados. Páginas `/notificacoes`, `/admin/notificacoes`, `/portaria/notificacoes`; a portaria passou a ler comunicados em `/portaria/comunicados`.
- **Responsável pelas reservas**: perfil de equipe novo (`reservas`) e "Quem aprova os pedidos" em cada área; os pedidos chegam no sino dessa pessoa (sem responsável → síndico).
- **Comentário ao não aprovar**: anúncio e reserva já pediam o motivo; cancelar uma solicitação agora exige comentário visível para o morador.
- Rodapé **"Desenvolvido por Rafael Araújo"** nas telas principais.

## Notificações no celular, instalar o app e editar anúncio (20/11/2026)

- Ao entrar, janela para **permitir notificações** e **instalar o app**; notificações de verdade no celular (Web Push com service worker), mesmo com o portal fechado, nos principais acontecimentos (comunicados, anúncios, reservas, solicitações, visitas, enquetes e votação).
- **Editar anúncio** nos classificados (volta para aprovação).
- Painel do síndico: card **"Casas sem acesso"** (casas ativas sem login) completando a grade.
- Início no celular: cartões de comunicado, endereço, PIX e ronda mais compactos.

## Prestação de contas do relatório mensal (20/11/2026)

- Categorias **Despesas ordinárias** e **Despesas extraordinárias** (as duas colunas do relatório mensal do Jardins do Lago).
- `scripts/lancar-prestacao.ts`: lança um mês inteiro a partir do relatório passado a limpo (JSON em `scripts/dados-financeiro/`, fora do git porque o repositório é público). Confere subtotais e saldo antes de gravar e recusa mês que já tem lançamentos. Outubro/2026 lançado (não publicado).
- Topo no celular reorganizado; textos dizem "Residencial Jardins do Lago" em vez de "condomínio".

## O que falta

- **Login dos moradores**: pronto no código; falta testar no Firebase real com um morador de teste (o simulador já aceitou o e-mail sintético `.invalid`).
- **"Esqueci minha senha" sozinho**: hoje o morador pede uma senha nova ao síndico (o portal mostra o WhatsApp da administração).
- **Mapa real** (Fase 5): depende da planta do condomínio.
- **Link da votação oficial** (`/admin/informacoes`): ficou opcional — a votação agora é nativa em `/admin/votacao`.
- **Limpeza LGPD automática**: hoje é pelo botão em `/admin/portaria`; falta a tarefa agendada (Vercel Cron) chamar `limparVisitantesAntigos`.
- **Fase 6** não foi implementada (decisão do dono).

## Decisões em aberto

1. **Método de login**: **decidido (14/11/2026).** Equipe: e-mail e senha. Moradores: usuário (código gerado pelo portal) + senha provisória enviada pelo WhatsApp; o morador escolhe a própria senha no primeiro acesso. Informações gerais continuam abertas pelo link.
2. **Plano Blaze** (arquivos, backup automático, SMS). Os arquivos dos documentos já usam o Storage (exige Blaze). Sem Blaze não há política de expiração automática (TTL) no banco.
3. **Retenção LGPD** de visitantes: implementada com 90 dias — confirmar o prazo com o síndico.
4. **Planta** do condomínio para o mapa.
