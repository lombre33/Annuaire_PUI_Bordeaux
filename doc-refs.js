// Les passages de la documentation que les messages du widget citent : le texte qu'un message porte pour les nommer (« guide
// d'installation Grist, étape 4 « Règles d'accès » », lisible tel quel, sans nom de fichier) et où ils mènent dans la fenêtre
// « Documentation » (docs-ui.js). dom.js en fait des liens partout où un message s'affiche ; sans fenêtre, ce reste du texte. Un message
// écrit `(voir le ${DOC_REFS.access.text})`. tests/doc-refs.test.mjs garde chaque entrée d'accord avec les titres de GRIST_SETUP.md :
// renommer un titre sans corriger ici est une erreur que ce test attrape.
//
// Les messages de la console, eux, nomment le fichier (GRIST_SETUP.md, étape 4) : une console ne porte pas de lien, et celui qui la lit
// tient le document sous la main.

export const DOC_REFS = {
  // Les colonnes de BDD et d'Etablissements doivent être des colonnes de données, pas des colonnes à formule.
  columns: { text: 'guide d’installation Grist, étape 1 « Les colonnes que le widget écrit »', page: 'GRIST_SETUP.md', anchor: '1-les-colonnes-que-le-widget-écrit--des-colonnes-de-données' },
  // Les règles d'accès : lecture de la table ACL par un responsable, droits de chacun.
  access: { text: 'guide d’installation Grist, étape 4 « Règles d’accès »', page: 'GRIST_SETUP.md', anchor: '4-règles-daccès' },
  // La colonne logo d'Etablissements et le dépôt d'un fichier à la main dans Grist.
  logos: { text: 'guide d’installation Grist, étape 5 « Les logos des établissements »', page: 'GRIST_SETUP.md', anchor: '5-les-logos-des-établissements-facultatif' }
};
