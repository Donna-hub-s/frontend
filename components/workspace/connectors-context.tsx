"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ConnectorsOut } from "@/lib/workspace-types";

/**
 * L'état des connecteurs, chargé côté serveur par le layout (`getConnectors`) et jusque-là transmis par props au panneau latéral et aux
 * Réglages seulement. L'accueil en a besoin aussi, plus bas dans l'arbre : un contexte plutôt qu'une troisième cascade de props.
 * `null` : l'API n'a pas répondu — personne n'en déduit « non connecté ».
 */
const ConnectorsContext = createContext<ConnectorsOut | null>(null);

export const ConnectorsProvider = ({ value, children }: { value: ConnectorsOut | null; children?: ReactNode }) => (
  <ConnectorsContext.Provider value={value}>{children}</ConnectorsContext.Provider>
);

export const useConnectors = () => useContext(ConnectorsContext);
