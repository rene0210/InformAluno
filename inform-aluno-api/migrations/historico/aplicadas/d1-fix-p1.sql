-- pedaco 1: limpezas de residuo
DELETE FROM registros_entrada WHERE nome = 'Aluno Smoke Checkin';
DELETE FROM professores
WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = 'professor.rafael@informaluno.com');
DELETE FROM chat_mensagens WHERE texto LIKE 'Smoke chat:%';
