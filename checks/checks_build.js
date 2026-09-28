// Genera el tablero CHECKS de Orrisa: checks.html, checks-datos.json, checks-avisos.json
// y checklist-base-hitos.csv.
//
// Uso:  node checks/checks_build.js <filas.json|filas.csv> [fecha-corte] [carpeta-salida]
//
// El tablero es un HTML estatico y autonomo: los datos van embebidos, no hay
// credenciales ni consultas en vivo, asi que es seguro publicarlo abierto.
// Privacidad: NO se incluye responsable (assignee) de ninguna tarea.
//
// Los avisos de calidad de datos NO detienen la publicacion: se escriben en
// checks-avisos.json para que el workflow los reporte.
const fs = require('fs');
const path = require('path');
const L = require('./checklist_lib.js');

const entrada = process.argv[2];
if (!entrada) { console.error('Falta el archivo de filas (.json de bq o .csv)'); process.exit(2); }
const corte = process.argv[3] || new Date().toISOString().slice(0, 10);
const salida = process.argv[4] || '.';
fs.mkdirSync(salida, { recursive: true });

const filas = L.cargarFilas(entrada);
if (!filas.length) { console.error('La consulta no devolvio tareas: se aborta para no publicar un tablero vacio'); process.exit(3); }

const obras = L.OBRAS.map(o => {
  const e = L.evaluar(filas.filter(r => o.secciones.includes(r.section)), corte);
  return { id: o.id, nombre: o.nombre, terminada: !!o.terminada, ...e };
}).filter(o => o.hitosTotal > 0);   // una obra sin hitos mapeados no aporta a la ruta
const avisos = L.diagnosticar(filas, corte);

const datos = {
  marca: 'CHECKS', empresa: 'ORRISA', cadena: ['TUCAN', 'ORRISA', 'CHECKS'],
  corte, generado: new Date().toISOString().slice(0, 19) + 'Z',
  fuente: "Asana · proyecto CHECKLIST'S DE OBRAS · vía BigQuery (bases-de-datos-sheets.ASANA.tareas)",
  esquema: 1,
  obras,
};

const plantilla = fs.readFileSync(path.join(__dirname, 'checks_plantilla.html'), 'utf8');
const json = JSON.stringify(datos).replace(/</g, '\\u003c');
const out = n => path.join(salida, n);
fs.writeFileSync(out('checks.html'), plantilla.replace('/*__DATA__*/null', () => json));
fs.writeFileSync(out('checks-datos.json'), JSON.stringify(datos, null, 1));
fs.writeFileSync(out('checks-avisos.json'), JSON.stringify({ corte, total: avisos.length, avisos }, null, 1));
fs.writeFileSync(out('checklist-base-hitos.csv'), '﻿' + 'orden,codigo,tipo,linea,nombre,gid_asana\n' +
  L.BASE.map(b => [b.orden, b.codigo, b.hito ? 'HITO' : 'tarea', b.linea, '"' + b.nombre + '"', b.gid].join(',')).join('\n') + '\n');

for (const o of obras) {
  const al = o.hitos.filter(h => h.severidad);
  console.log('%s hitos %d/%d alarmas %d', o.nombre.padEnd(18), o.hitosHechos, o.hitosTotal, al.length);
}
console.log('%d tareas leidas · corte %s · checks.html %d KB', filas.length, corte, Math.round(fs.statSync(out('checks.html')).size / 1024));
if (avisos.length) {
  console.log('\n%d AVISO(S) DE DATOS:', avisos.length);
  for (const a of avisos) console.log('  [%s] %s', a.tipo, a.detalle);
}
