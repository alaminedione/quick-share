// Configuration principale
const config = {
  maxFileSize: 100 * 1024 * 1024, // 100 MB max par fichier
  acceptAllFileTypes: true,
  dateFormat: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  notificationDuration: 5000, // ms
  fileIcons: {
    'image': 'fa-file-image',
    'video': 'fa-file-video',
    'audio': 'fa-file-audio',
    'application/pdf': 'fa-file-pdf',
    'application/msword': 'fa-file-word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'fa-file-word',
    'application/vnd.ms-excel': 'fa-file-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fa-file-excel',
    'application/vnd.ms-powerpoint': 'fa-file-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'fa-file-powerpoint',
    'text/plain': 'fa-file-alt',
    'text/html': 'fa-file-code',
    'application/json': 'fa-file-code',
    'application/javascript': 'fa-file-code',
    'application/zip': 'fa-file-archive',
    'application/x-rar-compressed': 'fa-file-archive',
    'application/x-tar': 'fa-file-archive',
    'application/x-7z-compressed': 'fa-file-archive',
    'default': 'fa-file'
  }
};

// Gestionnaire de fichiers
class FileManager {
  constructor() {
    this.files = [];
    this.fileMetadata = {};
    this.selectedFiles = new Map();
    this.currentSort = { field: 'name', order: 'asc' };
    this.searchTerm = '';
  }

  async loadFiles() {
    try {
      showLoadingIndicator(true);
      const response = await fetch('/files');
      const fileList = await response.json();
      
      // Récupérer les métadonnées pour chaque fichier
      for (const filename of fileList) {
        try {
          const statResponse = await fetch(`/files/${filename}?stat=true`);
          if (statResponse.ok) {
            const metadata = await statResponse.json();
            this.fileMetadata[filename] = metadata;
          }
        } catch (error) {
          console.error(`Erreur lors de la récupération des métadonnées pour ${filename}:`, error);
        }
      }
      
      this.files = fileList;
      this.renderFileList();
      return fileList;
    } catch (error) {
      showNotification('Erreur lors du chargement des fichiers', 'error');
      console.error('Erreur lors du chargement des fichiers:', error);
      return [];
    } finally {
      showLoadingIndicator(false);
    }
  }

  renderFileList() {
    const fileList = document.getElementById('files');
    const emptyState = document.getElementById('empty-state');
    
    // Nettoyer la liste actuelle
    fileList.innerHTML = '';
    
    // Filtrer et trier les fichiers
    const filesToShow = this.getFilteredAndSortedFiles();
    
    if (filesToShow.length === 0) {
      fileList.style.display = 'none';
      emptyState.classList.remove('hidden');
      return;
    }
    
    emptyState.classList.add('hidden');
    fileList.style.display = 'grid';
    
    // Créer les éléments de liste pour chaque fichier
    filesToShow.forEach(filename => {
      const metadata = this.fileMetadata[filename] || {};
      const fileType = this.getFileType(filename);
      const iconClass = this.getFileIconClass(fileType);
      const fileSize = metadata.size ? this.formatFileSize(metadata.size) : 'Inconnu';
      const fileDate = metadata.mtime ? new Date(metadata.mtime).toLocaleDateString('fr-FR', config.dateFormat) : 'Inconnu';
      
      const li = document.createElement('li');
      li.className = 'file-item';
      li.dataset.filename = filename;
      li.innerHTML = `
        <div class="file-icon">
          <i class="fas ${iconClass}"></i>
        </div>
        <div class="file-name">${filename}</div>
        <div class="file-meta">
          <span class="file-size">${fileSize}</span>
          <span class="file-date">${fileDate}</span>
        </div>
        <div class="file-actions">
          <button class="file-action-button view-file" title="Voir les détails">
            <i class="fas fa-info-circle"></i>
          </button>
          <button class="file-action-button download-file" title="Télécharger">
            <i class="fas fa-download"></i>
          </button>
        </div>
      `;
      
      // Ajouter les gestionnaires d'événements pour les boutons
      li.querySelector('.view-file').addEventListener('click', (e) => {
        e.stopPropagation();
        this.showFileDetails(filename);
      });
      
      li.querySelector('.download-file').addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadFile(filename);
      });
      
      // Ajouter un gestionnaire d'événements pour ouvrir les détails au clic sur l'élément
      li.addEventListener('click', () => {
        this.showFileDetails(filename);
      });
      
      fileList.appendChild(li);
    });
  }
  
  getFilteredAndSortedFiles() {
    // Filtrer les fichiers par la recherche
    let filteredFiles = this.files;
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      filteredFiles = filteredFiles.filter(filename => 
        filename.toLowerCase().includes(searchLower)
      );
    }
    
    // Trier les fichiers
    return filteredFiles.sort((a, b) => {
      const metaA = this.fileMetadata[a] || {};
      const metaB = this.fileMetadata[b] || {};
      
      switch (this.currentSort.field) {
        case 'name':
          return this.currentSort.order === 'asc' 
            ? a.localeCompare(b) 
            : b.localeCompare(a);
        case 'date':
          const dateA = metaA.mtime ? new Date(metaA.mtime) : new Date(0);
          const dateB = metaB.mtime ? new Date(metaB.mtime) : new Date(0);
          return this.currentSort.order === 'asc' 
            ? dateA - dateB 
            : dateB - dateA;
        case 'size':
          const sizeA = metaA.size || 0;
          const sizeB = metaB.size || 0;
          return this.currentSort.order === 'asc' 
            ? sizeA - sizeB 
            : sizeB - sizeA;
        default:
          return 0;
      }
    });
  }
  
  showFileDetails(filename) {
    const metadata = this.fileMetadata[filename] || {};
    const fileType = this.getFileType(filename);
    const modal = document.getElementById('file-details-modal');
    const modalContent = modal.querySelector('.modal-content');
    const filePreview = modalContent.querySelector('.file-preview');
    const fileInfo = modalContent.querySelector('.file-info');
    const downloadButton = modalContent.querySelector('.download-file');
    
    // Mettre à jour le titre
    modalContent.querySelector('.modal-header h3').textContent = 'Détails du fichier';
    
    // Créer l'aperçu du fichier si possible
    filePreview.innerHTML = '';
    if (fileType.startsWith('image/')) {
      filePreview.innerHTML = `<img src="/files/${filename}" alt="${filename}">`;
    } else if (fileType.startsWith('video/')) {
      filePreview.innerHTML = `
        <video controls>
          <source src="/files/${filename}" type="${fileType}">
          Votre navigateur ne prend pas en charge la lecture de vidéos.
        </video>
      `;
    } else if (fileType.startsWith('audio/')) {
      filePreview.innerHTML = `
        <audio controls>
          <source src="/files/${filename}" type="${fileType}">
          Votre navigateur ne prend pas en charge la lecture audio.
        </audio>
      `;
    } else {
      const iconClass = this.getFileIconClass(fileType);
      filePreview.innerHTML = `<div class="large-icon"><i class="fas ${iconClass} fa-5x"></i></div>`;
    }
    
    // Afficher les informations sur le fichier
    const fileSize = metadata.size ? this.formatFileSize(metadata.size) : 'Inconnu';
    const fileDate = metadata.mtime ? new Date(metadata.mtime).toLocaleDateString('fr-FR', config.dateFormat) : 'Inconnu';
    
    fileInfo.innerHTML = `
      <div class="file-info-label">Nom :</div>
      <div class="file-info-value">${filename}</div>
      
      <div class="file-info-label">Type :</div>
      <div class="file-info-value">${fileType}</div>
      
      <div class="file-info-label">Taille :</div>
      <div class="file-info-value">${fileSize}</div>
      
      <div class="file-info-label">Date d'ajout :</div>
      <div class="file-info-value">${fileDate}</div>
    `;
    
    // Configurer le bouton de téléchargement
    downloadButton.onclick = () => {
      this.downloadFile(filename);
      modal.classList.remove('show');
    };
    
    // Afficher le modal
    modal.classList.add('show');
    
    // Configurer le bouton de fermeture
    const closeButton = modalContent.querySelector('.close-modal');
    closeButton.onclick = () => {
      modal.classList.remove('show');
    };
    
    // Fermer le modal si on clique en dehors du contenu
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    };
  }
  
  downloadFile(filename) {
    window.location.href = `/files/${filename}`;
    showNotification(`Téléchargement de "${filename}" en cours...`, 'success');
  }
  
  getFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      'tar': 'application/x-tar',
      '7z': 'application/x-7z-compressed',
      'default': 'application/octet-stream'
    };
    
    return mimeTypes[extension] || mimeTypes.default;
  }
  
  getFileIconClass(fileType) {
    // Vérifier si le type de fichier correspond à une des catégories générales
    for (const category in config.fileIcons) {
      if (fileType.startsWith(category)) {
        return config.fileIcons[category];
      }
    }
    
    // Vérifier une correspondance exacte
    return config.fileIcons[fileType] || config.fileIcons.default;
  }
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  setSortOrder(order) {
    const [field, direction] = order.split('-');
    this.currentSort = { field, order: direction };
    this.renderFileList();
  }
  
  setSearchTerm(term) {
    this.searchTerm = term;
    this.renderFileList();
  }
  
  addSelectedFile(file) {
    const fileId = Date.now() + '-' + file.name;
    this.selectedFiles.set(fileId, file);
    return fileId;
  }
  
  removeSelectedFile(fileId) {
    return this.selectedFiles.delete(fileId);
  }
  
  clearSelectedFiles() {
    this.selectedFiles.clear();
  }
  
  getSelectedFilesArray() {
    return Array.from(this.selectedFiles.values());
  }
}

// Gestionnaire d'upload
class UploadManager {
  constructor(fileManager) {
    this.fileManager = fileManager;
    this.dropArea = document.getElementById('drop-area');
    this.uploadForm = document.getElementById('upload-form');
    this.fileInput = document.getElementById('file-input');
    this.uploadProgress = document.getElementById('upload-progress');
    this.progressFill = document.querySelector('.progress-fill');
    this.progressText = document.querySelector('.progress-text');
    this.selectedFilesContainer = document.getElementById('selected-files');
    this.selectedFilesList = document.getElementById('selected-files-list');
    this.uploadButton = document.getElementById('upload-button');
    
    this.initEventListeners();
  }
  
  initEventListeners() {
    // Événements pour le drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropArea.addEventListener(eventName, this.preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropArea.addEventListener(eventName, () => {
        this.dropArea.classList.add('highlight');
      }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      this.dropArea.addEventListener(eventName, () => {
        this.dropArea.classList.remove('highlight');
      }, false);
    });
    
    this.dropArea.addEventListener('drop', this.handleDrop.bind(this), false);
    
    // Événement pour le champ de fichier standard
    this.fileInput.addEventListener('change', this.handleFileSelect.bind(this), false);
    
    // Événement pour le bouton d'upload
    this.uploadButton.addEventListener('click', this.uploadFiles.bind(this), false);
  }
  
  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    this.handleFiles(files);
  }
  
  handleFileSelect(e) {
    const files = e.target.files;
    this.handleFiles(files);
  }
  
  handleFiles(files) {
    if (files.length === 0) return;
    
    Array.from(files).forEach(file => {
      // Vérifier la taille du fichier
      if (file.size > config.maxFileSize) {
        showNotification(`Le fichier "${file.name}" est trop volumineux (max: ${this.fileManager.formatFileSize(config.maxFileSize)})`, 'error');
        return;
      }
      
      // Ajouter le fichier à la liste des fichiers sélectionnés
      const fileId = this.fileManager.addSelectedFile(file);
      
      // Créer un élément dans la liste des fichiers sélectionnés
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="file-details">
          <i class="fas ${this.fileManager.getFileIconClass(file.type || 'default')}"></i>
          <div class="file-name-size">
            <div>${file.name}</div>
            <div class="file-size">${this.fileManager.formatFileSize(file.size)}</div>
          </div>
        </div>
        <button class="remove-file" data-file-id="${fileId}">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      // Ajouter le gestionnaire d'événements pour le bouton de suppression
      li.querySelector('.remove-file').addEventListener('click', () => {
        this.fileManager.removeSelectedFile(fileId);
        li.remove();
        this.updateSelectedFilesVisibility();
      });
      
      this.selectedFilesList.appendChild(li);
    });
    
    // Mettre à jour la visibilité du conteneur de fichiers sélectionnés
    this.updateSelectedFilesVisibility();
    
    // Réinitialiser le champ de fichier pour permettre la sélection du même fichier
    this.fileInput.value = '';
  }
  
  updateSelectedFilesVisibility() {
    if (this.fileManager.getSelectedFilesArray().length > 0) {
      this.selectedFilesContainer.classList.remove('hidden');
    } else {
      this.selectedFilesContainer.classList.add('hidden');
    }
  }
  
  async uploadFiles() {
    const files = this.fileManager.getSelectedFilesArray();
    
    if (files.length === 0) {
      showNotification('Aucun fichier sélectionné', 'error');
      return;
    }
    
    // Préparer le FormData
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    
    // Afficher la progression
    this.uploadProgress.classList.remove('hidden');
    this.uploadButton.disabled = true;
    
    try {
      const xhr = new XMLHttpRequest();
      
      // Configurer les événements de progression
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          this.progressFill.style.width = percentComplete + '%';
          this.progressText.textContent = `Envoi en cours... ${Math.round(percentComplete)}%`;
        }
      });
      
      // Configurer l'événement de fin
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          showNotification(`${files.length} fichier(s) téléchargé(s) avec succès`, 'success');
          
          // Réinitialiser le formulaire
          this.resetUploadForm();
          
          // Recharger la liste des fichiers
          this.fileManager.loadFiles();
        } else {
          showNotification('Erreur lors de l\'envoi des fichiers', 'error');
        }
        
        this.uploadProgress.classList.add('hidden');
        this.uploadButton.disabled = false;
      });
      
      // Configurer l'événement d'erreur
      xhr.addEventListener('error', () => {
        showNotification('Erreur lors de l\'envoi des fichiers', 'error');
        this.uploadProgress.classList.add('hidden');
        this.uploadButton.disabled = false;
      });
      
      // Envoyer la requête
      xhr.open('POST', '/upload', true);
      xhr.send(formData);
    } catch (error) {
      showNotification('Erreur lors de l\'envoi des fichiers', 'error');
      console.error('Erreur lors de l\'envoi des fichiers:', error);
      this.uploadProgress.classList.add('hidden');
      this.uploadButton.disabled = false;
    }
  }
  
  resetUploadForm() {
    this.fileManager.clearSelectedFiles();
    this.selectedFilesList.innerHTML = '';
    this.selectedFilesContainer.classList.add('hidden');
    this.progressFill.style.width = '0%';
    this.progressText.textContent = 'Envoi en cours...';
  }
}

// Fonctions utilitaires
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  const notificationIcon = notification.querySelector('.notification-icon');
  const notificationMessage = notification.querySelector('.notification-message');
  
  // Configurer le type de notification
  notification.className = 'notification';
  notification.classList.add(type);
  
  // Configurer l'icône en fonction du type
  let iconClass = 'fas ';
  switch (type) {
    case 'success':
      iconClass += 'fa-check-circle';
      break;
    case 'error':
      iconClass += 'fa-exclamation-circle';
      break;
    default:
      iconClass += 'fa-info-circle';
  }
  
  notificationIcon.className = iconClass;
  notificationMessage.textContent = message;
  
  // Afficher la notification
  notification.classList.add('show');
  
  // Configurer le bouton de fermeture
  const closeButton = notification.querySelector('.notification-close');
  const closeNotification = () => {
    notification.classList.remove('show');
  };
  
  closeButton.onclick = closeNotification;
  
  // Fermer automatiquement après un délai
  const timeoutId = setTimeout(closeNotification, config.notificationDuration);
  
  // Arrêter le timeout si l'utilisateur ferme manuellement
  closeButton.addEventListener('click', () => {
    clearTimeout(timeoutId);
  });
}

function showLoadingIndicator(show) {
  const loadingIndicator = document.getElementById('loading-files');
  if (show) {
    loadingIndicator.style.display = 'flex';
  } else {
    loadingIndicator.style.display = 'none';
  }
}

function initThemeToggle() {
  const themeSwitch = document.getElementById('theme-switch');
  
  // Charger le thème depuis le stockage local s'il existe
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeSwitch.checked = true;
  }
  
  // Changer le thème lors du clic sur le bouton
  themeSwitch.addEventListener('change', () => {
    if (themeSwitch.checked) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  });
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  // Initialiser le gestionnaire de fichiers
  const fileManager = new FileManager();
  fileManager.loadFiles();
  
  // Initialiser le gestionnaire d'upload
  const uploadManager = new UploadManager(fileManager);
  
  // Initialiser le basculement de thème
  initThemeToggle();
  
  // Initialiser l'année actuelle dans le pied de page
  document.getElementById('current-year').textContent = new Date().getFullYear();
  
  // Gestionnaire pour le tri des fichiers
  document.getElementById('sort-files').addEventListener('change', (e) => {
    fileManager.setSortOrder(e.target.value);
  });
  
  // Gestionnaire pour la recherche de fichiers
  document.getElementById('search-files').addEventListener('input', (e) => {
    fileManager.setSearchTerm(e.target.value);
  });
  
  // Gestionnaire pour fermer le modal en appuyant sur Échap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('file-details-modal');
      if (modal.classList.contains('show')) {
        modal.classList.remove('show');
      }
    }
  });
});