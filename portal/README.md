# Portal Jardins do Lago

Portal do condomínio (moradores, portaria, síndico e conselho): contas, visitantes, reservas, comunicados e mais, num só endereço, pelo celular.

**Tecnologia:** Next.js 16 + TypeScript + Tailwind CSS 4 · Firebase (Authentication, Firestore, App Check) · hospedagem na Vercel.

**Fase atual:** 3 (Portaria) e 4 (Reservas) entregues; informações gerais abertas pelo link e **login dos moradores** (usuário + senha enviados pelo WhatsApp) prontos no código (veja [docs/FASES.md](docs/FASES.md)).

| Documento | Conteúdo |
|---|---|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Como as peças se encaixam, identidade visual e navegação |
| [docs/BANCO.md](docs/BANCO.md) | Estrutura do Firestore e por quê |
| [docs/PERMISSOES.md](docs/PERMISSOES.md) | Perfis, permissões e como são aplicadas |
| [docs/SEGURANCA-LGPD.md](docs/SEGURANCA-LGPD.md) | Medidas de segurança, LGPD, backup |
| [docs/FASES.md](docs/FASES.md) | Roteiro e situação de cada fase |
| [docs/PRIMEIRO-ACESSO.md](docs/PRIMEIRO-ACESSO.md) | Como criar o primeiro administrador, o acesso da equipe e dos moradores (WhatsApp) e trocar a senha |

---

## 1. Instalação

Pré-requisitos: **Node.js 22+** e **Java 21+** (o simulador do Firebase precisa do Java).

```bash
cd portal
npm install
cp .env.example .env.local
```

O `.env.local` já vem pronto para o simulador. **Nunca** envie o `.env.local` ao GitHub (ele já está no `.gitignore`).

## 2. Rodar no computador (com o simulador)

```bash
npm run dev:emu
```

Isso liga o simulador do Firebase (login + banco), cria os dados de **demonstração** (fictícios) e abre o portal em http://localhost:3000.

- Na tela de entrada aparecem os botões **"Entrar como Morador / Portaria / Síndico / Conselho"**. Eles só existem no computador local com o simulador.
- Equipe demo com e-mail e senha (aba **"Sou da equipe"**) e o **morador demo da Casa 12** (aba **"Sou morador"**, usuário `DEMA22`): a senha fica em `portal/.acesso-demo.txt` (o arquivo é recriado a cada semeadura e não vai para o GitHub).
- Informações gerais sem login: http://localhost:3000/inicio?c=jardins-do-lago-demo (no simulador não existe o condomínio padrão `jardins-do-lago`, por isso o `?c=`).
- Códigos de visitante da demonstração: `K7M-4PX` (hoje, uso único), `PRT-3ZB` (prestador, 7 dias), `HGX-7QW` (amanhã).
- Painel do simulador (ver os dados gravados): http://127.0.0.1:4000
- Vitrine do visual: http://localhost:3000/identidade

> **Windows com acento no nome do usuário** (ex.: `C:\Users\Rafael Araújo`): o Java do simulador não funciona com essa pasta temporária. O script `scripts/firebase.mjs` já resolve isso sozinho, usando `C:\Users\Public\jardins-do-lago-tmp`.

## 3. Testes

| Comando | O que testa |
|---|---|
| `npm test` | Permissões, formatos (R$, datas, fuso), login demo desligado em produção, senhas, códigos e horários da portaria, regras das reservas |
| `npm run test:emu` | Regras do Firestore (isolamento entre casas e condomínios, ninguém grava direto, auditoria imutável), o contexto do usuário, portaria e reservas (inclusive dois pedidos no mesmo horário) |
| `npm run lint` / `npm run typecheck` | Qualidade e tipos do código |
| `npm run test:tudo` | Tudo acima |

`test:emu` liga o próprio simulador; feche o `dev:emu` antes (eles usam as mesmas portas).

## 4. Variáveis de ambiente

Veja os comentários em [.env.example](.env.example). Resumo:

| Variável | Onde | Segredo? |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | navegador | Não (identificam o projeto) |
| `NEXT_PUBLIC_USE_EMULATORS` | navegador | Não. `false` em produção |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | navegador | Não |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | servidor | **Sim** |
| `APP_CHECK_ENFORCE` | servidor | Não |
| `PORTARIA_SEGREDO_CODIGO` | servidor | **Sim** (obrigatório em produção, 32+ caracteres; trocar invalida os códigos já gerados) |
| `CONDOMINIO_PUBLICO` | servidor | Não. Condomínio do link sem `?c=` (padrão `jardins-do-lago`) |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | só local | Não. **Nunca** na Vercel |

## 5. Configurar o Firebase real (quando formos publicar)

1. Em https://console.firebase.google.com crie um projeto (ex.: `jardins-do-lago`). Analytics pode ficar desligado.
2. **Authentication** → Começar → ative **E-mail/senha**. Em Configurações → Política de senha, defina mínimo de 10 caracteres. Mantenha ligada a **proteção contra enumeração de e-mail**.
3. **Firestore Database** → Criar banco → região `southamerica-east1` (São Paulo) → modo **produção**.
4. **Configurações do projeto → Seus apps → Web**: registre o app e copie `apiKey`, `authDomain`, `projectId`, `appId` para as variáveis `NEXT_PUBLIC_FIREBASE_*`.
5. **Configurações do projeto → Contas de serviço → Gerar nova chave privada**: do JSON baixado, copie `client_email` e `private_key` para `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`. Guarde o arquivo em local seguro e **não** o coloque na pasta do projeto.
6. Publique regras e índices: `npx firebase login` e depois `npx firebase deploy --only firestore --project <id-do-projeto>`.
7. **App Check** → registre o app com reCAPTCHA v3, coloque a chave do site em `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, teste, e só então ligue `APP_CHECK_ENFORCE=true` e a aplicação obrigatória no Firestore.
8. Crie o condomínio e o primeiro administrador (passo a passo em [docs/PRIMEIRO-ACESSO.md](docs/PRIMEIRO-ACESSO.md)):
   `npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-email "<email>" --admin-nome "<nome>"`
   A senha provisória fica em `portal/.acesso-inicial.txt`. Apague o arquivo depois da troca. A alternativa `--admin-uid <UID>` continua valendo.

## 6. Deploy na Vercel

1. Na Vercel: **Add New → Project**, importe o repositório do GitHub.
2. **Root Directory: `portal`** (a raiz do repositório continua publicando o protótipo da votação em outro projeto).
3. Cadastre as variáveis de ambiente do item 4 (sem as `*_EMULATOR_HOST`) em **Settings → Environment Variables**.
4. Deploy. Cada `git push` na branch principal publica de novo.

Observação: o plano gratuito da Vercel (Hobby) não permite uso comercial. Para vender a plataforma, use o plano Pro.

## 7. Segurança (resumo)

- Informações gerais (prestação de contas publicada, mapa, contatos, agenda sem casas) abrem pelo link sem login; o que é da casa exige login.
- Moradores entram com usuário (código gerado pelo portal) + senha; a equipe com e-mail + senha. Senha provisória vista uma vez e troca obrigatória no 1º acesso.
- Toda gravação passa pelo servidor, que confere sessão, vínculo com o condomínio, permissão e registra auditoria.
- As regras do Firestore negam qualquer gravação vinda do navegador e limitam leituras por condomínio e por casa.
- O condomínio de cada pedido vem do cadastro no banco, nunca do navegador.
- Cookie de sessão `httpOnly`, cabeçalhos de segurança (CSP, HSTS, anti-iframe), limite de tentativas, App Check.
- Detalhes em [docs/SEGURANCA-LGPD.md](docs/SEGURANCA-LGPD.md).
