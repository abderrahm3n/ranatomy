import boneData from '../assets/bones.json'

//const normalize = (str = '') => str.toLowerCase().replace(/\./g, '')
function normalize(str) {
  if (typeof str !== 'string') return '';

  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')                       // decompose accented letters
    .replace(/[\u0300-\u036f]/g, '')       // remove combining diacritical marks
    .replace(/\s+/g, '')                   // remove all whitespace
    .replace(/[^a-z0-9]/g, '');            // keep only letters and digits
}

const aliasMap = new Map()

boneData.forEach((bone) => {
  const aliases = bone.meshAliases || []
  aliases.forEach((alias) => {
    aliasMap.set(normalize(alias), bone)
  })
  if (bone.name) {
    aliasMap.set(normalize(bone.name), bone)
  }
})

export function findBoneByMeshName(meshName) {
  if (!meshName) return null
  const norm = normalize(meshName)

  if (aliasMap.has(norm)) return aliasMap.get(norm)

  for (const [alias, bone] of aliasMap) {
    if (norm.includes(alias)) return bone
  }
  return null
}
