# DONNA — frontend

Interface web de DONNA : page d'accueil, comptes et espace de travail.
Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, TypeScript.

## Démarrer

Le backend doit tourner (`make dev` à la racine, API sur `http://localhost:8080`).

```sh
npm install
cp .env.example .env.local   # facultatif : les valeurs par défaut conviennent en local
npm run dev                  # http://localhost:3000
```

Depuis la racine du dépôt : `make frontend-install` puis `make frontend-dev`.

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` puis `npm run start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Vérification des types |

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `DONNA_API_URL` | `http://localhost:8080` | API DONNA vue par le serveur Next (Server Actions, `proxy.ts`, route `/api/donna`) |
| `DONNA_API_PUBLIC_URL` | `DONNA_API_URL` | API vue par le navigateur (démarrage de la connexion Google) |

Côté backend, `XAUTH_WEB_APP_URL` et `XAUTH_OAUTH_WEB_REDIRECT_ORIGINS` doivent pointer vers
l'adresse de ce frontend (retour de la connexion Google, liens des emails).

## Pages

| Route | Contenu |
|---|---|
| `/fr`, `/en` | Page d'accueil |
| `/[lang]/login`, `/signup` | Connexion (email, Google, vérification en deux étapes) et inscription |
| `/[lang]/forgot-password`, `/reset-password` | Mot de passe oublié |
| `/[lang]/welcome`, `/workspaces` | Création ou choix d'un espace de travail |
| `/[lang]/app`, `/[lang]/app/c/[id]` | Espace de travail : conversations, étapes en direct, validations, connecteurs |

## Architecture

```
app/
  [lang]/                 pages traduites (layout racine, dictionnaires fr.json / en.json)
    (auth)/               pages de compte
    app/                  espace de travail (protégé)
  api/donna/[...path]/    passerelle navigateur → API DONNA
  auth/                   retour de la connexion Google
  oauth/[provider]/       démarrage de la connexion Google
components/
  brand/                  logo DONNA
  landing/                page d'accueil
  auth/                   formulaires de compte
  workspace/              barre latérale, conversation, panneau, recherche (Ctrl+K)
lib/                      appels API, session, flux SSE, règles partagées
i18n/                     langues et négociation
proxy.ts                  redirection de langue, protection de /app, renouvellement de session
```

### Session

Les jetons xauth ne sont jamais exposés au JavaScript de la page : ils vivent dans des cookies
`httpOnly` (`lib/session-cookies.ts`), posés par les Server Actions (`lib/auth-actions.ts`) et
le retour OAuth (`app/auth/route.ts`). Le navigateur appelle l'API via `/api/donna/…`, qui
ajoute le jeton côté serveur, relaie le flux SSE et renouvelle la session au besoin. Seules les
routes utiles à l'interface y sont autorisées.

### Traductions

Français par défaut, anglais disponible. Toute URL sans langue est redirigée selon le cookie
`donna-locale`, puis la langue du navigateur. Les textes sont dans
`app/[lang]/dictionaries/{fr,en}.json` : toute nouvelle chaîne s'ajoute dans les deux fichiers.

### Design

Tokens (couleurs, typographie, rayons, ombres, mouvement) dans `app/globals.css` (`@theme`).
Polices auto-hébergées dans `app/fonts` (Figtree, Jost — licence OFL). Illustrations unDraw
recolorées par `scripts/illustrations.mjs` (voir `public/illustrations/LICENCE.md`).

## Conventions

- Next.js 16 diffère des versions précédentes (`proxy.ts` remplace `middleware.ts`, API
  asynchrones) : se référer à `node_modules/next/dist/docs/`.
- Code, commentaires et textes en français ; composants sans état serveur marqués `"use client"`.
- Aucune fonctionnalité annoncée dans l'interface sans son équivalent réel côté backend.
