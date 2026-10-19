// Envoyer le fichier d'une modification (la photo d'un profil, le logo d'un établissement) puis relire l'état de la
// fiche avant d'écrire : l'envoi prend du temps, la fiche a pu bouger. Commun à profile-save.js et à
// etablissement-save.js ; aucun accès au DOM ni à Grist ici (`upload` et `recheck` viennent de l'appelant).
//
// `upload(file)` renvoie l'identifiant de la pièce jointe (upload.js). Son échec devient une `ErrorClass` : la phrase d'un
// UploadError telle quelle, sinon `fallback` (la cause va dans la console, sous `consoleLine`). `recheck()` relit l'état
// et le renvoie ; une `ErrorClass` qu'elle lève porte alors l'identifiant du fichier envoyé (`leftover`), que l'écriture
// n'utilisera pas et qui reste dans les pièces jointes du document.
// Renvoie { attachmentId, state }.
export async function uploadThenRecheck(file, { upload, recheck, ErrorClass, fallback, consoleLine, log }) {
  let attachmentId;
  try {
    attachmentId = await upload(file);
  } catch (error) {
    if (error?.name === 'UploadError') throw new ErrorClass(error.message, error);
    log.error(consoleLine, error);
    throw new ErrorClass(fallback, error);
  }
  try {
    return { attachmentId, state: await recheck() };
  } catch (error) {
    if (error instanceof ErrorClass) error.leftover = attachmentId;
    throw error;
  }
}
