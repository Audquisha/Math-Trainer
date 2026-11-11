export const RANKS = [
  { short: 'K', label: 'Kindergarten', color: '#b87333' },
  { short: '1', label: '1st Grade', color: '#9ca3af' },
  { short: '2', label: '2nd Grade', color: '#eab308' },
  { short: '3', label: '3rd Grade', color: '#7c93b8' },
  { short: '4', label: '4th Grade', color: '#34d399' },
  { short: '5', label: '5th Grade', color: '#60a5fa' },
  { short: '6', label: '6th Grade', color: '#f97316', fire: true },
]

export function rankInfo(rank) {
  return RANKS[Number.isInteger(rank) ? rank : 0] ?? RANKS[0]
}
