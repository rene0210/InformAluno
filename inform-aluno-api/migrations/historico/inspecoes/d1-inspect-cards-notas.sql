-- Inspecao pos-migracao (somente SELECTs)
SELECT id, nome, matricula, serie FROM alunos ORDER BY id;
SELECT id, aluno_id, materia, bimestre, nota, professor_id FROM notas ORDER BY aluno_id, bimestre, materia;
SELECT id, nome, ordem FROM materias ORDER BY ordem;
PRAGMA table_info(notas);
