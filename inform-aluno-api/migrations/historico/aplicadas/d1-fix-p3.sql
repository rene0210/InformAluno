-- pedaco 3: notas do aluno demo -> uma linha por bimestre x materia
DELETE FROM notas
WHERE aluno_id = 56 AND materia = ''
  AND id IN (
    SELECT n1.id FROM notas n1
    JOIN notas n2 ON n2.aluno_id = n1.aluno_id
                 AND n2.bimestre = n1.bimestre
                 AND n2.materia = 'Matemática'
    WHERE n1.materia = ''
  );
UPDATE notas SET materia = 'Matemática' WHERE aluno_id = 56 AND materia = '';
