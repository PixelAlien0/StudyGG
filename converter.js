(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const dropZone = $('#drop-zone');
  const input = $('#pptx-file');
  const convertButton = $('#convert-button');
  const selectedPanel = $('#selected-file');
  const statusPanel = $('#conversion-status');
  const statusText = $('#conversion-status-text');
  const progressBar = $('#conversion-progress-bar');
  const engineState = $('#engine-state');
  const engineText = $('#engine-state-text');
  const maximumBytes = 200 * 1024 * 1024;
  const motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selectedFile = null;
  let engineAvailable = false;
  let converting = false;

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function setProgress(percent) {
    progressBar.style.transform = `scaleX(${Math.max(0, Math.min(100, percent)) / 100})`;
  }

  function showStatus(message, type = 'working') {
    statusPanel.hidden = false;
    statusPanel.dataset.state = type;
    statusText.textContent = message;
  }

  function updateButton() {
    convertButton.disabled = !selectedFile || !engineAvailable || converting;
  }

  function selectFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      showStatus('Choose a PowerPoint file with the .pptx extension.', 'error');
      return;
    }
    if (file.size > maximumBytes) {
      showStatus('The selected presentation exceeds the 200 MB limit.', 'error');
      return;
    }
    selectedFile = file;
    $('#selected-file-name').textContent = file.name;
    $('#selected-file-size').textContent = formatBytes(file.size);
    selectedPanel.hidden = false;
    statusPanel.hidden = true;
    setProgress(0);
    updateButton();
    if (motionAllowed && window.gsap) window.gsap.fromTo(selectedPanel, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
  }

  function removeFile() {
    selectedFile = null;
    input.value = '';
    selectedPanel.hidden = true;
    statusPanel.hidden = true;
    setProgress(0);
    updateButton();
  }

  async function checkEngine() {
    try {
      const response = await fetch('api/converter-status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      const status = await response.json();
      engineAvailable = Boolean(status.available);
      engineState.classList.toggle('is-ready', engineAvailable);
      engineState.classList.toggle('is-unavailable', !engineAvailable);
      engineText.textContent = engineAvailable ? 'PowerPoint engine ready' : 'PowerPoint engine unavailable';
    } catch {
      engineAvailable = false;
      engineState.classList.add('is-unavailable');
      engineText.textContent = 'Local engine required';
      $('#public-note').hidden = false;
    }
    updateButton();
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.replace(/\.pptx$/i, '.pdf');
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function convert() {
    if (!selectedFile || !engineAvailable || converting) return;
    converting = true;
    updateButton();
    showStatus('Uploading the presentation to the local PowerPoint engine…');
    setProgress(2);

    const request = new XMLHttpRequest();
    request.open('POST', 'api/convert');
    request.responseType = 'blob';
    request.setRequestHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    request.setRequestHeader('X-File-Name', encodeURIComponent(selectedFile.name));
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      const uploadPercent = Math.round((event.loaded / event.total) * 65);
      setProgress(uploadPercent);
      statusText.textContent = event.loaded === event.total
        ? 'PowerPoint is exporting the slides to PDF…'
        : `Uploading presentation… ${Math.round((event.loaded / event.total) * 100)}%`;
    });
    request.upload.addEventListener('load', () => {
      setProgress(72);
      if (motionAllowed && window.gsap) window.gsap.to(progressBar, { scaleX: 0.9, duration: 10, ease: 'none' });
    });
    request.addEventListener('load', async () => {
      converting = false;
      if (request.status === 200) {
        if (window.gsap) window.gsap.killTweensOf(progressBar);
        setProgress(100);
        showStatus('PDF created. The download has started.', 'success');
        downloadBlob(request.response, selectedFile.name);
      } else {
        let message = 'The presentation could not be converted.';
        try {
          const payload = JSON.parse(await request.response.text());
          if (payload.error) message = payload.error;
        } catch {
          // Keep the plain fallback message.
        }
        if (window.gsap) window.gsap.killTweensOf(progressBar);
        setProgress(0);
        showStatus(message, 'error');
      }
      updateButton();
    });
    request.addEventListener('error', () => {
      converting = false;
      setProgress(0);
      showStatus('The local converter connection was interrupted.', 'error');
      updateButton();
    });
    request.send(selectedFile);
  }

  input.addEventListener('change', () => selectFile(input.files[0]));
  $('#remove-file').addEventListener('click', removeFile);
  convertButton.addEventListener('click', convert);
  ['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  }));
  dropZone.addEventListener('drop', (event) => selectFile(event.dataTransfer.files[0]));

  if (motionAllowed && window.gsap) {
    window.gsap.timeline({ defaults: { ease: 'power2.out' } })
      .from('.converter-masthead > *', { y: -8, opacity: 0, duration: 0.3, stagger: 0.04 })
      .from('.converter-index', { x: -12, opacity: 0, duration: 0.35 }, '-=0.12')
      .from('.converter-copy > *', { y: 14, opacity: 0, duration: 0.38, stagger: 0.05 }, '-=0.24')
      .from('.converter-panel', { x: 18, opacity: 0, duration: 0.42 }, '-=0.3');
  }

  checkEngine();
})();
