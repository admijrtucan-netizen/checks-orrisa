// Prueba rapida del mapeo y las alarmas por obra.
// Uso: node checklist_prueba.js checklist-obras-asana-2026-09-27.csv
const L = require('./checklist_lib.js');
const rows = L.parseCSV(process.argv[2]);
for (const o of L.OBRAS) {
  const f = rows.filter(r => o.secciones.includes(r.section));
  const e = L.evaluar(f, '2026-09-27');
  const al = e.hitos.filter(h => h.severidad);
  console.log(o.nombre.padEnd(18), 'bq', f.length, 'mapeadas', e.total, 'sinEquiv', e.sinEquiv.length,
    'hitos', e.hitosHechos + '/' + e.hitosTotal,
    'alarmas', al.length + ' (criticas ' + al.filter(h => h.severidad == 'critica').length + ')',
    'fuera', e.fuera.length, 'atrasadas', e.atrasadas);
  if (e.sinEquiv.length) console.log('     sin equivalencia:', e.sinEquiv.map(s => s.nombre).join(' ; ').slice(0, 200));
}
