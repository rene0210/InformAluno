-- ============================================================
-- Migracao one-time (local): cards da diretoria + notas por materia
-- ============================================================

-- 1. Serie/turma do aluno (campo unico, ex.: "6º Ano A")
ALTER TABLE alunos ADD COLUMN serie TEXT NOT NULL DEFAULT '';

-- 2. Notas: de "uma por aluno x bimestre" para "por aluno x bimestre x materia"
CREATE TABLE notas_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id INTEGER NOT NULL,
  materia TEXT NOT NULL DEFAULT '',
  bimestre INTEGER NOT NULL,
  nota REAL NOT NULL,
  professor_id INTEGER,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME,
  UNIQUE (aluno_id, bimestre, materia),
  FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE,
  FOREIGN KEY (professor_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
INSERT INTO notas_nova (id, aluno_id, materia, bimestre, nota, professor_id, criado_em, atualizado_em)
  SELECT id, aluno_id, '', bimestre, nota, professor_id, criado_em, atualizado_em FROM notas;
DROP TABLE notas;
ALTER TABLE notas_nova RENAME TO notas;

-- 3. Grade escolar: catalogo de materias da escola
CREATE TABLE IF NOT EXISTS materias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT UNIQUE NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO materias (nome, ordem) VALUES
  ('Português', 1),
  ('Matemática', 2),
  ('Ciências', 3),
  ('História', 4),
  ('Geografia', 5),
  ('Inglês', 6),
  ('Educação Física', 7),
  ('Artes', 8);

-- 4. Backfill da serie nos alunos de demonstracao
--    (aluno real mat. 212121 fica em branco — sera preenchido depois)
UPDATE alunos SET serie = '6º Ano A' WHERE id = 56;
UPDATE alunos SET serie = '6º Ano B' WHERE id = 3;
UPDATE alunos SET serie = '5º Ano A' WHERE id = 2;
UPDATE alunos SET serie = '6º Ano A' WHERE id = 1;
