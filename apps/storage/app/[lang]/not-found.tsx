import Link from "next/link"

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div
          style={{
            fontSize: 140,
            fontWeight: 800,
            lineHeight: 1,
            background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 16,
          }}
        >
          404
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>
          Page not found
        </h1>
        <p style={{ opacity: 0.6, fontSize: 15, lineHeight: 1.6, margin: "0 0 32px" }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: 9999,
            border: "1px solid currentColor",
            opacity: 0.5,
            textDecoration: "none",
            color: "inherit",
            fontSize: 14,
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
