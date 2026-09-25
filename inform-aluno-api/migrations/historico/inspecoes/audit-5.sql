SELECT id, nome, matricula, status FROM alunos ORDER BY id;
SELECT id, nome, cpf FROM responsaveis ORDER BY id;
SELECT id, aluno_id, papel, substr(texto,1,40) AS texto FROM acompanhamentos ORDER BY id;
