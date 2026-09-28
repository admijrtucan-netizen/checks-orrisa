// Alertas de CHECKS. Convierte el resultado de evaluar() en una lista de alertas
// con clave estable; checks_enviar.js compara contra la corrida anterior y manda
// solo lo NUEVO o lo RESUELTO al webhook.
//
// Privacidad: las alertas NO llevan responsables ni ningun dato de personas;
// solo obra, codigo, nombre de tarea y fechas.
//
// Umbrales (ajustables):
const UMBRAL = {
  estancada_dias: 7,      // obra activa sin ningun cierre en estos dias
  masivo_cierres: 5,      // tareas cerradas el mismo dia en una obra
  masivo_ventana: 3,      // solo se mira el cierre masivo de los ultimos N dias
};

const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmt = d => { if (!d) return ''; const [, m, dd] = d.split('-').map(Number); return dd + ' ' + MES[m - 1]; };
const ref = x => ({ codigo: x.codigo, nombre: x.nombre, cerrada: x.cerrada || null, vence: x.vence || null });
const lista = (a, n = 5) => a.slice(0, n).map(x => x.codigo + ' ' + x.nombre).join(', ') + (a.length > n ? ' y ' + (a.length - n) + ' más' : '');

function calcular(obras, avisos, corte) {
  const out = [];
  for (const o of obras.filter(x => !x.terminada)) {
    const obra = { id: o.id, nombre: o.nombre };
    for (const h of o.hitos) {
      if (h.severidad) {
        const hitos = h.alarmas.filter(a => a.hito), tareas = h.alarmas.filter(a => !a.hito);
        const partes = [];
        if (hitos.length) partes.push(hitos.length + (hitos.length === 1 ? ' hito anterior' : ' hitos anteriores') + ' (' + lista(hitos) + ')');
        if (tareas.length) partes.push(tareas.length + (tareas.length === 1 ? ' tarea anterior' : ' tareas anteriores') + ' (' + lista(tareas) + ')');
        out.push({ clave: 'hito-sin-anteriores|' + o.id + '|' + h.codigo, tipo: 'hito-sin-anteriores', severidad: h.severidad, obra,
          hito: ref(h), abiertas: h.alarmas.map(a => ({ codigo: a.codigo, nombre: a.nombre, esHito: !!a.hito, vence: a.vence || null })),
          mensaje: o.nombre + ': se cerró el hito ' + h.codigo + ' ' + h.nombre + (h.cerrada ? ' (' + fmt(h.cerrada) + ')' : '') +
            ' con ' + partes.join(' y ') + ' sin cerrar.' });
      } else if (!h.hecha && h.vence && h.vence < corte) {
        out.push({ clave: 'hito-atrasado|' + o.id + '|' + h.codigo, tipo: 'hito-atrasado', severidad: 'aviso', obra, hito: ref(h),
          mensaje: o.nombre + ': el hito ' + h.codigo + ' ' + h.nombre + ' está atrasado ' + dias(h.vence, corte) + ' día(s) (vencía ' + fmt(h.vence) + ').' });
      }
    }
    const todas = [...o.hitos, ...o.hitos.flatMap(h => h.tareas), ...o.huerfanas];
    const cerradas = todas.filter(x => x.hecha && x.cerrada);
    if (cerradas.length && o.hitosHechos < o.hitosTotal) {
      const ultima = cerradas.map(x => x.cerrada).sort().pop();
      if (dias(ultima, corte) >= UMBRAL.estancada_dias)
        out.push({ clave: 'obra-estancada|' + o.id, tipo: 'obra-estancada', severidad: 'aviso', obra, ultimoCierre: ultima,
          mensaje: o.nombre + ': sin cierres de tareas ni hitos en ' + dias(ultima, corte) + ' días (último ' + fmt(ultima) + '); van ' + o.hitosHechos + ' de ' + o.hitosTotal + ' hitos.' });
    }
    const porDia = {};
    for (const x of cerradas) (porDia[x.cerrada] = porDia[x.cerrada] || []).push(x);
    for (const [fecha, xs] of Object.entries(porDia))
      if (xs.length >= UMBRAL.masivo_cierres && dias(fecha, corte) <= UMBRAL.masivo_ventana)
        out.push({ clave: 'cierre-masivo|' + o.id + '|' + fecha, tipo: 'cierre-masivo', severidad: 'info', obra, fecha, cantidad: xs.length,
          mensaje: o.nombre + ': se cerraron ' + xs.length + ' tareas/hitos el mismo día (' + fmt(fecha) + '). Conviene revisar que se hayan ejecutado y no cerrado en bloque.' });
  }
  for (const a of avisos)
    out.push({ clave: 'aviso-datos|' + a.tipo + '|' + a.detalle.slice(0, 80), tipo: 'aviso-datos', severidad: 'info', obra: null,
      mensaje: 'Dato que CHECKS no supo interpretar: ' + a.detalle });
  return out;
}

module.exports = { calcular, UMBRAL };
