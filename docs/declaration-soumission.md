# La Coloc : déclarations de soumission (CADEV, art. 6)

Le formulaire de soumission de la plateforme ne demande que le lien live, la vidéo, le dépôt et le produit Systalink. Le règlement demande en plus trois déclarations « lors de la soumission » : elles sont réunies ici, et ce fichier est joint à la page du projet.

Projet : La Coloc, https://lacoloc-dev.duckdns.org, code sur https://github.com/djbrl/la-coloc.
Participant : Djibril Sy (Jib).

## 1. Titularité

Je déclare que La Coloc a été créé en dehors de toute mission confiée par un employeur, un client ou un établissement d'enseignement susceptible d'en revendiquer les droits. Le projet a été commencé pour le Concours, le 2 octobre 2026, et ne reprend aucun code antérieur.

## 2. Composants tiers et licences

- **Code :** toutes les dépendances npm sont sous licence permissive (MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Unlicense). Aucune licence GPL, AGPL ou LGPL. La commande `npm run licences:check` le vérifie et passe sur la version soumise.
- **Polices :** Bricolage Grotesque, JetBrains Mono, Archivo Black et Caveat Brush, sous SIL Open Font Licence 1.1, qui autorise leur intégration dans un logiciel, y compris commercial.
- **Modèles 3D :** les kits City Kit et Mini Characters de Kenney, sous CC0 (domaine public). Les images du site (rue de la page d'accueil, aperçus de partage) sont des rendus faits par notre code à partir de ces modèles.
- **Données :** la base de pays DB-IP Lite, sous CC-BY-4.0, avec l'attribution demandée.
- **Paiement :** PayDunya, en mode test (sandbox), appelé par son API.
- **Environnement d'exécution, ni distribué ni modifié :** Linux, Docker, Traefik, Caddy et PostgreSQL font tourner la solution sur le serveur Datacloud ; ils ne font pas partie de son code.

La liste complète, avec les sources, est dans `docs/licences.md`.

## 3. Intelligence artificielle

**Outil utilisé :** Claude Code, l'assistant de programmation d'Anthropic, avec les modèles Claude Opus 5.5 (la plus grande partie), Claude Fable 5.1 et Claude Sonnet 5.5. Pour les gros chantiers, il a parfois lancé plusieurs agents en parallèle, chacun sur des fichiers distincts.

**Parties du projet produites avec l'IA :**
- la plus grande partie du code : le site (Vue et three.js), l'API (NestJS), le gardien qui pilote Docker sur le serveur, la base de données, les scripts de déploiement et les tests ;
- la documentation technique (`docs/`) et le journal de construction (`docs/build-notes.md`) ;
- les textes de l'interface, en français et en anglais ;
- des recherches techniques, par exemple sur l'API de PayDunya.

**Ce que j'ai fait moi-même :** l'idée et le concept, chaque décision produit, la direction visuelle, la relecture de chaque écran, et les tests de bout en bout sur le serveur réel. L'IA a écrit à partir de mes instructions, et j'ai fait refaire ce qui ne convenait pas.

**Maîtrise de la solution :** l'IA a écrit la plupart des lignes, et je dois pouvoir en expliquer chaque partie. Le détail, date par date, de ce que l'IA a produit est dans `docs/ai-usage.md`. Les guides de lecture sont `docs/architecture.md`, et `docs/ssh-walkthrough.md` pour l'accès SSH.

Cet usage respecte les conditions d'utilisation d'Anthropic et ne porte pas atteinte aux droits de tiers.
