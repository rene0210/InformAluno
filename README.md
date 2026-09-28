# InformAluno

Sistema escolar completo: pré-cadastro de alunos e responsáveis, portaria com
reconhecimento facial, notas por matéria (grade escolar), chat familiar ×
professor × diretoria, painéis por perfil (diretoria, secretaria, professor,
responsável, aluno) e log de acessos.

**Stack**

| Camada | Tecnologia |
|---|---|
| Front | React 18 + TypeScript + Vite (porta 5173) |
| Backend | Hono em Cloudflare Workers + D1/SQLite local (porta 8787, wrangler dev) |
| Reconhecimento | face-api.js (modelos em `public/models/`) |
| Qualidade | `tsc` em 3 projetos + oxlint + suíte de smokes HTTP |

## Como rodar

```powershell
npm install
npm install --prefix inform-aluno-api

# terminal 1 — API (wrangler dev, 127.0.0.1:8787)
npm run api

# terminal 2 — front (Vite, http://localhost:5173 — usar localhost, não 127.0.0.1)
npm run dev
```

Banco novo (apaga e recria o schema completo, **com dev parado**):

```powershell
npm run db:setup --prefix inform-aluno-api
```

**Admin inicial:** `admin@informaluno.com`. A senha **não vem no repositório**:
num clone novo, rode a API *sem* `.dev.vars` e use "Esqueci a senha" na tela de
login para definir a sua (sem credencial de e-mail a API devolve o link na
própria tela); guarde-a em `ADMIN_SENHA` no `.dev.vars` para os testes.

## Scripts npm (raiz)

| Script | O que faz |
|---|---|
| `npm run dev` | Vite (front, porta 5173 fixa) |
| `npm run api` | wrangler dev (backend, porta 8787) |
| `npm run check` | **0 erros e 0 avisos**: tsc (app + api + componentes da API) + oxlint |
| `npm run verify` | check + probes HTTP das 22 rotas (`scripts/verificar-dev.ps1`) + suíte `smoke` |
| `npm run smoke` | teste de reprodutibilidade do schema + 5 smokes de runtime |
| `npm run db:backup` | exporta o D1 local para `backups/*.sql` (dev parado) |
| `npm run build` | build de produção (`tsc -b && vite build`) |

## Estrutura

```
├── src/                      # front (React)
│   ├── app.tsx               # rotas + <ControleInatividade />
│   ├── components/           # privateroute, inatividade (timeout 15 min), sessao, legaltermos
│   └── pages/                # home, cadastro, portaria, adm, diretoria, secretaria,
│                             # professor, responsavel, aluno, chat, atestado, auth, convite...
├── scripts/
│   ├── verificar-dev.ps1     # probes de rota do verify
│   ├── schema-fresh-test.mjs # valida que schema.sql monta um banco novo funcional
│   ├── migrar-senhas.mjs     # one-time: texto puro → hash (dev parado)
│   ├── db-backup.mjs         # backup do D1 local
│   ├── smoke/                # 5 smokes + run-all.mjs (npm run smoke)
│   └── e2e/                  # scripts E2E em PowerShell (atestado, convite, notas...)
└── inform-aluno-api/
    ├── src/index.ts          # Hono: ~90 rotas /api
    ├── src/senha.ts          # hash PBKDF2-SHA256 (100k iterações)
    ├── src/ratelimit.ts      # rate limit de login (falhas)
    ├── src/mailer.ts         # SMTP com fallback "modo log"
    ├── src/emailtemplates.ts # corpos de e-mail
    ├── schema.sql            # ⭐ FONTE ÚNICA DE SCHEMA (com seeds)
    ├── migrations/           # histórico das migrações one-time aplicadas
    └── wrangler.toml         # bindings D1 + instruções de deploy
```

## Convenções do projeto

- **`inform-aluno-api/schema.sql` é a fonte única de schema.** Migrações
  pontuais em banco existente: `wrangler d1 execute --local --file` com o dev
  parado, registradas em `inform-aluno-api/migrations/` (ver README de lá).
- **CSS das páginas**: apenas `src/pages/cadastro/Cadastro.css`
  (exceção: `src/pages/portaria/portaria.css`).
- **`npm run check` tem de fechar 0 erros / 0 avisos** antes de commitar.
- CPF: máximo 11 dígitos, só números, sobrevive a colar/autocomplete.
- Toda tela de navegação oferece o botão "← Voltar".
- Token de sessão: `localStorage`, revogado no servidor no logout e com
  expiração de 12 h; inatividade de 15 min encerra a sessão no front e no banco.

## Segurança

- **Senhas em hash PBKDF2-SHA256** (100 mil iterações, salt por conta,
  formato `pbkdf2$...`) — `inform-aluno-api/src/senha.ts`. Senhas antigas em
  texto puro são migradas sozinhas no primeiro login (ou via
  `node scripts/migrar-senhas.mjs` com dev parado).
- **Sessão server-side**: tabela `sessoes` com expiração; `POST /api/auth/logout`
  apaga a sessão imediatamente (helper `finalizarSessao()` do front).
- **Rate limit de login**: 10 falhas por 5 min (e-mail+IP) → 429; acerto zera.
  Em produção o contador é por isolate do Workers.
- **Cargos com whitelist**: auto-cadastro público só cria
  RESPONSAVEL/PORTARIA/MOTORISTA; demais cargos só por admin logado.
- **CORS por ambiente**: `CORS_ORIGINS` (vírgula) via `.dev.vars`/secret;
  padrão = portas de dev do Vite.
- Tokens (sessão, redefinição, convite) = `crypto.randomUUID()` com expiração.
- SQL sempre parametrizado; log de acessos por login (admin/diretoria).

## E-mails

Sem credenciais, tudo roda em **modo log** (conteúdo impresso no console,
nenhuma operação falha). Para envio real: copie
`inform-aluno-api/.dev.vars.example` → `.dev.vars` e preencha SMTP
(senha de app do Gmail). Em produção: `wrangler secret put SMTP_PASS` etc.

## Verificação e testes

```powershell
npm run check    # estático (tsc + oxlint) — rápido, sempre
npm run verify   # completo: check + probes + smokes (exige dev no ar)
```

- `scripts/smoke/` — suíte HTTP idempotente: novas features, cards+notas,
  chat, check-in/out, motorista/van. Sai com código ≠ 0 em qualquer falha.
- `scripts/schema-fresh-test.mjs` — monta um banco do zero e confere coluna
  `serie`, seed de `materias`, hash do admin e constraints (roda offline).
- `scripts/e2e/` — fluxos longos em PowerShell (convite, atestado, notas...).

## Deploy (produção)

1. `npx wrangler d1 create inform-aluno-db` (dentro de `inform-aluno-api`)
2. cole o `database_id` no `wrangler.toml` (linha comentada pronta)
3. `npm run deploy` (em `inform-aluno-api`)
4. `npx wrangler secret put CORS_ORIGINS` com a URL do front publicado
5. senhas de e-mail: `wrangler secret put SMTP_USER` / `SMTP_PASS`

## Limitações conhecidas

- D1 **local** (`.wrangler/state`) — sem banco remoto configurado ainda;
  use `npm run db:backup` para snapshot pontual.
- Rate limit de login é por isolate (defesa em profundidade; para limite
  global use Cloudflare Rate Limiting).
- "Hoje" do dashboard usa `DATE('now')` (UTC) — após 21 h de Brasília o dia
  local já virou no servidor.
- E-mails em modo log enquanto não houver `.dev.vars`.
