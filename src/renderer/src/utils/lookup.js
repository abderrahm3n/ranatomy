import boneData from '../assets/bones.json'

const normalize = (str = '') => str.toLowerCase().replace(/[_\-\s]/g, '')

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
