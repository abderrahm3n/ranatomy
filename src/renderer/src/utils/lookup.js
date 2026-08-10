import boneData from '../assets/bones1.json';

// normalize mesh names so casing/underscores don't break matches
const normalize = (str) => str.toLowerCase().replace(/[_\-\s]/g, '');

// Build a map: normalized alias -> bone entry
const aliasMap = new Map();
boneData.forEach((bone) => {
  bone.meshAliases.forEach((alias) => {
    aliasMap.set(normalize(alias), bone);
  });
});

export function findBoneByMeshName(meshName) {
  const norm = normalize(meshName);

  // exact match first
  if (aliasMap.has(norm)) return aliasMap.get(norm);

  // fallback: partial match (handles names like "Bone_Femur_L_002")
  for (const [alias, bone] of aliasMap) {
    if (norm.includes(alias)) return bone;
  }
  return null;
}
