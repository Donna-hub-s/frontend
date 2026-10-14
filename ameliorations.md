# Améliorations frontend — corrections techniques et UX

Document de travail (hors site MkDocs à dessein, pour ne pas le soumettre à `mkdocs build --strict`).
Références `fichier:ligne` volontairement incluses.

---

## Partie A — Corrections techniques

### A1. Performance : le contexte monolithique re-rend tout à chaque token (priorité haute)
- La valeur de `WorkspaceProvider` est mémorisée avec ~50 dépendances (`workspace-provider.tsx:707-792`) et **15 composants** consomment `useWorkspace()` (aucun `React.memo`).
- Le flux met à jour `threads` **à chaque delta** (`chat-run.ts:229` → `patchThread` → `setThreads`), donc la valeur du contexte change à chaque token → tout le sous-arbre re-rend pendant une réponse.
- Corrections possibles : scinder le contexte (état vs actions stables) ; ou store externe + sélecteurs (`useSyncExternalStore`, déjà utilisé pour thème/voix/horloge) ; a minima `React.memo` + sous-contextes (séparer les `threads`).

### A2. En-têtes de sécurité absents
- `next.config.ts:7` : `poweredByHeader: true` → fuite de `X-Powered-By: Next.js`. À passer à `false`.
- Aucun CSP / `X-Frame-Options` / `frame-ancestors` / `X-Content-Type-Options` / `Referrer-Policy` (`grep` négatif). Ajouter un bloc `headers()` (CSP avec nonce pour les scripts Next) — défense en profondeur du rendu Markdown non fiable.

### A3. Défaut `DONNA_API_URL` incohérent avec `make dev`
- Défaut `http://localhost:8000` codé dans `lib/backend.ts:8`, `proxy.ts:5`, `app/[lang]/app/layout.tsx:15` et `frontend/README.md`, alors que `make dev` écoute **8080** (`makefile:24`). Sans `.env`, le dev pointe vers un port mort.
- Correction : aligner le défaut sur `8080` (ou documenter `.env` obligatoire).

### A4. WebSocket sans heartbeat applicatif
- `lib/use-project-ws.ts` ne se repose que sur `onclose`/`onerror` (pas de ping/pong ni de timeout de silence). Une demi-connexion TCP ouverte peut ne pas déclencher de reconnexion.
- Ajouter un ping applicatif + détection d'inactivité ; le backoff et le re-ticket sont déjà corrects (`use-project-ws.ts:53-67`).

### A5. Allowlist du proxy plus large que la promesse
- `/^chat(\/|$)/`, `/^profile(\/|$)/`, `/^workflows(\/|$)/` (`app/api/donna/[...path]/route.ts:12-31`) laissent passer toute méthode sous ces préfixes. Non exploitable (le backend autorise) mais à resserrer méthode+chemin exact si possible.

### A6. Couverture de test des composants
- Les composants les plus gros ne sont pas testés en rendu : `conversation.tsx` (1953 l.), `project-detail.tsx` (1511 l.). Les tests se limitent à `oauth-link-notice`, `home-screen`, etc.
- Ajouter quelques tests de rendu sur les chemins critiques (streaming, approbations, conflit canvas).

### A7. Détails mineurs
- `next.config.ts` : `experimental.scrollRestoration: true` (flag expérimental, sensible aux versions).
- Élagage des `threads` (`workspace-provider.tsx:220-226`) peut dépasser `THREAD_LIMIT` si beaucoup de fils `busy`/actifs (`continue` sans retirer).
- Double chargement skills/profil au démarrage (`workspace-provider.tsx:358-371`) alors que `getMe()` est déjà chargé côté serveur.

---

## Partie B — Corrections UX : vers un « bureau » où l'on reste

### North star
Un **bureau unique où DONNA travaille à côté de vous** :
1. Tout document est un **onglet persistant**, jamais une modale éphémère.
2. **DONNA est un coéquipier dans le document** (elle lit ce que vous éditez et propose, au même endroit).
3. **Zéro jargon** : WYSIWYG par défaut, Markdown/code en option.

### Ce qui existe déjà (à réutiliser, pas à refaire)
- Édition co-partagée avec DONNA + versions + diff + restauration + résolution de conflit (`canvas-panel.tsx`, `lib/canvas.ts:115-158`).
- Export **md / docx / pdf** + impression (`canvas-panel.tsx:335-373`).
- Aperçu PDF / image / Word / Excel / CSV / Markdown, lecture seule (`file-viewer.tsx`).
- Génération Word/Excel/PDF/Markdown par le serveur (`create_document`).
- Inventaire des livrables (`deliverables-page.tsx`).
- Accueil de reprise déjà pensé (`home-screen.tsx:63-160`).

### B0 (priorité haute) — Espace « Documents » à onglets
- Remplacer la **modale** `FileViewer` (`file-viewer.tsx:63-70`) par un panneau/route persistant à onglets, ouvert depuis les livrables, les pièces jointes et les projets.
- Depuis « Mes livrables », un clic sur un canvas doit ouvrir **directement l'édition** (aujourd'hui il renvoie vers la conversation : `deliverables-page.tsx:320`).
- Le canvas ne doit plus dépendre d'une conversation pour être trouvé (`canvas-panel.tsx:42-45`).

### B1 — Édition réelle, sans complexifier
- **Tableur** éditable (grille, copier/coller, formules simples) en réutilisant `read-excel-file` + `fflate` (déjà présents) ; réexport `.xlsx`/`.csv`.
- **Texte enrichi WYSIWYG** sur le canvas ; le serveur sait déjà rendre (`chat/src/document_render.py`). Markdown reste un mode avancé (`tabWrite` actuel).
- Conserver tel quel l'enregistrement automatique + versions (`lib/canvas.ts`).

### B2 — DONNA dans le document
- Édition **inline** : sélectionner du texte → « améliorer / résumer / traduire » dans la marge, sans quitter le document.
- DONNA écrit dans le **même** document que l'onglet affiché (conflit et historique déjà gérés).
- Bouton « Ouvrir dans le bureau » depuis toute réponse produisant un fichier.

### B3 — Engagement sain (le « prétexte de rester »)
- **Reprise** : enrichir `recent` + `HomeActivity` d'un résumé « À traiter aujourd'hui » (approbations + rappels + travaux en cours).
- **Modèles** : galerie de documents types (compte-rendu, facture, plan, budget) que DONNA remplit.
- **Raccourcis contextuels** dans l'onglet : « demander à DONNA » avec le document en contexte.

### Pièges à éviter
- Ne pas transformer l'espace documents en usine à gaz : un seul espace, des onglets, un bouton ; la complexité reste cachée.
- Pas de gamification sombre (streaks, badges) : l'attachement doit venir de l'utilité (reprise instantanée, travail non perdu).
- Sécurité inchangée : contenu non fiable (`sanitizeHtml`, `document_render.py` en liste blanche) ; l'édition n'ouvre ni évaluation de scripts ni liens externes.

---

## Récapitulatif des priorités

| Priorité | Correction | Lot |
|---|---|---|
| Haute | Espace documents à onglets, canvas discoverable | B0 |
| Haute | Contexte scindé / sélecteurs (perf streaming) | A1 |
| Haute | En-têtes de sécurité + `poweredByHeader: false` | A2 |
| Moyenne | Défaut `DONNA_API_URL` = 8080 | A3 |
| Moyenne | Éditeurs tableur + WYSIWYG | B1 |
| Moyenne | Heartbeat WebSocket | A4 |
| Basse | DONNA dans le document (inline) | B2 |
| Basse | Modèles, résumé « à traiter », raccourcis | B3 |
| Basse | Resserrer `ALLOWED`, tests de rendu, détails mineurs | A5-A7 |
