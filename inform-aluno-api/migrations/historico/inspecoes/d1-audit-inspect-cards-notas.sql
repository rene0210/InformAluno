-- Auditoria final do ciclo CARDS + NOTAS — INSPECCAO (somente SELECTs)

-- Registros restantes (feed de apresentacao VAN deve permanecer)
SELECT tipo, movimento, COUNT(*) AS n FROM registros_entrada GROUP BY tipo, movimento;

-- Integridade geral
SELECT COUNT(*) AS chat_mensagens FROM chat_mensagens;
SELECT COUNT(*) AS chat_leituras FROM chat_leituras;
SELECT COUNT(*) AS professores_com_foto FROM professores WHERE foto IS NOT NULL;
SELECT COUNT(*) AS usuarios_total FROM usuarios;
SELECT COUNT(*) AS alunos_total FROM alunos;
SELECT COUNT(*) AS convites_residuo FROM autorizacoes_temporarias;
SELECT COUNT(*) AS registros_orfaos
FROM registros_entrada r
WHERE r.pessoa_id IS NOT NULL
  AND (
    (r.tipo = 'PROFESSOR' AND NOT EXISTS (SELECT 1 FROM professores p WHERE p.id = r.pessoa_id))
    OR
    (r.tipo <> 'PROFESSOR' AND NOT EXISTS (SELECT 1 FROM alunos a WHERE a.id = r.pessoa_id))
  );

-- Notas: uma linha por aluno x bimestre x materia (sem duplicatas)
SELECT aluno_id, materia, bimestre, nota FROM notas ORDER BY aluno_id, bimestre, materia;
SELECT aluno_id, bimestre, materia, COUNT(*) AS n
FROM notas GROUP BY aluno_id, bimestre, materia HAVING n > 1;

-- Grade escolar + series
SELECT COUNT(*) AS materias_grade FROM materias;
SELECT id, matricula, serie FROM alunos ORDER BY id;
