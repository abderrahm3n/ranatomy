// systems.js
export const SYSTEMS = [
  { key: 'skeletal', label: 'Squelette', icon: 'ti-bone' },
  { key: 'cardiovascular', label: 'Cardiovasculaire', icon: 'ti-heartbeat' },
  { key: 'muscular',   label: 'Musculaire',        icon: 'ti-anatomy' },
  { key: 'nervous',    label: 'Nerveux',           icon: 'ti-brain'}
]

export const SYSTEM_MAP = Object.fromEntries(SYSTEMS.map((s) => [s.key, s]))
