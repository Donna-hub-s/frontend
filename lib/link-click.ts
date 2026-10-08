// Un clic « ordinaire » sur un lien : bouton principal, aucune touche modificatrice. C'est lui qui ouvre l'aperçu d'un lien
// dans une phrase ; Ctrl/Cmd/Maj/Alt ou le bouton du milieu gardent le comportement du navigateur (nouvel onglet, fenêtre,
// téléchargement…), que personne ne s'attend à voir remplacé.

export type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean };

export function isPlainClick(event: ClickLike): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
