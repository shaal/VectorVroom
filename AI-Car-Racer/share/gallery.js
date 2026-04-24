// share/gallery.js
// Phase 3C — community archive gallery.
//
// External-scope gate: per docs/plan/rulake-inspired-features.md ("3C —
// Shareable archive URLs") and the local-vs-external-scope memory,
// publishing any real community URL requires explicit user OK. Until then
// this module ships with a single placeholder entry whose `url` is
// `about:blank` so a user exploring the UI sees the shape of the gallery
// but cannot accidentally fetch a third-party URL.
//
// When the user gives the go-ahead, add entries with the shape:
//   { name, url, description, source }
// where `source` is a freeform label ("gist", "s3", "ipfs", "self-hosted")
// that the UI surfaces next to each entry so users can judge provenance
// at a glance.
//
// Candidate real entries queued for future review (not yet activated):
//   - "Rect track — 500-gen warm start" (gist, pending owner OK)
//   - "Triangle-apex corridor study" (gist, pending owner OK)
//   - "Cross-track n=6 fixture" (self-hosted, pending owner OK)
// Do NOT uncomment or add real URLs without user sign-off.

export const GALLERY = [
  {
    name: 'Example (placeholder — ask the owner before using)',
    url: 'about:blank',
    description:
      'Gallery placeholder. Real community archives land here once the owner '
      + 'approves the external-scope gate. Clicking this entry is a no-op '
      + '(about:blank is a recognized sentinel; the UI will fail to fetch '
      + 'a real bundle from it, which is exactly the behaviour we want '
      + 'until a real URL is vetted).',
    source: 'placeholder',
  },
];

// Render the gallery list into `container`. Each entry becomes a <li>
// with a button that invokes `onImport(entry.url)`. The UI is intentionally
// minimal — this is a pure mount helper; styling lives in style.css and
// piggybacks on the existing .rv-snapshots-* classes so the gallery feels
// like part of the Phase 1A Export/Import block.
export function mountGalleryPanel(container, onImport) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('mountGalleryPanel: container must be a DOM node');
  }
  const handler = typeof onImport === 'function' ? onImport : () => {};
  const wrap = document.createElement('div');
  wrap.className = 'rv-share-gallery';
  wrap.setAttribute('data-rv', 'share-gallery');

  const title = document.createElement('div');
  title.className = 'rv-share-gallery-title';
  title.textContent = 'Community archives';
  wrap.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'rv-share-gallery-list';
  for (const entry of GALLERY) {
    const li = document.createElement('li');
    li.className = 'rv-share-gallery-item';
    li.setAttribute('data-rv', 'share-gallery-item');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'controlButton rv-share-gallery-btn';
    btn.textContent = entry.name;
    btn.title = entry.description || '';
    btn.setAttribute('data-rv-url', entry.url);
    btn.setAttribute('data-rv-source', entry.source || '');
    btn.addEventListener('click', () => {
      try { handler(entry.url); }
      catch (e) { console.warn('[rv-share] gallery onImport threw', e); }
    });
    li.appendChild(btn);

    if (entry.description) {
      const desc = document.createElement('div');
      desc.className = 'rv-share-gallery-desc';
      desc.textContent = entry.description;
      li.appendChild(desc);
    }

    list.appendChild(li);
  }
  wrap.appendChild(list);
  container.appendChild(wrap);
  return wrap;
}
