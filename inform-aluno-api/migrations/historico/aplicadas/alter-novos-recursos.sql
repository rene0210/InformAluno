-- Reparo local one-time (o schema.sql já tem as colunas; bancos antigos não)
ALTER TABLE alunos ADD COLUMN responsavel3_id INTEGER;
ALTER TABLE autorizacoes_temporarias ADD COLUMN tipo TEXT NOT NULL DEFAULT 'CONVIDADO_PORTARIA';
ALTER TABLE autorizacoes_temporarias ADD COLUMN aprovacao_token TEXT;
ALTER TABLE acompanhamentos ADD COLUMN atestado_base64 TEXT;
ALTER TABLE acompanhamentos ADD COLUMN atestado_nome TEXT;
