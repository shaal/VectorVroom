// share/url.js
// Phase 3C — fetch a remote .vvarchive bundle and compute shareable URLs.
// We never host anything ourselves: the caller pastes a URL they already
// control (Gist, S3, IPFS gateway, their own server) and we build a
// `?snapshots=1&archive=<encoded>` link other people can open.
//
// API
//   fetchArchive(url) → { blob, snapshot }
//     Uses global `fetch` (so test harnesses can monkey-patch it), runs the
//     response through archive/serialize.fromBlob, and gates the result on
//     validateSnapshot before returning. Throws with a user-readable
//     message when the URL 404s, the magic header is wrong, or the
//     snapshot fails schema validation.
//   buildShareUrl(archiveUrl) → string
//     Returns `<current-page-origin+path>?snapshots=1&archive=<encoded>`.
//     Strips any existing `archive=` / `snapshots=` params from
//     window.location.search so the output is deterministic even when the
//     user clicks "copy link" from a page that was itself opened via a
//     share URL.
//
// Gotcha: `fetch` is subject to CORS. A Gist or raw.githubusercontent.com
// URL works from any origin; an S3 bucket needs CORS configured. We
// surface a hint-laced error message instead of silently swallowing
// TypeError: Failed to fetch.

import { fromBlob } from '../archive/serialize.js';
import { validateSnapshot } from '../archive/snapshot.js';

export async function fetchArchive(url) {
  if (typeof url !== 'string' || !url) {
    throw new Error('fetchArchive: url must be a non-empty string');
  }
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    // Typical CORS or DNS failure surfaces as a generic TypeError; hint
    // the user toward the likely root cause so they don't have to open
    // devtools to understand why their gist-raw URL worked but their S3
    // URL didn't.
    throw new Error('fetchArchive: network error (CORS or offline?) — ' + (e.message || e));
  }
  if (!res.ok) {
    throw new Error('fetchArchive: HTTP ' + res.status + ' ' + (res.statusText || '') + ' for ' + url);
  }
  const blob = await res.blob();
  let snapshot;
  try {
    snapshot = await fromBlob(blob);
  } catch (e) {
    throw new Error('fetchArchive: could not parse bundle (' + (e.message || e) + ')');
  }
  const v = validateSnapshot(snapshot);
  if (!v.ok) {
    throw new Error('fetchArchive: invalid snapshot — ' + v.reason);
  }
  return { blob, snapshot };
}

export function buildShareUrl(archiveUrl) {
  if (typeof archiveUrl !== 'string' || !archiveUrl) {
    throw new Error('buildShareUrl: archiveUrl must be a non-empty string');
  }
  let base = '';
  let existingParams = null;
  try {
    if (typeof window !== 'undefined' && window.location) {
      base = window.location.origin + window.location.pathname;
      existingParams = new URLSearchParams(window.location.search || '');
    }
  } catch (_) { /* non-browser harness */ }
  const params = existingParams || new URLSearchParams();
  // Strip anything we're about to overwrite so the share link is stable
  // when the user copies from a page already opened with ?archive=.
  params.delete('archive');
  params.delete('snapshots');
  // Preserve any other flags the user had on (e.g. ?consistency=eventual)
  // so share links round-trip demo configs, not just bundles.
  params.set('snapshots', '1');
  params.set('archive', archiveUrl);
  return (base || '') + '?' + params.toString();
}
