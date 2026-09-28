// Envia las alertas de CHECKS al webhook (n8n). Solo manda lo NUEVO o lo RESUELTO
// respecto a la corrida anterior, para no repetir la misma alarma cada hora.
//
// Uso: node checks/checks_enviar.js <checks-alertas.json> <estado-previo.json> <checks-datos.json>
//
// Entorno:
//   CHECKS_WEBHOOK_URL  URL del webhook (SECRETO de GitHub, nunca en el codigo ni en logs)
//   TABLERO_URL         liga del tablero publico, para incluirla en el mensaje
//   MODO                normal (defecto) | todo (reenvia TODAS las activas) | prueba (un solo evento de prueba)
//   DRY_RUN=1           imprime lo que enviaria, sin enviar
//
// Salida: escribe avanzar=true|false en $GITHUB_OUTPUT. El workflow solo guarda el
// estado nuevo cuando avanzar=true, asi que una alerta que no se pudo enviar se
// reintenta en la siguiente corrida en lugar de perderse.
const fs = require('fs');

const [, , fAlertas, fPrevio, fDatos] = process.argv;
const url = process.env.CHECKS_WEBHOOK_URL || '';
const modo = process.env.MODO || 'normal';
const dry = process.env.DRY_RUN === '1';
const tablero = process.env.TABLERO_URL || '';
const MAX_POR_CORRIDA = 15;
const ORDEN = { critica: 0, aviso: 1, info: 2 };
// Resolver estas alertas es una buena noticia util; las otras se resuelven en silencio.
const AVISA_RESUELTA = new Set(['hito-sin-anteriores', 'hito-atrasado', 'obra-estancada']);

const leer = f => (f && fs.existsSync(f)) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : null;
const salida = v => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'avanzar=' + v + '\n'); };

async function post(evento) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(evento), signal: AbortSignal.timeout(15000) });
      if (r.ok) return;
      throw new Error('HTTP ' + r.status);
    } catch (e) {
      if (i === 3) throw new Error('no se pudo enviar (' + e.message + ')');
      await new Promise(res => setTimeout(res, i * 2000));
    }
  }
}

function resuelta(clave, datos) {
  const [tipo, obraId, codigo] = clave.split('|');
  const obra = datos && datos.obras.find(o => o.id === obraId);
  const hito = obra && codigo ? obra.hitos.find(h => h.codigo === codigo) : null;
  const nombre = obra ? obra.nombre : obraId;
  const que = { 'hito-sin-anteriores': 'la alarma del hito ' + codigo + (hito ? ' ' + hito.nombre : ''),
    'hito-atrasado': 'el atraso del hito ' + codigo + (hito ? ' ' + hito.nombre : ''),
    'obra-estancada': 'la obra sin movimiento' }[tipo];
  return { clave, tipo, severidad: 'info', obra: { id: obraId, nombre }, hito: hito ? { codigo: hito.codigo, nombre: hito.nombre } : null,
    mensaje: nombre + ': se resolvió ' + que + '.' };
}

(async () => {
  const { corte, alertas } = leer(fAlertas) || { alertas: [] };
  const previo = leer(fPrevio), datos = leer(fDatos);
  const evento = (estado, alerta) => ({ evento: 'checks.alerta', version: 1, estado, enviado: new Date().toISOString(), corte, tablero, alerta });

  let lote = [];
  if (modo === 'prueba') {
    lote = [evento('prueba', { clave: 'prueba', tipo: 'prueba', severidad: 'info', obra: null,
      mensaje: 'Prueba de conexión de CHECKS. Si lo ves, el webhook recibe bien las alertas.' })];
  } else {
    const claves = new Set(alertas.map(a => a.clave)), previas = new Set(previo ? previo.claves : []);
    let nuevas = modo === 'todo' ? alertas : alertas.filter(a => !previas.has(a.clave));
    if (!previo && modo !== 'todo') { nuevas = []; console.log('Primera corrida: se registra la línea base sin enviar (use MODO=todo para enviar las activas).'); }
    nuevas.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad]);
    const res = previo ? [...previas].filter(k => !claves.has(k)).filter(k => AVISA_RESUELTA.has(k.split('|')[0])).map(k => resuelta(k, datos)) : [];
    lote = [...nuevas.map(a => evento('nueva', a)), ...res.map(a => evento('resuelta', a))];
    if (lote.length > MAX_POR_CORRIDA) {
      const extra = lote.length - (MAX_POR_CORRIDA - 1);
      lote = [...lote.slice(0, MAX_POR_CORRIDA - 1), { evento: 'checks.desborde', version: 1, enviado: new Date().toISOString(), corte, tablero,
        mensaje: 'Hay ' + extra + ' alertas más en esta corrida. Revisa el tablero.' , cantidad: extra }];
    }
    console.log('%d alerta(s) activa(s) · %d nueva(s) · %d resuelta(s) · %d evento(s) a enviar', alertas.length, nuevas.length, res.length, lote.length);
  }

  if (dry) { for (const e of lote) console.log(JSON.stringify(e, null, 1)); salida('false'); return; }
  if (!lote.length) { salida('true'); return; }
  if (!url) { console.log('::warning::CHECKS_WEBHOOK_URL no está configurado: no se envió nada y el estado NO avanza (se reintentará).'); salida('false'); return; }
  for (const e of lote) await post(e);
  console.log('Enviado(s): %d', lote.length);
  salida(modo === 'prueba' ? 'false' : 'true');   // una prueba no debe "gastar" las alertas reales
})().catch(e => { console.error('::error::' + e.message); process.exit(1); });
