const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');

const app = express();
const port = process.env.PORT || 3000;

// Promisifier les fonctions fs
const stat = util.promisify(fs.stat);
const readdir = util.promisify(fs.readdir);

// Configuration du dossier de partage
const sharedFolder = path.join(__dirname, 'shared_files');

// Créer le dossier partagé s'il n'existe pas
if (!fs.existsSync(sharedFolder)) {
  fs.mkdirSync(sharedFolder);
}

// Configuration de Multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, sharedFolder);
  },
  filename: (req, file, cb) => {
    // Préserver le nom original du fichier
    cb(null, file.originalname);
  }
});

// Configurer les limites d'upload
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
  }
});

// Middleware pour parser le corps JSON des requêtes
app.use(express.json());

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Route pour servir les fichiers du dossier partagé
app.use('/files', (req, res, next) => {
  // Vérifier si on demande les statistiques du fichier
  if (req.query.stat === 'true') {
    const filePath = path.join(sharedFolder, req.params[0] || '');
    
    stat(filePath)
      .then(stats => {
        res.json({
          name: path.basename(filePath),
          size: stats.size,
          mtime: stats.mtime,
          ctime: stats.ctime,
          isDirectory: stats.isDirectory()
        });
      })
      .catch(err => {
        res.status(404).json({
          error: 'Fichier non trouvé',
          details: err.message
        });
      });
  } else {
    // Poursuivre avec le serveur de fichiers statiques
    next();
  }
});

// Servir les fichiers statiques du dossier partagé
app.use('/files', express.static(sharedFolder));

// Route pour récupérer la liste des fichiers avec leurs métadonnées
app.get('/files', async (req, res) => {
  try {
    const files = await readdir(sharedFolder);
    
    res.json(files);
  } catch (err) {
    res.status(500).json({
      error: 'Erreur lors de la lecture des fichiers',
      details: err.message
    });
  }
});

// Route pour télécharger un fichier spécifique
app.get('/files/:filename', (req, res) => {
  const filePath = path.join(sharedFolder, req.params.filename);
  
  res.download(filePath, (err) => {
    if (err) {
      res.status(404).json({
        error: 'Fichier non trouvé',
        details: err.message
      });
    }
  });
});

// Route pour envoyer des fichiers au serveur
app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'Aucun fichier n\'a été envoyé'
    });
  }
  
  res.json({
    success: true,
    message: `${req.files.length} fichier(s) téléchargé(s) avec succès`,
    files: req.files.map(file => ({
      name: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }))
  });
});

// Route pour supprimer un fichier
app.delete('/files/:filename', (req, res) => {
  const filePath = path.join(sharedFolder, req.params.filename);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(404).json({
        error: 'Fichier non trouvé ou impossible à supprimer',
        details: err.message
      });
    }
    
    res.json({
      success: true,
      message: 'Fichier supprimé avec succès'
    });
  });
});

// Middleware de gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Fichier trop volumineux',
        details: 'La taille maximale autorisée est de 100 MB'
      });
    }
  }
  
  res.status(500).json({
    error: 'Erreur interne du serveur',
    details: err.message
  });
});

// Démarrer le serveur
app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur "jeTePartage" en cours d'exécution sur http://0.0.0.0:${port}`);
  console.log(`Dossier de partage : ${sharedFolder}`);
});