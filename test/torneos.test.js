/* ==========================================================================
   KOA-SPORTS — Pruebas de /api/torneos
   Ejecutar:   node --test test/torneos.test.js      (Node.js ≥ 20, sin dependencias)

   TODO LO QUE HAY AQUÍ ES SIMULADO. Ninguna prueba usa credenciales reales ni
   hace peticiones de red: `fetch` se sustituye por un servidor de Start.gg
   simulado (servidorSimulado) que solo implementa lo imprescindible —filtrar
   por la cuenta, aplicar `published: true`, ordenar por startAt desc, paginar
   y devolver pageInfo—. Estas pruebas demuestran cómo se comporta NUESTRO
   código frente a esas respuestas; NO demuestran cómo se comporta Start.gg
   (eso solo se comprueba con scripts/diagnostico-startgg.js y credenciales
   reales).

   Los nombres de campos GraphQL permitidos (CAMPOS_VERIFICADOS) están copiados
   de la referencia oficial del esquema de Start.gg (consultada el 2026-10-10);
   ver README, «Qué se verificó de Start.gg».
   ========================================================================== */

'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const MODULO = path.join(RAIZ, 'api', 'torneos.js');

const TOKEN = 'token-SIMULADO-0123456789abcdef';
const OWNER = '4242';
const DIA = 24 * 3600; // segundos

/* ───────────────────────────── Utilidades de prueba ──────────────────────── */

let ahoraMs; // hora simulada (Date.now)
let logs; // todo lo que el código escribió con console.*
const entornoOriginal = { token: process.env.STARTGG_TOKEN, owner: process.env.STARTGG_OWNER_ID };
const fetchOriginal = globalThis.fetch;

const ahoraSeg = () => Math.floor(ahoraMs / 1000);

/** Carga una copia NUEVA del módulo (memoria e instancia en vuelo vacías). */
function cargar() {
  delete require.cache[require.resolve(MODULO)];
  const handler = require(MODULO);
  return { handler, internals: handler.internals };
}

/** req/res mínimos con la forma que usa la función de Vercel. */
async function llamar(handler, metodo = 'GET') {
  const res = {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await handler({ method: metodo, url: '/api/torneos', query: {} }, res);
  return res;
}

/* Fábricas de torneos (tiempos relativos a la hora simulada). */
function nodo(id, extra = {}) {
  return {
    id,
    name: 'Torneo ' + id,
    slug: 'tournament/torneo-' + id,
    url: 'https://www.start.gg/tournament/torneo-' + id,
    startAt: ahoraSeg() + 10 * DIA,
    endAt: ahoraSeg() + 10 * DIA + 8 * 3600,
    isRegistrationOpen: false,
    registrationClosesAt: null,
    images: [{ type: 'banner', url: 'https://images.start.gg/' + id + '.png', width: 1200 }],
    ...extra,
  };
}
const enVivo = (id, extra) => nodo(id, { startAt: ahoraSeg() - 2 * 3600, endAt: ahoraSeg() + 6 * 3600, ...extra });
const proximo = (id, dias, extra) => nodo(id, { startAt: ahoraSeg() + dias * DIA, endAt: ahoraSeg() + dias * DIA + 8 * 3600, ...extra });
const terminado = (id, haceDias, extra) => nodo(id, { startAt: ahoraSeg() - haceDias * DIA - 8 * 3600, endAt: ahoraSeg() - haceDias * DIA, ...extra });

/**
 * Start.gg SIMULADO. `torneos` son los nodos "de la cuenta". Los campos que
 * empiezan por "__" son metadatos de la prueba y nunca se envían (por ejemplo
 * `__publicado: false` marca un borrador). Implementa: filtro por cuenta,
 * `published: true` (solo si la consulta lo pide), orden startAt desc, page y
 * perPage, y pageInfo.
 */
function servidorSimulado(torneos, opciones = {}) {
  const llamadas = [];
  const fn = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    llamadas.push({ url, init, cuerpo });
    const n = llamadas.length;

    if (opciones.respuesta) {
      const alterna = opciones.respuesta(n, cuerpo);
      if (alterna) return alterna;
    }

    const { query, variables } = cuerpo;
    // Algunas pruebas meten basura (null, texto, números) para comprobar que el
    // backend la descarta: el servidor simulado debe entregarla tal cual, no romperse.
    const esNodo = (t) => t !== null && typeof t === 'object';
    const inicio = (t) => (esNodo(t) ? Number(t.startAt) || 0 : 0);
    let lista = torneos.slice();
    if (query.includes('published: true')) lista = lista.filter((t) => !esNodo(t) || t.__publicado !== false);
    lista.sort((a, b) => inicio(b) - inicio(a));

    const total = lista.length;
    const perPage = variables.perPage;
    const pagina = variables.page;
    const nodes = lista
      .slice((pagina - 1) * perPage, pagina * perPage)
      .map((t) => (esNodo(t) ? Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith('__'))) : t));

    const tournaments = { nodes };
    if (!opciones.sinPageInfo) {
      tournaments.pageInfo = { total: opciones.totalFalso ? opciones.totalFalso(n, total) : total, totalPages: Math.ceil(total / perPage) };
    }
    return respuestaOk({ data: { tournaments } });
  };
  fn.llamadas = llamadas;
  return fn;
}

const respuestaOk = (json, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => json });
const respuestaHttp = (status) => ({ ok: false, status, json: async () => ({}) });

function instalarFetch(fn) {
  globalThis.fetch = fn;
}

const estados = (res) => res.body.map((t) => t.status);
const contar = (res, status) => res.body.filter((t) => t.status === status).length;
/* Estados de un torneo que aún no empieza: se muestran juntos en «Próximos torneos». */
const FUTUROS = ['reg_open', 'closing', 'reg_soon', 'reg_closed', 'upcoming'];
const futuros = (res) => res.body.filter((t) => FUTUROS.includes(t.status)).length;

/* ───────────────────────────────── Preparación ───────────────────────────── */

beforeEach(() => {
  ahoraMs = Date.UTC(2026, 9, 10, 12, 0, 0);
  mock.method(Date, 'now', () => ahoraMs);
  process.env.STARTGG_TOKEN = TOKEN;
  process.env.STARTGG_OWNER_ID = OWNER;
  logs = [];
  for (const nivel of ['error', 'warn', 'log', 'info']) {
    mock.method(console, nivel, (...args) => { logs.push(nivel + ': ' + args.map(String).join(' ')); });
  }
});

afterEach(() => {
  // Regla transversal: el token no puede aparecer en NINGÚN log.
  const filtrado = logs.filter((l) => l.includes(TOKEN));
  mock.restoreAll();
  mock.timers.reset();
  globalThis.fetch = fetchOriginal;
  if (entornoOriginal.token === undefined) delete process.env.STARTGG_TOKEN; else process.env.STARTGG_TOKEN = entornoOriginal.token;
  if (entornoOriginal.owner === undefined) delete process.env.STARTGG_OWNER_ID; else process.env.STARTGG_OWNER_ID = entornoOriginal.owner;
  assert.deepEqual(filtrado, [], 'el token apareció en un log');
});

/* ══════════════════════════════════════════════════════════════════════════
   1 · Varios torneos en vivo y próximos repartidos entre páginas
   ══════════════════════════════════════════════════════════════════════════ */
describe('1 · en vivo y próximos repartidos entre varias páginas (SIMULADO)', () => {
  it('encuentra TODOS los en vivo y próximos aunque los en vivo queden en páginas posteriores', async () => {
    const datos = [];
    for (let i = 1; i <= 70; i++) datos.push(proximo(1000 + i, i)); // 70 futuros
    for (let i = 1; i <= 4; i++) datos.push(enVivo(2000 + i)); // 4 en vivo: empezaron ANTES que todos los futuros
    for (let i = 1; i <= 30; i++) datos.push(terminado(3000 + i, i)); // 30 terminados

    // El fixture es significativo: con orden startAt desc la página 1 son solo futuros,
    // así que una consulta de una sola página perdería los 4 en vivo.
    const orden = datos.slice().sort((a, b) => b.startAt - a.startAt);
    assert.ok(orden.slice(0, 50).every((t) => t.startAt > ahoraSeg()), 'la página 1 debería ser solo de torneos futuros');

    const { handler, internals } = cargar();
    const servidor = servidorSimulado(datos);
    instalarFetch(servidor);

    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.equal(contar(res, 'live'), 4);
    assert.equal(futuros(res), 70);
    assert.equal(contar(res, 'finished'), internals.FINISHED_LIMIT);
    assert.equal(res.body.length, 4 + 70 + 3);

    // 104 torneos con 50 por página → 3 llamadas, páginas 1, 2 y 3.
    assert.equal(servidor.llamadas.length, 3);
    assert.deepEqual(servidor.llamadas.map((l) => l.cuerpo.variables.page).sort(), [1, 2, 3]);
  });

  it('el orden de salida es: en vivo → futuros por fecha de inicio (sea cual sea su inscripción) → finalizados', async () => {
    const datos = [
      terminado(1, 1),
      proximo(2, 20), // reg_soon, el más lejano
      proximo(3, 5, { isRegistrationOpen: true }), // reg_open
      proximo(4, 1, { isRegistrationOpen: true, registrationClosesAt: ahoraSeg() + 3600 }), // closing, el más cercano
      proximo(6, 3, { isRegistrationOpen: false, registrationClosesAt: ahoraSeg() - 3600 }), // reg_closed: empieza ANTES que el abierto
      enVivo(5),
    ];
    const { handler } = cargar();
    instalarFetch(servidorSimulado(datos));
    const res = await llamar(handler);
    assert.deepEqual(estados(res), ['live', 'closing', 'reg_closed', 'reg_open', 'reg_soon', 'finished']);
    assert.deepEqual(res.body.map((t) => t.name), ['Torneo 5', 'Torneo 4', 'Torneo 6', 'Torneo 3', 'Torneo 2', 'Torneo 1']);
  });

  it('a igualdad de fechas el orden es estable (por id), no depende de cómo llegaron las páginas', async () => {
    const mismoInicio = ahoraSeg() + 2 * DIA;
    const a = proximo(11, 2, { startAt: mismoInicio, endAt: mismoInicio + 3600 });
    const b = proximo(12, 2, { startAt: mismoInicio, endAt: mismoInicio + 3600, isRegistrationOpen: true });
    for (const datos of [[a, b], [b, a]]) {
      const { handler } = cargar();
      instalarFetch(servidorSimulado(datos));
      assert.deepEqual((await llamar(handler)).body.map((t) => t.name), ['Torneo 11', 'Torneo 12']);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · Más de 25 torneos y muchos eventos futuros
   ══════════════════════════════════════════════════════════════════════════ */
describe('2 · más de 25 torneos y muchos futuros (SIMULADO)', () => {
  it('con 26 torneos (uno más que la antigua página de 25) no se omite ninguno relevante', async () => {
    const datos = [];
    for (let i = 1; i <= 25; i++) datos.push(proximo(100 + i, i)); // 25 futuros
    datos.push(enVivo(999)); // el 26.º por startAt desc: la antigua consulta (25) lo perdía
    const { handler } = cargar();
    const servidor = servidorSimulado(datos);
    instalarFetch(servidor);
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.equal(contar(res, 'live'), 1);
    assert.equal(res.body.length, 26);
    assert.equal(servidor.llamadas.length, 1, '26 torneos caben en una página de 50: una sola llamada');
  });

  it('con 120 futuros recupera los 120 y el en vivo más antiguo', async () => {
    const datos = [];
    for (let i = 1; i <= 120; i++) datos.push(proximo(500 + i, i));
    datos.push(enVivo(9001));
    const { handler } = cargar();
    const servidor = servidorSimulado(datos);
    instalarFetch(servidor);
    const res = await llamar(handler);
    assert.equal(contar(res, 'live'), 1);
    assert.equal(futuros(res), 120);
    assert.equal(servidor.llamadas.length, 3); // 121 torneos → 3 páginas
  });

  it('una cuenta típica (≤ 50 torneos) cuesta una sola llamada', async () => {
    const datos = [enVivo(1), proximo(2, 3), terminado(3, 2)];
    const { handler } = cargar();
    const servidor = servidorSimulado(datos);
    instalarFetch(servidor);
    await llamar(handler);
    assert.equal(servidor.llamadas.length, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · Los tres finalizados más recientes
   ══════════════════════════════════════════════════════════════════════════ */
describe('3 · tres finalizados más recientes (SIMULADO)', () => {
  it('los elige por fecha de fin sobre el conjunto completo, no sobre una página', async () => {
    const datos = [];
    for (let i = 1; i <= 100; i++) datos.push(proximo(100 + i, i)); // llenan las páginas 1 y 2
    for (let i = 1; i <= 12; i++) datos.push(terminado(300 + i, 10 + i)); // finalizados: 300+i terminó hace 10+i días
    // Un torneo largo que EMPEZÓ mucho antes (queda en la última página por startAt)
    // pero terminó ayer: es el finalizado más reciente.
    datos.push(nodo(777, { startAt: ahoraSeg() - 60 * DIA, endAt: ahoraSeg() - 1 * DIA }));

    const { handler } = cargar();
    instalarFetch(servidorSimulado(datos));
    const res = await llamar(handler);

    const finalizados = res.body.filter((t) => t.status === 'finished').map((t) => t.name);
    assert.deepEqual(finalizados, ['Torneo 777', 'Torneo 301', 'Torneo 302']); // ayer, hace 11 d, hace 12 d
    // y están al final, ordenados del más reciente al más antiguo
    assert.deepEqual(res.body.slice(-3).map((t) => t.name), finalizados);
  });

  it('con menos de tres finalizados publica los que existan', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([terminado(1, 5), terminado(2, 9)]));
    const res = await llamar(handler);
    assert.deepEqual(res.body.map((t) => t.name), ['Torneo 1', 'Torneo 2']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · Identificadores duplicados
   ══════════════════════════════════════════════════════════════════════════ */
describe('4 · identificadores duplicados (SIMULADO)', () => {
  it('un mismo id repetido (en la misma página o entre páginas) cuenta una sola vez', async () => {
    const datos = [];
    for (let i = 1; i <= 60; i++) datos.push(proximo(100 + i, i));
    datos.push(enVivo(5), enVivo(5, { name: 'Duplicado exacto del 5' }));
    const { handler } = cargar();

    // El servidor, además, repite en la página 2 un nodo que ya entregó en la 1
    // (lo que pasa si los datos se desplazan entre dos peticiones).
    let primeraPagina = null;
    const base = servidorSimulado(datos);
    instalarFetch(async (url, init) => {
      const r = await base(url, init);
      const json = await r.json();
      const pagina = JSON.parse(init.body).variables.page;
      if (pagina === 1) primeraPagina = json.data.tournaments.nodes[0];
      if (pagina === 2 && primeraPagina) json.data.tournaments.nodes.push(primeraPagina);
      return respuestaOk(json);
    });

    const res = await llamar(handler);
    const nombres = res.body.map((t) => t.name);
    assert.equal(new Set(nombres).size, nombres.length, 'hay nombres repetidos: ' + nombres);
    assert.equal(contar(res, 'live'), 1);
    assert.equal(res.body.length, 61); // 60 futuros + 1 en vivo
  });

  it('los duplicados de un finalizado no ocupan los cupos de los tres más recientes', async () => {
    const { handler } = cargar();
    const datos = [terminado(1, 1), terminado(1, 1), terminado(1, 1), terminado(2, 2), terminado(3, 3), terminado(4, 4)];
    instalarFetch(servidorSimulado(datos));
    const res = await llamar(handler);
    assert.deepEqual(res.body.map((t) => t.name), ['Torneo 1', 'Torneo 2', 'Torneo 3']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 · Fechas, imágenes y URLs inválidas
   ══════════════════════════════════════════════════════════════════════════ */
describe('5 · datos inválidos (SIMULADO)', () => {
  it('descarta lo que no se puede afirmar y registra el motivo, sin tirar el resto', async () => {
    const datos = [
      proximo(1, 3), // válido
      nodo(10, { startAt: null }),
      nodo(11, { startAt: 'no es un número' }),
      nodo(12, { startAt: -5 }),
      nodo(13, { startAt: 0 }),
      nodo(14, { startAt: ahoraSeg() - DIA, endAt: null }), // ya empezó y sin fin válido: no se inventa
      nodo(15, { startAt: ahoraSeg() - DIA, endAt: 'x' }),
      nodo(16, { startAt: ahoraSeg() - DIA, endAt: ahoraSeg() - 2 * DIA }), // fin anterior al inicio
      nodo(17, { name: '   ' }),
      nodo(18, { name: null }),
      nodo(19, { url: 'javascript:alert(1)', slug: '../../etc/passwd' }),
      nodo(20, { url: null, slug: 'tournament/ok-' + 20 }), // se reconstruye desde el slug (válido)
      nodo(21, { url: null, slug: 'otra-cosa/x' }),
      nodo(22, { id: null }),
      null,
      'texto suelto',
      42,
    ];
    const { handler } = cargar();
    instalarFetch(servidorSimulado(datos));
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.map((t) => t.name).sort(), ['Torneo 1', 'Torneo 20'].sort());
    const t20 = res.body.find((t) => t.name === 'Torneo 20');
    assert.equal(t20.url, 'https://www.start.gg/tournament/ok-20');

    const aviso = logs.find((l) => l.startsWith('warn:') && l.includes('Descartados'));
    assert.ok(aviso, 'debe registrar los descartes');
    assert.match(aviso, /sin fecha de inicio válida/);
    assert.match(aviso, /ya empezó y no tiene fecha de fin válida/);
  });

  it('un torneo futuro sin fecha de fin sí se publica (su estado no la necesita)', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([proximo(1, 4, { endAt: null })]));
    const res = await llamar(handler);
    assert.deepEqual(estados(res), ['reg_soon']);
  });

  it('valida las imágenes: solo https; banner antes que profile; la más ancha; si no, la de por defecto', async () => {
    const datos = [
      proximo(1, 1, { images: [{ type: 'profile', url: 'https://i.start.gg/p.png', width: 100 }, { type: 'banner', url: 'https://i.start.gg/b-chico.png', width: 300 }, { type: 'banner', url: 'https://i.start.gg/b-ancho.png', width: 1200 }] }),
      proximo(2, 2, { images: [{ type: 'profile', url: 'https://i.start.gg/p.png', width: 100 }] }),
      proximo(3, 3, { images: [{ type: 'banner', url: 'http://i.start.gg/inseguro.png', width: 900 }] }),
      proximo(4, 4, { images: [{ type: 'banner', url: 'javascript:alert(1)', width: 900 }] }),
      proximo(5, 5, { images: [{ type: 'banner', url: 'data:image/png;base64,AAAA', width: 900 }] }),
      proximo(6, 6, { images: null }),
      proximo(7, 7, { images: [null, 5, { type: 'banner' }, { url: 42 }] }),
      proximo(8, 8, { images: [] }),
    ];
    const { handler, internals } = cargar();
    instalarFetch(servidorSimulado(datos));
    const res = await llamar(handler);
    const img = (n) => res.body.find((t) => t.name === 'Torneo ' + n).image;
    assert.equal(img(1), 'https://i.start.gg/b-ancho.png');
    assert.equal(img(2), 'https://i.start.gg/p.png');
    for (const n of [3, 4, 5, 6, 7, 8]) assert.equal(img(n), internals.DEFAULT_IMAGE, 'Torneo ' + n);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6 · Errores HTTP y GraphQL de Start.gg
   ══════════════════════════════════════════════════════════════════════════ */
describe('6 · errores de Start.gg (SIMULADO)', () => {
  const casos = [
    ['HTTP 401 (token rechazado)', () => respuestaHttp(401), 502],
    ['HTTP 403', () => respuestaHttp(403), 502],
    ['HTTP 429 (límite de peticiones)', () => respuestaHttp(429), 503],
    ['HTTP 500', () => respuestaHttp(500), 502],
    ['HTTP 503', () => respuestaHttp(503), 502],
    ['cuerpo que no es JSON', () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }), 502],
    ['200 con errors de GraphQL', () => respuestaOk({ errors: [{ message: 'Cannot query field "inventado" on type "Tournament"' }], data: null }), 502],
    ['200 con data.tournaments nulo', () => respuestaOk({ data: { tournaments: null } }), 502],
    ['200 con nodes que no es un arreglo', () => respuestaOk({ data: { tournaments: { nodes: 'x' } } }), 502],
    ['200 sin data', () => respuestaOk({}), 502],
    ['rechazo por límite: { success:false, "Rate limit exceeded" }', () => respuestaOk({ success: false, message: 'Rate limit exceeded - api-token' }), 503],
    // El texto del mensaje es INVENTADO para la prueba: la documentación solo muestra el formato { success, message }.
    ['rechazo { success:false } con otro mensaje (texto simulado, p. ej. por complejidad)', () => respuestaOk({ success: false, message: 'mensaje simulado de rechazo' }), 502],
  ];

  for (const [nombre, respuesta, esperado] of casos) {
    it(nombre + ' → ' + esperado + ', mensaje genérico y sin caché', async () => {
      const { handler } = cargar();
      instalarFetch(async () => respuesta());
      const res = await llamar(handler);
      assert.equal(res.statusCode, esperado);
      assert.equal(res.body.error, 'No se pudieron obtener los torneos en este momento.');
      assert.equal(res.headers['Cache-Control'], 'no-store');
      assert.ok(logs.some((l) => l.startsWith('error:')), 'el detalle debe ir al log del servidor');
    });
  }

  it('fallo de red (fetch rechaza) → 502', async () => {
    const { handler } = cargar();
    instalarFetch(async () => { throw new TypeError('fetch failed'); });
    const res = await llamar(handler);
    assert.equal(res.statusCode, 502);
  });

  it('abortada → 504', async () => {
    const { handler } = cargar();
    instalarFetch(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    const res = await llamar(handler);
    assert.equal(res.statusCode, 504);
  });

  it('plazo total agotado: Start.gg no responde → se aborta la petición y responde 504', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { handler, internals } = cargar();
    let senal = null;
    instalarFetch((url, init) => new Promise((_, rechazar) => {
      senal = init.signal;
      init.signal.addEventListener('abort', () => rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pendiente = llamar(handler);
    mock.timers.tick(internals.REQUEST_TIMEOUT_MS);
    const res = await pendiente;
    assert.ok(senal && senal.aborted, 'la señal de aborto debe activarse al vencer el plazo');
    assert.equal(res.statusCode, 504);
  });

  it('si falla la página 2 de 3 falla TODO: nada parcial en la respuesta ni en memoria', async () => {
    const datos = [];
    for (let i = 1; i <= 120; i++) datos.push(proximo(100 + i, i));
    const { handler } = cargar();
    const base = servidorSimulado(datos);
    let fallar = true;
    instalarFetch(async (url, init) => {
      const pagina = JSON.parse(init.body).variables.page;
      if (fallar && pagina === 2) return respuestaHttp(500);
      return base(url, init);
    });

    const mala = await llamar(handler);
    assert.equal(mala.statusCode, 502);
    assert.equal(mala.body.error, 'No se pudieron obtener los torneos en este momento.');

    fallar = false; // Start.gg se recupera: la siguiente petición debe leer todo otra vez
    const buena = await llamar(handler);
    assert.equal(buena.statusCode, 200);
    assert.equal(buena.body.length, 120);
  });

  it('el mensaje de error del visitante no revela detalles de Start.gg ni el token', async () => {
    const { handler } = cargar();
    instalarFetch(async () => respuestaOk({ errors: [{ message: 'detalle interno ' + TOKEN.slice(0, 6) }] }));
    const res = await llamar(handler);
    const texto = JSON.stringify(res.body) + JSON.stringify(res.headers);
    assert.ok(!texto.includes('detalle interno'));
    assert.ok(!texto.includes(TOKEN));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7 · Configuración de entorno incompleta
   ══════════════════════════════════════════════════════════════════════════ */
describe('7 · configuración incompleta', () => {
  const casos = [
    ['falta STARTGG_TOKEN', () => { delete process.env.STARTGG_TOKEN; }, /STARTGG_TOKEN no está definido/],
    ['STARTGG_TOKEN vacío o solo espacios', () => { process.env.STARTGG_TOKEN = '   '; }, /STARTGG_TOKEN no está definido/],
    ['STARTGG_TOKEN con espacios internos', () => { process.env.STARTGG_TOKEN = 'abc def'; }, /caracteres no válidos/],
    ['falta STARTGG_OWNER_ID', () => { delete process.env.STARTGG_OWNER_ID; }, /STARTGG_OWNER_ID no está definido/],
    ['STARTGG_OWNER_ID no numérico', () => { process.env.STARTGG_OWNER_ID = 'koa'; }, /ID numérico/],
    ['STARTGG_OWNER_ID decimal', () => { process.env.STARTGG_OWNER_ID = '12.5'; }, /ID numérico/],
    ['STARTGG_OWNER_ID demasiado largo', () => { process.env.STARTGG_OWNER_ID = '1234567890123'; }, /ID numérico/],
    ['faltan las dos', () => { delete process.env.STARTGG_TOKEN; delete process.env.STARTGG_OWNER_ID; }, /STARTGG_TOKEN no está definido; STARTGG_OWNER_ID no está definido/],
  ];

  for (const [nombre, preparar, patron] of casos) {
    it(nombre + ' → 503 genérico, sin llamar a Start.gg', async () => {
      preparar();
      const { handler } = cargar();
      let llamadas = 0;
      instalarFetch(async () => { llamadas++; return respuestaOk({}); });
      const res = await llamar(handler);
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.error, 'El servicio de torneos no está configurado.');
      assert.equal(res.headers['Cache-Control'], 'no-store');
      assert.equal(llamadas, 0, 'sin configuración válida no se debe llamar a Start.gg');
      assert.ok(logs.some((l) => patron.test(l)), 'el log debe nombrar la variable con problema');
    });
  }

  it('el log nombra las variables pero nunca sus valores', async () => {
    process.env.STARTGG_TOKEN = 'abc def'; // inválido
    process.env.STARTGG_OWNER_ID = 'valor-secreto-no-numerico';
    const { handler } = cargar();
    instalarFetch(async () => respuestaOk({}));
    await llamar(handler);
    const texto = logs.join('\n');
    assert.ok(!texto.includes('abc def'));
    assert.ok(!texto.includes('valor-secreto-no-numerico'));
  });

  it('solo se permiten GET y HEAD', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([]));
    const post = await llamar(handler, 'POST');
    assert.equal(post.statusCode, 405);
    assert.equal(post.headers.Allow, 'GET, HEAD');
    assert.equal((await llamar(handler, 'HEAD')).statusCode, 200);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8 · Respuesta válida sin torneos
   ══════════════════════════════════════════════════════════════════════════ */
describe('8 · sin torneos (SIMULADO)', () => {
  it('cuenta sin torneos → 200 con [] y caché normal', async () => {
    const { handler } = cargar();
    const servidor = servidorSimulado([]);
    instalarFetch(servidor);
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    assert.equal(res.headers['Cache-Control'], 'public, s-maxage=300, stale-while-revalidate=600');
    assert.equal(servidor.llamadas.length, 1, 'con total 0 no se piden más páginas');
  });

  it('nodes vacío y pageInfo ausente → 200 con []', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([], { sinPageInfo: true }));
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });

  it('solo hay borradores/no publicados → 200 con [] (el filtro los excluye)', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([proximo(1, 2, { __publicado: false })]));
    const res = await llamar(handler);
    assert.deepEqual(res.body, []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9 · Visibilidad, cancelaciones y fidelidad a los campos verificados
   ══════════════════════════════════════════════════════════════════════════ */
describe('9 · visibilidad y cancelación (lo que el esquema permite demostrar)', () => {
  /* Copiado de la referencia oficial del esquema de Start.gg (2026-10-10).
     Solo estos nombres pueden aparecer en la consulta. */
  const CAMPOS_VERIFICADOS = {
    TournamentQuery: ['page', 'perPage', 'sortBy', 'filter'],
    TournamentPageFilter: ['ownerId', 'published'],
    PageInfo: ['total', 'totalPages'],
    TournamentConnection: ['pageInfo', 'nodes'],
    Tournament: ['id', 'name', 'slug', 'url', 'startAt', 'endAt', 'isRegistrationOpen', 'registrationClosesAt', 'images'],
    'Tournament.url(args)': ['relative'],
    Image: ['type', 'url', 'width'],
    'Query.tournaments': ['tournaments', 'query'],
    Variables: ['KoaTorneos', 'ownerId', 'page', 'perPage', 'ID', 'Int'],
    Sintaxis: ['true', 'false'],
  };

  it('la consulta solo usa campos y argumentos verificados contra el esquema oficial', () => {
    const { internals } = cargar();
    const sinCadenas = internals.QUERY.replace(/"[^"]*"/g, '').replace(/\bquery\b(?=\s+Koa)/, '');
    const palabras = new Set(sinCadenas.match(/[A-Za-z_][A-Za-z0-9_]*/g));
    const permitidas = new Set(Object.values(CAMPOS_VERIFICADOS).flat());
    const desconocidas = [...palabras].filter((p) => !permitidas.has(p));
    assert.deepEqual(desconocidas, [], 'campos no verificados en la consulta: ' + desconocidas.join(', '));
  });

  it('pide solo torneos de la cuenta configurada, con published: true y SIN filtrar por videojuego', async () => {
    const { handler, internals } = cargar();
    const servidor = servidorSimulado([proximo(1, 1)]);
    instalarFetch(servidor);
    await llamar(handler);

    const { query, variables } = servidor.llamadas[0].cuerpo;
    assert.equal(variables.ownerId, OWNER);
    assert.match(query, /filter:\s*\{[^}]*ownerId:\s*\$ownerId/);
    assert.match(query, /published:\s*true/);
    assert.equal(internals.FILTRO_VISIBILIDAD, 'published: true');
    assert.ok(!/videogame/i.test(query), 'no debe haber filtro por videojuego');
    assert.ok(!/publiclySearchable/.test(query), 'publiclySearchable no se usa (semántica no documentada)');
  });

  it('un borrador (no publicado) no aparece cuando el servidor respeta el filtro pedido (SIMULADO: prueba la petición, no a Start.gg)', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([proximo(1, 1), proximo(2, 2, { __publicado: false })]));
    const res = await llamar(handler);
    assert.deepEqual(res.body.map((t) => t.name), ['Torneo 1']);
  });

  it('nunca emite "cancelled": ni por el título ni por tener la inscripción cerrada', async () => {
    const datos = [
      proximo(1, 3, { name: '[CANCELADO] Torneo viejo' }),
      proximo(2, 4, { name: 'Cancelled — see you next year' }),
      proximo(3, 5, { isRegistrationOpen: false }), // inscripción cerrada ≠ cancelado
      proximo(4, 6, { isRegistrationOpen: true, registrationClosesAt: ahoraSeg() - 3600 }), // el cierre ya pasó
      terminado(5, 2, { name: 'CANCELADO por lluvia' }),
    ];
    const { handler } = cargar();
    instalarFetch(servidorSimulado(datos));
    const res = await llamar(handler);
    assert.equal(res.body.length, 5, 'ningún título provoca que se oculte un torneo');
    assert.ok(res.body.every((t) => t.status !== 'cancelled'));
    // Cerrada ≠ cancelada: la inscripción cerrada solo cambia la etiqueta, el torneo sigue en «Próximos».
    assert.deepEqual(res.body.map((t) => t.status), ['reg_soon', 'reg_soon', 'reg_soon', 'reg_closed', 'finished']);
  });

  it('ciclo de vida solo por fechas e inscripción reales: límites exactos', () => {
    const { internals } = cargar();
    const base = ahoraMs;
    const calc = (o) => internals.calcularEstado({ inscripcionAbierta: false, cierreMs: null, ...o }, base);
    assert.equal(calc({ startMs: base, endMs: base + 1000 }), 'live'); // empieza justo ahora
    assert.equal(calc({ startMs: base - 1000, endMs: base }), 'finished'); // termina justo ahora
    assert.equal(calc({ startMs: base + 1, endMs: base + 2 }), 'reg_soon');
    assert.equal(calc({ startMs: base + 1000, endMs: base + 2000, inscripcionAbierta: true }), 'reg_open');
    assert.equal(calc({ startMs: base + 1000, endMs: base + 2000, inscripcionAbierta: true, cierreMs: base + 23 * 3600 * 1000 }), 'closing');
    assert.equal(calc({ startMs: base + 1000, endMs: base + 2000, inscripcionAbierta: true, cierreMs: base + 24 * 3600 * 1000 + 1 }), 'reg_open');
    assert.equal(calc({ startMs: base - 1000, endMs: null }), null);
  });

  it('inscripción de un torneo futuro: solo se afirma lo que los datos confirman', () => {
    const { internals } = cargar();
    const base = ahoraMs;
    const H = 3600 * 1000;
    const futuro = { startMs: base + 5 * 24 * H, endMs: base + 5 * 24 * H + 8 * H };
    const calc = (o) => internals.calcularEstado({ ...futuro, cierreMs: null, ...o }, base);
    // Abierta / cierra pronto (< 24 h) / abierta con plazo lejano
    assert.equal(calc({ inscripcionAbierta: true }), 'reg_open');
    assert.equal(calc({ inscripcionAbierta: true, cierreMs: base + 2 * H }), 'closing');
    assert.equal(calc({ inscripcionAbierta: true, cierreMs: base + 48 * H }), 'reg_open');
    // «Cierra pronto» exige un plazo real: sin registrationClosesAt nunca se emite
    assert.notEqual(calc({ inscripcionAbierta: true, cierreMs: null }), 'closing');
    // No abierta y plazo no vencido (o sin plazo): aún no disponible
    assert.equal(calc({ inscripcionAbierta: false }), 'reg_soon');
    assert.equal(calc({ inscripcionAbierta: false, cierreMs: base + 48 * H }), 'reg_soon');
    // Plazo vencido: cerrada, también si isRegistrationOpen quedó desactualizado en true
    assert.equal(calc({ inscripcionAbierta: false, cierreMs: base - H }), 'reg_closed');
    assert.equal(calc({ inscripcionAbierta: true, cierreMs: base - H }), 'reg_closed');
    assert.equal(calc({ inscripcionAbierta: false, cierreMs: base }), 'reg_closed'); // el plazo vence justo ahora
    // Dato ausente o no booleano: no se afirma nada sobre la inscripción
    for (const raro of [null, undefined, 'true', 1, 0, {}]) {
      assert.equal(calc({ inscripcionAbierta: raro }), 'upcoming', 'isRegistrationOpen = ' + String(raro));
    }
  });

  it('la inscripción NUNCA decide si un torneo está en vivo o finalizado (la fase sale solo de las fechas)', () => {
    const { internals } = cargar();
    const base = ahoraMs;
    const H = 3600 * 1000;
    const combinaciones = [];
    for (const abierta of [true, false, null]) {
      for (const cierre of [null, base - 48 * H, base + 48 * H]) combinaciones.push({ inscripcionAbierta: abierta, cierreMs: cierre });
    }
    for (const c of combinaciones) {
      assert.equal(internals.calcularEstado({ startMs: base - 2 * H, endMs: base + 2 * H, ...c }, base), 'live', JSON.stringify(c));
      assert.equal(internals.calcularEstado({ startMs: base - 4 * H, endMs: base - 2 * H, ...c }, base), 'finished', JSON.stringify(c));
      assert.ok(FUTUROS.includes(internals.calcularEstado({ startMs: base + 2 * H, endMs: base + 4 * H, ...c }, base)), JSON.stringify(c));
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Límites de paginación, memoria y contrato
   ══════════════════════════════════════════════════════════════════════════ */
describe('límites de paginación (SIMULADO)', () => {
  it('nunca hace más de MAX_PAGES llamadas y avisa si la cuenta tiene más torneos', async () => {
    const datos = [];
    for (let i = 1; i <= 400; i++) datos.push(proximo(100 + i, i));
    const { handler, internals } = cargar();
    const servidor = servidorSimulado(datos);
    instalarFetch(servidor);
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.equal(servidor.llamadas.length, internals.MAX_PAGES);
    assert.equal(res.body.length, internals.MAX_PAGES * internals.PER_PAGE);
    assert.ok(logs.some((l) => l.startsWith('warn:') && l.includes('tope')), 'debe advertir de la truncación');
    // Con el tope, lo que se conserva son los más recientes por startAt: el último (el que más tarda) sí está.
    assert.ok(res.body.some((t) => t.name === 'Torneo 500'));
    assert.ok(!res.body.some((t) => t.name === 'Torneo 101'));
  });

  it('respeta los límites documentados de Start.gg: perPage ≤ 512 y el plazo total cabe en 10 s', () => {
    const { internals } = cargar();
    assert.ok(internals.PER_PAGE <= 512);
    assert.ok(internals.REQUEST_TIMEOUT_MS < 10000);
    assert.ok(internals.MAX_PAGES >= 1 && internals.MAX_PAGES <= 10);
  });

  it('si pageInfo no viene, sigue mientras la página venga llena y se detiene en la primera corta', async () => {
    const datos = [];
    for (let i = 1; i <= 120; i++) datos.push(proximo(100 + i, i));
    const { handler } = cargar();
    const servidor = servidorSimulado(datos, { sinPageInfo: true });
    instalarFetch(servidor);
    const res = await llamar(handler);
    assert.equal(res.body.length, 120);
    assert.equal(servidor.llamadas.length, 3); // 50 + 50 + 20 (corta) → se detiene
  });

  it('sin pageInfo y con más torneos que el tope, se detiene en MAX_PAGES y avisa', async () => {
    const datos = [];
    for (let i = 1; i <= 400; i++) datos.push(proximo(100 + i, i));
    const { handler, internals } = cargar();
    const servidor = servidorSimulado(datos, { sinPageInfo: true });
    instalarFetch(servidor);
    await llamar(handler);
    assert.equal(servidor.llamadas.length, internals.MAX_PAGES);
    assert.ok(logs.some((l) => l.startsWith('warn:') && l.includes('tope')));
  });

  it('si el total cambia mientras se leen las páginas, lo avisa y sigue con lo leído', async () => {
    const datos = [];
    for (let i = 1; i <= 120; i++) datos.push(proximo(100 + i, i));
    const { handler } = cargar();
    instalarFetch(servidorSimulado(datos, { totalFalso: (n, total) => (n === 1 ? total : total + 1) }));
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.ok(logs.some((l) => l.startsWith('warn:') && l.includes('cambió')));
  });

  it('el token viaja solo en la cabecera Authorization (ni en la URL ni en el cuerpo)', async () => {
    const { handler } = cargar();
    const servidor = servidorSimulado([proximo(1, 1)]);
    instalarFetch(servidor);
    await llamar(handler);
    const { url, init } = servidor.llamadas[0];
    assert.equal(url, 'https://api.start.gg/gql/alpha');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer ' + TOKEN);
    assert.ok(!url.includes(TOKEN));
    assert.ok(!init.body.includes(TOKEN));
    assert.ok(init.signal instanceof AbortSignal, 'toda llamada lleva el plazo (AbortSignal)');
  });

  it('la query string de la petición del visitante no influye (no hay parámetros)', async () => {
    const { handler } = cargar();
    const servidor = servidorSimulado([proximo(1, 1)]);
    instalarFetch(servidor);
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ method: 'GET', url: '/api/torneos?owner=1&ownerId=999&perPage=1000', query: { owner: '1', ownerId: '999', perPage: '1000' } }, res);
    assert.equal(servidor.llamadas[0].cuerpo.variables.ownerId, OWNER);
    assert.equal(servidor.llamadas[0].cuerpo.variables.perPage, 50);
  });
});

describe('memoria de la instancia y datos de respaldo (SIMULADO)', () => {
  it('reutiliza la recuperación durante MEMORY_TTL_MS y vuelve a consultar al vencer', async () => {
    const { handler, internals } = cargar();
    const servidor = servidorSimulado([proximo(1, 1)]);
    instalarFetch(servidor);
    await llamar(handler);
    ahoraMs += internals.MEMORY_TTL_MS - 1000;
    await llamar(handler);
    assert.equal(servidor.llamadas.length, 1, 'dentro del TTL no se consulta');
    ahoraMs += 2000;
    await llamar(handler);
    assert.equal(servidor.llamadas.length, 2, 'vencido el TTL se consulta otra vez');
  });

  it('las peticiones simultáneas comparten una sola recuperación', async () => {
    const { handler } = cargar();
    const servidor = servidorSimulado([proximo(1, 1)]);
    instalarFetch(servidor);
    const respuestas = await Promise.all([1, 2, 3, 4, 5].map(() => llamar(handler)));
    assert.equal(servidor.llamadas.length, 1);
    assert.ok(respuestas.every((r) => r.statusCode === 200));
  });

  it('el estado se recalcula con la hora actual aunque los datos vengan de memoria', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([nodo(1, { startAt: ahoraSeg() + 30, endAt: ahoraSeg() + 3600 })]));
    assert.deepEqual(estados(await llamar(handler)), ['reg_soon']);
    ahoraMs += 40 * 1000; // sigue dentro del TTL de memoria (60 s): ya empezó
    assert.deepEqual(estados(await llamar(handler)), ['live']);
  });

  it('si Start.gg falla se sirven los últimos datos válidos hasta STALE_ON_ERROR_MS; después, error', async () => {
    const { handler, internals } = cargar();
    const bueno = servidorSimulado([proximo(1, 1), proximo(2, 2)]);
    let caido = false;
    instalarFetch(async (url, init) => (caido ? respuestaHttp(500) : bueno(url, init)));

    assert.equal((await llamar(handler)).body.length, 2);

    caido = true;
    ahoraMs += internals.MEMORY_TTL_MS + 1000;
    const conRespaldo = await llamar(handler);
    assert.equal(conRespaldo.statusCode, 200);
    assert.equal(conRespaldo.body.length, 2);
    assert.ok(logs.some((l) => l.startsWith('warn:') && l.includes('últimos datos válidos')));

    ahoraMs += internals.STALE_ON_ERROR_MS;
    const sinRespaldo = await llamar(handler);
    assert.equal(sinRespaldo.statusCode, 502);
  });

  it('un fallo en una página no se convierte en respaldo parcial: se sirve la recuperación completa anterior', async () => {
    const datos = [];
    for (let i = 1; i <= 120; i++) datos.push(proximo(100 + i, i));
    const { handler, internals } = cargar();
    const base = servidorSimulado(datos);
    let fallaPagina2 = false;
    instalarFetch(async (url, init) => (fallaPagina2 && JSON.parse(init.body).variables.page === 2 ? respuestaHttp(500) : base(url, init)));

    assert.equal((await llamar(handler)).body.length, 120);
    fallaPagina2 = true;
    ahoraMs += internals.MEMORY_TTL_MS + 1000;
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 120, 'se sirve la recuperación completa anterior, no un fragmento');
  });

  it('la memoria no se comparte entre cuentas distintas', async () => {
    const { handler } = cargar();
    const servidor = servidorSimulado([proximo(1, 1)]);
    instalarFetch(servidor);
    await llamar(handler);
    process.env.STARTGG_OWNER_ID = '777';
    await llamar(handler);
    assert.equal(servidor.llamadas.length, 2);
    assert.equal(servidor.llamadas[1].cuerpo.variables.ownerId, '777');
  });
});

describe('contrato con el frontend', () => {
  it('cada elemento tiene exactamente { name, image, url, status } y nada más', async () => {
    const { handler } = cargar();
    instalarFetch(servidorSimulado([enVivo(1), proximo(2, 2), terminado(3, 3)]));
    const res = await llamar(handler);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body) && res.body.length === 3);
    for (const t of res.body) {
      assert.deepEqual(Object.keys(t).sort(), ['image', 'name', 'status', 'url']);
      assert.ok(typeof t.name === 'string' && t.name);
      assert.ok(/^https:\/\//.test(t.image) || t.image.startsWith('/assets/'));
      assert.ok(/^https?:\/\//.test(t.url));
    }
    assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  });

  it('los status que emite el backend son todos conocidos por js/tournaments.js', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'js', 'tournaments.js'), 'utf8');
    const bloque = fuente.match(/var STATUS = \{([\s\S]*?)\n  \};/);
    assert.ok(bloque, 'no se encontró var STATUS en js/tournaments.js');
    const claves = new Set([...bloque[1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
    for (const emitido of ['live', 'reg_open', 'closing', 'reg_soon', 'reg_closed', 'upcoming', 'finished']) {
      assert.ok(claves.has(emitido), 'el frontend no conoce el status ' + emitido);
    }
  });

  it('el límite de finalizados del backend coincide con el del frontend', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'js', 'tournaments.js'), 'utf8');
    const front = Number(fuente.match(/var FINISHED_LIMIT = (\d+);/)[1]);
    assert.equal(cargar().internals.FINISHED_LIMIT, front);
  });

  it('ningún archivo público contiene el token ni llama directamente a Start.gg', () => {
    const publicos = ['index.html', ...fs.readdirSync(path.join(RAIZ, 'js')).map((f) => 'js/' + f), ...fs.readdirSync(path.join(RAIZ, 'data')).map((f) => 'data/' + f)];
    for (const rel of publicos) {
      const texto = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
      assert.ok(!/Bearer\s/i.test(texto), rel + ' contiene una cabecera Authorization');
      assert.ok(!/STARTGG_TOKEN\s*[=:]/.test(texto), rel + ' parece contener el token');
      assert.ok(!/api\.start\.gg/.test(texto), rel + ' llama a Start.gg directamente');
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Contrato de extremo a extremo: backend → js/tournaments.js (SIMULADO)
   Se ejecuta el frontend REAL (js/tournaments.js) dentro de un DOM mínimo de
   mentira (vm) y se le entrega lo que devuelve el backend sobre datos
   simulados. Comprueba que la agrupación y las tarjetas son las esperadas.
   ══════════════════════════════════════════════════════════════════════════ */
describe('contrato backend → frontend de extremo a extremo (SIMULADO)', () => {
  /** Ejecuta el js/tournaments.js REAL con `salida` como respuesta de /api/torneos y devuelve los contenedores falsos. */
  async function ejecutarFrontend(salida) {
    const vm = require('node:vm');
    const nodos = {};
    const nodoFalso = () => ({ innerHTML: '', hidden: false, children: { length: 0 }, querySelectorAll: () => [] });
    const documento = {
      readyState: 'complete',
      hidden: false,
      addEventListener() {},
      querySelectorAll: () => [],
      querySelector(selector) {
        if (selector === '[data-tournaments]') return nodoFalso();
        nodos[selector] = nodos[selector] || nodoFalso();
        return nodos[selector];
      },
    };
    const sandbox = {
      document: documento,
      console,
      URL,
      AbortController,
      Event: function Event() {},
      setTimeout: () => 1, // sin temporizadores reales
      clearTimeout() {},
      fetch: async (url) => {
        assert.equal(url, '/api/torneos', 'el frontend solo consulta /api/torneos');
        return { ok: true, status: 200, json: async () => salida };
      },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js', 'tournaments.js'), 'utf8'), sandbox, { filename: 'js/tournaments.js' });
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    return nodos;
  }

  const html = (nodos, clave) => (nodos['[data-tournaments="' + clave + '"]'] || { innerHTML: '' }).innerHTML;
  const tarjetas = (nodos, clave) => (html(nodos, clave).match(/<article class="tournament-card">/g) || []).length;
  const etiquetas = (nodos, clave) => (html(nodos, clave).match(/tournament-card__status [^"]+">([^<]+)</g) || []).map((m) => m.replace(/^.*">/, '').replace('<', ''));
  const enlaces = (nodos, clave) => (html(nodos, clave).match(/class="tournament-card__cta"[^>]*>([^<]+)</g) || []).map((m) => m.replace(/^.*">/, '').replace('<', ''));

  it('el frontend agrupa y pinta lo que entrega el backend: en vivo, próximos torneos (todas las inscripciones) y máx. 3 finalizados', async () => {
    const datos = [
      enVivo(1, { isRegistrationOpen: false, registrationClosesAt: ahoraSeg() - 3 * DIA }), // en curso con inscripción ya cerrada
      proximo(2, 2, { isRegistrationOpen: true }), // inscripciones abiertas
      proximo(3, 1, { isRegistrationOpen: true, registrationClosesAt: ahoraSeg() + 3600 }), // cierra pronto
      proximo(4, 9), // inscripciones aún no disponibles
      proximo(5, 4, { registrationClosesAt: ahoraSeg() - 3600 }), // inscripciones cerradas
      proximo(6, 7, { isRegistrationOpen: null }), // sin dato fiable
      terminado(11, 1), terminado(12, 2), terminado(13, 3), terminado(14, 4), terminado(15, 5),
    ];
    const { handler } = cargar();
    instalarFetch(servidorSimulado(datos));
    const salida = JSON.parse(JSON.stringify((await llamar(handler)).body));
    assert.equal(salida.length, 1 + 5 + 3, 'el backend ya recorta a 3 finalizados');

    const nodos = await ejecutarFrontend(salida);

    // Tres secciones: ya no existe un contenedor «registration» aparte.
    assert.equal(tarjetas(nodos, 'live'), 1);
    assert.equal(tarjetas(nodos, 'upcoming'), 5);
    assert.equal(tarjetas(nodos, 'finished'), 3);
    assert.equal(tarjetas(nodos, 'registration'), 0);
    assert.equal(tarjetas(nodos, 'carousel'), 6, 'el Home muestra en vivo + próximos y nunca finalizados');

    // Etiqueta de inscripción de cada tarjeta, en orden cronológico de inicio.
    assert.deepEqual(etiquetas(nodos, 'live'), ['En vivo']);
    assert.deepEqual(etiquetas(nodos, 'upcoming'), ['Cierra pronto', 'Inscripciones abiertas', 'Inscripciones cerradas', 'Próximo', 'Próximamente']);
    assert.deepEqual(etiquetas(nodos, 'finished'), ['Terminado', 'Terminado', 'Terminado']);
    assert.deepEqual(etiquetas(nodos, 'carousel'), ['En vivo', 'Cierra pronto', 'Inscripciones abiertas', 'Inscripciones cerradas', 'Próximo', 'Próximamente']);

    // «Inscribirme» solo donde la inscripción está realmente abierta.
    assert.deepEqual(enlaces(nodos, 'upcoming'), ['Inscribirme en Start.gg', 'Inscribirme en Start.gg', 'Ver detalles en Start.gg', 'Ver detalles en Start.gg', 'Ver detalles en Start.gg']);

    // Ningún torneo aparece dos veces en la vista (ni entre secciones).
    const urls = ['live', 'upcoming', 'finished'].flatMap((c) => html(nodos, c).match(/class="tournament-card__cta" href="[^"]+"|href="[^"]+" class="tournament-card__cta"/g) || []);
    assert.equal(new Set(urls).size, urls.length, 'una tarjeta por torneo');
    // Enlaces externos con el comportamiento seguro.
    for (const c of ['live', 'upcoming', 'finished']) {
      for (const a of html(nodos, c).match(/<a [^>]*href="https?:[^>]*>/g) || []) {
        assert.match(a, /target="_blank"/);
        assert.match(a, /rel="noopener noreferrer"/);
      }
    }
  });

  it('red de seguridad: una respuesta con el mismo torneo repetido no duplica tarjetas y gana el grupo de mayor prioridad (live > próximos > finalizados)', async () => {
    const t = (name, url, status) => ({ name, url, status, image: '/assets/images/tournaments/tournament-01.png' });
    const salida = [
      t('Copa A', 'https://www.start.gg/tournament/a', 'reg_open'),
      t('Copa A', 'https://www.start.gg/tournament/a', 'live'), // mismo torneo, ahora en vivo: gana live
      t('Copa A', 'https://www.start.gg/tournament/a', 'finished'),
      t('Copa B', 'https://www.start.gg/tournament/b', 'reg_soon'),
      t('Copa B', 'https://www.start.gg/tournament/b', 'reg_soon'), // repetido idéntico
      t('Copa C', 'https://www.start.gg/tournament/c', 'finished'),
      t('Copa C', 'https://www.start.gg/tournament/c', 'reg_closed'), // gana el futuro sobre el finalizado
    ];
    const nodos = await ejecutarFrontend(salida);
    assert.equal(tarjetas(nodos, 'live'), 1);
    assert.equal(tarjetas(nodos, 'upcoming'), 2);
    assert.equal(tarjetas(nodos, 'finished'), 0);
    assert.deepEqual(etiquetas(nodos, 'live'), ['En vivo']);
    assert.deepEqual(etiquetas(nodos, 'upcoming'), ['Próximamente', 'Inscripciones cerradas']);
    assert.equal(tarjetas(nodos, 'carousel'), 3);
  });

  it('elementos incompletos o con datos opcionales ausentes no rompen: sin imagen usa la de respaldo; sin nombre, sin status o con status desconocido se descartan', async () => {
    const salida = [
      { name: 'Sin imagen', url: 'https://www.start.gg/tournament/x', status: 'reg_open' }, // sin image
      { name: 'Imagen rara', url: 'https://www.start.gg/tournament/y', status: 'reg_soon', image: 'javascript:alert(1)' },
      { name: '', url: 'https://www.start.gg/tournament/z', status: 'live' }, // sin nombre
      { name: 'Sin status', url: 'https://www.start.gg/tournament/w' },
      { name: 'Status raro', url: 'https://www.start.gg/tournament/v', status: 'registration' }, // el grupo antiguo ya no existe
      { name: 'Cancelado', url: 'https://www.start.gg/tournament/u', status: 'cancelled' }, // la clave existe pero no se muestra
      { name: 'Enlace malo', url: 'javascript:alert(1)', status: 'reg_closed' },
      null, 'texto', 42,
    ];
    const nodos = await ejecutarFrontend(salida);
    assert.equal(tarjetas(nodos, 'upcoming'), 3);
    assert.equal(tarjetas(nodos, 'live'), 0);
    const upcoming = html(nodos, 'upcoming');
    assert.equal((upcoming.match(/src="\/assets\/images\/tournaments\/tournament-01\.png"/g) || []).length, 3, 'todas con la imagen de respaldo');
    assert.ok(!/javascript:/i.test(upcoming), 'ninguna URL peligrosa llega al HTML');
    assert.match(upcoming, /tournament-card__cta--disabled/, 'sin enlace válido el CTA queda deshabilitado');
  });

  it('una respuesta vacía no deja tarjetas (y el front muestra los mensajes de "sin torneos")', async () => {
    const nodos = await ejecutarFrontend([]);
    for (const c of ['live', 'upcoming', 'finished', 'carousel']) assert.equal(tarjetas(nodos, c), 0, c);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   scripts/diagnostico-startgg.js (SIMULADO: aquí solo se prueba el script, no a Start.gg)
   ══════════════════════════════════════════════════════════════════════════ */
describe('script de diagnóstico (SIMULADO)', () => {
  const { diagnosticar, consulta } = require(path.join(RAIZ, 'scripts', 'diagnostico-startgg.js'));

  it('compara con y sin published: true, lista los excluidos y muestra state frente al estado calculado', async () => {
    const datos = [
      enVivo(1, { state: 2 }),
      proximo(2, 3, { state: 1 }),
      terminado(3, 2, { state: 3 }),
      proximo(4, 5, { state: 1, name: 'Borrador interno', __publicado: false }),
    ];
    const servidor = servidorSimulado(datos);
    instalarFetch(servidor);

    const lineas = [];
    const resumen = await diagnosticar({ escribir: (l) => lineas.push(l), ahora: ahoraMs });
    const salida = lineas.join('\n');

    assert.equal(resumen.publicados, 3);
    assert.equal(resumen.sinFiltro, 4);
    assert.equal(resumen.excluidos, 1);
    assert.equal(servidor.llamadas.length, 2, 'una pasada con el filtro y otra sin él');
    assert.match(salida, /Excluidos por published: true: 1/);
    assert.match(salida, /Borrador interno/);
    assert.match(salida, /state=2 → live: 1/);
    assert.match(salida, /state=3 → finished: 1/);
    assert.match(salida, /state=1 → reg_soon: 1/);
    assert.ok(!salida.includes(TOKEN), 'la salida nunca incluye el token');
    assert.ok(servidor.llamadas[0].cuerpo.query.includes('published: true'));
    assert.ok(!servidor.llamadas[1].cuerpo.query.includes('published'));
  });

  it('no hace más de 2 × MAX_PAGES peticiones aunque la cuenta sea enorme', async () => {
    const datos = [];
    for (let i = 1; i <= 700; i++) datos.push(proximo(100 + i, i));
    const { internals } = cargar();
    const servidor = servidorSimulado(datos);
    instalarFetch(servidor);
    const lineas = [];
    await diagnosticar({ escribir: (l) => lineas.push(l), ahora: ahoraMs });
    assert.equal(servidor.llamadas.length, 2 * internals.MAX_PAGES);
    assert.ok(lineas.some((l) => l.startsWith('AVISO')), 'avisa de que el sitio no lee todo');
  });

  it('sin configuración no llama a Start.gg', async () => {
    delete process.env.STARTGG_TOKEN;
    let llamadas = 0;
    instalarFetch(async () => { llamadas++; return respuestaOk({}); });
    await assert.rejects(() => diagnosticar({ escribir: () => {} }), /no está configurado/);
    assert.equal(llamadas, 0);
  });

  it('un error de Start.gg se informa sin revelar el token', async () => {
    instalarFetch(async () => respuestaOk({ errors: [{ message: 'error simulado' }] }));
    await assert.rejects(() => diagnosticar({ escribir: () => {} }), (e) => /Errores GraphQL: error simulado/.test(e.message) && !e.message.includes(TOKEN));
  });

  it('la consulta de diagnóstico solo usa campos que existen en el esquema (state y publishing incluidos)', () => {
    const permitidas = new Set(['query', 'KoaDiagnostico', 'ownerId', 'ID', 'page', 'Int', 'perPage', 'tournaments', 'sortBy', 'filter', 'published', 'true',
      'pageInfo', 'total', 'totalPages', 'nodes', 'id', 'name', 'slug', 'url', 'relative', 'false', 'startAt', 'endAt', 'isRegistrationOpen',
      'registrationClosesAt', 'state', 'publishing']);
    for (const soloPublicados of [true, false]) {
      const palabras = consulta(soloPublicados).replace(/"[^"]*"/g, '').match(/[A-Za-z_][A-Za-z0-9_]*/g);
      const desconocidas = [...new Set(palabras)].filter((p) => !permitidas.has(p));
      assert.deepEqual(desconocidas, []);
    }
  });
});
