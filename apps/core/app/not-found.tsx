export default function NotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#09090b",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 120,
              fontWeight: 800,
              lineHeight: 1,
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            404
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "16px 0 8px" }}>
            Page not found
          </h1>
          <p style={{ color: "#a1a1aa", fontSize: 15 }}>
            The page you are looking for does not exist.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: 32,
              padding: "10px 24px",
              borderRadius: 9999,
              border: "1px solid #27272a",
              color: "#fafafa",
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            Go home
          </a>
        </div>
      </body>
    </html>
  )
}
