'use strict';

// Ordnet einen Gerätenamen einem Gerätetyp zu (für Icon und Sortierung).
const RULES = [
  ['controller', /controller|gamepad|xbox|dualsense|dualshock|joy-?con|pro controller|8bitdo/i],
  ['headset', /headset|headphone|kopfh[öo]rer|buds|airpods|earbuds|wh-?1000|wf-?1000|xm[3-6]\b|beats|bose qc|quietcomfort|jabra|arctis|hyperx cloud|ear\s?\(/i],
  ['keyboard', /keyboard|tastatur|\bkeys\b|mx keys|k\d{3}\b|craft|magic keyboard|keychron|logi pop keys/i],
  ['mouse', /mouse|maus|mx master|mx anywhere|mx ergo|g ?pro|g\d{3}\b|m\d{3}\b|deathadder|basilisk|viper|trackpad|trackball|magic mouse|lift\b|pebble/i],
  ['speaker', /speaker|lautsprecher|boom|jbl (flip|charge|go|clip|xtreme)|soundlink|soundcore|sonos/i],
  ['pen', /\bpen\b|stift|stylus|pencil/i],
  ['phone', /phone|iphone|galaxy|pixel \d|xiaomi|oneplus/i],
  ['watch', /watch|band \d|fitbit|garmin/i],
];

function classify(name, hint) {
  if (hint && TYPES.has(hint)) return hint;
  const n = String(name || '');
  for (const [type, re] of RULES) {
    if (re.test(n)) return type;
  }
  return 'other';
}

const TYPES = new Set(['mouse', 'keyboard', 'headset', 'controller', 'speaker', 'pen', 'phone', 'watch', 'system', 'other']);

module.exports = { classify, TYPES };
