// Convierte checks-avisos.json en el cuerpo Markdown del Issue.
// Uso: node checks/avisos_md.js salida/checks-avisos.json
const a = require(require('path').resolve(process.argv[2]));
const NOMBRES = {
  'seccion-nueva': 'Obra o sección nueva sin registrar',
  'codigo-desconocido': 'Código que no existe en la plantilla BASE',
  'sin-equivalencia': 'Tarea sin equivalencia en la plantilla',
};
const lineas = [];
if (!a.total) {
  lineas.push('✅ **CHECKS · sin avisos de datos** (corte ' + a.corte + ').');
} else {
  lineas.push('## CHECKS · ' + a.total + ' aviso(s) de datos', '', 'Corte: ' + a.corte,
    '', 'El tablero **sí se publicó**; estas tareas quedaron fuera o sin ligar a un hito.', '');
  for (const tipo of Object.keys(NOMBRES)) {
    const g = a.avisos.filter(x => x.tipo === tipo);
    if (!g.length) continue;
    lineas.push('### ' + NOMBRES[tipo] + ' (' + g.length + ')', ...g.map(x => '- ' + x.detalle), '');
  }
  lineas.push('**Qué hacer:** agregar la obra en `OBRAS`, el código en `BASE`, o la tarea en',
    '`CONOCIDAS_SIN_EQUIVALENCIA`, dentro de `checks/checklist_lib.js`.');
}
console.log(lineas.join('\n'));
