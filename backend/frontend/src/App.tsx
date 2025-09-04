import { useEffect, useState } from "react";

interface Notice {
  title: string;
  url: string;
  created_at: string;
  data: any; // later we can define a stricter type
}

function App() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ padding: "2rem" }}>
      <h1>ZANECO Notices</h1>
      {notices.length === 0 ? (
        <p>No notices found.</p>
      ) : (
        <ul>
          {notices.map((n, idx) => (
            <li key={idx}>
              <a href={n.url} target="_blank" rel="noopener noreferrer">
                {n.title}
              </a>{" "}
              <small>
                {n.created_at
                  ? new Date(n.created_at).toLocaleString()
                  : "No date"}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
