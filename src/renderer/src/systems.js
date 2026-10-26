// systems.js
export const SYSTEMS = [
  { key: 'skeletal', label: 'Squelette', icon: 'ti-bone', shortcut: 'S' },
  { key: 'cardiovascular', label: 'Cardiovasculaire', icon: 'ti-heartbeat', shortcut: 'C' },
  { key: 'muscular', label: 'Musculaire', icon: 'ti-anatomy', shortcut: 'M' },
  { key: 'nervous', label: 'Nerveux', icon: 'ti-brain', shortcut: 'N' },
  { key: 'ligcart',label: 'ligcart', shortcut: 'L'}
]

export const SYSTEM_MAP = Object.fromEntries(SYSTEMS.map((s) => [s.key, s]))

export const SYSTEM_SHORTCUTS = new Map(
  SYSTEMS.filter((s) => s.shortcut).map((s) => [s.shortcut.toLowerCase(), s.key])
)
