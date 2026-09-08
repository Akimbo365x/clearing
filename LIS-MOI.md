# Mettre Clearing en ligne — glisser-déposer

## Ce que contient ce dossier

```
clearing-netlify/
├── index.html                  ← la page du scanner
├── netlify/functions/rpc.js    ← le relais serveur
└── LIS-MOI.md                  ← ce fichier
```

**Ne change rien à l'organisation des dossiers.** Le fichier `rpc.js` doit
rester dans `netlify/functions/`, sinon il ne sera pas reconnu comme une
fonction serveur et le scanner ne marchera pas.

## Les étapes

### 1. Dézippe le dossier

Tu dois obtenir un dossier nommé `clearing-netlify` contenant les trois
éléments ci-dessus. Repère bien où il se trouve sur ton ordinateur.

### 2. Crée un compte Netlify

Va sur **netlify.com**, clique **Sign up**. Un email et un mot de passe
suffisent. C'est gratuit, il n'y a pas de carte bancaire à donner.

### 3. Dépose le dossier

Une fois connecté, tu arrives sur ton tableau de bord.

- Cherche la zone **« Deploy manually »** ou **« Drag and drop your site
  output folder here »** (selon les versions, le texte change un peu)
- Fais glisser le dossier **`clearing-netlify` entier** dessus — le dossier,
  pas les fichiers qu'il contient
- Attends une trentaine de secondes

Netlify te donne une adresse du type `nom-aleatoire-123.netlify.app`.
**C'est ton site. Il est en ligne, accessible par n'importe qui.**

### 4. Teste

Ouvre l'adresse, colle une adresse de token, appuie sur Entrée.

Sous le formulaire, une petite ligne indique quel nœud a répondu. Si elle
affiche **« connecté via relais du site »**, tout fonctionne comme prévu.

### 5. Change le nom (facultatif, 30 secondes)

Le nom aléatoire est moche. Dans **Site configuration → Change site name**,
mets ce que tu veux : tu obtiens `clearing.netlify.app` si c'est libre.

Un vrai domaine à toi (une dizaine d'euros par an) pourra être branché plus
tard dans **Domain management**.

## Pour modifier le site ensuite

Tu modifies `index.html` dans ton éditeur, puis tu refais glisser le dossier
au même endroit. Netlify remplace la version précédente.

C'est la limite de cette méthode : il faut reglisser à chaque changement.
Quand ça deviendra pénible, on passera à GitHub — et là ça se republiera tout
seul à chaque modification.

## Si ça ne marche pas

Dans Netlify : onglet **Logs** → **Functions**. Tu lances une analyse sur le
site, tu regardes ce qui s'affiche, tu me copies le message.

Les deux erreurs les plus probables :

- **404 sur /api/rpc** — le dossier `netlify/functions` n'est pas au bon
  endroit, ou tu as déposé les fichiers au lieu du dossier
- **502** — les nœuds publics sont saturés à cet instant ; réessaie une minute
  après

## Limite à connaître

Les nœuds publics plafonnent vers 5 requêtes par seconde, partagées entre tous
leurs utilisateurs. Une analyse = 4 appels. Ça tient largement pour tes premiers
utilisateurs. Le jour où ça sature, une clé Helius gratuite dans les variables
d'environnement règle le problème sans rien changer d'autre.
