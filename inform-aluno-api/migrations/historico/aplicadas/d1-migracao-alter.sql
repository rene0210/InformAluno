-- Migração check-in/check-out (one-time, local) — não pertence ao schema.sql
ALTER TABLE registros_entrada ADD COLUMN movimento TEXT;
ALTER TABLE professores ADD COLUMN foto TEXT;

PRAGMA table_info(registros_entrada);
PRAGMA table_info(professores);
