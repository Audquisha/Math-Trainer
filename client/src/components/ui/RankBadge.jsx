const HEXAGON = 'M48 6 84.4 27v42L48 90 11.6 69V27z'

export default function RankBadge({ rank, className = '' }) {
  const paint = rank.fire ? 'url(#rank-fire)' : rank.color

  return (
    <svg viewBox="0 0 96 96" role="img" aria-label={`${rank.label} rank`} className={className}>
      {rank.fire && (
        <defs>
          <linearGradient id="rank-fire" gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="0" y2="6">
            <stop offset="0" stopColor="#facc15" />
            <stop offset="0.55" stopColor="#f97316" />
            <stop offset="1" stopColor="#dc2626" />
          </linearGradient>
        </defs>
      )}
      <path d={HEXAGON} className="fill-bg" />
      <path d={HEXAGON} fill={rank.color} fillOpacity="0.15" stroke={paint} strokeWidth="6" strokeLinejoin="round" />
      <text x="48" y="60" textAnchor="middle" fontSize="34" fontWeight="600" fill={paint}>{rank.short}</text>
    </svg>
  )
}
