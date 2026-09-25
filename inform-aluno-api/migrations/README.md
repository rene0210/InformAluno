# Migrações do banco (D1 local)

## Regra de ouro

**`inform-aluno-api/schema.sql` é a fonte única de verdade do schema.**
Num banco novo, `npm run db:setup` (dentro de `inform-aluno-api`) aplica o
schema inteiro — incluindo seeds (admin inicial e catálogo de matérias).

Reparos/migrações **one-time** para bancos que já existem **não entram no
schema.sql**: eles são aplicados pontualmente via `wrangler d1 execute` e o
SQL aplicado fica registrado nesta pasta como evidência histórica.

## Como aplicar uma migração one-time

```powershell
# 1) com o `npm run api` PARADO (o wrangler trava o arquivo do banco)
# 2) a partir de inform-aluno-api:
npx wrangler d1 execute inform-aluno-db --local --file migrations/historico/aplicadas/<arquivo>.sql
```

Boas práticas aprendidas neste projeto:

- **Arquivos grandes combinados podem falhar no parser do wrangler** —
  divida em pedaços (ex.: `d1-audit-fix-cards-notas.sql` é o pacote
  combinado; ele foi aplicado em `d1-fix-p1/p1b/p2/p3.sql`).
- **Separe mutação × inspeção**: um statement com erro aborta todo o
  output do arquivo; nunca misture SELECTs de conferência com UPDATE/DELETE.
- Após aplicar, atualize o `schema.sql` quando a mudança for de estrutura
  (coluna/tabela/constraint) para que bancos novos nasçam corretos.

## Conteúdo desta pasta

```
migrations/
├── README.md                 ← este arquivo
└── historico/
    ├── aplicadas/   (24)     ← SQL executado de fato no D1 local
    │                           (criação de tabelas, ALTERs, backfills,
    │                           limpezas de resíduo de smoke/E2E)
    └── inspecoes/   (20)     ← SELECTs de auditoria/evidência (somente leitura)
```

### Avisos importantes do histórico

- `aplicadas/d1-fix-elenco.sql` e `aplicadas/d1-repair.sql` gravavam
  **senhas em texto puro** (época anterior ao hash). **Não reexecute** esses
  arquivos: hoje as senhas são PBKDF2 (`inform-aluno-api/src/senha.ts`) e o
  caminho para trocar uma senha é `PATCH /api/admin/usuarios/:id/senha`
  (já grava hash) ou o upgrade preguiçoso no primeiro login.
- `aplicadas/d1-migracao-cards-notas.sql` criou `alunos.serie`, a tabela
  `notas` no formato atual (por matéria) e o seed de `materias` — tudo isso
  já está refletido no `schema.sql` atual.
- Os arquivos de "resíduo de smoke" (`cleanup-final.sql`, `limpa-email.sql`,
  `d1-fix-p*`) existem porque os smokes escrevem dados descartáveis; na
  prática os próprios smokes limpam o que criam.

## Backup

`npm run db:backup` (raiz) exporta o D1 local inteiro para
`backups/inform-aluno-db-<data>.sql` (pasta ignorada pelo git — contém
dados de usuários). Rode com o dev parado.
