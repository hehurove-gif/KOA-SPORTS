/* ==========================================================================
   KOA — TORNEOS (tarjetas dinámicas)
   Consulta /api/torneos (Start.gg, a través de api/torneos.js), valida la
   respuesta, agrupa los torneos por estado y pinta las tarjetas. No tiene
   datos propios: no hay torneos escritos en el HTML ni datos de ejemplo aquí.

   FLUJO
     1. setState("loading")
     2. fetch("/api/torneos")
     3. se valida el HTTP (response.ok) y que el JSON sea un array
     4. cada elemento se valida (nombre, estado conocido, URL e imagen seguras)
     5. se agrupa por status → { live, upcoming, finished } (un mismo torneo
        nunca queda en dos grupos)
     6. render(groups) pinta las tarjetas, los estados vacíos y el carrusel
     7. si falla y todavía no había nada en pantalla → estado de error
        (si ya había torneos visibles se conservan; ver ACTUALIZACIÓN)

   Este archivo NO calcula estados ni interpreta fechas de Start.gg: el
   backend ya entrega { name, image, url, status } normalizado, ordenado y sin
   datos inválidos. Aquí solo se valida, se agrupa y se presenta.

   AGRUPACIÓN (clave `status` del backend → grupo de render)
       live                                       → live
       reg_open, closing, reg_soon, reg_closed,
       upcoming                                   → upcoming («Próximos torneos»)
       finished                                   → finished
       cancelled                                  → no se muestra en ningún lado
   El estado de la inscripción NO decide el grupo: solo cambia la etiqueta de
   la tarjeta dentro de «Próximos torneos» (ver STATUS). Un status desconocido
   o ausente descarta ese elemento (no se inventa uno). Si la respuesta trajera
   dos veces el mismo torneo (misma URL), se queda UNA tarjeta, en el grupo de
   mayor prioridad: live > upcoming > finished.
   El Home recibe live + upcoming y NUNCA finished; la vista Torneos muestra
   como máximo FINISHED_LIMIT finalizados.

   ACTUALIZACIÓN AUTOMÁTICA (el sitio se refresca solo, sin recargar ni
   volver a desplegar)
     • Un único temporizador: tras cada respuesta se agenda la siguiente
       consulta a los POLL_INTERVAL_MS (5 min). Nunca hay dos peticiones a la
       vez ni más de un temporizador.
     • Con la pestaña oculta (document.hidden) no se consulta. Al volver, si ya
       tocaba actualizar, se consulta de inmediato; si no, se espera lo que
       faltaba.
     • Si una consulta falla de forma temporal, las tarjetas visibles se
       conservan; se reintenta antes (1 min, luego 2, 4… hasta 5 min).
     • Si la respuesta no cambió, no se vuelve a pintar el DOM.
     • El navegador consulta /api/torneos con frecuencia, pero Vercel la sirve
       desde su caché (s-maxage=300): no cada visita llega a Start.gg.

   API PÚBLICA (window.KOATournaments):
     render({ live, upcoming, finished })
         Rellena los contenedores con tarjetas y deja la lista en estado "ready".
     setState("loading" | "error" | "ready")
         Muestra el estado global de la lista: cargando, error o listo.
     refresh()
         Pide una actualización ahora (no hace nada si ya hay una en curso).
     API_URL, STATUS

   El carrusel del Home (js/carousel.js) se recalcula solo después de render().

   CONTRATO DE LA TARJETA (únicamente estos campos):
       { name, image, url, status }
     name    nombre del torneo
     image   URL https de Start.gg o ruta del sitio; si falta o no es válida se
             usa FALLBACK_IMAGE. Si la imagen falla en el navegador se cambia a
             FALLBACK_IMAGE y, si esa también falla, se oculta (la tarjeta no
             se rompe).
     url     enlace a Start.gg (solo se aceptan http/https; se abre en una
             pestaña nueva con rel="noopener noreferrer")
     status  clave de STATUS (live, reg_open, closing, reg_soon, reg_closed,
             upcoming, finished, cancelled)

   CONTENEDORES (index.html):
     [data-tournaments="carousel"]      carrusel del Home (live + upcoming;
                                        los terminados NUNCA entran en el Home)
     [data-tournaments="live"]          vista Torneos: en vivo
     [data-tournaments="upcoming"]      vista Torneos: próximos torneos (todas las inscripciones)
     [data-tournaments="finished"]      vista Torneos: finalizados recientes (máx. FINISHED_LIMIT)
     [data-tournaments-empty="<clave>"] mensaje de "sin torneos" de cada contenedor
     [data-tournaments-state="loading"] "Cargando torneos…" (Home y vista Torneos)
     [data-tournaments-state="error"]   mensaje de error (Home y vista Torneos)
   ========================================================================== */

(function () {
  "use strict";

  /* Evita inicializar dos veces (dos temporizadores) si el script se cargara repetido. */
  if (window.KOATournaments) return;

  /* Única URL que consulta el frontend: la función serverless propia del sitio.
     El token de Start.gg vive solo en el servidor; aquí no hay ninguna clave. */
  var API_URL = "/api/torneos";

  var POLL_INTERVAL_MS = 5 * 60 * 1000;   /* consulta periódica: ~5 min */
  var RETRY_BASE_MS = 60 * 1000;          /* tras un fallo: 1 min, 2, 4… (tope: POLL_INTERVAL_MS) */
  var REQUEST_TIMEOUT_MS = 15 * 1000;     /* una petición colgada no bloquea las siguientes */

  var FALLBACK_IMAGE = "/assets/images/tournaments/tournament-01.png";
  var FINISHED_LIMIT = 3;

  /* Estados que la tarjeta sabe mostrar: etiqueta, clase del indicador y texto
     del enlace. En «Próximos torneos» la etiqueta es el estado REAL de la
     inscripción según el backend (nunca se deduce aquí):
       reg_open    inscripciones abiertas
       closing     abiertas y cierran en menos de 24 h
       reg_soon    todavía no disponibles
       reg_closed  plazo vencido, el torneo aún no empieza
       upcoming    el backend no pudo confirmar nada sobre la inscripción
                   (solo se dice «Próximo») */
  var STATUS = {
    live:       { label: "En vivo",                cssClass: "tournament-card__status--live",     cta: "Ver en Start.gg" },
    reg_open:   { label: "Inscripciones abiertas", cssClass: "tournament-card__status--soon",     cta: "Inscribirme en Start.gg" },
    closing:    { label: "Cierra pronto",          cssClass: "tournament-card__status--closing",  cta: "Inscribirme en Start.gg" },
    reg_soon:   { label: "Próximamente",           cssClass: "tournament-card__status--upcoming", cta: "Ver detalles en Start.gg" },
    reg_closed: { label: "Inscripciones cerradas", cssClass: "tournament-card__status--closed",   cta: "Ver detalles en Start.gg" },
    upcoming:   { label: "Próximo",                cssClass: "tournament-card__status--upcoming", cta: "Ver detalles en Start.gg" },
    finished:   { label: "Terminado",              cssClass: "tournament-card__status--done",     cta: "Ver en Start.gg" },
    cancelled:  { label: "Cancelado",              cssClass: "tournament-card__status--cancelled", cta: "Ver en Start.gg" }
  };

  var DEFAULT_CTA = "Ver en Start.gg";

  /* Clave de estado → grupo de render. `cancelled` no está: no se muestra. */
  var GROUP_OF = {
    live:       "live",
    reg_open:   "upcoming",
    closing:    "upcoming",
    reg_soon:   "upcoming",
    reg_closed: "upcoming",
    upcoming:   "upcoming",
    finished:   "finished"
  };

  /* Si un mismo torneo llegara en dos grupos, gana el de menor número
     (un torneo en vivo nunca debe aparecer también como próximo). */
  var GROUP_PRIORITY = { live: 0, upcoming: 1, finished: 2 };

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Solo se enlazan URLs http(s); cualquier otra cosa (javascript:, data:…) se descarta. */
  function safeUrl(value) {
    var url = typeof value === "string" ? value.trim() : "";
    if (!/^https?:\/\/\S+$/i.test(url)) return "";
    try {
      var parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
    } catch (error) {
      return "";
    }
  }

  /* Imagen: URL https o ruta del propio sitio ("/…", nunca "//host"). Si no es
     válida, la imagen por defecto: la tarjeta siempre tiene imagen. */
  function safeImage(value) {
    var src = typeof value === "string" ? value.trim() : "";
    if (/^\/(?!\/)[^\s\\]*$/.test(src)) return src;
    if (/^https:\/\/\S+$/i.test(src)) {
      try {
        return new URL(src).href;
      } catch (error) {
        return FALLBACK_IMAGE;
      }
    }
    return FALLBACK_IMAGE;
  }

  /* Si una imagen falla: primero la imagen por defecto; si esa también falla,
     se oculta (el recuadro de la tarjeta conserva su fondo) en vez de mostrar
     el ícono de imagen rota. */
  function onImageError() {
    if (this.getAttribute("data-fallback") !== "1" && this.getAttribute("src") !== FALLBACK_IMAGE) {
      this.setAttribute("data-fallback", "1");
      this.src = FALLBACK_IMAGE;
      return;
    }
    this.style.display = "none";
  }

  /* Construye una <article class="tournament-card">: imagen, nombre, estado y
     enlace a Start.gg. Nada más (sin fecha, sede, formato, resultados, etc.). */
  function buildCard(tournament) {
    var t = tournament || {};
    var name = escapeHtml(t.name || "");
    var image = escapeHtml(safeImage(t.image));
    var url = escapeHtml(safeUrl(t.url));
    var status = hasOwn(STATUS, t.status) ? STATUS[t.status] : null;
    var ext = url ? ' target="_blank" rel="noopener noreferrer"' : "";

    var badge = status
      ? '<span class="tournament-card__status ' + status.cssClass + '">' + escapeHtml(status.label) + '</span>'
      : "";

    var img = '<img src="' + image + '" alt="' + name + '" width="400" height="250" loading="lazy">';
    var media = url ? '<a href="' + url + '"' + ext + '>' + img + '</a>' : img;
    var title = url ? '<a href="' + url + '"' + ext + '>' + name + '</a>' : name;

    /* Sin enlace no hay nada a lo que invitar a entrar: el CTA deshabilitado
       conserva el texto genérico (no promete "Inscribirme"). */
    var ctaText = escapeHtml(status && status.cta ? status.cta : DEFAULT_CTA);
    var cta = url
      ? '<a href="' + url + '" class="tournament-card__cta"' + ext + '>' + ctaText + '</a>'
      : '<span class="tournament-card__cta tournament-card__cta--disabled">' + escapeHtml(DEFAULT_CTA) + '</span>';

    return (
      '<article class="tournament-card">' +
        '<div class="tournament-card__media">' + media + badge + '</div>' +
        '<div class="tournament-card__body">' +
          '<h3 class="tournament-card__title">' + title + '</h3>' +
          cta +
        '</div>' +
      '</article>'
    );
  }

  /* Rellena un contenedor y muestra/oculta su mensaje de "sin torneos".
     Devuelve true si hay al menos una tarjeta. */
  function fill(key, list) {
    var container = document.querySelector('[data-tournaments="' + key + '"]');
    var empty = document.querySelector('[data-tournaments-empty="' + key + '"]');
    if (!container) return false;

    var hasCards = list.length > 0;
    container.innerHTML = list.map(buildCard).join("");
    if (empty) empty.hidden = hasCards;

    var imgs = container.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener("error", onImageError);
    }
    return hasCards;
  }

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  /* ---- Estado global de la lista --------------------------------------- */

  var currentState = "ready";

  function setHidden(selector, hidden) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) nodes[i].hidden = hidden;
  }

  /* "loading" y "error" ocultan los mensajes de "sin torneos" (no tiene sentido
     decir que no hay torneos mientras se carga o si la carga falló) y los
     controles del carrusel. "ready" oculta ambos avisos y deja el mensaje de
     "sin torneos" solo en los contenedores que no tienen tarjetas. */
  function setState(state) {
    var ready = state !== "loading" && state !== "error";
    currentState = ready ? "ready" : state;

    setHidden('[data-tournaments-state="loading"]', state !== "loading");
    setHidden('[data-tournaments-state="error"]', state !== "error");

    var empties = document.querySelectorAll("[data-tournaments-empty]");
    for (var i = 0; i < empties.length; i++) {
      var key = empties[i].getAttribute("data-tournaments-empty");
      var container = document.querySelector('[data-tournaments="' + key + '"]');
      empties[i].hidden = !ready || !!(container && container.children.length);
    }

    if (!ready) setHidden("#torneos-preview .tournaments__controls", true);
  }

  function render(groups) {
    var g = groups || {};
    var live = asList(g.live);
    var upcoming = asList(g.upcoming);
    var finished = asList(g.finished).slice(0, FINISHED_LIMIT);

    fill("live", live);
    fill("upcoming", upcoming);
    fill("finished", finished);

    /* El Home nunca muestra terminados: solo en vivo y próximos. */
    var hasCarousel = fill("carousel", live.concat(upcoming));

    /* Después de rellenar (los mensajes "sin torneos" dependen de las tarjetas). */
    setState("ready");

    var controls = document.querySelector("#torneos-preview .tournaments__controls");
    if (controls) controls.hidden = !hasCarousel;

    /* carousel.js calcula anchos con getBoundingClientRect() y ya escucha
       "resize": se aprovecha tras reemplazar las tarjetas (sin tocar su lógica). */
    window.setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
    }, 0);
  }

  /* ---- Respuesta de /api/torneos → grupos ------------------------------- */

  /* Valida un elemento de la respuesta y devuelve { name, image, url, status },
     o null si no sirve (se descarta sin romper el resto). */
  function cleanTournament(raw) {
    if (!raw || typeof raw !== "object") return null;

    var status = raw.status;
    if (typeof status !== "string" || !hasOwn(STATUS, status)) return null;

    var name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return null;

    return { name: name, image: safeImage(raw.image), url: safeUrl(raw.url), status: status };
  }

  /* Agrupa por `status`; conserva el orden que ya entregó el backend. Un mismo
     torneo (misma URL; sin URL, mismo nombre) ocupa UNA sola tarjeta: si llegara
     repetido, se queda el de mayor prioridad (GROUP_PRIORITY) y, a igualdad, el
     primero. El backend ya descarta duplicados por id; esto es una red de
     seguridad para que una respuesta defectuosa no duplique tarjetas. */
  function tournamentKey(tournament) {
    return tournament.url || ("nombre:" + tournament.name.toLowerCase());
  }

  function groupTournaments(list) {
    var groups = { live: [], upcoming: [], finished: [] };
    var entries = [];
    var best = {}; /* clave del torneo → posición en `entries` de su mejor aparición */

    for (var i = 0; i < list.length; i++) {
      var tournament = cleanTournament(list[i]);
      if (!tournament) continue;

      var group = hasOwn(GROUP_OF, tournament.status) ? GROUP_OF[tournament.status] : null;
      if (!group) continue; /* cancelled: sin grupo → no se muestra */

      var key = tournamentKey(tournament);
      var position = entries.push({ group: group, tournament: tournament }) - 1;
      if (!hasOwn(best, key) || GROUP_PRIORITY[group] < GROUP_PRIORITY[entries[best[key]].group]) {
        best[key] = position;
      }
    }

    for (var j = 0; j < entries.length; j++) {
      if (best[tournamentKey(entries[j].tournament)] === j) {
        groups[entries[j].group].push(entries[j].tournament);
      }
    }
    return groups;
  }

  /* ---- Consulta --------------------------------------------------------- */

  /* GET /api/torneos → array. Rechaza si el HTTP no es 2xx, si el cuerpo no es
     JSON o si no es un array. El temporizador de tiempo máximo cubre también la
     lectura del cuerpo. */
  function request() {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = window.setTimeout(function () {
      if (controller) controller.abort();
    }, REQUEST_TIMEOUT_MS);

    var options = { headers: { Accept: "application/json" } };
    if (controller) options.signal = controller.signal;

    return fetch(API_URL, options)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("La respuesta no es un array");
        return data;
      })
      .then(
        function (data) { window.clearTimeout(timeoutId); return data; },
        function (error) { window.clearTimeout(timeoutId); throw error; }
      );
  }

  /* ---- Actualización automática ----------------------------------------- */

  var started = false;
  var inFlight = false;   /* hay una petición en curso: nunca dos a la vez */
  var timer = null;       /* el único temporizador */
  var dueAt = 0;          /* cuándo toca la próxima consulta (ms desde epoch) */
  var failures = 0;       /* fallos consecutivos (para el reintento escalonado) */
  var hasData = false;    /* ya se pintó al menos una respuesta válida */
  var lastSignature = ""; /* para no repintar si nada cambió */

  /* Arma (o rearma) el único temporizador. Con la pestaña oculta o con una
     petición en curso no se arma nada: se retoma al volver o al terminar. */
  function arm() {
    window.clearTimeout(timer);
    timer = null;
    if (inFlight || document.hidden) return;
    timer = window.setTimeout(load, Math.max(0, dueAt - Date.now()));
  }

  function schedule(delay) {
    dueAt = Date.now() + delay;
    arm();
  }

  function retryDelay() {
    return Math.min(POLL_INTERVAL_MS, RETRY_BASE_MS * Math.pow(2, Math.max(0, failures - 1)));
  }

  function apply(data) {
    var groups = groupTournaments(data);
    var signature = JSON.stringify(groups);

    /* Sin cambios y con la lista ya lista en pantalla: no se toca el DOM. */
    if (!hasData || signature !== lastSignature || currentState !== "ready") {
      render(groups);
      lastSignature = signature;
    }
    hasData = true;
  }

  function load() {
    window.clearTimeout(timer);
    timer = null;
    if (inFlight || document.hidden) return;
    inFlight = true;

    /* "Cargando…" solo aparece en la carga inicial (init). Los reintentos tras
       un error no lo vuelven a mostrar (no parpadea) y las actualizaciones
       posteriores son silenciosas. */
    request()
      .then(function (data) {
        failures = 0;
        apply(data);
      })
      .then(null, function (error) {
        failures += 1;
        if (hasData) {
          /* Fallo temporal: los torneos que ya se ven se conservan. */
          console.warn("[torneos] No se pudo actualizar; se mantienen los datos actuales.", error && error.message);
        } else {
          console.warn("[torneos] No se pudieron cargar los torneos.", error && error.message);
          setState("error");
        }
      })
      .then(function () {
        inFlight = false;
        schedule(failures ? retryDelay() : POLL_INTERVAL_MS);
      });
  }

  /* Al volver a la pestaña: si ya tocaba actualizar, se consulta enseguida; si
     no, se espera el tiempo que faltaba. Al ocultarla se cancela el temporizador. */
  document.addEventListener("visibilitychange", function () {
    if (!started) return;
    if (document.hidden) {
      window.clearTimeout(timer);
      timer = null;
    } else {
      arm();
    }
  });

  function init() {
    if (started || !document.querySelector("[data-tournaments]")) return;
    started = true;
    setState("loading");
    load();
  }

  /* El script va al final del <body>: normalmente el DOM ya está listo y se
     arranca de inmediato (sin parpadeo de "sin torneos"). */
  if (document.readyState === "loading" && !document.querySelector("[data-tournaments]")) {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* Actualización manual: respeta las mismas reglas (nunca dos a la vez). */
  function refresh() {
    if (!started) return;
    load();
  }

  window.KOATournaments = {
    API_URL: API_URL,
    STATUS: STATUS,
    render: render,
    setState: setState,
    refresh: refresh
  };
})();
