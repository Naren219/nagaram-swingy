/* =====================================================================
   THE CITY HAS A DAY
   ---------------------------------------------------------------------
   Like today's ring course, the date (UTC) is a seed, and it picks what kind
   of day the city is having: the weather, how hard the breeze blows and from
   where, whether it is a kite-festival day, whether tonight the temple is lit
   with lamps. Everyone gets the same city on the same day, and a different
   one tomorrow. Nothing here is a rule or a goal; it is a reason the city is
   worth coming back to.

   The season leans the odds the way the Coromandel coast's year does: the
   north-east monsoon brings the rain from October to December, the kites
   go up for Sankranti in the middle of January, and the lamps for Karthigai
   in late November.

     ?day=2026-01-14   that date's city, for sharing a day
     ?day=plain        the reference city the tests run in: clear, an
                       ordinary breeze, no festival
   ===================================================================== */
const CITY_DAY = (() => {
  const q = /[?&]day=([0-9]{4}-[0-9]{2}-[0-9]{2}|plain)\b/.exec(location.search);
  if (q && q[1] === 'plain')
    return { plain: true, weather: 'clear', squallEvery: Infinity, windK: 1, windTurn: 0, kites: false, lamps: false, seed: 0, line: '' };
  const d = q ? new Date(q[1] + 'T12:00:00Z') : new Date();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
  const seed = y * 10000 + m * 100 + dd;
  const r = mulberry32(seed * 7919 + 17);
  r(); r();                                          // the first draws off a fresh seed are the least mixed
  /* weather: clear, passing showers, or the monsoon proper */
  const wet = m >= 10 ? [0.25, 0.45] : m >= 6 ? [0.45, 0.40] : [0.70, 0.25];
  const w = r(), weather = w < wet[0] ? 'clear' : w < wet[0] + wet[1] ? 'showers' : 'monsoon';
  const squallEvery = weather === 'clear' ? Infinity : weather === 'showers' ? 420 : 285;
  const windK = 0.7 + 0.65 * r();                    // how hard the breeze is blowing today
  const windTurn = (r() - 0.5) * 2.2;                // and from where
  const kites = (m === 1 && (dd === 14 || dd === 15)) || r() < 0.12;
  const lamps = (m === 11 && dd >= 20) || (m === 12 && dd <= 8) ? r() < 0.7 : r() < 0.1;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const said = [DAYS[d.getUTCDay()] + ' ' + dd + ' ' + MONTHS[m - 1]];
  said.push(weather === 'clear' ? (windK > 1.15 ? 'clear, a fresh breeze' : windK < 0.85 ? 'clear and still' : 'clear')
          : weather === 'showers' ? 'showers coming in off the bay' : 'the monsoon is in');
  if (kites) said.push('kites up all over the city');
  if (lamps) said.push('lamps at the temple tonight');
  return { plain: false, weather, squallEvery, windK, windTurn, kites, lamps, seed, line: said.join(' · ') };
})();
