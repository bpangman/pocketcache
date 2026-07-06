/*!
 * PocketCache embed widget — https://pocketcache.app/widget.js
 *
 * Usage (from your PocketCache dashboard → Grow tab):
 *   <script src="https://pocketcache.app/widget.js" data-org="BGCA"></script>
 *
 * Optional attributes:
 *   data-name="Boys & Girls Clubs of America"  — display name (defaults to the code)
 *   data-color="#003865"                       — button/brand color
 *   data-width="340"                           — card max width in px (240–600)
 *   data-label="Start giving →"                — button text
 *
 * Renders a small self-contained "Round up for us" card exactly where the
 * script tag is placed, linking to the org's giving page (tagged src=widget
 * so the org's analytics can attribute clicks). No dependencies, no cookies,
 * no external requests.
 */
(function () {
  var s = document.currentScript;
  if (!s || !s.parentNode) return;

  var org = (s.getAttribute('data-org') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!org) return;
  var name = s.getAttribute('data-name') || org;
  var color = (s.getAttribute('data-color') || '#003865').replace(/[^#a-zA-Z0-9(),. %-]/g, '');
  var width = Math.min(600, Math.max(240, parseInt(s.getAttribute('data-width'), 10) || 340));
  var label = s.getAttribute('data-label') || 'Start giving →';
  // src=widget lets the org's analytics attribute donors who came from the widget
  var giveUrl = 'https://pocketcache.app/' + encodeURIComponent(org) + '/give?src=widget';

  // Everything is built with createElement/textContent — org-provided strings
  // are never parsed as HTML.
  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.setAttribute('style', style);
    if (text != null) n.textContent = text;
    return n;
  }

  var card = el('div',
    'display:block;box-sizing:border-box;max-width:' + width + 'px;background:#ffffff;' +
    'border:1px solid #e5e7eb;border-radius:16px;padding:16px;' +
    'box-shadow:0 2px 8px rgba(11,42,74,0.08);' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'line-height:1.45;color:#0f172a;');

  // The official PocketCache coin — gold coin, teal block arrow, white halo
  function coinSvg(px) {
    return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 100 100" aria-hidden="true" style="display:inline-block;vertical-align:-0.12em;">' +
      '<circle cx="50" cy="50" r="50" fill="#E5A800"/>' +
      '<circle cx="50" cy="50" r="44" fill="#FBBF24"/>' +
      '<polygon points="50,17 24,43 37,43 37,77 63,77 63,43 76,43" fill="#5EEAD4" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>' +
      '</svg>';
  }

  // Header row: coin mark + title
  var row = el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:8px;');
  var coin = el('span', 'flex-shrink:0;display:inline-flex;');
  coin.innerHTML = coinSvg(30);
  var title = el('strong', 'font-size:14.5px;font-weight:700;display:block;');
  title.textContent = 'Round up for ' + name;
  row.appendChild(coin);
  row.appendChild(title);
  card.appendChild(row);

  card.appendChild(el('p',
    'margin:0 0 12px;font-size:12.5px;color:#475569;',
    'Spare change from your everyday purchases, sent to us automatically once a month. Takes a minute to set up.'));

  var btn = el('a',
    'display:block;text-align:center;padding:11px 14px;border-radius:12px;' +
    'background:linear-gradient(135deg,' + color + ',#001a33);color:#ffffff;' +
    'font-weight:700;font-size:14px;text-decoration:none;');
  btn.textContent = label;
  btn.href = giveUrl;
  btn.target = '_blank';
  btn.rel = 'noopener';
  card.appendChild(btn);

  // Footer: "Powered by P◉cketCache" — the coin IS the o, per the brand
  var foot = el('p', 'margin:8px 0 0;font-size:10.5px;color:#94a3b8;text-align:center;');
  var footLink = el('a', 'color:#94a3b8;text-decoration:none;');
  footLink.href = 'https://pocketcache.app';
  footLink.target = '_blank';
  footLink.rel = 'noopener';
  footLink.appendChild(document.createTextNode('Powered by '));
  var mark = el('span', 'font-weight:800;color:#0B2A4A;letter-spacing:-0.2px;white-space:nowrap;');
  mark.appendChild(document.createTextNode('P'));
  var footCoin = el('span', 'display:inline-flex;');
  footCoin.innerHTML = coinSvg(10);
  mark.appendChild(footCoin);
  mark.appendChild(document.createTextNode('cket'));
  var cache = el('span', 'color:#0D9488;', 'Cache');
  mark.appendChild(cache);
  footLink.appendChild(mark);
  foot.appendChild(footLink);
  card.appendChild(foot);

  s.parentNode.insertBefore(card, s);
})();
