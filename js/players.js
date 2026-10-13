/* ==========================================================================
   KOA — ROSTER DINÁMICO
   data/players.json es la ÚNICA fuente de verdad del roster. Este archivo lo lee
   y genera las tarjetas en los dos lugares donde aparecen jugadores (en
   index.html no hay tarjetas escritas a mano):

     [data-roster="featured"]  Home → solo los jugadores con "featured": true.
     [data-roster="all"]       Vista Jugadores → TODOS los jugadores del JSON.

   "featured" solo decide quién sale destacado en el Home; no oculta a nadie de la
   vista completa.

   Datos que todavía no existen: un campo vacío ("") simplemente no se pinta
   (nunca se rellena con texto inventado). Una tarjeta sin ningún dato aparte de
   la foto se muestra solo como foto, sin botón "Ver ficha".

   Ficha interactiva: cada tarjeta con información recibe un botón "Ver ficha" y,
   al activarla (clic o teclado), abre un <dialog> modal con la foto ampliada,
   tag, personajes, descripción y redes del jugador. Los datos se leen de la
   propia tarjeta.

   Slot provisional: mientras el roster oficial no se publica, players.json trae
   un único registro provisional que usa la misma tarjeta que cualquier jugador.
   Al publicar el roster real basta con editar el JSON y borrar ese registro; no
   hay que tocar HTML, CSS ni JS.

   Estados: la sección de Home (#roster-destacado) permanece oculta (hidden) hasta
   que hay jugadores destacados que mostrar. La de la vista Jugadores (#roster, el
   ancla de "Ver roster completo") es visible desde el inicio para que el router
   siempre pueda llegar a ella; este script solo la oculta si el JSON está vacío.
   Si falla la carga, la vista Jugadores muestra un aviso y el Home no muestra el
   roster.
   ========================================================================== */

(function () {
  "use strict";

  var DATA_URL = "data/players.json";

  var SOCIAL_ICONS = {
    twitter:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4 20-7z"></path></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="6" width="18" height="14" rx="2"></rect><circle cx="12" cy="13" r="4"></circle>' +
      '<path d="M8 6l1.5-2h5L16 6"></path></svg>',
    twitch:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="18" height="14" rx="1"></rect><path d="M8 21h8M12 17v4"></path></svg>',
    youtube:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="2.5" y="5" width="19" height="14" rx="4"></rect><path d="m10.5 9.5 5 2.5-5 2.5z"></path></svg>'
  };

  var SOCIAL_LABELS = {
    twitter: "Twitter / X",
    instagram: "Instagram",
    twitch: "Twitch",
    youtube: "YouTube"
  };

  var FALLBACK_ALT = "Jugador del roster de KOA";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isHttpUrl(value) {
    return /^https?:\/\/[^\s]+$/i.test(value);
  }

  function buildSocialLinks(socials) {
    if (!socials || typeof socials !== "object") return "";

    var links = ["twitter", "instagram", "youtube", "twitch"].map(function (key) {
      var url = clean(socials[key]);
      if (!isHttpUrl(url)) return "";
      return (
        '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' +
        escapeHtml(SOCIAL_LABELS[key]) + '">' + SOCIAL_ICONS[key] + '</a>'
      );
    }).join("");

    /* Sin ninguna red cargada se omite todo el bloque (no hay franja vacía). */
    if (!links) return "";
    return '<div class="player-card__social">' + links + '</div>';
  }

  /* Tarjeta de jugador. Cada parte solo se pinta si el JSON trae el dato.
     options.showDescription: en la vista completa la descripción también se ve
     dentro de la tarjeta; en el Home solo aparece en la ficha. */
  function buildCard(player, options) {
    var name = clean(player.name);
    var tag = clean(player.tag);
    var main = clean(player.mainCharacter);
    var secondary = clean(player.secondaryCharacter);
    var description = clean(player.description);
    var image = escapeHtml(clean(player.image));
    var social = buildSocialLinks(player.socials);

    var chips = "";
    if (main) {
      chips += '<span class="player-card__main-chip">Main: <strong>' + escapeHtml(main) + '</strong></span>';
    }
    if (secondary) {
      chips += '<span class="player-card__main-chip">Secondary: <strong>' + escapeHtml(secondary) + '</strong></span>';
    }

    var showDescription = options && options.showDescription && description;

    var bodyInner =
      (name ? '<h3 class="player-card__name">' + escapeHtml(name) + '</h3>' : "") +
      (chips ? '<div class="player-card__mains">' + chips + '</div>' : "") +
      (showDescription ? '<p class="player-card__extra">' + escapeHtml(description) + '</p>' : "") +
      social;

    /* Sin ningún dato aparte de la foto no hay ficha que abrir. */
    var hasInfo = !!(name || tag || chips || description || social);

    return (
      '<article class="player-card' + (hasInfo ? "" : " player-card--static") + '"' +
        (description ? ' data-description="' + escapeHtml(description) + '"' : "") + '>' +
        '<div class="player-card__media">' +
          '<img src="' + image + '" alt="' + escapeHtml(name || tag || FALLBACK_ALT) + '" width="400" height="500" loading="lazy">' +
          (tag ? '<span class="player-card__tag">' + escapeHtml(tag) + '</span>' : "") +
        '</div>' +
        (hasInfo ? '<div class="player-card__body">' + bodyInner + '</div>' : "") +
      '</article>'
    );
  }

  /* ---- Ficha interactiva ------------------------------------------------ */

  var ICON_ARROW =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';

  /* Añade el botón "Ver ficha" a cada tarjeta con información. El botón se
     estira sobre toda la tarjeta (ver jugadores.css), así que la tarjeta entera
     es clicable y, a la vez, accesible por teclado. */
  function enhanceCards(root) {
    var cards = root.querySelectorAll(".player-card:not(.player-card--static)");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.querySelector(".player-card__more")) continue;
      var body = card.querySelector(".player-card__body");
      if (!body) continue;
      var label = textOf(card.querySelector(".player-card__name")) ||
                  textOf(card.querySelector(".player-card__tag"));
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-card__more";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.innerHTML = 'Ver ficha' +
        (label ? '<span class="visually-hidden"> de ' + escapeHtml(label) + '</span>' : "") +
        ICON_ARROW;
      body.appendChild(btn);
    }
  }

  var dialog = document.getElementById("playerDialog");

  function textOf(node) {
    return node ? node.textContent.trim() : "";
  }

  function openFicha(card) {
    if (!dialog || typeof dialog.showModal !== "function") return;

    var img = card.querySelector(".player-card__media img");
    var name = textOf(card.querySelector(".player-card__name"));
    var tag = textOf(card.querySelector(".player-card__tag"));
    var desc = card.getAttribute("data-description") || "";
    var mains = card.querySelector(".player-card__mains");
    var social = card.querySelector(".player-card__social");

    var dImg = dialog.querySelector("#playerDialogImg");
    dImg.src = img ? img.getAttribute("src") : "";
    dImg.alt = name || tag || FALLBACK_ALT;
    dialog.setAttribute("aria-label", name || tag || "Ficha del jugador");

    var tagEl = dialog.querySelector("#playerDialogTag");
    tagEl.textContent = tag;
    tagEl.hidden = !tag;

    var nameEl = dialog.querySelector("#playerDialogName");
    nameEl.textContent = name;
    nameEl.hidden = !name;

    /* Los fragmentos vienen de nuestro propio DOM (ya escapado al generarse). */
    var mainsEl = dialog.querySelector("#playerDialogMains");
    mainsEl.innerHTML = mains ? mains.innerHTML : "";
    mainsEl.hidden = !mains;

    var descEl = dialog.querySelector("#playerDialogDesc");
    descEl.textContent = desc;
    descEl.hidden = !desc;

    var socialEl = dialog.querySelector("#playerDialogSocial");
    socialEl.innerHTML = social ? social.innerHTML : "";
    socialEl.hidden = !social;

    /* "Ver roster completo" solo tiene sentido si la ficha se abrió desde el Home. */
    var moreEl = dialog.querySelector(".player-dialog__more");
    if (moreEl) moreEl.hidden = !!card.closest("[data-roster='all']");

    dialog.showModal();
  }

  if (dialog) {
    dialog.addEventListener("click", function (event) {
      /* Clic en el fondo oscuro (fuera del panel) o en un control de cierre. */
      if (event.target === dialog || event.target.closest("[data-dialog-close]")) {
        dialog.close();
      }
    });
  }

  document.addEventListener("click", function (event) {
    var card = event.target.closest(".player-card");
    if (!card) return;
    if (event.target.closest("a")) return;          /* los enlaces sociales siguen siendo enlaces */
    if (dialog && dialog.contains(card)) return;
    if (!card.querySelector(".player-card__more")) return;   /* tarjeta solo-foto: sin ficha */
    openFicha(card);
  });

  /* ---- Carga desde data/players.json ------------------------------------ */

  /* Pinta los jugadores en un contenedor y muestra su sección; sin jugadores,
     la sección se queda oculta. */
  function render(grid, players, options) {
    if (!grid) return;
    var section = grid.closest("section");

    if (!players.length) {
      if (section) section.hidden = true;
      return;
    }

    grid.innerHTML = players.map(function (player) {
      return buildCard(player, options);
    }).join("");
    enhanceCards(grid);

    /* Si una foto no existe, se oculta en vez de mostrar el ícono de imagen rota. */
    var imgs = grid.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener("error", function () {
        this.style.display = "none";
      });
    }

    if (section) {
      section.hidden = false;

      /* Si la URL apunta a esta misma sección (index.html#roster-destacado), el
         router no pudo llegar a ella porque seguía oculta: ahora que existe se
         lleva el scroll hasta aquí, solo si la persona todavía no se movió. */
      if (section.id && window.location.hash === "#" + section.id && window.scrollY === 0) {
        section.scrollIntoView({ behavior: "instant", block: "start" });
      }
    }
  }

  function showLoadError() {
    var state = document.querySelector("[data-roster-state='error']");
    if (!state) return;
    state.hidden = false;
    var section = state.closest("section");
    if (section) section.hidden = false;
  }

  fetch(DATA_URL)
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      if (!Array.isArray(data)) {
        throw new Error("data/players.json debe ser un arreglo JSON");
      }

      var seen = {};
      var valid = data.filter(function (p) {
        if (!p || typeof p !== "object" || !p.id || !p.image || seen[p.id]) return false;
        seen[p.id] = true;
        return true;
      });

      render(document.querySelector("[data-roster='featured']"),
        valid.filter(function (p) { return p.featured === true; }),
        { showDescription: false });

      render(document.querySelector("[data-roster='all']"), valid, { showDescription: true });
    })
    .catch(function (err) {
      console.warn("[KOA] No se pudo cargar el roster desde data/players.json.", err);
      showLoadError();
    });
})();
