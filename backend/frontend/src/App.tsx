import { useEffect, useState } from "react";

interface Location {
  code: string;
  name: string;
  barangays: { code: string; name: string }[];
}

interface Notice {
  id: string;
  title: string;
  url: string;
  created_at: string;
  data: any;
}

function App() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedBarangay, setSelectedBarangay] = useState<string>("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch cached PSGC locations from backend
  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/locations")
      .then((res) => res.json())
      .then((data) => {
        let normalized: Location[] = [];

        // If backend returns object { CITY: [barangay list] }
        if (!Array.isArray(data)) {
          normalized = Object.entries(data).map(([city, barangays], idx) => ({
            code: `CITY-${idx}`,
            name: city,
            barangays: (barangays as string[]).map((b, i) => ({
              code: `BRGY-${idx}-${i}`,
              name: b,
            })),
          }));
        } else {
          normalized = data;
        }

        setLocations(normalized);
      })
      .catch((err) => console.error("Error fetching locations:", err));
  }, []);

  // Fetch notices
  useEffect(() => {
    setLoading(true);
    fetch("http://127.0.0.1:5000/api/notices/latest")
      .then((res) => res.json())
      .then((data) => {
        setNotices(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching notices:", err);
        setLoading(false);
      });
  }, []);

// Filter schedules based on barangay selection, with debug logs
const filteredNotices = notices.filter((n) => {
  if (!selectedCity || !selectedBarangay) return false;
  if (!n.data?.processed_images) return false;

  let matched = false;

  n.data.processed_images.forEach((img: any, pi: number) => {
    if (!Array.isArray(img.structured)) return;

    img.structured.forEach((s: any, si: number) => {
      console.log(`🔎 Checking img[${pi}].structured[${si}]`, s);

      s.locations?.forEach((loc: any, li: number) => {
        console.log(
          `  ➡️ loc[${li}] muni=${loc.municipality?.code} vs selected=${selectedCity}`
        );

        if (loc.municipality?.code === selectedCity) {
          loc.barangays?.forEach((b: any, bi: number) => {
            console.log(
              `    🏘️ barangay[${bi}] code=${b.code} vs selected=${selectedBarangay}`
            );
            if (b.code === selectedBarangay) {
              console.log("✅ MATCH FOUND!");
              matched = true;
            }
          });
        }
      });
    });
  });

  if (!matched) console.log("❌ No match for notice:", n.id);
  return matched;
});

  const barangays =
    locations.find((loc) => loc.code === selectedCity)?.barangays || [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        ZANECO SCHEDULED POWER INTERRUPTION CHECKER
      </h1>

      {/* City Dropdown */}
      <label className="block mb-2 font-medium">City/Municipality:</label>
      <select
        className="border p-2 rounded w-full mb-4"
        value={selectedCity}
        onChange={(e) => {
          setSelectedCity(e.target.value);
          setSelectedBarangay(""); // reset barangay when city changes
        }}
      >
        <option value="">-- Select City/Municipality --</option>
        {locations.map((loc) => (
          <option key={loc.code} value={loc.code}>
            {loc.name}
          </option>
        ))}
      </select>

      {/* Barangay Dropdown */}
      <label className="block mb-2 font-medium">Barangay:</label>
      <select
        className="border p-2 rounded w-full mb-4"
        value={selectedBarangay}
        onChange={(e) => setSelectedBarangay(e.target.value)}
        disabled={!selectedCity}
      >
        <option value="">-- Select Barangay --</option>
        {barangays.map((b) => (
          <option key={b.code} value={b.code}>
            {b.name}
          </option>
        ))}
      </select>

      {/* Notices Table */}
      {loading ? (
        <p>Loading schedules...</p>
      ) : filteredNotices.length === 0 ? (
        <p className="text-green-600 font-semibold">
          Great! No scheduled brownout in your area
        </p>
      ) : (
        <table className="border w-full mt-4">
          <thead>
            <tr className="bg-gray-200">
              <th className="border p-2">Title</th>
              <th className="border p-2">Date</th>
              <th className="border p-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredNotices.map((n) => (
              <tr key={n.id}>
                <td className="border p-2">{n.title}</td>
                <td className="border p-2">
                  {new Date(n.created_at).toLocaleString()}
                </td>
                <td className="border p-2">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    View Notice
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;
