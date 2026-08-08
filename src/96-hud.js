/* ---- minimap ---- */
const mapCan = document.getElementById('map'), mctx = mapCan.getContext('2d');
const MAPR = 620;
const mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 720;
(function drawMap() {
  const c = mapBase.getContext('2d'), S = 720, f = S / (MAPR * 2), o = S / 2;
  c.fillStyle = '#0d1113'; c.fillRect(0, 0, S, S);
  c.fillStyle = '#0a2530'; c.fillRect(o + SEA_X * f, 0, S, S);
  c.strokeStyle = '#0a2530'; c.lineWidth = RIVER_HW * 2 * f; c.beginPath();
  for (let x = -MAPR; x <= MAPR; x += 20) { const z = riverZ(x); x === -MAPR ? c.moveTo(o + x * f, o + z * f) : c.lineTo(o + x * f, o + z * f); }
  c.stroke();
  c.strokeStyle = 'rgba(200,190,160,0.10)'; c.lineWidth = 1;
  for (let k = -EXT; k <= EXT; k += PITCH) {
    c.beginPath(); c.moveTo(0, o + k * f); c.lineTo(S, o + k * f); c.stroke();
    c.beginPath(); c.moveTo(o + k * f, 0); c.lineTo(o + k * f, S); c.stroke();
  }
  for (const b of buildings) {
    const t = clamp(b.h / 90, 0.12, 1);
    c.fillStyle = b.kind === 'glass' ? `rgba(120,180,200,${0.35 + t * 0.5})` : `rgba(226,214,180,${0.14 + t * 0.55})`;
    c.fillRect(o + (b.x - b.w / 2) * f, o + (b.z - b.d / 2) * f, Math.max(1, b.w * f), Math.max(1, b.d * f));
  }
  c.fillStyle = '#d9a83a';
  c.fillRect(o - PW * f, o - PW * f, PW * 2 * f, PW * 2 * f);
  c.fillStyle = '#e8532c';
  for (const g of GOPURAMS) c.fillRect(o + g.x * f - 3, o + g.z * f - 3, 6, 6);
})();
function drawMinimap() {
  const S = mapCan.width, Z = 2.0;
  mctx.clearRect(0, 0, S, S);
  mctx.save();
  mctx.translate(S / 2, S / 2);
  mctx.scale(Z, Z);
  mctx.drawImage(mapBase, -360 - player.p.x * (720 / (MAPR * 2)), -360 - player.p.z * (720 / (MAPR * 2)));
  mctx.restore();
  mctx.save(); mctx.translate(S / 2, S / 2); mctx.rotate(yaw + PI);   /* arrow tracks camFwd on a north-up map */
  mctx.fillStyle = '#e8a92b'; mctx.beginPath();
  mctx.moveTo(0, -9); mctx.lineTo(6.5, 7); mctx.lineTo(0, 3.5); mctx.lineTo(-6.5, 7);
  mctx.closePath(); mctx.fill(); mctx.restore();
}

/* ---- hud ---- */
const elSpd = document.querySelector('#vSpd .v'), elAlt = document.querySelector('#vAlt .v');
const elTen = document.querySelector('#vTen .v'), elLen = document.querySelector('#vLen .v');
const elZone = document.querySelector('#zone .en');
const elBar = document.getElementById('tbar'), elRush = document.getElementById('rush');
let hudT = 0, aimOk = false, missFlash = 0;
const held = [false, false];
let aimPt = null;
function updateHUD(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.07;
  const spd = player.v.length();
  elSpd.innerHTML = (spd * 3.6).toFixed(0) + '<small>km/h</small>';
  elAlt.innerHTML = Math.max(0, player.p.y).toFixed(0) + '<small>m</small>';
  const tn = Math.max(player.webs[0].tension, player.webs[1].tension);
  elTen.innerHTML = (tn / 1000).toFixed(1) + '<small>kN</small>';
  const on = player.webs[0].on || player.webs[1].on;
  elLen.innerHTML = on
    ? Math.max(player.webs[0].on ? player.webs[0].len : 0, player.webs[1].on ? player.webs[1].len : 0).toFixed(0) + '<small>m</small>'
    : '—';
  elBar.style.width = clamp(tn / 14000, 0, 1) * 100 + '%';
  const z = ZONE_NAME[player.p.x > SEA_X ? 'sea' : districtAt(player.p.x, player.p.z)] || ZONE_NAME.mid;
  if (elZone.textContent !== z) elZone.textContent = z;
  elRush.style.opacity = clamp((spd - 26) / 76, 0, 0.9);
  cross.classList.toggle('web', on);
  cross.classList.toggle('lock', aimOk);
  cross.classList.toggle('miss', missFlash > 0);
}

