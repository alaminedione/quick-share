// Configuration principale
const config = {
  maxFileSize: 100 * 1024 * 1024, // 100 MB max par fichier
  acceptAllFileTypes: true,
  dateFormat: {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  notificationDuration: 5000, // ms
  fileIcons: {
    image: "fa-file-image",
    video: "fa-file-video",
    audio: "fa-file-audio",
    "application/pdf": "fa-file-pdf",
    "application/msword": "fa-file-word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "fa-file-word",
    "application/vnd.ms-excel": "fa-file-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "fa-file-excel",
    "application/vnd.ms-powerpoint": "fa-file-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "fa-file-powerpoint",
    "text/plain": "fa-file-alt",
    "text/html": "fa-file-code",
    "application/json": "fa-file-code",
    "application/javascript": "fa-file-code",
    "application/zip": "fa-file-archive",
    "application/x-rar-compressed": "fa-file-archive",
    "application/x-tar": "fa-file-archive",
    "application/x-7z-compressed": "fa-file-archive",
    default: "fa-file",
  },
};

// Gestionnaire de fichiers
class FileManager {
  constructor() {
    this.currentEntries = []; // Stocke les entrées (fichiers et dossiers) avec leurs métadonnées
    this.fileMetadata = {}; // Conservé pour compatibilité, à supprimer dans les futures versions
    this.selectedFiles = new Map();
    this.currentSort = { field: "name", order: "asc" };
    this.searchTerm = "";
    this.historyStack = []; // Pour stocker l'historique de navigation
    this.currentPath = "/"; // Chemin actuel
  }
  
  // Méthode pour assainir les chemins et prévenir le path traversal
  sanitizePath(path) {
    // Enlever les séquences de path traversal
    path = path.replace(/\.\.\//g, '').replace(/\.\./g, '');
    // Normaliser les barres obliques
    path = path.replace(/\/+/g, '/');
    // S'assurer que le chemin commence par /
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    return path;
  }

// Ajoute le chemin actuel à l'historique et charge les fichiers
async navigateTo(path) {
  if (this.currentPath !== path) {
    if (this.currentPath) {
      this.historyStack.push(this.currentPath);
    }
    await this.loadFiles(path);
  }
}
  
// Navigue vers le dossier parent/précédent
async navigateBack() {
  if (this.historyStack.length > 0) {
    const previousPath = this.historyStack.pop();
    await this.loadFiles(previousPath, false); // Le false indique de ne pas ajouter à l'historique
  } else if (this.currentPath && this.currentPath !== "/") {
    // Si pas d'historique mais on n'est pas à la racine, remonte d'un niveau
    const pathParts = this.currentPath.split("/").filter(part => part !== "");
    pathParts.pop(); // Retirer le dernier élément du chemin
    const parentPath = pathParts.length === 0 ? "/" : "/" + pathParts.join("/");
    await this.loadFiles(parentPath, false);
    
    // Mise à jour du chemin dans l'historique du navigateur sans ajouter d'entrée
    const historyPath = parentPath === "/" 
      ? (window.location.pathname.split("/files")[0] || "/")
      : (window.location.pathname.split("/files")[0] || "/") + "files" + parentPath;
    window.history.replaceState({ path: parentPath }, "", historyPath);
  }
}
  
// Loads files and directories for a given path
async loadFiles(path = "/", addToHistory = true) {
  path = this.sanitizePath(path); // Sanitize path to prevent path traversal
  this.currentPath = path; // Store the current path

  try {
    showLoadingIndicator(true);
    // Fetch data from the correct path (handle root '/')
    const response = await fetch(path === "/" ? "/files" : `/files${path}`);

    if (!response.ok) {
      // Handle non-OK responses (e.g., 404)
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`,
      );
    }

    const entries = await response.json();

    // Store the fetched entries directly. Each entry includes name, isDirectory, size, mtime.
    this.currentEntries = entries;

    // Clear previous file metadata - we now have full metadata in currentEntries
    this.fileMetadata = {}; // This line might not be necessary depending on future use, but good practice to clear.

    this.renderFileList(); // Re-render the list with the new entries
    // Update the browser history if addToHistory is true
    if (addToHistory) {
      try {
        // Utiliser uniquement des chemins relatifs pour éviter les erreurs de sécurité
        let historyPath;
        if (path === "/") {
          historyPath = window.location.pathname.split("/files")[0] || "/";
        } else {
          historyPath = (window.location.pathname.split("/files")[0] || "/") + "files" + path;
        }
        // S'assurer que le chemin est valide pour pushState
        if (historyPath.startsWith("//")) {
          historyPath = historyPath.substring(1);
        }
        window.history.pushState({ path }, "", historyPath);
      } catch (err) {
        console.warn("Navigation history error:", err.message);
        // Continuer l'exécution même si pushState échoue
      }
    }
  } catch (error) {
    showNotification(
      `Erreur lors du chargement des fichiers pour ${path}: ${error.message}`,
      "error",
    );
    console.error(
      `Erreur lors du chargement des fichiers pour ${path}:`,
      error,
    );
    this.currentEntries = []; // Clear the list on error
    this.fileMetadata = {}; // Clear metadata too
    this.renderFileList(); // Render an empty list or error state
  } finally {
    showLoadingIndicator(false);
  }
}

  renderFileList() {
    const fileList = document.getElementById("files");
    const emptyState = document.getElementById("empty-state");

    // Nettoyer la liste actuelle
    fileList.innerHTML = "";

    // Filtrer et trier les entrées (fichiers et dossiers)
    const entriesToShow = this.getFilteredAndSortedEntries();

    // Add ".." entry if not at the root directory
    if (this.currentPath !== "/") {
      const upDirLi = document.createElement("li");
      upDirLi.className = "directory-item";
      upDirLi.dataset.name = "..";
      upDirLi.innerHTML = `
          <div class="file-icon">
            <i class="fas fa-level-up-alt"></i>
          </div>
          <div class="file-name">..</div>
          <div class="file-meta"></div> <!-- Empty meta for parent directory -->
          <div class="file-actions"></div> <!-- Empty actions for parent directory -->
        `;
      upDirLi.addEventListener("click", () => {
        this.changeDirectory("..");
      });
      fileList.appendChild(upDirLi);
    }

    if (entriesToShow.length === 0 && this.currentPath === "/") {
      // Only show empty state if root is empty
      fileList.style.display = "none";
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    fileList.style.display = "grid";

    // Créer les éléments de liste pour chaque entrée
    entriesToShow.forEach((entry) => {
      const li = document.createElement("li");
      li.dataset.name = entry.name;

      if (entry.isDirectory) {
        li.className = "directory-item";
        li.innerHTML = `
          <div class="file-icon">
            <i class="fas fa-folder"></i>
          </div>
          <div class="file-name">${entry.name}</div>
          <div class="file-meta"></div> <!-- Empty meta for directories -->
          <div class="file-actions"></div> <!-- Empty actions for directories -->
        `;
        // Add click listener to navigate into the directory
        li.addEventListener("click", () => {
          this.changeDirectory(entry.name);
        });
      } else {
        li.className = "file-item";
        const fileType = this.getFileType(entry.name);
        const iconClass = this.getFileIconClass(fileType);
        const fileSize = entry.size
          ? this.formatFileSize(entry.size)
          : "Inconnu";
        const fileDate = entry.mtime
          ? new Date(entry.mtime).toLocaleDateString("fr-FR", config.dateFormat)
          : "Inconnu";

        li.innerHTML = `
          <div class="file-icon">
            <i class="fas ${iconClass}"></i>
          </div>
          <div class="file-name">${entry.name}</div>
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
            <button class="file-action-button delete-item" title="Supprimer">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        `;

        // Add event listeners for file actions
        li.querySelector(".view-file").addEventListener("click", (e) => {
          e.stopPropagation();
          this.showFileDetails(entry.name); // Pass entry name
        });

        li.querySelector(".download-file").addEventListener("click", (e) => {
          e.stopPropagation();
          this.downloadFile(entry.name); // Pass entry name
        });

        li.querySelector(".delete-item").addEventListener("click", (e) => {
          e.stopPropagation();
          this.deleteItem(entry.name); // Pass entry name
        });

        // Add a click listener to open details on item click (only for files)
        li.addEventListener("click", () => {
          this.showFileDetails(entry.name); // Pass entry name
        });
        li.querySelector(".download-file").addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent triggering showFileDetails
          this.downloadFile(entry.name); // Pass entry name
        });
      }

      fileList.appendChild(li);
    });

    // Render the breadcrumb after updating the list
    this.renderBreadcrumb();
  }

  getFilteredAndSortedEntries() {
    // Vérifier si currentEntries existe
    if (!this.currentEntries || !Array.isArray(this.currentEntries)) {
      return [];
    }
    
    // Filtrer les fichiers par la recherche
    let filteredEntries = [...this.currentEntries]; // Créer une copie pour éviter de modifier l'original
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      filteredEntries = filteredEntries.filter((entry) =>
        entry.name.toLowerCase().includes(searchLower),
      );
    }

    // Trier les fichiers
    return filteredEntries.sort((a, b) => {
      switch (this.currentSort.field) {
        case "name":
          return this.currentSort.order === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        case "date":
          const dateA = a.mtime ? new Date(a.mtime) : new Date(0);
          const dateB = b.mtime ? new Date(b.mtime) : new Date(0);
          return this.currentSort.order === "asc"
            ? dateA - dateB
            : dateB - dateA;
        case "size":
          const sizeA = a.size || 0;
          const sizeB = b.size || 0;
          return this.currentSort.order === "asc"
            ? sizeA - sizeB
            : sizeB - sizeA;
        default:
          return 0;
      }
    });
  }

  showFileDetails(filename) {
    // Trouver l'entrée correspondante au nom de fichier
    const entry = this.currentEntries?.find(entry => entry.name === filename) || {};
    const fileType = this.getFileType(filename);
    const modal = document.getElementById("file-details-modal");
    const modalContent = modal.querySelector(".modal-content");
    const filePreview = modalContent.querySelector(".file-preview");
    const fileInfo = modalContent.querySelector(".file-info");
    const downloadButton = modalContent.querySelector(".download-file");

    // Mettre à jour le titre
    modalContent.querySelector(".modal-header h3").textContent =
      "Détails du fichier";

    // Créer l'aperçu du fichier si possible
    filePreview.innerHTML = "";
    if (fileType.startsWith("image/")) {
      filePreview.innerHTML = `<img src="/files/${filename}" alt="${filename}">`;
    } else if (fileType.startsWith("video/")) {
      filePreview.innerHTML = `
        <video controls>
          <source src="/files/${filename}" type="${fileType}">
          Votre navigateur ne prend pas en charge la lecture de vidéos.
        </video>
      `;
    } else if (fileType.startsWith("audio/")) {
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
    const fileSize = entry.size
      ? this.formatFileSize(entry.size)
      : "Inconnu";
    const fileDate = entry.mtime
      ? new Date(entry.mtime).toLocaleDateString("fr-FR", config.dateFormat)
      : "Inconnu";

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
      modal.classList.remove("show");
    };

    // Afficher le modal
    modal.classList.add("show");

    // Configurer le bouton de fermeture
    const closeButton = modalContent.querySelector(".close-modal");
    closeButton.onclick = () => {
      modal.classList.remove("show");
    };

    // Fermer le modal si on clique en dehors du contenu
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove("show");
      }
    };
  }

  downloadFile(filename) {
    window.location.href = `/files/${filename}`;
    showNotification(`Téléchargement de "${filename}" en cours...`, "success");
  }

  getFileType(filename) {
    const extension = filename.split(".").pop().toLowerCase();
    const mimeTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      zip: "application/zip",
      rar: "application/x-rar-compressed",
      tar: "application/x-tar",
      "7z": "application/x-7z-compressed",
      default: "application/octet-stream",
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
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  setSortOrder(order) {
    const [field, direction] = order.split("-");
    this.currentSort = { field, order: direction };
    this.renderFileList();
  }

  setSearchTerm(term) {
    this.searchTerm = term;
    this.renderFileList();
  }

  addSelectedFile(file) {
    const fileId = Date.now() + "-" + file.name;
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
    return Array.from(this.selectedFiles);
  }

  // Navigate into a directory or up to the parent directory
  changeDirectory(directoryName) {
    let newPath;
    if (directoryName === "..") {
      // Go up one level
      this.navigateBack();
      return; // La navigateBack() gère tout le processus de navigation
    } else if (this.currentPath === "/") {
      // Navigate into a subdirectory from the root
      newPath = "/" + directoryName;
    } else {
      // Navigate into a subdirectory from a non-root directory
      newPath = this.currentPath + "/" + directoryName;
    }

    // Clean up the path (e.g., remove double slashes)
    newPath = this.sanitizePath(newPath);

    try {
      // Update the browser's URL without reloading the page
      // Use a query parameter or hash for path, or leverage history API state
      // Let's use the history API for cleaner URLs
      // Ensure the path starts with /shared_files if needed on server side, but client side should match the API call path
      // The API expects path relative to /files. So / for root, /subdir for subdir.
      let historyPath;
      if (newPath === "/") {
        historyPath = (window.location.pathname.split("/files")[0] || "/");
      } else {
        historyPath = (window.location.pathname.split("/files")[0] || "/") + "files" + newPath;
      }
  
      // S'assurer que le chemin est valide pour pushState
      if (historyPath.startsWith("//")) {
        historyPath = historyPath.substring(1);
      }
  
      // Ne pas modifier l'URL ici, laisser navigateTo s'en occuper via loadFiles
    } catch (err) {
      console.warn("Path navigation error:", err.message);
    }

    // Navigate to the new path with history tracking
    this.navigateTo(newPath);
  }

  // Get the current path as an array of directory names
  getCurrentPathArray() {
    // Split the current path, filter out empty strings, and add 'root' for the base
    const parts = this.currentPath.split("/").filter((part) => part !== "");
    return ["root", ...parts];
  }

  // Render the breadcrumb navigation
  renderBreadcrumb() {
    const breadcrumbContainer = document.getElementById("breadcrumb");
    if (!breadcrumbContainer) return;

    breadcrumbContainer.innerHTML = ""; // Clear current breadcrumb
    const pathParts = this.getCurrentPathArray();

    pathParts.forEach((part, index) => {
      const span = document.createElement("span");
      span.classList.add("breadcrumb-item");
      span.textContent = index === 0 ? "Shared Files" : part; // Label root as "Shared Files"

      let pathToNavigate = "/";
      if (index > 0) {
        pathToNavigate = "/" + pathParts.slice(1, index + 1).join("/");
      }

      if (index < pathParts.length - 1) {
        // If it's not the last part (current directory), make it a link
        span.classList.add("clickable");
        span.addEventListener("click", () => {
          this.changeDirectory(pathToNavigate);
        });

        // Add a separator
        const separator = document.createElement("span");
        separator.classList.add("breadcrumb-separator");
        separator.textContent = " / ";
        breadcrumbContainer.appendChild(span);
        breadcrumbContainer.appendChild(separator);
      } else {
        // If it's the last part, just display the text (current directory)
        span.classList.add("current");
        breadcrumbContainer.appendChild(span);
      }
    });
  }

  // Handle item deletion (file or directory)
  async deleteItem(itemName) {
    const itemPath =
      this.currentPath === "/" ? itemName : `${this.currentPath}/${itemName}`;
    const absoluteItemPath = itemPath.replace(/^\//, ""); // Remove leading slash for the fetch URL if needed, depends on server route config

    // Vérifier si l'élément est un fichier ou un dossier
    const itemEntry = this.currentEntries?.find(entry => entry.name === itemName);
    const itemType = itemEntry?.isDirectory ? "dossier" : "fichier";
    const confirmMessage = itemType === "dossier" 
      ? `Êtes-vous sûr de vouloir supprimer le dossier "${itemName}" et tout son contenu ?` 
      : `Êtes-vous sûr de vouloir supprimer le fichier "${itemName}" ?`;
      
    if (!confirm(confirmMessage)) {
      return; // L'utilisateur a annulé la suppression
    }

    try {
      showLoadingIndicator(true);
      const response = await fetch(`/files/${absoluteItemPath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }

      const result = await response.json();
      showNotification(result.message, "success");

      // Reload the current directory contents after deletion
      this.loadFiles(this.currentPath);
    } catch (error) {
      showNotification(
        `Erreur lors de la suppression de ${itemName}: ${error.message}`,
        "error",
      );
      console.error(`Error deleting ${itemName}:`, error);
    } finally {
      showLoadingIndicator(false);
    }
  }

  // Crée un nouveau dossier dans le chemin courant
  async createFolder(folderName) {
    if (!folderName || folderName.trim() === '') {
      showNotification('Le nom du dossier ne peut pas être vide', 'error');
      return false;
    }
    
    // Valider le nom du dossier
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(folderName)) {
      showNotification('Le nom du dossier contient des caractères invalides', 'error');
      return false;
    }

    const folderPath = this.currentPath === '/' 
      ? folderName 
      : `${this.currentPath}/${folderName}`;

    try {
      showLoadingIndicator(true);
      const response = await fetch('/mkdir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: folderPath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      showNotification(result.message, 'success');
      
      // Recharger les fichiers du dossier courant
      this.loadFiles(this.currentPath);
      return true;
    } catch (error) {
      showNotification(
        `Erreur lors de la création du dossier ${folderName}: ${error.message}`,
        'error'
      );
      console.error(`Error creating folder ${folderName}:`, error);
      return false;
    } finally {
      showLoadingIndicator(false);
    }
  }
}

// Gestionnaire d'upload
class UploadManager {
  constructor(fileManager) {
    this.fileManager = fileManager;
    this.dropArea = document.getElementById("drop-area");
    this.uploadForm = document.getElementById("upload-form");
    this.fileInput = document.getElementById("file-input");
    this.uploadProgress = document.getElementById("upload-progress");
    this.progressFill = document.querySelector(".progress-fill");
    this.progressText = document.querySelector(".progress-text");
    this.selectedFilesContainer = document.getElementById("selected-files");
    this.selectedFilesList = document.getElementById("selected-files-list");
    this.uploadButton = document.getElementById("upload-button");

    this.initEventListeners();
  }

  initEventListeners() {
    // Événements pour le drag & drop
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      this.dropArea.addEventListener(eventName, this.preventDefaults, false);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      this.dropArea.addEventListener(
        eventName,
        () => {
          this.dropArea.classList.add("highlight");
        },
        false,
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      this.dropArea.addEventListener(
        eventName,
        () => {
          this.dropArea.classList.remove("highlight");
        },
        false,
      );
    });

    this.dropArea.addEventListener("drop", this.handleDrop.bind(this), false);

    // Événement pour le champ de fichier standard
    this.fileInput.addEventListener(
      "change",
      this.handleFileSelect.bind(this),
      false,
    );

    // Événement pour le bouton d'upload
    this.uploadButton.addEventListener(
      "click",
      this.uploadFiles.bind(this),
      false,
    );
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

    Array.from(files).forEach((file) => {
      // Vérifier la taille du fichier
      if (file.size > config.maxFileSize) {
        showNotification(
          `Le fichier "${file.name}" est trop volumineux (max: ${this.fileManager.formatFileSize(config.maxFileSize)})`,
          "error",
        );
        return;
      }

      // Ajouter le fichier à la liste des fichiers sélectionnés
      const fileId = this.fileManager.addSelectedFile(file);

      // Créer un élément dans la liste des fichiers sélectionnés
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="file-details">
          <i class="fas ${this.fileManager.getFileIconClass(file.type || "default")}"></i>
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
      li.querySelector(".remove-file").addEventListener("click", () => {
        this.fileManager.removeSelectedFile(fileId);
        li.remove();
        this.updateSelectedFilesVisibility();
      });

      this.selectedFilesList.appendChild(li);
    });

    // Mettre à jour la visibilité du conteneur de fichiers sélectionnés
    this.updateSelectedFilesVisibility();

    // Réinitialiser le champ de fichier pour permettre la sélection du même fichier
    this.fileInput.value = "";
  }

  updateSelectedFilesVisibility() {
    if (this.fileManager.getSelectedFilesArray().length > 0) {
      this.selectedFilesContainer.classList.remove("hidden");
    } else {
      this.selectedFilesContainer.classList.add("hidden");
    }
  }

  async uploadFiles() {
    const files = this.fileManager.getSelectedFilesArray();

    if (files.length === 0) {
      showNotification("Aucun fichier sélectionné", "error");
      return;
    }

    // Vérifier les noms de fichiers pour éviter les caractères problématiques
    const invalidFiles = files.filter(([_, file]) => {
      const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
      return invalidChars.test(file.name);
    });
    
    if (invalidFiles.length > 0) {
      showNotification(
        `Certains noms de fichiers contiennent des caractères invalides: ${invalidFiles.map(([_, f]) => f.name).join(', ')}`,
        "error"
      );
      return;
    }

    // Préparer le FormData
    const formData = new FormData();
    files.forEach(([_, file]) => {
      formData.append("files", file);
    });

    // Afficher la progression
    this.uploadProgress.classList.remove("hidden");
    this.uploadButton.disabled = true;

    try {
      const xhr = new XMLHttpRequest();

      // Configurer les événements de progression
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          this.progressFill.style.width = percentComplete + "%";
          this.progressText.textContent = `Envoi en cours... ${Math.round(percentComplete)}%`;
        }
      });

      // Configurer l'événement de fin
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          showNotification(
            `${files.length} fichier(s) téléchargé(s) avec succès`,
            "success",
          );

          // Réinitialiser le formulaire
          this.resetUploadForm();

          // Recharger la liste des fichiers
          this.fileManager.loadFiles(this.fileManager.currentPath);
        } else {
          showNotification("Erreur lors de l'envoi des fichiers", "error");
        }

        this.uploadProgress.classList.add("hidden");
        this.uploadButton.disabled = false;
      });

      // Configurer l'événement d'erreur
      xhr.addEventListener("error", () => {
        showNotification("Erreur lors de l'envoi des fichiers", "error");
        this.uploadProgress.classList.add("hidden");
        this.uploadButton.disabled = false;
      });

      // Envoyer la requête
      // Get the current path from the file manager
      const currentPath = this.fileManager.currentPath;
      // Construct the upload URL. Remove leading slash for the URL path segment if it's not just '/'
      const uploadUrlPath =
        currentPath === "/" ? "" : currentPath.replace(/^\//, "");
      const uploadUrl = `/upload${uploadUrlPath ? "/" + uploadUrlPath : ""}`;

      xhr.open("POST", uploadUrl, true);
      xhr.send(formData);
    } catch (error) {
      showNotification("Erreur lors de l'envoi des fichiers", "error");
      console.error("Erreur lors de l'envoi des fichiers:", error);
      this.uploadProgress.classList.add("hidden");
      this.uploadButton.disabled = false;
    }
  }

  resetUploadForm() {
    this.fileManager.clearSelectedFiles();
    this.selectedFilesList.innerHTML = "";
    this.selectedFilesContainer.classList.add("hidden");
    this.progressFill.style.width = "0%";
    this.progressText.textContent = "Envoi en cours...";
  }
}

// Fonctions utilitaires
function showNotification(message, type = "info") {
  const notification = document.getElementById("notification");
  const notificationIcon = notification.querySelector(".notification-icon");
  const notificationMessage = notification.querySelector(
    ".notification-message",
  );

  // Configurer le type de notification
  notification.className = "notification";
  notification.classList.add(type);

  // Configurer l'icône en fonction du type
  let iconClass = "fas ";
  switch (type) {
    case "success":
      iconClass += "fa-check-circle";
      break;
    case "error":
      iconClass += "fa-exclamation-circle";
      break;
    default:
      iconClass += "fa-info-circle";
  }

  notificationIcon.className = iconClass;
  notificationMessage.textContent = message;

  // Afficher la notification
  notification.classList.add("show");

  // Configurer le bouton de fermeture
  const closeButton = notification.querySelector(".notification-close");
  const closeNotification = () => {
    notification.classList.remove("show");
  };

  closeButton.onclick = closeNotification;

  // Fermer automatiquement après un délai
  const timeoutId = setTimeout(closeNotification, config.notificationDuration);

  // Arrêter le timeout si l'utilisateur ferme manuellement
  closeButton.addEventListener("click", () => {
    clearTimeout(timeoutId);
  });
}

function showLoadingIndicator(show) {
  const loadingIndicator = document.getElementById("loading-files");
  if (show) {
    loadingIndicator.style.display = "flex";
  } else {
    loadingIndicator.style.display = "none";
  }
}

function initThemeToggle() {
  const themeSwitch = document.getElementById("theme-switch");

  // Charger le thème depuis le stockage local s'il existe
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
    themeSwitch.checked = true;
  }

  // Changer le thème lors du clic sur le bouton
  themeSwitch.addEventListener("change", () => {
    if (themeSwitch.checked) {
      document.body.classList.add("dark-theme");
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark-theme");
      localStorage.setItem("theme", "light");
    }
  });
}

// Initialisation
document.addEventListener("DOMContentLoaded", () => {
  // Initialiser le gestionnaire de fichiers
  const fileManager = new FileManager();

  // Determine the initial path from the URL
  const pathSegments = window.location.pathname.split("/files/");
  // The path relative to /files/ is the second segment. Default to '/' if empty.
  const initialPath =
    pathSegments.length > 1 && pathSegments[1] !== ""
      ? "/" + pathSegments[1]
      : "/";

  // Load files for the initial path
  fileManager.loadFiles(initialPath);

  // Add listener for popstate event to handle browser back/forward navigation
  window.addEventListener("popstate", (event) => {
    try {
      // Get the path from the history state or the current location if state is null
      const statePath = event.state ? event.state.path : null;
      let pathToLoad;

      if (statePath !== null) {
        pathToLoad = statePath;
      } else {
        // If state is null (e.g., initial load or direct navigation), parse from URL
        const currentPathSegments = window.location.pathname.split("/files/");
        pathToLoad =
          currentPathSegments.length > 1 && currentPathSegments[1] !== ""
            ? "/" + currentPathSegments[1]
            : "/";
      
        // Sanitize path to prevent errors
        pathToLoad = pathToLoad.replace(/\/+/g, '/');
      }

      // Indiquer à loadFiles de ne pas modifier l'historique puisque c'est un événement popstate
      fileManager.loadFiles(pathToLoad, false);
    } catch (err) {
      console.error("Error handling navigation:", err);
      showNotification("Erreur de navigation. Retour à la racine.", "error");
      // Retour à la racine en cas d'erreur
      fileManager.loadFiles("/", false);
    }
  });

  // Initialiser le gestionnaire d\'upload
  const uploadManager = new UploadManager(fileManager);

  // Initialiser le basculement de thème
  initThemeToggle();

  // Initialiser l\'année actuelle dans le pied de page
  document.getElementById("current-year").textContent =
    new Date().getFullYear();

  // Gestionnaire pour le tri des fichiers
  document.getElementById("sort-files").addEventListener("change", (e) => {
    fileManager.setSortOrder(e.target.value);
  });
    
  // Ajouter les noms de classe à la fenêtre modale pour utiliser le thème actuel
  const theme = localStorage.getItem("theme") || "light";
  document.getElementById("create-folder-modal").classList.add(`${theme}-theme`);

  // Gestionnaire pour la recherche de fichiers
  document.getElementById("search-files").addEventListener("input", (e) => {
    fileManager.setSearchTerm(e.target.value);
  });

  // Gestionnaire pour le bouton retour
  document.getElementById("back-button").addEventListener("click", () => {
    fileManager.navigateBack();
  });

  // Gestionnaire pour le bouton de création de dossier
  document.getElementById("create-folder-button").addEventListener("click", () => {
    const createFolderModal = document.getElementById("create-folder-modal");
    const folderNameInput = document.getElementById("folder-name");
    folderNameInput.value = ""; // Réinitialiser l'input
    createFolderModal.classList.add("show");
  });
  
  // Gestionnaire pour le bouton de confirmation de création de dossier
  document.getElementById("create-folder-confirm").addEventListener("click", async () => {
    const folderNameInput = document.getElementById("folder-name");
    const folderName = folderNameInput.value.trim();
    const createFolderModal = document.getElementById("create-folder-modal");
    
    if (await fileManager.createFolder(folderName)) {
      createFolderModal.classList.remove("show");
    }
  });
  
  // Gestionnaire pour le bouton d'annulation de création de dossier
  document.querySelector("#create-folder-modal .cancel-button").addEventListener("click", () => {
    document.getElementById("create-folder-modal").classList.remove("show");
  });
  
  // Gestionnaire pour fermer le modal de création de dossier
  document.querySelectorAll("#create-folder-modal .close-modal").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("create-folder-modal").classList.remove("show");
    });
  });

  // Gestionnaire pour fermer le modal en appuyant sur Échap
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("file-details-modal");
      if (modal.classList.contains("show")) {
        modal.classList.remove("show");
      }
    }
  });
});
