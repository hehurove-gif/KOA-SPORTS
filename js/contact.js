/* ==========================================================================
   KOA — REDES (Contacto + Footer)
   Las URLs de las redes viven en UN solo lugar: los atributos data-instagram,
   data-whatsapp, data-tiktok, data-discord y data-x de <section id="contacto">.
   Este script "enciende" cada enlace marcado con data-social="…", tanto las
   tarjetas de la sección Contacto como las filas del footer.

   - URL válida (http/https) → el elemento se convierte en un enlace normal
                               (href + target="_blank" + rel="noopener noreferrer")
                               y se muestra.
   - URL vacía o inválida    → se oculta el canal completo (su <li>), sin dejar
                               un enlace falso ni un hueco en la rejilla.

   X queda así oculto hasta que exista una URL real: basta con escribirla en
   data-x. No hay formulario, ni envío de correo, ni backend.
   ========================================================================== */

(function () {
  "use strict";

  var root = document.getElementById("contacto");
  if (!root) return;

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isHttpUrl(value) {
    return /^https?:\/\/[^\s]+$/i.test(value);
  }

  var nodes = document.querySelectorAll("[data-social]");
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var url = clean(root.getAttribute("data-" + el.getAttribute("data-social")));
    var item = el.closest("li") || el;

    if (isHttpUrl(url)) {
      el.setAttribute("href", url);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
      item.hidden = false;
    } else {
      el.removeAttribute("href");
      el.removeAttribute("target");
      el.removeAttribute("rel");
      item.hidden = true;
    }
  }

  /* Logos de marca: cada canal usa su archivo de assets/images/logo/ (instagram-,
     whatsapp- y x-logo.png; Tiktok-logo.webp y Discord-logo.webp, con esa
     mayúscula: Vercel distingue mayúsculas de minúsculas). Si un archivo no
     existe, solo se oculta su recuadro: nunca se ve una imagen rota ni un ícono
     genérico de relleno, y el canal sigue funcionando con su nombre y su enlace. */
  function hideTile(img) {
    var tile = img.parentNode;
    if (tile) tile.hidden = true;
  }

  var logos = document.querySelectorAll("[data-social] img");
  for (var j = 0; j < logos.length; j++) {
    var logo = logos[j];
    if (logo.complete && logo.naturalWidth === 0 && logo.getAttribute("src")) {
      hideTile(logo);
    } else {
      logo.addEventListener("error", function () { hideTile(this); });
    }
  }
})();
