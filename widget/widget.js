/*!
 * PocketCache embed widget — https://pocketcache.app/widget.js
 *
 * Usage (from your PocketCache dashboard → Grow tab):
 *   <script src="https://pocketcache.app/widget.js" data-org="BGCA"></script>
 *
 * Optional attributes:
 *   data-name="Boys & Girls Clubs of America"  — display name (defaults to the code)
 *   data-color="#003865"                       — button/brand color
 *
 * Renders a small self-contained "Round up for us" card exactly where the
 * script tag is placed, linking to the org's giving page. No dependencies,
 * no tracking, no external requests.
 */
(function () {
  var s = document.currentScript;
  if (!s || !s.parentNode) return;

  var org = (s.getAttribute('data-org') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!org) return;
  var name = s.getAttribute('data-name') || org;
  var color = (s.getAttribute('data-color') || '#003865').replace(/[^#a-zA-Z0-9(),. %-]/g, '');
  var giveUrl = 'https://pocketcache.app/' + encodeURIComponent(org) + '/give';

  // Everything is built with createElement/textContent — org-provided strings
  // are never parsed as HTML.
  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.setAttribute('style', style);
    if (text != null) n.textContent = text;
    return n;
  }

  var card = el('div',
    'display:block;box-sizing:border-box;max-width:340px;background:#ffffff;' +
    'border:1px solid #e5e7eb;border-radius:16px;padding:16px;' +
    'box-shadow:0 2px 8px rgba(11,42,74,0.08);' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'line-height:1.45;color:#0f172a;');

  // Header row: coin mark + title
  var row = el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:8px;');
  var coin = el('span', 'flex-shrink:0;display:inline-flex;');
  coin.innerHTML =
    '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">' +
    '<circle cx="16" cy="16" r="15" fill="#FBBF24" stroke="#E5A800" stroke-width="1.5"/>' +
    '<path d="M16 23 V11" stroke="#003865" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
    '<path d="M11 15.5 L16 10.5 L21 15.5" stroke="#003865" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
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
  btn.textContent = 'Start giving →';
  btn.href = giveUrl;
  btn.target = '_blank';
  btn.rel = 'noopener';
  card.appendChild(btn);

  var foot = el('p', 'margin:8px 0 0;font-size:10.5px;color:#94a3b8;text-align:center;');
  var footLink = el('a', 'color:#94a3b8;text-decoration:none;', 'Powered by PocketCache');
  footLink.href = 'https://pocketcache.app';
  footLink.target = '_blank';
  footLink.rel = 'noopener';
  foot.appendChild(footLink);
  card.appendChild(foot);

  s.parentNode.insertBefore(card, s);
})();
