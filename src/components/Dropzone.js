export function createDropzone({ dropzoneEl, inputEl, onFile, onError }) {
  if (!dropzoneEl || !inputEl) return;

  const setActive = (isActive) => {
    dropzoneEl.classList.toggle('ring-2', isActive);
    dropzoneEl.classList.toggle('ring-fileintel-gold/20', isActive);
    dropzoneEl.classList.toggle('border-fileintel-gold', isActive);
    dropzoneEl.classList.toggle('shadow-soft', isActive);
  };

  const handleFiles = () => {
    const file = inputEl.files?.[0];
    if (file) {
      onFile(file);
    }
  };

  inputEl.addEventListener('change', handleFiles);

  dropzoneEl.addEventListener('dragenter', (event) => {
    event.preventDefault();
    setActive(true);
  });

  dropzoneEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    setActive(true);
  });

  dropzoneEl.addEventListener('dragleave', (event) => {
    event.preventDefault();
    setActive(false);
  });

  dropzoneEl.addEventListener('drop', (event) => {
    event.preventDefault();
    setActive(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      onError('Please select a valid PDF file.');
      return;
    }

    onFile(file);
  });

  return {
    reset() {
      inputEl.value = '';
      setActive(false);
    },
  };
}