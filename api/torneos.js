/* ==========================================================================
   KOA-SPORTS — /api/torneos
   Vercel Serverless Function (Node.js, CommonJS)

   Intermediario seguro entre Start.gg y el front-end. Consulta la API GraphQL
   de Start.gg (única fuente de torneos), normaliza la respuesta y devuelve un
   arreglo JSON que js/tournaments.js puede pintar tal cual:

       [ { name, image, url, status }, … ]

     name    nombre del torneo
     image   imagen de Start.gg (banner → profile) o la imagen por defecto
     url     enlace absoluto a Start.gg (solo http/https)
     status  clave de estado (las mismas que usa el front; no se devuelven
             textos como "EN VIVO" o "PRÓXIMO"):
               live        en curso
               finished    ya terminó
               reg_open    futuro · inscripciones abiertas
               closing     futuro · inscripciones abiertas y cierran en < 24 h
               reg_soon    futuro · inscripciones aún no disponibles
               reg_closed  futuro · inscripciones cerradas (plazo vencido)
               upcoming    futuro · sin dato fiable de inscripción
             Las cinco claves "futuras" se muestran juntas en «Próximos
             torneos»; la distinción entre ellas es solo la etiqueta de
             inscripción (ver «Estados»).

   El arreglo sale ya ordenado: en vivo (el que termina antes primero) →
   futuros (el que empieza antes primero, sea cual sea su inscripción) →
   finalizados (el más reciente primero, máximo FINISHED_LIMIT). El backend se
   encarga de recuperar, normalizar, calcular fechas/estado, ordenar y descartar
   datos inválidos; el front solo presenta. El contrato es siempre
   { name, image, url, status }: los estados de inscripción nuevos son
   VALORES adicionales de `status`, no campos nuevos.

   ── Variables de entorno (Vercel → Project Settings → Environment Variables)
     STARTGG_TOKEN       Token de desarrollador de Start.gg. SECRETO: solo
                         existe aquí, en el servidor. Nunca en HTML, JS del
                         front, URLs, respuestas ni logs.
     STARTGG_OWNER_ID    ID numérico de la cuenta de Start.gg que CREA los
                         torneos de KOA. Es la única cuenta que se consulta.
   Si falta cualquiera de las dos (o el ID no es numérico) el endpoint
   responde 503 con un mensaje genérico; el detalle solo va al log del
   servidor. No existe token ni cuenta de ejemplo.

   ── Parámetros de la URL
     Ninguno. El endpoint ignora por completo la query string: un visitante no
     puede cambiar la cuenta, el límite ni nada de la consulta.

   ── Consulta a Start.gg (https://api.start.gg/gql/alpha)
     tournaments(query: { page, perPage: 50, sortBy: "startAt desc",
                          filter: { ownerId, published: true } })
         { pageInfo { total totalPages }  nodes { … } }
     Campos cuya EXISTENCIA se comprobó en la referencia oficial del esquema
     (consultada el 2026-10-10; ver README, «Qué se verificó de Start.gg»):
       TournamentQuery.page | perPage (máx. 512) | sortBy | filter
         · sortBy es un String del que la referencia NO documenta valores ni
           sintaxis. Se conserva "startAt desc" (ya era el de la consulta
           anterior del sitio), pero la corrección NO depende de él mientras la
           cuenta tenga ≤ MAX_PAGES × PER_PAGE torneos (se leen todos).
           (Existe además `sort: TournamentPaginationSort` —startAt, endAt,
           eventRegistrationClosesAt, computedUpdatedAt— sin dirección
           documentada; no se usa.)
       TournamentPageFilter.ownerId  ("ID of the user that owns this tournament")
                            .published (Boolean; la referencia no lo describe;
                                        ver «Visibilidad» más abajo)
       PageInfo.total | totalPages
       Tournament.id | name | slug | url(relative: Boolean) | startAt | endAt
                 | isRegistrationOpen | registrationClosesAt
                 | images → Image { type, url, width }
     `filter.ownerId` devuelve solo torneos CREADOS por esa cuenta (no aquellos
     donde solo es admin o participante). Los Timestamp son segundos Unix.
     NO se filtra por videojuego: se recuperan los torneos de cualquier juego.
     Solo se piden los campos que se usan; no se descargan eventos, brackets
     ni participantes.

   ── Estrategia de recuperación (por qué no basta una página)
     Antes se leía UNA página de 25 ordenada por startAt desc. Con más de 25
     torneos (o muchos eventos futuros) los más antiguos quedaban fuera, y un
     torneo en vivo —que empezó antes que los futuros— podía no aparecer.
     Ahora:
       1. Se pide la página 1 (50 torneos) y se lee pageInfo.totalPages.
       2. Las páginas 2…totalPages se piden EN PARALELO, hasta MAX_PAGES (6 →
          300 torneos). Si pageInfo no es utilizable, se sigue de forma
          secuencial mientras la página venga llena (mismo tope).
       3. Con todos los torneos juntos se calcula el estado de cada uno, se
          descartan duplicados e inválidos, y se conservan TODOS los en vivo y
          próximos y SOLO los FINISHED_LIMIT (3) finalizados más recientes
          (por fecha de fin), calculados sobre el conjunto completo.
     Mientras la cuenta tenga ≤ 300 torneos el resultado NO depende del orden
     ni de lo que `desc` signifique para Start.gg. Si tuviera más, se leen los
     300 más recientes por startAt y se registra una advertencia en el log.
     Una cuenta típica (≤ 50 torneos) cuesta UNA sola llamada.
     Si cualquier página falla, la recuperación completa falla: nunca se
     publica ni se guarda en memoria un resultado parcial.

   ── Límites (de Start.gg y propios)
     Start.gg: promedio de 80 peticiones por 60 s; 1000 objetos por petición
     (incluye anidados: 50 torneos × (1 + imágenes) cabe con margen).
     Propios: PER_PAGE 50, MAX_PAGES 6, plazo TOTAL de REQUEST_TIMEOUT_MS (8 s,
     bajo el máximo de 10 s de una función en Vercel Hobby) para todas las
     llamadas de una recuperación, memoria de 60 s y caché del Edge de 5 min.

   ── Visibilidad (qué se filtra y qué NO se puede garantizar)
     • Se filtra en Start.gg con `published: true` (campo real de
       TournamentPageFilter). La referencia no describe qué significa, así que
       se asume —sin poder demostrarlo desde aquí— que excluye lo que Start.gg
       tiene como no publicado. Su efecto real se comprueba con
       scripts/diagnostico-startgg.js y credenciales reales.
     • `publiclySearchable` existe en el esquema pero NO se usa: la referencia
       no documenta su significado y podría ocultar torneos legítimos de KOA.
       Ver FILTRO_VISIBILIDAD abajo.
     • No hay un campo verificable para detectar torneos «privados» o «solo con
       enlace» más allá de lo anterior: eso NO está garantizado.
     • No se usa ninguna heurística basada en el título del torneo.

   ── Estados (se calculan con la hora del servidor)
     El estado del TORNEO y el de la INSCRIPCIÓN son cosas distintas. Primero
     se decide la fase del torneo SOLO con sus fechas; la inscripción se mira
     únicamente si el torneo aún no empieza. Así un torneo en curso nunca
     acaba como «próximo» ni uno terminado como «en vivo», tenga la
     inscripción que tenga.

       fase (solo fechas)         ahora ≥ startAt  y  ahora < endAt   → live
                                  ahora ≥ endAt                       → finished
                                  ahora < startAt                     → futuro ↓

       futuro, inscripción:       registrationClosesAt ya pasó        → reg_closed
         (se evalúa en este       isRegistrationOpen = true           → reg_open
          orden; gana la 1.ª      … y cierra en < 24 h                → closing
          que se cumpla)          isRegistrationOpen = false          → reg_soon
                                  isRegistrationOpen no es booleano   → upcoming

     Qué se puede y qué NO se puede confirmar con los campos reales:
       • Abierta: `isRegistrationOpen === true` y el plazo (si lo hay) no ha
         vencido. «Cierra pronto» exige además `registrationClosesAt` a menos
         de 24 h: sin ese dato nunca se emite.
       • Cerrada: solo cuando `registrationClosesAt` ya pasó (un plazo vencido
         se confirma con la fecha, aunque `isRegistrationOpen` esté
         desactualizado). Que una inscripción esté cerrada NO significa que el
         torneo se haya cancelado.
       • Aún no disponible (`reg_soon`): `isRegistrationOpen` es false y el plazo
         no ha vencido. Start.gg NO expone la fecha de APERTURA de inscripciones
         (la referencia del esquema solo trae `registrationClosesAt`), así que
         no se puede saber CUÁNDO abrirá ni distinguir «todavía no abre» de
         «el organizador la cerró antes de su plazo».
       • Si `isRegistrationOpen` falta o no es un booleano, no se afirma nada
         sobre la inscripción (`upcoming`: el front solo dice «Próximo»).
     Un torneo futuro NUNCA se considera abierto solo por serlo.
     `Tournament.state` (Int) existe y la referencia dice que "puede ser
     ActivityState::CREATED, ACTIVE o COMPLETED", pero NO documenta qué entero
     corresponde a cada valor, así que no se usa. Los estados salen de las
     fechas de inicio/fin (las PROGRAMADAS por la organización: un torneo que
     se alarga más allá de su `endAt` figurará como finalizado). El script
     scripts/diagnostico-startgg.js permite comparar `state` con el estado
     calculado usando datos reales.
     `cancelled` NO se emite: ni el esquema (Tournament) ni ActivityState
     (CREATED, ACTIVE, COMPLETED, READY, INVALID, CALLED, QUEUED) exponen una
     cancelación. Que la inscripción esté cerrada tampoco significa que el
     torneo se haya cancelado. El front ya conoce la clave por si algún día se
     puede derivar de un dato real.
     Se descartan (y se registra el motivo en el log, sin datos sensibles) los
     torneos sin id, sin nombre, sin enlace, sin startAt válido, o ya iniciados
     sin un endAt válido (no se inventa una duración).

   ── Caché
     • Vercel Edge: `s-maxage=300, stale-while-revalidate=600` en respuestas
       correctas; los errores llevan `no-store` y nunca se cachean.
     • Memoria de la instancia (no persistente): se reutiliza la última
       recuperación completa y válida durante 60 s y las peticiones
       simultáneas comparten una sola recuperación. Así, variar la URL para
       saltarse el caché del Edge no multiplica las llamadas a Start.gg.
       Si Start.gg falla, se sirven los últimos datos válidos hasta 1 h.
   ========================================================================== */

'use strict';

/* ───────────────────────────── Configuración ───────────────────────────── */

const STARTGG_ENDPOINT = 'https://api.start.gg/gql/alpha';
const STARTGG_SITE = 'https://www.start.gg/';

// Imagen por defecto (archivo real del proyecto, servido desde la raíz del sitio).
const DEFAULT_IMAGE = '/assets/images/tournaments/tournament-01.png';

// Caché del Edge Network de Vercel: 5 min "fresco" + 10 min sirviendo el
// contenido viejo mientras se revalida en segundo plano.
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';

// Paginación. Start.gg permite perPage ≤ 512 y 1000 objetos por petición
// (anidados incluidos); 50 torneos con sus imágenes quedan muy por debajo.
const PER_PAGE = 50;
const MAX_PAGES = 6; // Tope de seguridad: 6 × 50 = 300 torneos por recuperación.
const REQUEST_TIMEOUT_MS = 8000; // Plazo TOTAL de todas las llamadas de una recuperación.
const FINISHED_LIMIT = 3; // Finalizados más recientes que se publican.

const MEMORY_TTL_MS = 60 * 1000; // Reutilización de la última recuperación válida.
const STALE_ON_ERROR_MS = 60 * 60 * 1000; // Si Start.gg falla, datos de hasta 1 h.

const CLOSING_SOON_MS = 24 * 60 * 60 * 1000; // < 24 h para cerrar → 'closing'.
const MAX_NAME_LENGTH = 120;

const ERROR_GENERICO = 'No se pudieron obtener los torneos en este momento.';

// Orden de aparición: en vivo → futuros → finalizados. Todos los estados de
// inscripción de un torneo futuro comparten prioridad (se ordenan por fecha de
// inicio, no por el estado de su inscripción).
const STATUS_PRIORITY = { live: 0, closing: 1, reg_open: 1, reg_soon: 1, reg_closed: 1, upcoming: 1, finished: 2 };

/* ───────────────────────────────── Consulta ──────────────────────────────── */

/* FILTRO_VISIBILIDAD: `published: true` es la ÚNICA regla de visibilidad
   pública que se aplica (campo real de TournamentPageFilter; Start.gg no
   documenta su semántica, así que conviene comprobarla con
   scripts/diagnostico-startgg.js tras desplegar). Si algún día se decide
   usar también `publiclySearchable: true`, se añade aquí y solo aquí. */
const FILTRO_VISIBILIDAD = 'published: true';

const QUERY = `
  query KoaTorneos($ownerId: ID!, $page: Int!, $perPage: Int!) {
    tournaments(query: {
      page: $page
      perPage: $perPage
      sortBy: "startAt desc"
      filter: { ownerId: $ownerId, ${FILTRO_VISIBILIDAD} }
    }) {
      pageInfo {
        total
        totalPages
      }
      nodes {
        id
        name
        slug
        url(relative: false)
        startAt
        endAt
        isRegistrationOpen
        registrationClosesAt
        images {
          type
          url
          width
        }
      }
    }
  }
`;

/* ───────────────────────────── Errores y config ──────────────────────────── */

/**
 * Error con código HTTP. `message` es lo ÚNICO que ve el visitante, así que
 * debe ser genérico: el detalle técnico va a console.error (log del servidor).
 */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Lee y valida STARTGG_TOKEN y STARTGG_OWNER_ID. No hay valores de ejemplo:
 * si algo falta o es inválido, error controlado 503 y el detalle (solo los
 * NOMBRES de las variables, nunca sus valores) va al log.
 */
function leerConfiguracion() {
  const token = String(process.env.STARTGG_TOKEN || '').trim();
  const ownerId = String(process.env.STARTGG_OWNER_ID || '').trim();

  const problemas = [];
  if (!token) problemas.push('STARTGG_TOKEN no está definido');
  else if (!/^[\x21-\x7E]+$/.test(token)) problemas.push('STARTGG_TOKEN contiene caracteres no válidos');

  if (!ownerId) problemas.push('STARTGG_OWNER_ID no está definido');
  else if (!/^\d{1,12}$/.test(ownerId)) problemas.push('STARTGG_OWNER_ID debe ser un ID numérico');

  if (problemas.length) {
    console.error('[api/torneos] Configuración incompleta: ' + problemas.join('; ') + '.');
    throw httpError(503, 'El servicio de torneos no está configurado.');
  }
  return { token, ownerId };
}

/* ──────────────────────────── Cliente Start.gg ───────────────────────────── */

/** Entero ≥ 0 o null (pageInfo puede venir vacío o con valores inesperados). */
function enteroONulo(valor) {
  return Number.isInteger(valor) && valor >= 0 ? valor : null;
}

/**
 * Pide UNA página (POST GraphQL) y devuelve { nodos, total, totalPaginas }.
 * Lanza un Error con `status` apropiado si algo falla; los mensajes son
 * genéricos y el detalle se registra solo en el servidor. `signal` es el plazo
 * compartido por todas las páginas de una recuperación.
 */
async function pedirPagina({ token, ownerId }, pagina, signal) {
  let respuesta;
  try {
    respuesta = await fetch(STARTGG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: QUERY, variables: { ownerId, page: pagina, perPage: PER_PAGE } }),
      signal,
    });
  } catch (err) {
    const agotado = err && err.name === 'AbortError';
    console.error('[api/torneos] No se pudo contactar con Start.gg (página ' + pagina + '):', agotado ? 'tiempo de espera agotado o petición cancelada' : (err && err.name));
    throw httpError(agotado ? 504 : 502, ERROR_GENERICO);
  }

  if (respuesta.status === 401 || respuesta.status === 403) {
    console.error('[api/torneos] Start.gg rechazó el token (HTTP ' + respuesta.status + '): revisa STARTGG_TOKEN.');
    throw httpError(502, ERROR_GENERICO);
  }
  if (respuesta.status === 429) {
    console.error('[api/torneos] Start.gg alcanzó el límite de peticiones (HTTP 429).');
    throw httpError(503, ERROR_GENERICO);
  }
  if (!respuesta.ok) {
    console.error('[api/torneos] Start.gg respondió con HTTP ' + respuesta.status + '.');
    throw httpError(502, ERROR_GENERICO);
  }

  let json;
  try {
    json = await respuesta.json();
  } catch (err) {
    const agotado = err && err.name === 'AbortError';
    console.error('[api/torneos] Respuesta de Start.gg ilegible:', agotado ? 'tiempo de espera agotado o petición cancelada' : 'no es JSON válido');
    throw httpError(agotado ? 504 : 502, ERROR_GENERICO);
  }

  // Rechazos con el formato documentado por Start.gg: { success: false, message }
  // (límite de peticiones o de complejidad). No traen `errors` ni `data`.
  if (json && json.success === false) {
    const mensaje = String(json.message || '').slice(0, 300);
    console.error('[api/torneos] Start.gg rechazó la consulta:', mensaje);
    throw httpError(/rate limit/i.test(mensaje) ? 503 : 502, ERROR_GENERICO);
  }

  // GraphQL puede responder 200 con `errors`.
  if (json && Array.isArray(json.errors) && json.errors.length) {
    const detalle = json.errors.map((e) => String((e && e.message) || e)).join(' | ').slice(0, 500);
    console.error('[api/torneos] Errores GraphQL de Start.gg:', detalle);
    throw httpError(502, ERROR_GENERICO);
  }

  const conexion = json && json.data && json.data.tournaments;
  const nodos = conexion && conexion.nodes;
  if (!Array.isArray(nodos)) {
    console.error('[api/torneos] La respuesta de Start.gg no trae data.tournaments.nodes.');
    throw httpError(502, ERROR_GENERICO);
  }

  const info = (conexion && conexion.pageInfo) || {};
  return { nodos, total: enteroONulo(info.total), totalPaginas: enteroONulo(info.totalPages) };
}

/**
 * Recupera TODOS los torneos publicados de la cuenta (hasta MAX_PAGES páginas)
 * y devuelve los nodos tal como llegan de Start.gg. Todo ocurre dentro de un
 * único plazo (REQUEST_TIMEOUT_MS). Si falla cualquier página, falla todo: no
 * se devuelve un resultado parcial.
 */
async function descargarTorneos(config) {
  // AbortController: corta las peticiones si Start.gg tarda demasiado. El
  // temporizador cubre también la lectura de los cuerpos de las respuestas.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const primera = await pedirPagina(config, 1, controller.signal);
    const nodos = primera.nodos.slice();

    if (primera.totalPaginas === null) {
      // pageInfo no utilizable: se sigue mientras la página venga llena.
      let ultima = primera;
      for (let pagina = 2; pagina <= MAX_PAGES && ultima.nodos.length >= PER_PAGE; pagina++) {
        ultima = await pedirPagina(config, pagina, controller.signal);
        nodos.push(...ultima.nodos);
      }
      if (ultima.nodos.length >= PER_PAGE) {
        console.warn('[api/torneos] Start.gg no informó el total de páginas y se alcanzó el tope de ' + (MAX_PAGES * PER_PAGE) + ' torneos: puede haber torneos más antiguos sin leer.');
      }
    } else {
      const ultimaPagina = Math.min(primera.totalPaginas, MAX_PAGES);
      if (primera.totalPaginas > MAX_PAGES) {
        console.warn('[api/torneos] La cuenta tiene ' + (primera.total === null ? 'más de ' + (MAX_PAGES * PER_PAGE) : primera.total) +
          ' torneos publicados; se leen solo los ' + (MAX_PAGES * PER_PAGE) + ' más recientes por fecha de inicio (tope MAX_PAGES).');
      }

      // Páginas 2…ultimaPagina en paralelo (como mucho MAX_PAGES − 1 peticiones).
      const pendientes = [];
      for (let pagina = 2; pagina <= ultimaPagina; pagina++) {
        pendientes.push(pedirPagina(config, pagina, controller.signal));
      }
      const resto = await Promise.all(pendientes);

      let totalCambio = false;
      for (const r of resto) {
        nodos.push(...r.nodos);
        if (r.total !== null && primera.total !== null && r.total !== primera.total) totalCambio = true;
      }
      if (totalCambio) {
        console.warn('[api/torneos] El total de torneos cambió mientras se leían las páginas; la próxima recuperación lo corregirá.');
      }
    }
    return nodos;
  } catch (err) {
    controller.abort(); // Cancela las páginas que sigan en vuelo.
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── Memoria de la instancia ───────────────────────── */

let memoria = null; // { ownerId, nodos, en } — última recuperación completa y válida
let enVuelo = null; // { ownerId, promesa } — recuperación en curso, compartida

/**
 * Devuelve los nodos de Start.gg reutilizando la memoria de la instancia:
 *  - dentro de MEMORY_TTL_MS no se vuelve a consultar;
 *  - las peticiones simultáneas comparten una única recuperación;
 *  - si Start.gg falla y hay datos de hasta STALE_ON_ERROR_MS, se sirven esos.
 * Solo se guardan los nodos crudos de una recuperación COMPLETA: el estado se
 * recalcula en cada respuesta.
 */
async function obtenerNodos(config) {
  const { ownerId } = config;

  if (memoria && memoria.ownerId === ownerId && Date.now() - memoria.en < MEMORY_TTL_MS) {
    return memoria.nodos;
  }

  if (!enVuelo || enVuelo.ownerId !== ownerId) {
    const actual = { ownerId, promesa: null };
    actual.promesa = descargarTorneos(config)
      .then((nodos) => {
        memoria = { ownerId, nodos, en: Date.now() };
        return nodos;
      })
      .finally(() => {
        if (enVuelo === actual) enVuelo = null;
      });
    enVuelo = actual;
  }

  try {
    return await enVuelo.promesa;
  } catch (err) {
    if (memoria && memoria.ownerId === ownerId && Date.now() - memoria.en < STALE_ON_ERROR_MS) {
      console.warn('[api/torneos] Start.gg falló; se sirven los últimos datos válidos.');
      return memoria.nodos;
    }
    throw err;
  }
}

/* ───────────────────────────── Utilidades puras ──────────────────────────── */

/**
 * Convierte un Timestamp de Start.gg (segundos Unix) a milisegundos.
 * Devuelve null si el valor no es un número válido.
 */
function segundosAMs(valor) {
  const n = typeof valor === 'number'
    ? valor
    : (typeof valor === 'string' && valor.trim() ? Number(valor) : NaN);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
}

/**
 * Valida una URL absoluta: solo http/https (nunca javascript:, data:, etc.).
 * Con `soloHttps` exige https (imágenes: el sitio se sirve por https).
 * Devuelve la URL normalizada o null.
 */
function urlSegura(valor, soloHttps) {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  if (!texto || texto.length > 2048) return null;

  let u;
  try {
    u = new URL(texto);
  } catch {
    return null;
  }
  if (u.protocol === 'https:' || (!soloHttps && u.protocol === 'http:')) return u.href;
  return null;
}

/**
 * Construye la URL a partir del slug si la API no trae una absoluta. El slug de
 * Start.gg tiene la forma "tournament/<nombre>"; cualquier otra cosa se rechaza.
 * El host es siempre el de Start.gg: el slug nunca puede cambiarlo.
 */
function urlDesdeSlug(slug) {
  if (typeof slug !== 'string') return null;
  const limpio = slug.trim().replace(/^\/+/, '');
  if (!/^tournament\/[A-Za-z0-9][A-Za-z0-9._~-]{0,150}$/.test(limpio) || limpio.includes('..')) return null;
  return STARTGG_SITE + limpio;
}

/**
 * Elige la mejor imagen: primero `banner`, luego `profile`; entre varias del
 * mismo tipo, la más ancha. Si no hay ninguna válida, la imagen por defecto.
 */
function elegirImagen(images) {
  if (!Array.isArray(images)) return DEFAULT_IMAGE;

  const validas = images
    .map((img) => ({ tipo: String((img && img.type) || '').toLowerCase(), url: urlSegura(img && img.url, true), ancho: Number(img && img.width) || 0 }))
    .filter((img) => img.url);

  for (const tipo of ['banner', 'profile']) {
    const candidatas = validas.filter((img) => img.tipo === tipo).sort((a, b) => b.ancho - a.ancho);
    if (candidatas.length) return candidatas[0].url;
  }
  return DEFAULT_IMAGE;
}

/**
 * Calcula la clave de estado comparando fechas con `ahora` (milisegundos).
 * Devuelve null si los datos no bastan para afirmar un estado (se descarta).
 *
 * Orden de decisión (ver «Estados» arriba):
 *   1. Fase del torneo, SOLO por fechas: en curso o terminado. Aquí termina la
 *      función: la inscripción no influye en estos dos estados.
 *   2. Solo si aún no empieza, estado de la inscripción.
 */
function calcularEstado({ startMs, endMs, inscripcionAbierta, cierreMs }, ahora) {
  if (ahora >= startMs) {
    if (endMs === null || endMs < startMs) return null; // Sin fin válido no se sabe si terminó.
    return ahora < endMs ? 'live' : 'finished';
  }

  // Aún no empieza. Un plazo de inscripción vencido es el único dato que
  // confirma que está CERRADA (aunque `isRegistrationOpen` esté desactualizado).
  if (cierreMs !== null && cierreMs <= ahora) return 'reg_closed';

  // Abierta solo si Start.gg lo dice (y el plazo, si lo trae, no ha vencido).
  if (inscripcionAbierta === true) {
    return cierreMs !== null && cierreMs - ahora < CLOSING_SOON_MS ? 'closing' : 'reg_open';
  }

  // `false`: no está abierta ahora y el plazo no ha vencido → aún no disponible.
  // Cualquier otra cosa (falta el dato): no se afirma nada sobre la inscripción.
  return inscripcionAbierta === false ? 'reg_soon' : 'upcoming';
}

/**
 * Transforma un nodo GraphQL. Devuelve { item } (el objeto público más los
 * tiempos necesarios para ordenar) o { motivo } si el nodo no sirve.
 */
function transformarTorneo(nodo, ahora) {
  if (!nodo || typeof nodo !== 'object' || nodo.id == null) return { motivo: 'sin id' };

  const name = typeof nodo.name === 'string' ? nodo.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (!name) return { motivo: 'sin nombre' };

  const url = urlSegura(nodo.url, false) || urlDesdeSlug(nodo.slug);
  if (!url) return { motivo: 'sin enlace válido' };

  const startMs = segundosAMs(nodo.startAt);
  if (startMs === null) return { motivo: 'sin fecha de inicio válida' };

  const endMs = segundosAMs(nodo.endAt);
  const cierreMs = segundosAMs(nodo.registrationClosesAt);

  const status = calcularEstado(
    { startMs, endMs, inscripcionAbierta: nodo.isRegistrationOpen, cierreMs },
    ahora
  );
  if (!status) return { motivo: 'ya empezó y no tiene fecha de fin válida' };

  return {
    item: {
      id: String(nodo.id),
      startMs,
      endMs,
      cierreMs,
      torneo: { name, image: elegirImagen(nodo.images), url, status },
    },
  };
}

/**
 * Orden: en vivo (el que termina antes primero) → futuros, con cualquier estado
 * de inscripción (el que empieza antes primero) → finalizados (el más reciente
 * primero). A igualdad de fechas se desempata por id para que el orden no
 * dependa de cómo Start.gg entregó las páginas.
 */
function compararTorneos(a, b) {
  const d = STATUS_PRIORITY[a.torneo.status] - STATUS_PRIORITY[b.torneo.status];
  if (d !== 0) return d;

  let porFecha;
  switch (a.torneo.status) {
    case 'live': porFecha = a.endMs - b.endMs; break;
    case 'finished': porFecha = b.endMs - a.endMs; break;
    default: porFecha = a.startMs - b.startMs;
  }
  if (porFecha !== 0) return porFecha;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Nodos de Start.gg → arreglo público `{ name, image, url, status }` ordenado.
 * Descarta duplicados (el mismo id puede repetirse si los datos se desplazan
 * entre páginas) y torneos inválidos (se registra el motivo), y se queda solo
 * con los FINISHED_LIMIT finalizados más recientes del conjunto completo.
 */
function normalizarTorneos(nodos, ahora) {
  const vistos = new Set();
  const items = [];
  const descartes = [];

  for (const nodo of nodos) {
    const id = nodo && typeof nodo === 'object' && nodo.id != null ? String(nodo.id) : null;
    if (id !== null) {
      if (vistos.has(id)) continue;
      vistos.add(id);
    }

    const resultado = transformarTorneo(nodo, ahora);
    if (resultado.motivo) {
      descartes.push('id ' + (id === null ? '?' : id.slice(0, 20)) + ': ' + resultado.motivo);
      continue;
    }
    items.push(resultado.item);
  }

  if (descartes.length) {
    console.warn('[api/torneos] Descartados ' + descartes.length + ' torneo(s): ' +
      descartes.slice(0, 10).join('; ') + (descartes.length > 10 ? '; …' : ''));
  }

  const publicos = [];
  let terminados = 0;
  for (const item of items.sort(compararTorneos)) {
    if (item.torneo.status === 'finished' && ++terminados > FINISHED_LIMIT) continue;
    publicos.push(item.torneo);
  }
  return publicos;
}

/* ───────────────────────────────── Handler ─────────────────────────────── */

async function handler(req, res) {
  // Solo lectura.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const config = leerConfiguracion(); // Nada de la URL influye en la consulta.
    const nodos = await obtenerNodos(config);

    // Un único "ahora" para toda la respuesta (todos los estados son coherentes).
    const torneos = normalizarTorneos(nodos, Date.now());

    // Caché en el Edge Network de Vercel (solo en respuestas exitosas).
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json(torneos);
  } catch (err) {
    const controlado = Boolean(err && err.status);
    if (!controlado) console.error('[api/torneos] Error inesperado:', err);

    // Los errores NUNCA se cachean: así un fallo temporal no se queda 15 min.
    res.setHeader('Cache-Control', 'no-store');
    return res
      .status(controlado ? err.status : 500)
      .json({ error: controlado ? err.message : 'Error interno del servidor.' });
  }
}

module.exports = handler;

/* Piezas internas expuestas SOLO para las pruebas (test/) y para
   scripts/diagnostico-startgg.js. Vercel usa únicamente la función exportada. */
module.exports.internals = {
  STARTGG_ENDPOINT,
  QUERY,
  FILTRO_VISIBILIDAD,
  PER_PAGE,
  MAX_PAGES,
  REQUEST_TIMEOUT_MS,
  FINISHED_LIMIT,
  MEMORY_TTL_MS,
  STALE_ON_ERROR_MS,
  DEFAULT_IMAGE,
  leerConfiguracion,
  pedirPagina,
  descargarTorneos,
  normalizarTorneos,
  transformarTorneo,
  calcularEstado,
};
