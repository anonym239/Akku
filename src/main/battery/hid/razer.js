'use strict';

// Razer-Protokoll (wie bei OpenRazer): 90-Byte-Feature-Berichte.
// Befehl 0x07/0x80 liefert den Akkustand, 0x07/0x84 den Ladezustand.

const REPORT_LEN = 90;
const STATUS = { BUSY: 0x01, OK: 0x02, FAIL: 0x03, TIMEOUT: 0x04, UNSUPPORTED: 0x05 };
// Die "Transaction-ID" unterscheidet sich je nach Modell.
const TRANSACTION_IDS = [0x1f, 0x3f, 0xff, 0x9f];

function buildReport(tid, cmdClass, cmdId, size) {
  const r = Buffer.alloc(REPORT_LEN);
  r[1] = tid;
  r[5] = size;
  r[6] = cmdClass;
  r[7] = cmdId;
  let crc = 0;
  for (let i = 2; i < 88; i++) crc ^= r[i];
  r[88] = crc;
  return r;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function command(handle, tid, cmdClass, cmdId, size) {
  const req = buildReport(tid, cmdClass, cmdId, size);
  for (let attempt = 0; attempt < 4; attempt++) {
    await handle.sendFeatureReport([0x00, ...req]);
    await wait(attempt === 0 ? 60 : 120);
    let res = Buffer.from(await handle.getFeatureReport(0x00, REPORT_LEN + 1));
    if (res.length === REPORT_LEN + 1) res = res.subarray(1);
    if (res.length < REPORT_LEN) return null;
    if (res[0] === STATUS.BUSY) continue;
    if (res[0] !== STATUS.OK || res[6] !== cmdClass || res[7] !== cmdId) return { status: res[0] };
    return { status: res[0], args: res.subarray(8, 88) };
  }
  return { status: STATUS.BUSY };
}

// Fragt eine geöffnete Razer-HID-Sammlung ab. Liefert null, wenn das Gerät
// keinen Akku hat oder diese Sammlung keine Befehle annimmt.
async function readRazer(handle, preferredTid) {
  const tids = preferredTid ? [preferredTid, ...TRANSACTION_IDS.filter((t) => t !== preferredTid)] : TRANSACTION_IDS;
  let sleeping = false;
  for (const tid of tids) {
    const bat = await command(handle, tid, 0x07, 0x80, 0x02);
    if (!bat) return null;
    if (bat.status === STATUS.TIMEOUT) sleeping = true;
    if (bat.status !== STATUS.OK) continue;
    const chg = await command(handle, tid, 0x07, 0x84, 0x02).catch(() => null);
    return {
      tid,
      level: Math.round((bat.args[1] / 255) * 100),
      charging: Boolean(chg && chg.status === STATUS.OK && chg.args[1] === 1),
    };
  }
  return sleeping ? { sleeping: true } : null;
}

module.exports = { readRazer, buildReport, REPORT_LEN, STATUS };
