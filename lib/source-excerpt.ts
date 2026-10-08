// Extrait lisible d'un passage de document, pour les cartes « Sources » sous une réponse.
//
// Le passage brut (texte indexé, ~800 caractères) a deux défauts d'affichage : il peut commencer au milieu d'un mot
// (les passages indexés avant le correctif du découpage se chevauchaient sur une tranche de caractères : « xercice 2… »,
// « s, amplificateur… ») et il garde les retours à la ligne de l'extraction des PDF, qui coupent les phrases en deux.

const MID_WORD_START = /^[a-zà-öø-ÿœ,;:.)\]]/;

/** Le texte sur une seule ligne, sans fragment de mot au début, borné à `max` caractères sur une frontière de mot.
 * Un passage qui commence correctement (majuscule, chiffre, puce) est laissé tel quel. */
export function readableExcerpt(raw: string | null | undefined, max = 260): string {
  const flat = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  let text = flat;
  if (MID_WORD_START.test(text)) {
    const firstSpace = text.indexOf(" ");
    // Le premier « mot » est un reste de mot coupé : on repart du suivant — sauf s'il ne reste rien.
    if (firstSpace > 0 && firstSpace < text.length - 1) text = text.slice(firstSpace + 1);
  }
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return `${text.slice(0, cut > max / 2 ? cut : max).trimEnd()}…`;
}
