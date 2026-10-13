#!/usr/bin/env node
/* ==========================================================================
   KOA-SPORTS — scripts/diagnostico-startgg.js
   Diagnóstico OPCIONAL y de SOLO LECTURA contra Start.gg REAL. No forma parte
   del sitio ni de Vercel (ver .vercelignore): lo ejecuta una persona, en su
   propio equipo, con sus propias credenciales.

   Para qué sirve: el esquema de Start.gg no describe qué hace el filtro
   `published` ni a qué entero corresponde cada `Tournament.state`. Las pruebas
   automáticas (test/) son SIMULADAS y no pueden demostrarlo; este script sí,
   con los datos reales de la cuenta:
     1. Cuántos torneos devuelve la consulta de producción (`published: true`)
        y cuántos devolvería SIN ese filtro, y cuáles son los excluidos.
     2. Qué valor de `state` trae cada torneo y qué estado le calcula el sitio
        (live / upcoming / finished…), para comprobar el mapeo con datos reales.
     3. Qué entregaría hoy /api/torneos (conteo por estado).

   Uso (Node.js ≥ 18, sin dependencias):
       STARTGG_TOKEN=<token> STARTGG_OWNER_ID=<id numérico> node scripts/diagnostico-startgg.js

   Hace como máximo 2 × MAX_PAGES peticiones (una pasada con el filtro y otra
   sin él), una detrás de otra, con plazo por petición. Nunca imprime el token.
   Lo que imprime son datos de TU cuenta (incluidos torneos no publicados):
   no pegues la salida en sitios públicos sin revisarla.
   ========================================================================== */

'use strict';

const handler = require('../api/torneos.js');
const {
  STARTGG_ENDPOINT, PER_PAGE, MAX_PAGES, REQUEST_TIMEOUT_MS,
  leerConfiguracion, transformarTorneo, normalizarTorneos,
} = handler.internals;

/* Misma consulta que la de producción, con dos diferencias de diagnóstico:
   el filtro `published` es opcional y se piden `state` y `publishing` (campos
   que existen en el esquema: `state` Int y `publishing` JSON). */
function consulta(soloPublicados) {
  const filtro = soloPublicados ? 'ownerId: $ownerId, published: true' : 'ownerId: $ownerId';
  return `
  query KoaDiagnostico($ownerId: ID!, $page: Int!, $perPage: Int!) {
    tournaments(query: {
      page: $page
      perPage: $perPage
      sortBy: "startAt desc"
      filter: { ${filtro} }
    }) {
      pageInfo { total totalPages }
      nodes {
        id name slug url(relative: false)
        startAt endAt isRegistrationOpen registrationClosesAt
        state publishing
      }
    }
  }`;
}

/* Lee las páginas de una consulta (máx. MAX_PAGES). Lanza Error con un mensaje
   sin datos sensibles si Start.gg rechaza o responde algo inesperado. */
async function paginar(config, soloPublicados, fetchFn) {
  const nodos = [];
  let total = null;
  let peticiones = 0;

  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const respuesta = await fetchFn(STARTGG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ query: consulta(soloPublicados), variables: { ownerId: config.ownerId, page: pagina, perPage: PER_PAGE } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    peticiones++;

    if (!respuesta.ok) throw new Error('Start.gg respondió con HTTP ' + respuesta.status);
    const json = await respuesta.json();
    if (json && json.success === false) throw new Error('Start.gg rechazó la consulta: ' + String(json.message || '').slice(0, 200));
    if (json && Array.isArray(json.errors) && json.errors.length) {
      throw new Error('Errores GraphQL: ' + json.errors.map((e) => String((e && e.message) || e)).join(' | ').slice(0, 400));
    }
    const conexion = json && json.data && json.data.tournaments;
    if (!conexion || !Array.isArray(conexion.nodes)) throw new Error('La respuesta no trae data.tournaments.nodes');

    nodos.push(...conexion.nodes);
    const info = conexion.pageInfo || {};
    if (Number.isInteger(info.total)) total = info.total;
    const totalPaginas = Number.isInteger(info.totalPages) ? info.totalPages : null;
    if (totalPaginas !== null ? pagina >= totalPaginas : conexion.nodes.length < PER_PAGE) break;
  }
  return { nodos, total, peticiones };
}

const fecha = (segundos) => (Number.isFinite(Number(segundos)) && Number(segundos) > 0
  ? new Date(Number(segundos) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  : 'sin fecha');

/**
 * Ejecuta el diagnóstico. `fetchFn`, `escribir` y `ahora` se pueden sustituir
 * (así lo hacen las pruebas simuladas). Devuelve un resumen con los conteos.
 */
async function diagnosticar({ fetchFn = globalThis.fetch, escribir = console.log, ahora = Date.now() } = {}) {
  const config = leerConfiguracion(); // lanza 503 (y registra solo NOMBRES de variables) si falta algo

  const publicados = await paginar(config, true, fetchFn);
  const todos = await paginar(config, false, fetchFn);

  const idsPublicados = new Set(publicados.nodos.filter((n) => n && n.id != null).map((n) => String(n.id)));
  const excluidos = todos.nodos.filter((n) => n && n.id != null && !idsPublicados.has(String(n.id)));

  escribir('— Visibilidad (filtro published: true) —');
  escribir('Con published: true : ' + publicados.nodos.length + ' leídos (pageInfo.total = ' + publicados.total + ')');
  escribir('Sin filtro          : ' + todos.nodos.length + ' leídos (pageInfo.total = ' + todos.total + ')');
  escribir('Excluidos por published: true: ' + excluidos.length);
  for (const n of excluidos.slice(0, 30)) {
    const publishing = JSON.stringify(n.publishing === undefined ? null : n.publishing);
    escribir('  · id ' + n.id + ' | ' + n.name + ' | inicio ' + fecha(n.startAt) + ' | state=' + n.state + ' | publishing=' + String(publishing).slice(0, 200));
  }
  if (excluidos.length) escribir('  Revisa si esos torneos deberían ser públicos: si no lo son, el filtro hace lo esperado.');
  if ((publicados.total || 0) > MAX_PAGES * PER_PAGE) {
    escribir('AVISO: hay más de ' + (MAX_PAGES * PER_PAGE) + ' torneos publicados; el sitio solo lee los ' + (MAX_PAGES * PER_PAGE) + ' primeros según el orden de Start.gg.');
  }

  escribir('');
  escribir('— state de Start.gg frente al estado calculado por el sitio (torneos publicados) —');
  const tabla = {};
  for (const nodo of publicados.nodos) {
    const r = transformarTorneo(nodo, ahora);
    const calculado = r.item ? r.item.torneo.status : 'descartado (' + r.motivo + ')';
    const clave = 'state=' + (nodo && nodo.state);
    tabla[clave] = tabla[clave] || {};
    tabla[clave][calculado] = (tabla[clave][calculado] || 0) + 1;
  }
  for (const clave of Object.keys(tabla).sort()) {
    escribir('  ' + clave + ' → ' + Object.entries(tabla[clave]).map(([k, v]) => k + ': ' + v).join(', '));
  }
  escribir('  (El sitio NO usa `state`: la referencia no documenta su mapeo. Si las filas anteriores son coherentes, se podría valorar usarlo.)');

  escribir('');
  escribir('— Lo que entregaría /api/torneos ahora —');
  const publico = normalizarTorneos(publicados.nodos, ahora);
  const porEstado = {};
  for (const t of publico) porEstado[t.status] = (porEstado[t.status] || 0) + 1;
  escribir('  ' + publico.length + ' torneos: ' + (Object.entries(porEstado).map(([k, v]) => k + ': ' + v).join(', ') || 'ninguno'));
  escribir('  Peticiones realizadas: ' + (publicados.peticiones + todos.peticiones));

  return {
    publicados: publicados.nodos.length,
    sinFiltro: todos.nodos.length,
    excluidos: excluidos.length,
    peticiones: publicados.peticiones + todos.peticiones,
    publico: publico.length,
  };
}

module.exports = { diagnosticar, consulta };

if (require.main === module) {
  diagnosticar()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Diagnóstico fallido:', (err && err.message) || 'error desconocido');
      process.exit(1);
    });
}
