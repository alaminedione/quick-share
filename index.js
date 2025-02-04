const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

const sharedFolder = path.join(__dirname, 'shared_files');

if (!fs.existsSync(sharedFolder)) {
  fs.mkdirSync(sharedFolder);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, sharedFolder); // Enregistrer dans le dossier partagé
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); 
  }
});

const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));

app.use('/files', express.static(sharedFolder));

app.get('/files', (req, res) => {
  fs.readdir(sharedFolder, (err, files) => {
    if (err) {
      return res.status(500).send('Erreur lors de la lecture des fichiers');
    }
    res.json(files);
  });
});

// Route pour télécharger un fichier spécifique
app.get('/files/:filename', (req, res) => {
  const filePath = path.join(sharedFolder, req.params.filename);
  res.download(filePath, (err) => {
    if (err) {
      res.status(404).send('Fichier non trouvé');
    }
  });
});

// Route pour envoyer des fichiers au serveur
app.post('/upload', upload.array('files'), (req, res) => {
  res.send('Fichiers téléchargés avec succès');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur "jeTePartage" en cours d'exécution sur http://0.0.0.0:${port}`);
});

