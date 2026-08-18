// Геокодування назви міста → координати, через безкоштовний Nominatim (OpenStreetMap).
// Викликається рідко (лише коли диспетчер додає/оновлює місто), тому обмеження запитів не проблема.
async function geocodeCity(name) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'dispatch-system/1.0 (taxi dispatch app)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.error('Помилка геокодування міста', name, e.message);
    return null;
  }
}

// Відстань між двома точками у км (формула гаверсинуса)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Знаходить найближче з відомих міст (тих, що мають координати) до заданої точки
function findNearestCity(cities, lat, lng, maxKm = 60) {
  let best = null;
  let bestDist = Infinity;
  for (const c of cities) {
    if (c.lat == null || c.lng == null) continue;
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  if (!best || bestDist > maxKm) return null;
  return { city: best.name, distanceKm: Math.round(bestDist * 10) / 10 };
}

module.exports = { geocodeCity, haversineKm, findNearestCity };
