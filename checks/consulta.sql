SELECT id, name, section, status, dueOn, DATE(completedAt) AS cerrada
FROM `bases-de-datos-sheets.ASANA.tareas`
WHERE project LIKE 'CHECKLIST%'
