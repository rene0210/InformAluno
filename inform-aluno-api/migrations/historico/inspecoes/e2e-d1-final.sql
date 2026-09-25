SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios,
       (SELECT COUNT(*) FROM alunos) AS alunos,
       (SELECT COUNT(*) FROM responsaveis) AS responsaveis,
       (SELECT COUNT(*) FROM autorizacoes_temporarias) AS convites,
       (SELECT COUNT(*) FROM acompanhamentos) AS acomp,
       (SELECT COUNT(*) FROM notas) AS notas;
SELECT id FROM responsaveis WHERE id NOT IN (
  SELECT responsavel_id FROM alunos WHERE responsavel_id IS NOT NULL
  UNION SELECT responsavel2_id FROM alunos WHERE responsavel2_id IS NOT NULL
  UNION SELECT responsavel3_id FROM alunos WHERE responsavel3_id IS NOT NULL
) AND id NOT IN (SELECT responsavel_id FROM responsavel_usuario);
SELECT id, matricula FROM alunos ORDER BY id;