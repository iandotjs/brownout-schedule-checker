import { useCallback } from 'react';

interface Location {
  code: string;
  name: string;
  barangays: { code: string; name: string }[];
}

interface GeoResult {
  cityCode: string;
  barangayCode: string;
}

const normalizeForMatch = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Reverse-geocode coordinates via OpenStreetMap Nominatim (free, no API key).
 * Returns the city/town and suburb/village from the address.
 */
async function reverseGeocode(lat: number, lon: number): Promise<{ city: string; barangay: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    const city = addr.city || addr.town || addr.municipality || addr.county || '';
    const barangay = addr.suburb || addr.village || addr.neighbourhood || addr.quarter || '';

    return { city, barangay };
  } catch {
    return null;
  }
}

/**
 * Match reverse-geocoded names to the closest entry in the locations list.
 * Tries exact match first, then substring/fuzzy match.
 */
function matchToLocations(
  geoCity: string,
  geoBarangay: string,
  locations: Location[]
): GeoResult | null {
  const normCity = normalizeForMatch(geoCity);
  const normBarangay = normalizeForMatch(geoBarangay);

  if (!normCity) return null;

  // Try to find matching city
  let matchedCity = locations.find((loc) => normalizeForMatch(loc.name) === normCity);

  // Fuzzy: city name contains or is contained
  if (!matchedCity) {
    matchedCity = locations.find((loc) => {
      const locName = normalizeForMatch(loc.name);
      return locName.includes(normCity) || normCity.includes(locName);
    });
  }

  // Try without "CITY OF" / "MUNICIPALITY OF" prefix
  if (!matchedCity) {
    const stripped = normCity.replace(/^(CITY OF|MUNICIPALITY OF)\s+/i, '');
    matchedCity = locations.find((loc) => {
      const locStripped = normalizeForMatch(loc.name).replace(/^(CITY OF|MUNICIPALITY OF)\s+/i, '');
      return locStripped === stripped || locStripped.includes(stripped) || stripped.includes(locStripped);
    });
  }

  if (!matchedCity) return null;

  // Try to find matching barangay
  if (!normBarangay) {
    return { cityCode: matchedCity.code, barangayCode: '' };
  }

  let matchedBarangay = matchedCity.barangays.find(
    (b) => normalizeForMatch(b.name) === normBarangay
  );

  if (!matchedBarangay) {
    matchedBarangay = matchedCity.barangays.find((b) => {
      const bName = normalizeForMatch(b.name);
      return bName.includes(normBarangay) || normBarangay.includes(bName);
    });
  }

  return {
    cityCode: matchedCity.code,
    barangayCode: matchedBarangay?.code ?? '',
  };
}

/**
 * Hook that provides a function to detect user location and match it to the app's locations list.
 */
export function useGeolocation(locations: Location[]) {
  const detectLocation = useCallback((): Promise<GeoResult | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const geo = await reverseGeocode(latitude, longitude);
          if (!geo) {
            resolve(null);
            return;
          }
          const result = matchToLocations(geo.city, geo.barangay, locations);
          resolve(result);
        },
        () => {
          // User denied or error
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    });
  }, [locations]);

  return { detectLocation };
}
