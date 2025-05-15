# jeTePartage

jeTePartage est une application web simple et élégante pour partager des fichiers rapidement et facilement sur un réseau local.

![jeTePartage Screenshot](screenshot.png)

## Fonctionnalités

- 🚀 Interface utilisateur moderne et responsive
- 🌓 Mode sombre / mode clair
- 📁 Glisser-déposer pour l'envoi de fichiers
- 🔍 Recherche et tri de fichiers
- 📊 Affichage des métadonnées (taille, date d'ajout)
- 📱 Compatible mobile et tablette
- 🖼️ Aperçu des images, vidéos et audios
- 🔔 Notifications visuelles pour les actions

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/alaminedione/jeTePartage.git
cd jeTePartage

# Installer les dépendances
npm install

# Démarrer le serveur
node index.js
```

L'application sera disponible à l'adresse http://localhost:3000

## Utilisation

1. **Accès** : Ouvrez votre navigateur à l'adresse http://localhost:3000
2. **Partage** : Glissez-déposez des fichiers ou cliquez sur la zone d'upload
3. **Téléchargement** : Cliquez sur un fichier pour voir ses détails et le télécharger

## Partage sur le réseau local

Pour partager des fichiers avec d'autres appareils du même réseau :

1. Obtenez l'adresse IP de votre machine (`ipconfig` sous Windows, `ifconfig` sous Linux/Mac)
2. Les autres appareils peuvent accéder à l'application via `http://VOTRE_IP:3000`

## Configuration

Vous pouvez modifier le port d'écoute en définissant la variable d'environnement PORT :

```bash
PORT=8080 node index.js
```

## Sécurité

⚠️ Cette application est conçue pour un usage sur un réseau local sécurisé. Elle ne fournit pas d'authentification ou de chiffrement des données.

## Personnalisation

Modifiez le fichier `public/style.css` pour personnaliser l'apparence de l'application selon vos préférences.

## Technologie

- Backend : Node.js avec Express
- Frontend : JavaScript vanilla, CSS3, HTML5
- Gestion des uploads : Multer

## Licence

Distribué sous licence MIT. Voir le fichier `LICENSE` pour plus d'informations.

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou à soumettre une pull request.

1. Forkez le projet
2. Créez votre branche de fonctionnalité (`git checkout -b feature/amazing-feature`)
3. Commitez vos changements (`git commit -m 'Add some amazing feature'`)
4. Pushez vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request
