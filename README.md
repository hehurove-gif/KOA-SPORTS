# KOA-SPORTS

Sitio web de KOA: una plataforma enfocada en el desarrollo de comunidades a través de experiencias deportivas, eSports y Wellness, que empezó con Super Smash Bros. Ultimate.

El sitio es una **SPA (Single Page Application) sencilla**, sin frameworks: un único `index.html`, HTML + CSS + JavaScript vanilla, con navegación interna manejada por `js/router.js`.
---

## Dónde vive cada dato

| Qué | Dónde | Cómo se edita |
|---|---|---|
| **Jugadores** (roster) | `data/players.json` | Es el **único archivo JSON editable** del proyecto. Ver sección 1. |
| **Torneos** | Start.gg, a través de `/api/torneos` | Se actualizan solos al crear o cambiar un torneo en Start.gg; no hay ningún archivo local de torneos. Ver sección 2. |
| **Información institucional** (textos, historia, enfoques, etc.) | Directamente en `index.html` (y sus CSS/JS) | Se edita en el propio HTML. Los textos actuales vienen de `KOA_contenido_real_frontend.txt`; lo que no está en ese documento todavía no se muestra (ver «Pendiente»). |
| **Redes** (Instagram, WhatsApp, TikTok, Discord y, cuando exista, X) | Atributos `data-*` de `<section id="contacto">` en `index.html` | Única fuente para Contacto y Footer. Ver sección 3. |

No existe panel administrativo ni base de datos.

---

## 1. Jugadores — `data/players.json`

`data/players.json` es la **única fuente de verdad del roster**: en `index.html` no hay ninguna tarjeta de jugador escrita a mano. `js/players.js` lee el archivo y genera:

- **Home** (`[data-roster="featured"]`): solo los jugadores con `"featured": true` (hoy: solo `proximamente-01`). `featured` **solo** decide quién sale destacado en el Home.
- **Vista Jugadores** (`[data-roster="all"]`): **todos** los jugadores del archivo (hoy 5, los registros provisionales), incluidos los que no son destacados.
- **Ficha / modal** de cada jugador (`<dialog id="playerDialog">`).

Cada jugador es un bloque `{ }` dentro de una lista `[ ]`, separados por comas.

| Propiedad | Qué es | Ejemplo |
|---|---|---|
| `id` | Identificador único del jugador (si se repite, solo cuenta el primero). | `"player-07"` |
| `name` | Nombre real o público del jugador. | `"Nombre del jugador"` |
| `tag` | Gamertag / apodo competitivo (se ve sobre la foto). | `"Tag"` |
| `image` | Ruta de la foto, dentro de `assets/images/players/`. Obligatoria. | `"assets/images/players/player-01.jpg"` |
| `mainCharacter` | Personaje principal. | `"Personaje"` |
| `secondaryCharacter` | Personaje secundario. Si no tiene, `""`. | `"Personaje"` |
| `description` | Frase breve: región, rol dentro del equipo, etc. (se ve en la ficha y en la tarjeta de la vista Jugadores). | `"Texto breve"` |
| `socials.twitter` / `instagram` / `youtube` / `twitch` | URL completa `http(s)` de la red del jugador. `""` si no se conoce. | `"https://…"` |
| `featured` | `true` o `false`: si aparece en el roster del Home. | `true` |

**Agregar un jugador:** copia un bloque completo, pégalo antes del `]` final (con una coma después del bloque anterior), cambia el `id` por uno nuevo y rellena los campos. El archivo debe seguir siendo JSON válido. **Quitar uno:** borra su bloque.

**Colocar una imagen:** guarda el archivo en `assets/images/players/` y escribe en `image` la ruta completa desde la raíz del proyecto (sin `../` ni `/` al inicio).

**Datos que todavía no existen:** se dejan en `""`. Un campo vacío simplemente **no se pinta** (ni chip, ni nombre, ni tag, ni redes): nunca se rellena con texto de relleno. Una tarjeta que solo tiene foto se muestra como foto, sin botón «Ver ficha»; en cuanto el jugador tiene algún dato, la tarjeta lo muestra y recibe su ficha. En cuanto el jugador tiene algún dato, la tarjeta se ve completa: tag sobre la foto, nombre, chips de Main/Secondary, descripción (en la vista Jugadores) y redes.

**Registros provisionales (roster aún no publicado).** Mientras KOA no publique el roster oficial, `players.json` contiene cinco registros (`proximamente-01` … `proximamente-05`), todos con la imagen `assets/images/players/Proximamente.webp`, el nombre «Jugador por anunciar», el tag «Próximamente», «Por definir» en Main y Secondary, y una descripción que solo dice que el roster oficial se anunciará próximamente. Solo el primero tiene `"featured": true`: el Home muestra esa tarjeta y la vista Jugadores muestra las cinco. «Por definir» en Main/Secondary es solo el relleno visible de la tarjeta. No hay jugadores, criterios, fechas ni requisitos inventados. Se ven igual que cualquier otra tarjeta (Home, vista Jugadores y ficha). **Para publicar el roster real:** edita cada bloque `proximamente-0X` con los datos de un jugador real (`id`, `name`, `tag`, `image`, personajes, `description`, `socials` y `featured`), copia un bloque si hacen falta más y **borra los que sobren**; no hay que tocar HTML, CSS ni JS. Todos los `id` deben ser distintos: si se repite uno, solo cuenta el primero. Las 5 fotos anteriores (`player-01.jpg`, `player-02.jpg`, `player-03.jpg`, `player-05.png`, `player-06.png`) siguen en `assets/images/players/` pero ya no están en el JSON: no tenían ningún dato de KOA asociado y no se confirmó que sean jugadores del roster.

**No inventar datos:** nombres, gamertags, personajes, logros, estadísticas, ubicaciones y enlaces solo se rellenan con información oficial.

**Ficha interactiva:** cada tarjeta con información tiene un botón **Ver ficha** que abre un diálogo con la foto ampliada, tag, personajes, descripción y redes (solo muestra lo que existe). Se cierra con la X, con Esc o haciendo clic fuera.

**Estados:** si `players.json` está vacío, las secciones del roster permanecen ocultas; si el Home no tiene ningún `featured`, el Home no muestra el roster; si el archivo no se puede cargar, la vista Jugadores muestra un aviso y el Home no muestra el roster.

**Vista Jugadores (estructura):** `hero → introducción → cabecera del roster (etiqueta «Jugadores», título «Roster completo» y descripción) → grilla de jugadores → enfoque de crecimiento → CTA`. La cabecera es texto fijo del HTML; la grilla la genera `players.js` desde el JSON. La rejilla (Home y vista Jugadores usan el mismo CSS, `.roster-grid`) centra las tarjetas cuando la última fila queda incompleta o hay una sola. En la ficha, el botón «Ver roster completo» solo aparece cuando se abre desde el Home.

**Anclas del roster.** `#roster` es el roster **completo** (sección de la vista Jugadores): «Ver roster completo» (Home y ficha) y «Ver el roster» (CTA de Torneos) llevan a `#roster`; el router abre la vista Jugadores y deja la sección justo debajo de la barra. También funciona abriendo `index.html#roster` directamente (esa sección es visible desde el inicio justamente para que el ancla siempre tenga a dónde llegar). `#roster-destacado` es el roster destacado del Home (lo usa el botón «Ver el roster» del hero). `#jugadores` sigue abriendo la vista desde arriba.

---

## 2. Torneos — Start.gg

Los torneos salen **únicamente de Start.gg**, a través de la función serverless `api/torneos.js`. No hay `tournaments.json` ni ningún torneo escrito a mano: cuando se crea o cambia un torneo en Start.gg, el sitio lo refleja **sin editar el repositorio ni volver a desplegar**.

### Variables de entorno (obligatorias)

| Variable | Qué es |
|---|---|
| `STARTGG_TOKEN` | Token de desarrollador de Start.gg (Developer Settings de tu perfil). **Secreto**: solo existe en el servidor. Los tokens de Start.gg caducan (a 1 año); si un día dejan de aparecer torneos, genera uno nuevo y actualiza la variable. |
| `STARTGG_OWNER_ID` | ID **numérico** de la cuenta de Start.gg que **crea** los torneos de KOA. Se puede obtener con la consulta `query { currentUser { id } }` en el API Explorer de Start.gg, usando el token de esa cuenta. |

**La cuenta que determina los torneos es `STARTGG_OWNER_ID`** (filtro `ownerId` de Start.gg): solo aparecen los torneos *creados* por esa cuenta, no aquellos donde solo es administradora o participante. Los visitantes no pueden cambiarla: `/api/torneos` ignora por completo la query string (`?owner=`, `?user=`…).

Si falta alguna de las dos variables (o el ID no es numérico), `/api/torneos` responde `503` con un mensaje genérico y el detalle solo queda en el log del servidor. No existe ningún token ni cuenta por defecto.

### Configurarlas en Vercel

1. Vercel → tu proyecto → **Settings → Environment Variables**.
2. Agrega `STARTGG_TOKEN` y `STARTGG_OWNER_ID` (marca al menos **Production**).
3. **Vuelve a desplegar** una vez (Deployments → ⋯ → Redeploy): Vercel solo aplica las variables nuevas a los despliegues nuevos.

Nunca escribas el token en `index.html`, en `js/`, en `data/` ni en ningún archivo del repositorio, y no subas archivos `.env*` a Git.

### Cómo funciona

- `js/tournaments.js` consulta **`/api/torneos`** (solo esa URL), valida la respuesta, agrupa los torneos por estado y pinta las tarjetas. Se actualiza solo cada **5 minutos** mientras la pestaña está abierta y visible (no consulta con la pestaña oculta; al volver, actualiza si ya tocaba). Si una actualización falla, las tarjetas que ya se ven se conservan.
- `api/torneos.js` consulta `https://api.start.gg/gql/alpha` (todos los torneos publicados de la cuenta, en páginas de 50 y con un tope de seguridad; sin participantes, eventos ni brackets; ver «Estrategia de recuperación y límites») y entrega un arreglo ya ordenado `[ { name, image, url, status } ]`. **No filtra por videojuego**: aparecen los torneos de cualquier juego creados por la cuenta.
- Organización visual de la vista Torneos: **tres** secciones, cada torneo en una sola (`En vivo` · `Próximos torneos` · `Finalizados recientes`). `Próximos torneos` reúne **todos** los torneos que aún no empiezan, tengan la inscripción abierta, sin abrir o cerrada; lo que cambia entre ellos es la etiqueta de la tarjeta. El carrusel del Home muestra *En vivo* + *Próximos torneos* (nunca finalizados).
- Estado de cada torneo (`status`), calculado en el servidor con datos reales de Start.gg. **Primero** se decide la fase del torneo solo con sus fechas (en curso / terminado / futuro) y **solo si es futuro** se mira la inscripción: el estado de la inscripción nunca decide si un torneo está en vivo o finalizado.

| `status` | Cuándo | Etiqueta | Sección |
|---|---|---|---|
| `live` | `startAt` ≤ ahora < `endAt`. | En vivo | En vivo |
| `finished` | ahora ≥ `endAt`. | Terminado | Finalizados recientes (hasta 3, los más recientes) |
| `closing` | Aún no empieza; `isRegistrationOpen` = `true` y `registrationClosesAt` a menos de 24 h. | Cierra pronto | Próximos torneos |
| `reg_open` | Aún no empieza; `isRegistrationOpen` = `true` (y su plazo, si lo hay, no ha vencido). | Inscripciones abiertas | Próximos torneos |
| `reg_soon` | Aún no empieza; `isRegistrationOpen` = `false` y el plazo no ha vencido (o no hay plazo). | Próximamente | Próximos torneos |
| `reg_closed` | Aún no empieza y `registrationClosesAt` ya pasó. | Inscripciones cerradas | Próximos torneos |
| `upcoming` | Aún no empieza y `isRegistrationOpen` falta o no es booleano: no se afirma nada de la inscripción. | Próximo | Próximos torneos |

  Dentro de *Próximos torneos* el orden es por **fecha de inicio** (el más cercano primero), no por el estado de la inscripción. Un torneo futuro **no** se considera "con inscripciones abiertas" por el solo hecho de ser futuro: depende de lo que Start.gg informe. «Cierra pronto» solo se muestra con una fecha de cierre real. Las tarjetas de torneos con la inscripción abierta o por cerrar invitan con «Inscribirme en Start.gg»; el resto dice «Ver detalles en Start.gg» (o «Ver en Start.gg»). Start.gg no expone ningún campo de cancelación, por lo que no se muestra ningún estado *Cancelado* (ver «Limitaciones que siguen existiendo»).
  **Limitación de «Próximamente»:** Start.gg no expone la fecha de **apertura** de inscripciones (solo `registrationClosesAt`), así que `reg_soon` significa «la inscripción no está abierta ahora y su plazo no ha vencido»; no puede distinguir «todavía no abre» de «el organizador la cerró antes de su plazo». Un plazo vencido sí se confirma con la fecha, aunque `isRegistrationOpen` esté desactualizado. Para cambiar el criterio, el único lugar es `calcularEstado()` en `api/torneos.js`.
- Imagen: la del torneo en Start.gg; si no tiene (o falla al cargar), `assets/images/tournaments/tournament-01.png` (la usan `api/torneos.js` y `js/tournaments.js`: **no borrar**). `tournament-02.png`, `tournament-03.png` y `tournament-04.png` ya no las usa ningún archivo del sitio (solo las referenciaba la página antigua `pages/torneos.html`, ya eliminada; ver «`pages/` eliminada»). El enlace de la tarjeta lleva a la página del torneo en Start.gg y se abre en una pestaña nueva.

### Caché

`/api/torneos` responde con `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`: el Edge de Vercel sirve la respuesta durante 5 minutos (y hasta 10 más mientras se renueva en segundo plano), así que los visitantes no provocan una consulta nueva a Start.gg en cada visita. Además, la instancia de la función reutiliza durante 60 s la última respuesta válida y, si Start.gg falla, sirve la última buena hasta 1 hora. Un torneo nuevo aparece normalmente en pocos minutos (en el peor caso, unos 20). No hay base de datos ni almacenamiento persistente. Los errores nunca se cachean.

### Estrategia de recuperación y límites

**Qué fallaba.** La consulta anterior leía **una sola página de 25 torneos** ordenada por `startAt desc`. Con más de 25 torneos, o con muchos torneos futuros, los más antiguos quedaban fuera; y un torneo **en vivo** (empezó antes que los futuros) o un finalizado reciente de larga duración podían no aparecer.

**Qué hace ahora** (`api/torneos.js`):

1. Pide la página 1 con `perPage: 50` y lee `pageInfo.totalPages`.
2. Pide las páginas 2…`totalPages` **en paralelo**, hasta un tope de **`MAX_PAGES` = 6** (300 torneos). Si `pageInfo` no es utilizable, sigue de forma secuencial mientras la página venga llena (mismo tope).
3. Con **todos** los torneos juntos descarta duplicados (por `id`) e inválidos, calcula el estado de cada uno y conserva **todos** los en vivo y próximos y **solo los 3 finalizados más recientes por fecha de fin**, calculados sobre el conjunto completo y no sobre una página.
4. Si **cualquier** página falla, falla toda la recuperación: nunca se publica ni se guarda en memoria un resultado parcial (con datos de respaldo recientes se sirven esos, ver «Caché»).

Una cuenta típica (≤ 50 torneos publicados) cuesta **una sola llamada** a Start.gg. Mientras la cuenta tenga ≤ 300 torneos publicados, el resultado **no depende del orden** de Start.gg. Si tuviera más, se leen los 300 primeros según su orden y se registra una advertencia en el log (ver limitaciones).

**Por qué no se usan más filtros.** `TournamentPageFilter` ofrece `upcoming`, `past`, `regOpen`, `afterDate`, `beforeDate`…, pero la referencia oficial **no describe su significado**. Un filtro mal interpretado volvería a omitir torneos en silencio, justo el fallo que se corrige, así que solo se usan `ownerId` (documentado) y `published` (ver «Visibilidad»).

**Límites aplicados**

| Límite | Valor | Origen |
|---|---|---|
| Peticiones a Start.gg | promedio ≤ 80 por 60 s | Start.gg (documentado) |
| Objetos por petición | ≤ 1000 (los anidados cuentan) | Start.gg (documentado). 50 torneos × (1 + imágenes) queda muy por debajo |
| `perPage` | ≤ 512 | Start.gg (documentado). Se usa 50 |
| Páginas por recuperación | `MAX_PAGES` = 6 (300 torneos, como mucho 6 peticiones) | propio |
| Plazo total de una recuperación | 8 s (todas las llamadas juntas, con `AbortController`) | propio, bajo el máximo de 10 s de una función en Vercel Hobby |
| Finalizados publicados | 3 | propio (igual que `js/tournaments.js`; una prueba lo comprueba) |
| Memoria de la instancia | 60 s; respaldo ante fallos hasta 1 h | propio (sin cambios respecto a antes) |
| Caché del Edge | `s-maxage=300, stale-while-revalidate=600` | propio (sin cambios respecto a antes) |

La frecuencia de consulta **no aumenta**: la caché del Edge y la memoria de la instancia se conservan tal cual, y la mayoría de recuperaciones siguen siendo una sola llamada.

### Qué se verificó de Start.gg

Contrastado el **2026-10-10** con la documentación oficial (`developer.start.gg`, y su referencia del esquema, a la que redirige: `smashgg-schema.netlify.app/reference/…`). Solo se comprobó que los campos **existen** y qué dice la referencia; **no se ejecutó ninguna consulta real** (no hay credenciales en este entorno).

| Tema | Lo que dice la documentación |
|---|---|
| Endpoint y autenticación | `https://api.start.gg/gql/alpha`; se recomienda `POST`; cabecera `Authorization: Bearer <token>`; los tokens caducan al año. |
| Límites | Promedio de 80 peticiones por 60 s y 1000 objetos por petición (anidados incluidos). Un rechazo por límite tiene la forma `{ "success": false, "message": "Rate limit exceeded - api-token" }`; no se documenta el código HTTP. |
| `tournaments(query: TournamentQuery!)` | «Paginated, filterable list of tournaments»; devuelve `TournamentConnection { pageInfo, nodes }`. |
| `TournamentQuery` | `page`, `perPage` («Maximum value of 512»), `sortBy` (String), `filter` (`TournamentPageFilter`) y `sort` (`TournamentPaginationSort`: `startAt`, `endAt`, `eventRegistrationClosesAt`, `computedUpdatedAt`). **No documenta** valores ni sintaxis de `sortBy` ni la dirección de `sort`. |
| `TournamentPageFilter.ownerId` | «ID of the user that owns this tournament». Es lo que limita la consulta a los torneos **creados** por la cuenta. |
| `published`, `publiclySearchable`, `upcoming`, `past`, `regOpen`, `afterDate`, `beforeDate`, `videogameIds`… | Existen (Boolean / Timestamp / lista de ID) pero **sin descripción**. |
| `PageInfo` | `total`, `totalPages`, `page`, `perPage`, `sortBy`, `filter`, sin descripciones. |
| `Tournament` (campos usados) | `id`, `name`, `slug`, `url(relative)` (por defecto `true`; se pide `false`), `startAt`, `endAt`, `isRegistrationOpen`, `registrationClosesAt`, `images { type url width }`. |
| Inscripción (`Tournament`) | `isRegistrationOpen` (Boolean): «Is tournament registration open»; `registrationClosesAt` (Timestamp): «When does registration for the tournament end». Revisado también el 2026-10-12: **no existe ningún campo de fecha de apertura de inscripciones** (solo `eventRegistrationClosesAt` y `teamCreationClosesAt`, que no se usan). De ahí la limitación de «Próximamente». |
| `Tournament.state` | Int: «can be ActivityState::CREATED, ACTIVE, or COMPLETED». **No documenta qué entero es cada valor**, por eso no se usa. |
| `Tournament.publishing` | JSON: «Publishing settings for this tournament», sin estructura documentada. |
| Cancelación | **No existe ningún campo.** `ActivityState` solo tiene CREATED, ACTIVE, COMPLETED, READY, INVALID, CALLED y QUEUED. |

**Lo que sigue sin comprobarse con datos reales:** que la sintaxis `sortBy: "startAt desc"` (heredada de la consulta anterior del sitio) y el filtro `published: true` se comporten como se espera. La corrección de los torneos no depende de `sortBy` mientras la cuenta tenga ≤ 300 torneos publicados. Para el resto, ver `scripts/diagnostico-startgg.js` más abajo.

### Visibilidad y cancelaciones (limitaciones que siguen existiendo)

- **Publicados:** la consulta incluye `published: true`, un campo real del filtro. La referencia no explica su semántica; se asume que excluye lo que Start.gg tiene como no publicado (borradores). Las pruebas automáticas solo demuestran que la petición lo incluye, **no** lo que Start.gg hace con él.
- **Torneos «privados» o «solo con enlace»:** no hay ningún campo documentado que los distinga, así que **no se garantiza** que se excluyan. `publiclySearchable` existe pero **no se usa**: no está documentado y podría ocultar torneos legítimos.
- **Cancelados:** Start.gg no expone ningún campo de cancelación, así que el sitio **no puede** detectarlos ni emite el estado `cancelled`. Un torneo cancelado en Start.gg seguirá mostrándose según sus fechas hasta que se despublique o se retire allí. Cerrar la inscripción **no** se interpreta como cancelación, y **no** se usa ninguna heurística basada en el título.
- **Estados por fechas programadas:** `live` y `finished` salen de `startAt`/`endAt` (las fechas que programó la organización). Un torneo que se alarga más allá de su `endAt` figurará como finalizado; uno terminado antes de tiempo figurará como en vivo hasta su `endAt`. `Tournament.state` podría afinar esto, pero su mapeo no está documentado (el script de diagnóstico permite compararlo con datos reales).
- **Cuentas con más de 300 torneos publicados:** se leen los 300 primeros según el orden de Start.gg (`startAt desc`, sintaxis no documentada) y se registra una advertencia en el log; podrían quedar fuera torneos antiguos. Suponiendo que `startAt desc` funcione como se espera, un torneo en vivo o finalizado reciente quedaría fuera solo si hay más de 300 torneos con inicio posterior al suyo.
- **Datos que cambian mientras se leen las páginas:** al leer varias páginas en paralelo, un torneo creado o borrado justo en ese instante podría desplazar uno entre páginas (se descartan duplicados, pero un torneo podría faltar en esa recuperación). Se corrige en la siguiente recuperación (unos minutos, según la caché) y se registra una advertencia si el total cambia.
- **Inscripciones «Próximamente»:** ver la limitación descrita en «Cómo funciona» (Start.gg no expone la fecha de apertura).
- **Torneos descartados:** se omiten (con el motivo en el log, sin datos sensibles) los que no tienen id, nombre, enlace válido o fecha de inicio válida, y los que ya empezaron sin una fecha de fin válida (no se inventa una duración).

### Pruebas

```bash
node --test test/torneos.test.js      # Node.js ≥ 20, sin dependencias, sin credenciales ni red
```

`test/torneos.test.js` tiene **76 pruebas**, todas **SIMULADAS**: sustituyen `fetch` por un Start.gg de mentira que solo implementa filtrar por cuenta, `published: true`, ordenar por `startAt desc`, paginar y devolver `pageInfo`. Demuestran cómo se comporta **nuestro código** frente a esas respuestas; **no demuestran cómo se comporta Start.gg**. Cubren: en vivo y próximos repartidos entre páginas; más de 25 torneos y muchos futuros; los 3 finalizados más recientes sobre el conjunto completo; identificadores duplicados; fechas, imágenes y URLs inválidas; errores HTTP, de red, de plazo y GraphQL; configuración incompleta; respuestas sin torneos; visibilidad y cancelación (solo lo demostrable); límites de paginación; memoria y datos de respaldo; el contrato `{ name, image, url, status }` (incluidos tests de extremo a extremo que ejecutan el `js/tournaments.js` real con la salida del backend: las tres secciones, las etiquetas de inscripción, ausencia de duplicados, datos incompletos y respuesta vacía); los estados de inscripción de un torneo futuro y que la inscripción nunca decide si un torneo está en vivo o finalizado; que el token no aparece en ningún log ni archivo público; y el script de diagnóstico. Una prueba verifica que la consulta solo usa nombres de campos copiados de la referencia oficial.

Para comprobar que las pruebas detectan el fallo original: con `PER_PAGE = 25` y `MAX_PAGES = 1` (el comportamiento anterior) fallan 10 de ellas.

### Diagnóstico con datos reales (opcional)

Lo que ninguna prueba simulada puede demostrar se comprueba con una cuenta real:

```bash
STARTGG_TOKEN=<tu token> STARTGG_OWNER_ID=<ID numérico> node scripts/diagnostico-startgg.js
```

Es de solo lectura y hace como máximo 12 peticiones. Muestra cuántos torneos devuelve la consulta con y sin `published: true` (y cuáles excluye), el valor de `state` de cada torneo frente al estado que calcula el sitio, y qué entregaría `/api/torneos`. No imprime el token, pero sí datos de tu cuenta (incluidos torneos no publicados). `scripts/` y `test/` están en `.vercelignore`, así que no se publican en Vercel.

### Probar localmente

`python3 -m http.server` **no** ejecuta `api/torneos.js` (la sección de torneos mostraría el aviso de error). Para probar la conexión real hace falta la CLI de Vercel y las dos variables, por ejemplo en un archivo `.env.local` en la raíz del proyecto (no se sube a Git):

```bash
STARTGG_TOKEN=<tu token de Start.gg>
STARTGG_OWNER_ID=<ID numérico de la cuenta>
```

```bash
npm i -g vercel
vercel dev                        # y abrir http://localhost:3000
curl http://localhost:3000/api/torneos   # debe devolver un arreglo JSON
```

---

## 3. Contacto y redes — configuración en el HTML

La sección **Contacto** (`#contacto`, accesible desde cualquier vista con el botón «Contacto» de la barra) es comunicación directa: una tarjeta por canal — **Instagram, WhatsApp (comunidad), TikTok y Discord** —. No hay formulario, ni correo, ni backend. Los mismos canales aparecen en la columna «Síguenos» del footer.

**Las URLs viven en un solo lugar**: los atributos de una sola etiqueta en `index.html`. No se repiten en ningún otro punto del HTML, CSS ni JS.

```html
<section class="contact" id="contacto" ...
         data-instagram="https://www.instagram.com/koa.esports_mx/"
         data-whatsapp="https://chat.whatsapp.com/…"
         data-tiktok="https://www.tiktok.com/@koa_esports?…"
         data-discord="https://discord.gg/…"
         data-x="">
```

| Atributo | Qué hace |
|---|---|
| `data-instagram`, `data-whatsapp`, `data-tiktok`, `data-discord`, `data-x` | URL completa del perfil, chat o invitación. Con una URL `http(s)` válida, la tarjeta del canal y su fila del footer se convierten en enlaces normales (`target="_blank" rel="noopener noreferrer"`). Si el atributo está vacío o no es una URL válida, **el canal se oculta** en Contacto y en el footer: no hay enlace falso ni etiqueta «próximamente». |

`js/contact.js` solo aplica esas URLs a los elementos con `data-social="instagram | whatsapp | tiktok | discord | x"` y oculta el `<li>` de los canales sin URL.

**X / Twitter:** todavía no tiene enlace confirmado, así que `data-x` está vacío y el canal permanece oculto. Cuando exista la cuenta, basta con escribir su URL completa en `data-x` y el canal aparece solo (la estructura ya está en el HTML).

**Iconos.** Cada canal usa su logo de `assets/images/logo/` con el mismo recuadro y tamaño en Contacto y en el footer: `instagram-logo.png`, `whatsapp-logo.png`, `x-logo.png`, `Tiktok-logo.webp` y `Discord-logo.webp`. **Los nombres de TikTok y Discord llevan mayúscula inicial y extensión `.webp`**: Vercel distingue mayúsculas de minúsculas, así que si se renombran hay que cambiar también las 4 etiquetas `<img>` de `index.html`. `Tiktok-logo.webp` no es cuadrado (500×692) e incluye el texto «Tik Tok» bajo el ícono; no se modificó el archivo: la clase `social-logo--tiktok` (en `css/style.css`) recorta solo la vista para mostrar el ícono, sin estirarlo. Si algún día se sustituye por un logo cuadrado, basta con quitar esa clase de las dos etiquetas `<img>` de TikTok. Si un archivo no existe, solo se oculta el recuadro de ese icono (sin imagen rota ni icono genérico); el nombre y el enlace siguen funcionando.

---

## Otros detalles

**Texto de Historia (Home y vista Historial).** Se reescribió el tono: ya no abre con depresión/suicidio sino con la falta de espacios de convivencia y el gaming como punto de encuentro (problema → respuesta → filosofía de KOA), conservando «La Unión y la Mejora Continua», «Juega. Compite. Pertenece.», «KOA es TU casa» y «la pantalla no los aísla, los une». No hay cifras ni afirmaciones clínicas. Es redacción nueva a partir de la idea indicada, no un texto del documento original: conviene que KOA la revise y apruebe.

**Logos de redes.** `instagram-logo.png`, `whatsapp-logo.png` y `x-logo.png` se recibieron con un fondo de cuadros (transparencia "falsa") incrustado en la imagen. Se reemplazaron en la misma ruta por PNG con transparencia real; los originales quedan respaldados en `assets/images/logo/_originals/`.

**Imágenes.** `og:image` apunta a `assets/images/logo/koa-logo.png` con ruta relativa; para que las vistas previas de WhatsApp, Instagram o X la lean, hay que cambiarla por la URL absoluta cuando se conozca el dominio de producción. Varias imágenes tienen extensión `.png` o `.jpg` pero son WebP o JPEG por dentro (se ven bien en todos los navegadores).

**`pages/` eliminada.** La carpeta `pages/` era un respaldo de la versión anterior (una página HTML por sección) con texto de plantilla entre corchetes, enlaces `href="#"` y tarjetas de jugadores y torneos escritas a mano. Se eliminó porque nada la usaba: ni `index.html`, ni el router, ni los scripts, ni los CSS, ni `sitemap.xml`/`robots.txt` (vacíos), y el proyecto no tiene configuración de despliegue que la mencione. Quedan sin uso, y **no se borraron**, los estilos `tournament-spotlight`, `tournament-results` y `tournament-card__meta` de `css/torneos.css`, las imágenes `tournament-02/03/04.png` (≈1,8 MB) y las fotos `player-01/02/03/05/06` de `assets/images/players/`; se pueden revisar en la limpieza de CSS/assets.

**Vista previa local.** Para que `fetch()` pueda leer `data/players.json` hay que abrir el sitio con un servidor local (no con doble clic en `index.html`):

```bash
python3 -m http.server 8000   # y abrir http://localhost:8000
```

`api/torneos.js` es una función serverless de Vercel: con ese servidor simple `/api/torneos` no existe y la sección de torneos mostrará el aviso de error. Para probar los torneos hace falta `vercel dev` con las variables de entorno (ver sección 2).

---

## Pendiente (todavía no existe la información o el material)

- **Enlace de X / Twitter** (se abrirá la cuenta): escribirlo en `data-x`.
- **Roster oficial y proceso de selección**: hoy `data/players.json` solo trae cinco registros provisionales «Próximamente». Faltan los jugadores reales (nombre, tag, personajes, descripción, redes y foto) y la información del proceso de selección; ver «Registros provisionales».
- **Imagen del slot provisional**: `Proximamente.webp` es una imagen de stock con marca de agua visible de Dreamstime; conviene sustituirla por una imagen propia o con licencia antes de publicar (basta con reemplazar el archivo o cambiar `image` en el JSON).
- **Historial**: línea de tiempo (años y hitos), logros y resultados, y pie de foto de las imágenes — no hay datos en el contenido aprobado, así que esos bloques no se muestran.
- **Cifras del Home** (jugadores, torneos, victorias, comunidad) y **ubicación / sede** (venue, dirección, enlace de mapa): sin datos, bloques retirados. La imagen `assets/images/backgrounds/location.png` queda sin usar.
- **Estructura interna de la organización** (áreas y responsables): sin datos, bloque retirado.
- **Aviso de privacidad, términos y ciudad/país** del footer: no se proporcionaron; no se inventan textos legales.
- **Dominio de producción**: para `og:image` absoluta y un `sitemap.xml` válido (hoy `robots.txt` y `sitemap.xml` están vacíos).
- Soporte táctil (swipe) del carrusel de torneos.
- **Comprobación con Start.gg real** (ninguna prueba automática la sustituye): tras desplegar, abrir `/api/torneos`, comparar el resultado con los torneos de la cuenta en Start.gg y ejecutar `scripts/diagnostico-startgg.js` (ver «Diagnóstico con datos reales»). Confirma en particular el efecto de `published: true`, la sintaxis `sortBy: "startAt desc"` y el mapeo de `Tournament.state`.
- **Despliegue en Vercel de esta versión del backend:** (1) subir el proyecto completo (incluye `.vercelignore`); (2) comprobar que `STARTGG_TOKEN` y `STARTGG_OWNER_ID` siguen definidas en Production (el código no cambió de nombres) y, si se cambiaron, redesplegar; (3) revisar los logs de la función `/api/torneos` los primeros días (advertencias de descartes, de tope de 300 torneos o de total cambiante); (4) si se sustituye la caché o el tope `MAX_PAGES`, hacerlo en `api/torneos.js` y ajustar este README.
