// utils/lookup.js
import bones from '../assets/bones.json'
import cardio from '../assets/cardio.json'   // your cardio data, same shape

const TABLES = { skeletal: bones, cardiovascular: cardio }

//const normalize = (str = '') => str.toLowerCase().replace(/\./g, '')
function normalize(str) {
  if (typeof str !== 'string') return ''

  return str
    .trim()
    .toLowerCase()
    .normalize('NFD') // decompose accented letters
    .replace(/[\u0300-\u036f]/g, '') // remove combining diacritical marks
    .replace(/\s+/g, '') // remove all whitespace
    .replace(/[^a-z0-9]/g, '') // keep only letters and digits
}

export function findEntityByMeshName(meshName, system) {
  console.log('[lookup]', {
    meshName,
    system,
    tableLen: (TABLES[system] || []).length,
    tables: Object.keys(TABLES)
  })
  if (!meshName) return null

  const norm = normalize(meshName)
  const table = TABLES[system] || []

  // 1. Direct match check
  for (const entity of table) {
    const nameNorm = normalize(entity.name)
    const aliases = (entity.meshAliases || []).map(normalize)

    if (nameNorm === norm || aliases.includes(norm)) {
      return entity
    }
  }

  // 2. Partial match fallback
  for (const entity of table) {
    const nameNorm = normalize(entity.name)
    const aliases = (entity.meshAliases || []).map(normalize)

    if (
      (nameNorm && norm.includes(nameNorm)) ||
      aliases.some((alias) => alias && norm.includes(alias))
    ) {
      return entity
    }
  }

  return null
}
