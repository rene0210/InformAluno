SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios,
       (SELECT COUNT(*) FROM alunos) AS alunos,
       (SELECT COUNT(*) FROM responsaveis) AS responsaveis,
       (SELECT COUNT(*) FROM autorizacoes_temporarias) AS convites,
       (SELECT COUNT(*) FROM acompanhamentos) AS acomp;
SELECT id, nome, cpf FROM responsaveis ORDER BY id;
SELECT id, matricula, responsavel_id, responsavel2_id, responsavel3_id FROM alunos ORDER BY id;