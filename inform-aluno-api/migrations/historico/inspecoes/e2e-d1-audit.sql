SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios,
       (SELECT COUNT(*) FROM alunos) AS alunos,
       (SELECT COUNT(*) FROM responsaveis) AS responsaveis,
       (SELECT COUNT(*) FROM autorizacoes_temporarias) AS convites;
SELECT id, nome, cpf FROM responsaveis WHERE cpf LIKE '9910000%';
SELECT id, email FROM usuarios WHERE email LIKE 'e2e.%' OR email LIKE 'e2e.%@%';
SELECT id, matricula FROM alunos WHERE matricula LIKE '990%';
SELECT id, aluno_id, tipo, status, token FROM autorizacoes_temporarias;