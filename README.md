# Kanban Story Forge

Kanban Story Forge est une application TypeScript/Vite generique pour piloter un backlog de User Stories.

Elle fournit une base autonome pour organiser et suivre des User Stories :

- un tableau kanban par statut ;
- une User Story sous forme de fiche structuree ;
- les criteres DOR/DOD ;
- la recherche globale ;
- la creation et l'edition d'US ;
- l'import/export JSON ;
- l'export Markdown d'une US.

## Commandes

```powershell
npm install
npm run dev
```

Puis ouvrir :

```txt
http://127.0.0.1:5190/
```

## Persistance

En mode developpement, les donnees sont stockees dans des fichiers JSON separes :

```txt
data/stories/US-0001.json
data/stories/US-0002.json
data/stories/...
```

L'application passe automatiquement par l'API Vite locale `GET/PUT/DELETE /api/stories`.

Si cette API n'est pas disponible, par exemple apres un build statique servi sans serveur Node, l'application bascule sur le `localStorage` du navigateur. L'export JSON reste disponible comme sauvegarde portable.
