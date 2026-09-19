// systems.js
export const SYSTEMS = [
  { key: 'skeletal',      label: 'Squelette',         icon: 'ti-bone' },
  { key: 'cardiovascular', label: 'Cardiovasculaire', icon: 'ti-heartbeat' }
  // { key: 'muscular',   label: 'Musculaire',        icon: 'ti-anatomy',    color: '#F59E0B' },
  // { key: 'nervous',    label: 'Nerveux',           icon: 'ti-brain',      color: '#9b7ec9' },
]

export const SYSTEM_MAP = Object.fromEntries(SYSTEMS.map((s) => [s.key, s]))
