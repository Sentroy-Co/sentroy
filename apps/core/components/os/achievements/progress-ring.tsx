"use client"

/**
 * Minimal dairesel ilerleme halkası — widget başlığı (mini) ve Achievements
 * penceresi (büyük) ortak kullanır. Renk `currentColor` üzerinden gelir;
 * track aynı rengin düşük opaklığı. `children` merkezde render edilir
 * (ör. "7/19").
 */
export function ProgressRing({
  value,
  size = 28,
  stroke = 3,
  className,
  children,
}: {
  /** 0..1 arası ilerleme. */
  value: number
  size?: number
  stroke?: number
  className?: string
  children?: React.ReactNode
}) {
  const clamped = Math.max(0, Math.min(1, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span
      className={"relative inline-flex shrink-0 items-center justify-center " + (className ?? "")}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-current opacity-20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="stroke-current transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center">{children}</span>
      ) : null}
    </span>
  )
}
