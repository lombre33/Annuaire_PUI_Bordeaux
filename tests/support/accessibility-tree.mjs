// L'arbre d'accessibilité tel que le navigateur le calcule (protocole DevTools), nœud par nœud : c'est lui que lit un lecteur d'écran,
// et le HTML seul ne dit pas ce qu'il en fait (un nom tiré d'`aria-label`, une description tirée d'un élément masqué, une zone
// vivante). Les nœuds ignorés (masqués, décoratifs) n'y figurent pas.
//
// Chaque nœud : { role, name, description, backendDOMNodeId, … } puis ses états et propriétés ARIA (`expanded`, `checked`, `live`,
// `busy`…), tels que Chromium les nomme. Optionnel comme les autres tests navigateur : nécessite Chromium (voir TESTING.md).

export async function accessibilityTree(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    return nodes.filter(node => !node.ignored).map(node => ({
      role: node.role?.value,
      name: node.name?.value ?? '',
      description: node.description?.value ?? '',
      backendDOMNodeId: node.backendDOMNodeId,
      ...Object.fromEntries((node.properties ?? []).map(property => [property.name, property.value?.value]))
    }));
  } finally {
    await session.detach();
  }
}

// Le premier nœud d'un rôle et d'un nom : `name` est le nom entier, pas un morceau.
export const accessibleNode = (tree, role, name) => tree.find(node => node.role === role && node.name === name);
