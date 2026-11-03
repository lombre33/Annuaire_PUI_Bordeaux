# La police du widget : Inter

`inter-400.woff2`, `inter-600.woff2`, `inter-700.woff2` et `inter-800.woff2` sont les graisses normale, demi-grasse, grasse et
extra-grasse de **Inter 4.0** (« Version 4.000;git-a52131595 »), de The Inter Project Authors, sous licence **SIL Open Font
License 1.1** : le texte est dans `LICENSE.txt`, à garder à côté des fichiers (la licence l'exige pour toute copie distribuée).
La mention de droits d'auteur et la licence sont aussi écrites dans les métadonnées de chaque fichier.

Ce sont des **sous-ensembles** (environ 400 signes sur 2 900) : les lettres latines et leurs accents, la ponctuation, les
guillemets, les tirets, le signe moins, les flèches, la coche et l'euro. Un signe absent des fichiers (par exemple ☎ ou ▾, que
l'Inter d'origine n'a pas non plus) s'affiche dans la police du système. Les fichiers ne contiennent ni italique ni graisse
intermédiaire : la feuille de style demande 650 et 750 à certains endroits, qui tombent sur 700 et 800.

## Les refaire

Les fichiers viennent des polices `Inter-Regular.otf`, `Inter-SemiBold.otf`, `Inter-Bold.otf` et `Inter-ExtraBold.otf` du paquet
Debian `fonts-inter` 4.0, réduites avec fonttools (`pip install fonttools brotli`), pour chaque graisse :

```text
pyftsubset Inter-Regular.otf --output-file=inter-400.woff2 --flavor=woff2 --no-hinting \
  --unicodes=U+0020-007E,U+00A0-00FF,U+0100-017F,U+02BC,U+02C6,U+02DC,U+2010-2015,U+2018-201E,U+2020-2022,U+2026,U+2030,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212,U+2713 \
  --layout-features=calt,ccmp,clig,curs,kern,liga,locl,mark,mkmk,rclt,rlig,rvrn
```

Pour ajouter un signe, l'ajouter à `--unicodes`, refaire les quatre fichiers et vérifier qu'aucun ne dépasse 30 Ko
(`tests/fonts.test.mjs`).
