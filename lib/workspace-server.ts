import "server-only";
import { cache } from "react";
import { getMe, listLinkedAccounts } from "./api";

/**
 * Identité affichée (barre latérale, accueil, bulles) : compte Google lié s'il existe,
 * sinon l'adresse email du compte. Aucun prénom n'est inventé. Mis en cache pour la requête.
 */
export const accountIdentity = cache(async () => {
  const [me, accounts] = await Promise.all([getMe(), listLinkedAccounts()]);
  const google = accounts.find((a) => a.provider === "google") ?? null;
  const email = me?.email ?? google?.provider_email ?? "";
  const fullName = google?.provider_name?.trim() || null;
  const base = fullName ?? email.split("@")[0];
  const initials =
    base
      .split(/[\s._-]+/)
      .filter((part) => /^\p{L}/u.test(part))
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || email.charAt(0).toUpperCase() || "?";
  return {
    name: fullName ?? email,
    email,
    firstName: fullName?.split(/\s+/)[0] ?? null,
    initials,
    googleConnected: google !== null,
  };
});
