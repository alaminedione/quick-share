// Afficher la liste des fichiers disponibles
fetch('/files')
  .then(response => response.json())
  .then(files => {
    const fileList = document.getElementById('files');
    files.forEach(file => {
      const li = document.createElement('li');
      li.innerHTML = `<a href="/files/${file}" download>${file}</a>`;
      fileList.appendChild(li);
    });
  });

// Gérer le formulaire d'upload
document.getElementById('upload-form').addEventListener('submit', function(event) {
  event.preventDefault();

  const formData = new FormData(this);

  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(response => response.text())
  .then(data => alert(data))
  .catch(error => console.error('Erreur lors de l\'envoi des fichiers', error));
});

