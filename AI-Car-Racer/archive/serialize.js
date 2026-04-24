// archive/serialize.js
// Phase 1A (F3) — wire format for the warm-restart bundle. An archive
// snapshot (see archive/snapshot.js + archive/exporter.js) is written as a
// gzipped JSON blob with a short magic header so a truncated or
// wrong-format download fails loudly at import instead of halfway through
// the replay. We use CompressionStream('gzip') when available (Chromium +
// Firefox + Safari 16.4+), falling back to plain JSON on older browsers —
// documented in the magic header so fromBlob() picks the right decode path.
//
// File layout
//   magicLine = "VVARCHIVE v1 <codec>\n"
//   body      = JSON.stringify(snapshot)
//   codec     = "gzip" | "json"
//
// For the gzip path the file is [magic-line bytes][gzip(body) bytes] — the
// header is *not* compressed so fromBlob() can peek the codec without
// loading a decompressor it doesn't need.

const MAGIC_PREFIX = 'VVARCHIVE v1 ';
const MAGIC_GZIP = MAGIC_PREFIX + 'gzip\n';
const MAGIC_JSON = MAGIC_PREFIX + 'json\n';
const MIME_TYPE = 'application/x-vvarchive';

function _supportsGzip() {
  return typeof CompressionStream === 'function'
      && typeof DecompressionStream === 'function'
      && typeof Response === 'function';
}

async function _gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function _gunzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function _encodeUtf8(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  // Very-old-Safari fallback. Unicode is fine — JSON body is ASCII except
  // for user-supplied meta fields, which are rare in this archive.
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

function _decodeUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(s));
}

// Write a snapshot object to a Blob. Returns Promise<Blob>. The blob's
// `type` is the VV-archive MIME so a later `saveAs` call on a browser that
// cares about types picks the right handler (most browsers just care about
// the filename extension, but we set both for belt-and-suspenders).
export async function toBlob(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('serialize.toBlob: snapshot must be an object');
  }
  const body = JSON.stringify(snapshot);
  if (_supportsGzip()) {
    const header = _encodeUtf8(MAGIC_GZIP);
    const compressed = await _gzipBytes(_encodeUtf8(body));
    return new Blob([header, compressed], { type: MIME_TYPE });
  }
  const header = _encodeUtf8(MAGIC_JSON);
  return new Blob([header, _encodeUtf8(body)], { type: MIME_TYPE });
}

// Read a Blob into a snapshot object. Rejects if the magic header is
// missing or the codec isn't recognised. The caller should re-validate via
// archive/snapshot.validateSnapshot() — this function only guarantees the
// returned value parses as JSON with the expected wrapper.
export async function fromBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('serialize.fromBlob: argument must be a Blob');
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  // The magic line is ASCII, so we can scan the first ~64 bytes as 1:1
  // codepoints without running a full UTF-8 decode.
  let nlIdx = -1;
  const scanEnd = Math.min(buf.length, 64);
  for (let i = 0; i < scanEnd; i++) {
    if (buf[i] === 0x0a) { nlIdx = i; break; }
  }
  if (nlIdx < 0) {
    throw new Error('serialize.fromBlob: missing magic header (not a .vvarchive file?)');
  }
  const header = _decodeUtf8(buf.subarray(0, nlIdx + 1));
  if (!header.startsWith(MAGIC_PREFIX)) {
    throw new Error('serialize.fromBlob: bad magic header: ' + JSON.stringify(header.slice(0, 40)));
  }
  const payload = buf.subarray(nlIdx + 1);
  let jsonBytes;
  if (header === MAGIC_GZIP) {
    if (!_supportsGzip()) {
      throw new Error('serialize.fromBlob: file is gzip but this browser lacks DecompressionStream');
    }
    jsonBytes = await _gunzipBytes(payload);
  } else if (header === MAGIC_JSON) {
    jsonBytes = payload;
  } else {
    throw new Error('serialize.fromBlob: unknown codec in header: ' + JSON.stringify(header));
  }
  const text = _decodeUtf8(jsonBytes);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('serialize.fromBlob: JSON parse failed: ' + (e.message || e));
  }
}

// Convenience constant for file-picker filters and downloads.
export const VVARCHIVE_EXTENSION_GZ = '.vvarchive.json.gz';
export const VVARCHIVE_EXTENSION_JSON = '.vvarchive.json';
export const VVARCHIVE_MIME = MIME_TYPE;

// Exposed for test harnesses — lets a test assert which path was used
// without reaching into private state.
export function gzipAvailable() { return _supportsGzip(); }
