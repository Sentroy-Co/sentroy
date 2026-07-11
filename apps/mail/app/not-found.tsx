// Root-level 404 (locale segment'inden önce) — kendi <html>'ini render eder,
// self-contained (inline style). OS-dark + marka kırmızısı ile uyumlu.
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
          padding: "2rem",
          fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          background: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 50% 45%, rgba(255,23,68,0.14), transparent 55%)",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 34 }}>
            Sentroy
          </div>
          <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1, color: "#ff1744" }}>404</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "14px 0 10px" }}>Page not found</h1>
          <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            The page you are looking for doesn&rsquo;t exist or has been moved.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: 32,
              padding: "12px 26px",
              borderRadius: 12,
              background: "#fafafa",
              color: "#0a0a0a",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Go home
          </a>
        </div>
      </body>
    </html>
  )
}
