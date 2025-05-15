const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');
const crypto = require('crypto');

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

// Fonction utilitaire pour normaliser et sécuriser les chemins
function sanitizePath(userPath) {
  // Nettoyer le chemin pour éviter le path traversal
  const cleanPath = path.normalize(userPath).replace(/^(\.\.[\/\\])+/, '');
  // Vérifier que le chemin ne sort pas du dossier partagé
  const normalizedPath = path.join('/', cleanPath);
  return normalizedPath.replace(/^\/+/, '');
}

// Configuration de Multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // The path comes from the URL, e.g., /upload/some/path
    // req.params[0] contains 'some/path'
    const uploadPath = req.params[0] || '';
    const sanitizedPath = sanitizePath(uploadPath);
    const destinationPath = path.join(sharedFolder, sanitizedPath);

    // Vérifier que le chemin ne sort pas du dossier partagé
    const resolvedPath = path.resolve(destinationPath);
    if (!resolvedPath.startsWith(path.resolve(sharedFolder))) {
      return cb(new Error('Chemin non autorisé'));
    }

    // Ensure the destination directory exists. Recursive creates parent directories as needed.
    fs.mkdir(destinationPath, { recursive: true }, (err) => {
        if (err) {
            console.error(`Error creating upload directory ${destinationPath}: ${err.message}`);
            return cb(err);
        }
        cb(null, destinationPath);
    });
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
    const sanitizedPath = sanitizePath(req.params[0] || '');
    const filePath = path.join(sharedFolder, sanitizedPath);
    
    // Vérifier que le chemin ne sort pas du dossier partagé
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(sharedFolder))) {
      return res.status(403).json({
        error: 'Accès refusé',
        details: 'Chemin non autorisé'
      });
    }
    
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

// Route pour servir les fichiers statiques du dossier partagé avec vérification de sécurité
app.use('/files', (req, res, next) => {
  const requestedPath = req.path;
  
  // Sanitize the path
  const sanitizedPath = sanitizePath(requestedPath);
  const filePath = path.join(sharedFolder, sanitizedPath);
  
  // Vérifier que le chemin ne sort pas du dossier partagé
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(sharedFolder))) {
    return res.status(403).json({
      error: 'Accès refusé',
      details: 'Chemin non autorisé'
    });
  }
  
  // Continue to serve the file
  express.static(sharedFolder)(req, res, next);
});

// Route pour créer un dossier
app.post('/mkdir', (req, res) => {
  const { path: folderPath } = req.body;
  
  if (!folderPath) {
    return res.status(400).json({
      error: 'Le chemin du dossier est manquant'
    });
  }
  
  // Valider le nom du dossier
  const invalidChars = /[<>:"\/\\|?*\x00-\x1F]/g;
  if (invalidChars.test(path.basename(folderPath))) {
    return res.status(400).json({
      error: 'Nom de dossier invalide',
      details: 'Le nom contient des caractères non autorisés'
    });
  }
  
  const sanitizedPath = sanitizePath(folderPath);
  const absolutePath = path.join(sharedFolder, sanitizedPath);
  
  // Vérifier que le chemin ne sort pas du dossier partagé
  const resolvedPath = path.resolve(absolutePath);
  if (!resolvedPath.startsWith(path.resolve(sharedFolder))) {
    return res.status(403).json({
      error: 'Accès refusé',
      details: 'Chemin non autorisé'
    });
  }
  
  // Créer le dossier avec recursive:true pour créer les dossiers parents si nécessaires
  fs.mkdir(absolutePath, { recursive: true }, (err) => {
    if (err) {
      console.error(`Erreur lors de la création du dossier ${absolutePath}: ${err.message}`);
      return res.status(500).json({
        error: 'Erreur lors de la création du dossier',
        details: err.message
      });
    }
    
    res.json({
      success: true,
      message: 'Dossier créé avec succès',
      path: sanitizedPath
    });
  });
});

// Route pour récupérer la liste des fichiers/dossiers pour un chemin donné
// This route handles GET requests for directory contents.
// It should come BEFORE app.use('/files', express.static) to intercept directory requests.
app.get('/files/*?', async (req, res, next) => {
  // req.params[0] captures the path after /files/ (e.g., 'some/path')
  const requestedPath = req.params[0] || '';
  const sanitizedPath = sanitizePath(requestedPath);
  const absolutePath = path.join(sharedFolder, sanitizedPath);

  // Vérifier que le chemin ne sort pas du dossier partagé
  const resolvedPath = path.resolve(absolutePath);
  if (!resolvedPath.startsWith(path.resolve(sharedFolder))) {
    return res.status(403).json({
      error: 'Accès refusé',
      details: 'Chemin non autorisé'
    });
  }

  try {
    const stats = await stat(absolutePath);

    if (stats.isDirectory()) {
      // If the requested path is a directory, read its contents
      const entries = await readdir(absolutePath);

      const detailedEntries = await Promise.all(entries.map(async (entryName) => {
        const entryPath = path.join(absolutePath, entryName);
        try {
          const entryStats = await stat(entryPath);
          return {
            name: entryName,
            isDirectory: entryStats.isDirectory(),
            size: entryStats.isDirectory() ? 0 : entryStats.size, // Size is 0 for directories
            mtime: entryStats.mtime, // Modification time
          };
        } catch (err) {
          console.error(`Error stating entry ${entryPath}: ${err.message}`);
          // If stat fails for a specific entry, include a basic representation or skip
          // Skipping for now to avoid partial data issues
          return null;
        }
      }));

      // Filter out null entries in case of stat errors and send the list
      res.json(detailedEntries.filter(entry => entry !== null));

    } else {
      // If the requested path is a file, call next() to let express.static handle serving it
      next();
    }

  } catch (err) {
    // Handle errors like directory/file not found (ENOENT)
    if (err.code === 'ENOENT') {
        res.status(404).json({
          error: 'Dossier ou fichier non trouvé',
          details: err.message
        });
    } else {
      console.error(`Error accessing path ${absolutePath}: ${err.message}`);
      res.status(500).json({
        error: 'Erreur lors de l\'accès au dossier/fichier',
        details: err.message
      });
    }
  }
});



// Validation des noms de fichiers
function validateFileName(filename) {
  // Vérifier les caractères invalides dans le nom de fichier
  const invalidChars = /[<>:"\/\\|?*\x00-\x1F]/g;
  return !invalidChars.test(filename);
}

// Route pour envoyer des fichiers au serveur
app.post('/upload', (req, res, next) => {
  // Middleware de validation avant l'upload
  upload.array('files')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: 'Fichier trop volumineux',
            details: 'La taille maximale autorisée est de 100 MB'
          });
        }
      }
      return next(err);
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Aucun fichier n\'a été envoyé'
      });
    }
    
    // Vérifier les noms de fichiers
    const invalidFiles = req.files.filter(file => !validateFileName(file.originalname));
    if (invalidFiles.length > 0) {
      return res.status(400).json({
        error: 'Nom(s) de fichier(s) invalide(s)',
        details: `Les fichiers suivants contiennent des caractères non autorisés: ${invalidFiles.map(f => f.originalname).join(', ')}`
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
});

// Route pour envoyer des fichiers dans un dossier spécifique
app.post('/upload/*', (req, res, next) => {
  // Vérifier que le chemin du dossier de destination est valide
  const uploadPath = req.params[0] || '';
  const sanitizedPath = sanitizePath(uploadPath);
  const destinationPath = path.join(sharedFolder, sanitizedPath);
  
  // Vérifier que le chemin ne sort pas du dossier partagé
  const resolvedPath = path.resolve(destinationPath);
  if (!resolvedPath.startsWith(path.resolve(sharedFolder))) {
    return res.status(403).json({
      error: 'Accès refusé',
      details: 'Chemin non autorisé'
    });
  }
  
  // Traiter le téléchargement avec la validation
  upload.array('files')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: 'Fichier trop volumineux',
            details: 'La taille maximale autorisée est de 100 MB'
          });
        }
      }
      return next(err);
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Aucun fichier n\'a été envoyé'
      });
    }
    
    // Vérifier les noms de fichiers
    const invalidFiles = req.files.filter(file => !validateFileName(file.originalname));
    if (invalidFiles.length > 0) {
      return res.status(400).json({
        error: 'Nom(s) de fichier(s) invalide(s)',
        details: `Les fichiers suivants contiennent des caractères non autorisés: ${invalidFiles.map(f => f.originalname).join(', ')}`
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
});

// Route pour supprimer un fichier ou un dossier
// This route handles DELETE requests for files or directories at any path under /files.
app.delete('/files/*?', (req, res) => {
  // req.params[0] captures the path after /files/ (e.g., 'some/path/file.txt' or 'some/path')
  const itemPath = req.params[0];

  if (!itemPath) {
      return res.status(400).json({
          error: 'Le chemin de l\'élément à supprimer est manquant.'
      });
  }

  const sanitizedPath = sanitizePath(itemPath);
  const absolutePath = path.join(sharedFolder, sanitizedPath);

  // Vérifier que le chemin ne sort pas du dossier partagé
  const resolvedPath = path.resolve(absolutePath);
  if (!resolvedPath.startsWith(path.resolve(sharedFolder))) {
    return res.status(403).json({
      error: 'Accès refusé',
      details: 'Chemin non autorisé'
    });
  }

  // Use fs.rm (available from Node.js 14.4.0) with recursive: true to delete directories and their contents
  // force: true ignores errors like ENOENT (not found) during recursion, but we check ENOENT below anyway.
  fs.rm(absolutePath, { recursive: true, force: true }, (err) => {
    if (err) {
      // Check if the error is ENOENT (not found) specifically
      if (err.code === 'ENOENT') {
        return res.status(404).json({
          error: 'Élément non trouvé',
          details: err.message
        });
      }
      // Handle other errors
      console.error(`Error deleting ${absolutePath}: ${err.message}`);
      return res.status(500).json({
        error: 'Erreur lors de la suppression de l\'élément',
        details: err.message
      });
    }

    res.json({
      success: true,
      message: 'Élément supprimé avec succès'
    });
  });
});

// Middleware de limitation de débit pour prévenir les attaques par force brute
const requestCounts = {};
const MAX_REQUESTS_PER_MINUTE = 120; // 2 requêtes par seconde en moyenne
const WINDOW_MS = 60 * 1000; // 1 minute

app.use((req, res, next) => {
  // Identifier l'utilisateur par son IP
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // Initialiser le compteur pour cette IP si nécessaire
  if (!requestCounts[ip]) {
    requestCounts[ip] = { count: 0, resetTime: now + WINDOW_MS };
  }
  
  // Réinitialiser le compteur si la période est écoulée
  if (now > requestCounts[ip].resetTime) {
    requestCounts[ip] = { count: 0, resetTime: now + WINDOW_MS };
  }
  
  // Incrémenter le compteur
  requestCounts[ip].count++;
  
  // Vérifier si la limite est dépassée
  if (requestCounts[ip].count > MAX_REQUESTS_PER_MINUTE) {
    return res.status(429).json({
      error: 'Trop de requêtes',
      details: 'Veuillez réessayer plus tard'
    });
  }
  
  next();
});

// Middleware de gestion des erreurs
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Erreur: ${err.message}`);
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Fichier trop volumineux',
        details: 'La taille maximale autorisée est de 100 MB'
      });
    }
  }
  
  // Générer un ID d'erreur pour faciliter le dépannage
  const errorId = crypto.randomBytes(4).toString('hex');
  
  res.status(500).json({
    error: 'Erreur interne du serveur',
    errorId: errorId,
    details: process.env.NODE_ENV === 'production' 
      ? `Une erreur est survenue (ID: ${errorId})` 
      : err.message
  });
});

// Nettoyage périodique du compteur de demandes pour éviter les fuites de mémoire
setInterval(() => {
  const now = Date.now();
  for (const ip in requestCounts) {
    if (now > requestCounts[ip].resetTime) {
      delete requestCounts[ip];
    }
  }
}, 10 * 60 * 1000); // Toutes les 10 minutes

// Démarrer le serveur
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur "jeTePartage" en cours d'exécution sur http://0.0.0.0:${port}`);
  console.log(`Dossier de partage : ${sharedFolder}`);
});

// Gérer la fermeture propre du serveur
process.on('SIGTERM', () => {
  console.log('Signal SIGTERM reçu, arrêt du serveur...');
  server.close(() => {
    console.log('Serveur arrêté avec succès');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Signal SIGINT reçu, arrêt du serveur...');
  server.close(() => {
    console.log('Serveur arrêté avec succès');
    process.exit(0);
  });
});