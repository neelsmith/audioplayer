/**
 * Audio format detection. Pure functions; the browser capability check is
 * injected (`probe`) so it can be tested without a real <audio> element.
 */

/** Extension → MIME type for formats we recognise as audio. */
export const AUDIO_TYPES = Object.freeze({
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  mp4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  caf: 'audio/x-caf',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  weba: 'audio/webm',
  webm: 'audio/webm',
});

/**
 * Copy-protected (DRM) audio: recognised as audio, but no browser can play it.
 * m4p = iTunes Store purchases with FairPlay DRM (pre-2009).
 */
export const PROTECTED_EXTENSIONS = Object.freeze(new Set(['m4p']));

/** @param {string} name */
export const isProtected = (name) => PROTECTED_EXTENSIONS.has(getExtension(name));

/**
 * Lower-cased extension without the dot, or "" if there is none.
 * Dotfiles like ".hidden" have no extension.
 * @param {string} name
 */
export function getExtension(name) {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

/**
 * Best-guess audio MIME type, or "" if the file isn't audio.
 * Extension wins (browsers often report "" or odd types for local files);
 * otherwise an `audio/*` type reported by the browser is accepted.
 * @param {string} name
 * @param {string} [reportedType] File.type as reported by the browser
 */
export function mimeFor(name, reportedType = '') {
  const fromExt = AUDIO_TYPES[getExtension(name)];
  if (fromExt) return fromExt;
  return reportedType.startsWith('audio/') ? reportedType : '';
}

/** @param {string} name @param {string} [reportedType] */
export function isAudio(name, reportedType = '') {
  return isProtected(name) || mimeFor(name, reportedType) !== '';
}

/**
 * Default probe: asks a real <audio> element. Created lazily and reused.
 * @type {(mime: string) => string}
 */
let probeEl;
export function defaultProbe(mime) {
  probeEl ??= document.createElement('audio');
  return probeEl.canPlayType(mime);
}

/**
 * @typedef {'playable' | 'unsupported' | 'protected' | 'other'} FileKind
 * - playable:    audio this browser reports it can play
 * - unsupported: audio, but this browser can't play the format (e.g. Ogg in older Safari)
 * - protected:   DRM-protected audio (e.g. .m4p) that no browser can play
 * - other:       not audio (shown greyed out)
 *
 * @param {string} name
 * @param {string} [reportedType]
 * @param {(mime: string) => string} [probe] returns '', 'maybe' or 'probably'
 * @returns {FileKind}
 */
export function classify(name, reportedType = '', probe = defaultProbe) {
  if (isProtected(name)) return 'protected';
  const mime = mimeFor(name, reportedType);
  if (!mime) return 'other';
  return probe(mime) ? 'playable' : 'unsupported';
}
