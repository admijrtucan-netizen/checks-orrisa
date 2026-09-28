// Nucleo compartido de CHECKS: hitos del checklist de obra (alarmas + tablero).
// BASE = seccion BASE del proyecto de Asana "CHECKLIST'S DE OBRAS", en su orden.
// BigQuery ASANA.tareas NO trae resource_subtype ni posicion (taskType='task'
// en todas las filas), por eso el orden y cuales tareas son HITOS se declaran aqui.
const fs = require('fs');

// [codigo, hito?, nombre, gid en BASE]
const BASE_CRUDA = [
 ['PRE',0,'Preliminares de obra','1213530803593170'],['ON1',0,'Trazo manual','1213514071984352'],
 ['ON2-L',1,'Excavación manual','1213530802837719'],['ON3-L',1,'Excavación retro','1213530800034256'],
 ['ON4',0,'Piscina preliminares','1213530802829839'],['ON5',0,'Mamposterías','1213530802831036'],
 ['ON6-L',1,'Zapatas y dados','1213530803572976'],['ON7-L',1,'Cadenas de cimentación','1213530804211077'],
 ['ON8-L',1,'Muros PB','1213530803546130'],['ON9',0,'Piscina estructura','1213791879088480'],
 ['ON10-L',1,'Castillos y columnas PB','1213530786242147'],['ON11',0,'Inst. eléctricas 1 PB','1213530803593032'],
 ['ON12',0,'Inst. hidrosanitarias 1 PB','1213530762955982'],['ON13-L',1,'Losas PB','1213530804257472'],
 ['ON14',0,'Cisterna','1213716152737992'],['ON15-L',1,'Prueba hidráulica 1er losa','1213516424590371'],
 ['ON16-L',1,'Inst. en losa PB','1213530801351116'],['ON17',0,'Muros PA','1213530795456494'],
 ['ON18-L',1,'Castillos y columnas PA','1213516424673699'],['ON19',0,'Inst. eléctricas 1 PA','1213530802825056'],
 ['ON20',0,'Inst. hidrosanitarias 1 PA','1213530809030619'],['ON21',0,'Tableros eléctricos','1213794554473703'],
 ['ON22-L',1,'Losas PA','1213530802829871'],['ON23',0,'Cisterna (instalación)','1213716152738001'],
 ['ON24',0,'Biodigestor o sitar','1213716152737994'],['ON25-L',1,'Prueba hidráulica 2da losa','1213518780243202'],
 ['ON26-L',1,'Inst. en losa PA','1213530803593044'],['ON27-L',1,'Escalera','1213530809742392'],
 ['ON28',0,'Piscina instalaciones','1213530809079201'],
 ['OG1',0,'Inst. eléctricas 2 PB','1213516424637193'],['OG2',0,'Inst. eléctricas 2 PA','1213530801310861'],
 ['OG3',0,'Inst. hidrosanitarias 2 PB','1213530793960420'],['OG4',0,'Inst. hidrosanitarias 2 PA','1213514071857159'],
 ['OG5',0,'Bomba y cisternas','1213530800054370'],['OG6-L',1,'Prueba pluvial','1214005931755404'],
 ['OG7-L',1,'Prueba sanitaria','1213530808746923'],['OG8',0,'Acabados PB y PA','1213516424605683'],
 ['OG9',0,'Cancelería medición','1213530808127639'],['OG10',0,'Carpintería medición','1213530795483182'],
 ['OG11',0,'Firmes','1213530803552143'],['OG12-L',1,'Carpintería entrega','1213530809098185'],
 ['OG13-L',1,'Cancelería entrega','1213530802812682'],['OG14',0,'Muebles de baño','1213514072005130'],
 ['OG15',0,'Mármol y granitos','1213522052511539'],['OG16',0,'Herrería decorativa','1213530809083959'],
 ['OG17',0,'Piscina firme y aplanados','1213516424725837'],['OG18',1,'Liberaciones piscina','1213522052531014'],
 ['OG19',0,'Acabados piscina 2','1213791879088486'],['OG20-L',1,'Azoteas','1214137816063821'],
 ['OG21',0,'Aires acondicionados','1213577519882460'],['OG22',0,'Jardineras','1213791879088504'],
 ['OG23',0,'Pintura','1213603787343510'],
 ['1EF',1,'Entrega final · Inodoros','1213635948926024'],['2EF',1,'Entrega final · Lavamanos','1213815497068115'],
 ['3EF',1,'Entrega final · Regaderas','1213635854302987'],['4EF',1,'Entrega final · Accesorios de baños','1213635854302996'],
 ['5EF',1,'Entrega final · Circuitos','1213635854303003'],['6EF',1,'Entrega final · Luminarias y ventiladores','1213635854303008'],
 ['7EF',1,'Entrega final · Contactos','1213635854303019'],['8EF',1,'Entrega final · Calentador','1213635854303025'],
 ['9EF',1,'Entrega final · Bomba de cisterna','1213635854303033'],['10EF',1,'Entrega final · Bomba pozo profundo','1213635854303042'],
 ['11EF',1,'Entrega final · Presurizador','1213635854303048'],['12EF',1,'Entrega final · Cocina','1213635854303055'],
 ['13EF',1,'Entrega final · Presurizador (2)','1213635854303063'],['14EF',1,'Entrega final · Tablero','1213964346392533'],
 ['14EF-AZOTEA',1,'Entrega final · Azotea','1217595209456730'],
];
// linea: la piscina y las entregas finales son frentes paralelos; una alarma solo cuenta
// lo abierto de SU linea (si no, la piscina, que se ejecuta tarde, dispara falsas alarmas).
// PROVISIONAL - a confirmar con Orrisa.
const PISCINA = new Set(['ON4', 'ON9', 'ON28', 'OG17', 'OG18', 'OG19']);
const lineaDe = c => PISCINA.has(c.replace(/-L$/, '')) ? 'piscina' : /EF/.test(c) ? 'entrega' : 'obra';
const BASE = BASE_CRUDA.map(([codigo, hito, nombre, gid], i) =>
  ({ orden: i + 1, codigo, hito: !!hito, nombre, gid, linea: lineaDe(codigo) }));


// Obras con la numeracion vieja (1-37) no llevan codigo ON/OG/EF: se mapean por nombre.
// PROVISIONAL - pendiente de que Orrisa confirme la equivalencia.
const REGLAS = [
 [/PRELIMINARES DE OBRA/, 'PRE'], [/TRAZO/, 'ON1'], [/EXCAVACION MANUAL/, 'ON2'], [/EXCAVACION RETRO/, 'ON3'],
 [/MAMPOSTERIAS/, 'ON5'], [/ZAPATAS/, 'ON6'], [/CADENAS/, 'ON7'], [/MUROS - PB/, 'ON8'],
 [/CASTILLOS Y COLUMNAS - PB/, 'ON10'], [/ELECTRICAS 1 - PB/, 'ON11'], [/HIDROSANITARIAS 1 - PB/, 'ON12'],
 [/LOSAS - PB/, 'ON13'], [/PRUEBA HID 1ER/, 'ON15'], [/INSTALACIONES EN LOSA - PB/, 'ON16'], [/MUROS - PA/, 'ON17'],
 [/CASTILLOS Y COLUMNAS - PA/, 'ON18'], [/ELECTRICAS 1 - PA/, 'ON19'], [/HIDROSANITARIAS 1 - PA/, 'ON20'],
 [/LOSAS - PA/, 'ON22'], [/PRUEBAS? HIDR.* LOSA/, 'ON25'], [/INSTALACIONES EN LOSA - PA/, 'ON26'],
 [/ESCALERA/, 'ON27'], [/PISCINA PREELIMINARES/, 'ON4'], [/PISCINA ESTRUCTURA/, 'ON9'], [/PISCINA INSTALACIONES/, 'ON28'],
 [/ELECTRICAS 2 - PB/, 'OG1'], [/ELECTRICAS 2 - PA/, 'OG2'], [/HIDROSANITARIAS 2 - PB/, 'OG3'],
 [/HIDROSANITARIAS 2 - PA/, 'OG4'], [/BOMBA Y CISTERNAS/, 'OG5'], [/PRUEBA PLUVIAL/, 'OG6'],
 [/PRUEBA SANITARIA\s*$/, 'OG7'], [/ACABADOS PB Y PA/, 'OG8'], [/\bFIRMES\b/, 'OG11'],
 [/CARPINTERIA ENTREGA/, 'OG12'], [/CANCELERIA ENTREGA/, 'OG13'], [/MUEBLES DE BANO/, 'OG14'],
 [/MARMOL/, 'OG15'], [/HERRERIA/, 'OG16'], [/PISCINA FIRME/, 'OG17'], [/LIBERACIONES PISCINA/, 'OG18'],
 [/PISCINA 2/, 'OG19'],
];
const sinAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function codigoDe(nombre) {
  const n = sinAcentos(nombre);
  let m = n.match(/\b(PRE|ON\d+|OG\d+|\d+EF)\b/);
  if (m) return m[1];
  if (/ENTREGA FINAL ETAPA/.test(n)) { m = n.match(/^\s*(\d+)\s/); if (m) return m[1] + 'EF'; }
  for (const [re, c] of REGLAS) if (re.test(n)) return c;
  return null;
}
const baseDe = c => c && BASE.find(b => b.codigo.replace(/-L$/, '') === c);

function parseCSV(ruta) {
  const parse = l => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i];
    if (q) { if (ch == '"' && l[i + 1] == '"') { c += '"'; i++; } else if (ch == '"') q = false; else c += ch; }
    else if (ch == '"') q = true; else if (ch == ',') { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const t = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '').trim().split('\n');
  const h = parse(t[0]);
  return t.slice(1).map(parse).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

// Obra -> secciones de BigQuery que la componen
const OBRAS = [
 { id: 'gaeta-35', nombre: 'Gaeta 35', secciones: ['GAETA 35 | 2026', 'Checklist'] },
 { id: 'casa-shami', nombre: 'Casa Shami', secciones: ['SHAMI | 2026'] },
 { id: 'casa-paal', nombre: 'Casa Paal', secciones: ['CASA PAAL | 2025'] },
 { id: 'gaeta-50', nombre: 'Gaeta 50', secciones: ['GAETA 50 | 2025 / TERMINADA'], terminada: true },
 { id: 'casa-santiago', nombre: 'Casa Santiago', secciones: ['SANTIAGO |2025'], terminada: true },
 { id: 'casa-abupi', nombre: 'Casa Abupi', secciones: ['ABUPI | 2025 / TERMINADA'], terminada: true },
 { id: 'casa-cactus', nombre: 'Casa Cactus', secciones: ['CACTUS | 2026 / TERMINADA'], terminada: true },
 { id: 'casa-chakun', nombre: 'Casa Chakun', secciones: ['CHAKUN 2025 | TERMINADA'], terminada: true },
 { id: 'oficina-chuburna', nombre: 'Oficina Chuburná', secciones: ['OFICINA CHUBURNÁ | 2026 / TERMINADA'], terminada: true },
];

const dia = s => (s || '').slice(0, 10) || null;

function evaluar(filas, corte) {
  const items = new Map(); const sinEquiv = [];
  for (const r of filas) {
    const cod = codigoDe(r.name); const b = baseDe(cod);
    if (!b) { sinEquiv.push({ nombre: r.name.replace(/\p{Extended_Pictographic}|️/gu, '').trim(), hecha: r.status === 'true' }); continue; }
    const hecha = r.status === 'true', cerr = dia(r.cerrada), vence = dia(r.dueOn);
    const it = items.get(b.codigo);
    if (it) { it.hecha = it.hecha && hecha; it.cerrada = [it.cerrada, cerr].filter(Boolean).sort().pop() || null; continue; }
    items.set(b.codigo, { orden: b.orden, codigo: b.codigo, nombre: b.nombre, hito: b.hito, linea: b.linea, hecha, cerrada: cerr, vence });
  }
  const lista = [...items.values()].sort((a, b) => a.orden - b.orden);
  const hitos = lista.filter(x => x.hito);
  // hito que la tarea libera: el siguiente de su misma linea; si ya no hay, el siguiente a secas
  const gate = t => hitos.find(h => h.orden > t.orden && h.linea === t.linea) || hitos.find(h => h.orden > t.orden);
  for (const t of lista) t.atrasada = !t.hecha && !!t.vence && t.vence < corte;
  const salida = hitos.map(h => {
    const propias = lista.filter(t => !t.hito && gate(t) === h);
    const previas = lista.filter(t => t.orden < h.orden && t.linea === h.linea && !t.hecha);
    const alarma = h.hecha ? previas : [];
    return { ...h, tareas: propias,
      alarmas: alarma.map(a => ({ codigo: a.codigo, nombre: a.nombre, hito: a.hito })),
      severidad: !alarma.length ? null : alarma.some(a => a.hito) ? 'critica' : 'aviso' };
  });
  // cierres fuera de orden: tarea cerrada despues de un hito posterior ya cerrado
  const fuera = [];
  for (const t of lista.filter(x => x.hecha && x.cerrada)) {
    const pos = hitos.find(x => x.hecha && x.cerrada && x.orden > t.orden && x.cerrada < t.cerrada);
    if (pos) fuera.push({ codigo: t.codigo, nombre: t.nombre, cerrada: t.cerrada, hito: pos.codigo, hitoCerrado: pos.cerrada });
  }
  return { hitos: salida, huerfanas: lista.filter(t => !t.hito && !gate(t)), fuera, sinEquiv,
    total: lista.length, hechas: lista.filter(t => t.hecha).length,
    hitosTotal: hitos.length, hitosHechos: hitos.filter(h => h.hecha).length,
    atrasadas: lista.filter(t => t.atrasada).length };
}

// Filas de entrada: CSV (consulta manual) o JSON (salida de bq --format=json).
function cargarFilas(ruta) {
  if (!/\.json$/i.test(ruta)) return parseCSV(ruta);
  const j = JSON.parse(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '') || '[]');
  return j.map(r => ({ ...r, status: String(r.status) }));   // bq entrega el booleano como texto o como bool
}

// Tareas que se sabe que no caben en la plantilla BASE (extras de obras concretas).
// No generan aviso; cualquier otra sin equivalencia SI.
const CONOCIDAS_SIN_EQUIVALENCIA = [/BODEGA DE OBRA/, /PRUEBA DRENAJE AIRES/, /PRUEBA SANITARIA ESTRUCTURA/];

// Avisos de calidad de datos: lo que el mapeo no supo interpretar. Para que una
// tarea nueva, un codigo nuevo o una obra nueva no pasen en silencio.
function diagnosticar(filas, corte) {
  const avisos = [];
  const registradas = new Set(OBRAS.flatMap(o => o.secciones));
  const porSeccion = {};
  for (const r of filas) (porSeccion[r.section] = porSeccion[r.section] || []).push(r);
  for (const [sec, rs] of Object.entries(porSeccion))
    if (!registradas.has(sec))
      avisos.push({ tipo: 'seccion-nueva', detalle: 'Seccion "' + sec + '" (' + rs.length + ' tareas) no esta en OBRAS: no aparece en el tablero' });
  for (const r of filas.filter(x => registradas.has(x.section))) {
    const n = sinAcentos(r.name || ''); const cod = codigoDe(r.name || '');
    const forma = n.match(/\b(ON\d+|OG\d+|\d+EF)\b/);
    if (forma && !baseDe(cod))
      avisos.push({ tipo: 'codigo-desconocido', detalle: '"' + r.name.trim() + '" (' + r.section + '): el codigo ' + forma[1] + ' no existe en la plantilla BASE' });
    else if (!cod && !CONOCIDAS_SIN_EQUIVALENCIA.some(re => re.test(n)))
      avisos.push({ tipo: 'sin-equivalencia', detalle: '"' + r.name.replace(/\p{Extended_Pictographic}/gu, '').trim() + '" (' + r.section + '): sin equivalencia en la plantilla' });
  }
  // Una tarea de obra ACTIVA con codigo de la plantilla pero repetida en dos secciones distintas seria ambigua
  return avisos;
}
module.exports = { BASE, OBRAS, parseCSV, cargarFilas, diagnosticar, evaluar, codigoDe, baseDe };
