// Les faux serveurs de pièces jointes (tests/support/fake-attachments.mjs, tests/support/grist-rest-server.mjs) et le serveur de
// démonstration (docs/demo/serveur-demo.mjs) lisent ainsi le fichier que le widget leur envoie.

// Le fichier d'un envoi `multipart/form-data` : { field, fileName, contentType, bytes }, ou null si le corps n'en porte pas. `body`
// : un Buffer ; `contentType` : l'en-tête de la requête, qui donne la frontière. Les octets sont lus en latin1 pour que la position
// dans le texte soit celle dans le fichier.
export function readMultipartFile(body, contentType) {
  const boundary = /boundary=(.+)$/.exec(contentType ?? '')?.[1];
  if (!boundary || !body) return null;
  const text = body.toString('latin1');
  const start = text.indexOf(`--${boundary}`);
  const headerEnd = text.indexOf('\r\n\r\n', start);
  const end = text.indexOf(`\r\n--${boundary}`, headerEnd + 4);
  if (start < 0 || headerEnd < 0 || end < 0) return null;
  const head = text.slice(start, headerEnd);
  return {
    field: /name="([^"]*)"/.exec(head)?.[1] ?? '',
    fileName: /filename="([^"]*)"/.exec(head)?.[1] ?? '',
    contentType: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? '',
    bytes: body.subarray(headerEnd + 4, end)
  };
}
