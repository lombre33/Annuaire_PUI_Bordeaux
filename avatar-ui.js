// La photo de profil d'une personne et tout ce qui la montre : l'avatar des cartes, du bandeau « Ma
// présence » et des fenêtres, la miniature du récapitulatif des changements et la fenêtre qui
// l'agrandit. La photo remplace les initiales quand la personne en a une et que Grist la donne ; sans
// photo, avec un fichier supprimé ou illisible, ou sans jeton, ce sont les initiales, comme avant la
// 1.18.0. DOM seulement : ce qui est montré vient de l'appelant, et tout texte venu de Grist (un nom)
// passe par textContent ou par un attribut.
//
// Une photo (`photo`) est :
//   - l'identifiant d'une pièce jointe de Grist (la colonne Avatar de BDD, voir avatarIdOf dans
//     attachments.js) : `attachments` (attachments.js) en donne l'adresse et le jeton ;
//   - ou { url } pour une image que la page détient déjà : la photo qu'on vient de choisir, pas encore
//     dans Grist. Seule une adresse `blob:` (fabriquée par le navigateur) est acceptée : une photo ne
//     fait jamais charger une adresse extérieure ;
//   - ou 0 / rien : pas de photo.

import { createLogoImage } from './branding-ui.js';
import { el } from './dom.js';

// La photo, ramenée à { id } (pièce jointe de Grist) ou { url } (image locale) ; null sans photo.
export function photoSource(photo) {
  if (Number.isInteger(photo) && photo > 0) return { id: photo };
  const url = photo && typeof photo === 'object' ? photo.url : '';
  return typeof url === 'string' && url.startsWith('blob:') ? { url } : null;
}

// Vrai quand la photo peut être montrée : elle existe et, si c'est une pièce jointe, `attachments` en
// donne le chemin.
const showable = (source, attachments) => source !== null && (source.id === undefined || Boolean(attachments));

// L'<img> d'une photo. Une pièce jointe passe par createLogoImage (branding-ui.js) : jeton renouvelé
// s'il a expiré, image invisible tant qu'elle n'est pas chargée. `onFail` est appelé une fois, quand
// la photo ne peut pas être montrée.
function photoImage(source, attachments, { alt = '', eager = false, onLoad, onFail }) {
  if (source.id !== undefined) return createLogoImage(attachments, source.id, alt, onFail, { eager, onLoad });
  const image = document.createElement('img');
  image.className = 'logo-img';
  image.alt = alt;
  image.decoding = 'async';
  image.draggable = false;
  image.addEventListener('load', () => {
    onLoad?.(image);
    image.classList.add('loaded');
  });
  image.addEventListener('error', onFail);
  image.src = source.url;
  return image;
}

// Remplit un avatar (`.avatar`, rond) : les initiales d'abord, la photo par-dessus dès qu'elle est
// chargée (classe `has-photo`, qui cache les initiales). Si elle ne se charge pas, les initiales
// restent et `onFail` est appelé. Renvoie vrai quand une photo est en cours de chargement.
export function fillAvatar(element, { initials, photo = 0, attachments = null, onFail } = {}) {
  element.classList.remove('has-photo');
  element.textContent = initials;
  const source = photoSource(photo);
  if (!showable(source, attachments)) return false;
  const image = photoImage(source, attachments, {
    onLoad: () => element.classList.add('has-photo'),
    onFail: () => {
      image.remove();
      element.classList.remove('has-photo');
      onFail?.();
    }
  });
  image.classList.add('avatar-img');
  element.append(image);
  return true;
}

// Un avatar tout fait. Avec `zoom` ({ name, detail }) et une photo de Grist, c'est un bouton qui
// l'agrandit (classe `avatar-zoom`, écouté une seule fois par la page, voir main.js) : il porte
// l'identifiant de la photo et la légende en data-*, de quoi ouvrir la fenêtre sans rien chercher.
// Sans photo, ou si elle ne se charge pas, c'est un simple rond d'initiales, que les lecteurs d'écran
// ignorent.
export function createAvatar({ initials, photo = 0, attachments = null, zoom = null }) {
  const source = photoSource(photo);
  if (!zoom || !showable(source, attachments) || source.id === undefined) {
    const avatar = el('div', 'avatar');
    avatar.setAttribute('aria-hidden', 'true');
    fillAvatar(avatar, { initials, photo, attachments });
    return avatar;
  }
  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'avatar avatar-zoom';
  avatar.title = 'Agrandir la photo';
  avatar.setAttribute('aria-label', `Agrandir la photo de ${zoom.name}`);
  avatar.dataset.photo = String(source.id);
  avatar.dataset.name = zoom.name;
  avatar.dataset.detail = zoom.detail ?? '';
  fillAvatar(avatar, { initials, photo, attachments, onFail: () => avatar.replaceWith(createAvatar({ initials })) });
  return avatar;
}

// La miniature d'une photo dans le récapitulatif des changements (« Photo actuelle », « Nouvelle
// photo ») : un bouton qui l'agrandit en appelant `onOpen`. null quand il n'y a rien à montrer.
export function createThumb({ photo, attachments = null, label, onOpen }) {
  const source = photoSource(photo);
  if (!showable(source, attachments)) return null;
  const thumb = document.createElement('button');
  thumb.type = 'button';
  thumb.className = 'thumb';
  thumb.title = 'Agrandir';
  thumb.setAttribute('aria-label', `Agrandir : ${label}`);
  thumb.append(photoImage(source, attachments, {
    eager: true,
    onFail: () => thumb.replaceWith(el('span', 'none', 'photo illisible'))
  }));
  thumb.addEventListener('click', onOpen);
  return thumb;
}

// La fenêtre qui agrandit une photo (#photoDialog de index.html : .photo-stage reçoit l'image,
// .photo-cap la légende). Un clic sur la photo, à côté de la fenêtre ou sur la croix la ferme, comme
// Échap ; le navigateur rend alors le focus à ce qui l'avait ouverte.
//   open({ photo, name, detail })   `name` : le nom de la personne ; `detail` : sa fonction et son
//                                   établissement, ou « Photo actuelle » / « Nouvelle photo »
export function createPhotoViewer(dialog, attachments) {
  const stage = dialog.querySelector('.photo-stage');
  const caption = dialog.querySelector('.photo-cap');

  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('.photo-stage')) dialog.close();
  });
  dialog.addEventListener('close', () => stage.replaceChildren());

  return {
    open({ photo, name, detail = '' }) {
      const source = photoSource(photo);
      if (!showable(source, attachments)) return;
      const image = photoImage(source, attachments, {
        alt: `Photo de ${name}`,
        eager: true,
        onFail: () => stage.replaceChildren(el('p', 'photo-fail', 'La photo n’a pas pu être chargée.'))
      });
      image.classList.add('photo-img');
      stage.replaceChildren(image);
      caption.replaceChildren(name);
      if (detail) caption.append(el('small', '', detail));
      if (!dialog.open) dialog.showModal();
    }
  };
}
