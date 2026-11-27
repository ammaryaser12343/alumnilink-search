window.profilePhoto = (() => {
  const { request, message } = window.profileClient;
  const endpoint = "/api/profiles/me/photo";
  const panel = document.getElementById("profile-photo");
  const input = document.getElementById("photo-file");
  const preview = document.getElementById("photo-preview");
  const openPhoto = document.getElementById("photo-open");
  const viewer = document.getElementById("photo-viewer");
  const viewerImage = document.getElementById("photo-viewer-image");
  const placeholder = panel.querySelector(".photo-placeholder");
  const form = document.getElementById("photo-upload");
  const upload = form.querySelector('button[type="submit"]');
  const fileDetail = document.getElementById("photo-file-detail");
  const remove = document.getElementById("remove-photo");
  const status = document.getElementById("photo-status");
  let saved = null;
  let previewUrl;
  let busy = false;
  let available = true;

  const photoMessage = (text, error) => message(text, error, status);

  function render(photo = saved) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = photo ? URL.createObjectURL(photo) : null;
    if (previewUrl) preview.src = previewUrl;
    else preview.removeAttribute("src");
    openPhoto.hidden = !previewUrl;
    placeholder.hidden = Boolean(previewUrl);
    updateControls();
  }

  function updateControls() {
    input.disabled = busy || !available;
    openPhoto.disabled = busy || !saved || Boolean(input.files.length);
    upload.hidden = !input.files.length;
    upload.disabled = input.disabled || upload.hidden;
    fileDetail.textContent = input.files[0]?.name || "JPEG or PNG, up to 2 MB";
    remove.disabled = input.disabled;
    remove.hidden = !saved;
    upload.textContent = saved ? "Replace photo" : "Upload photo";
  }

  async function changePhoto(method, file) {
    busy = true;
    updateControls();
    photoMessage("");
    try {
      saved = await request(endpoint, method, file);
      input.value = "";
      if (method === "PUT") photoMessage("Photo saved.");
      if (method === "DELETE") photoMessage("Photo removed.");
    } catch (error) {
      if (error.code === "PHOTO_STORAGE_NOT_CONFIGURED") available = false;
      photoMessage(error.message, true);
    } finally {
      busy = false;
      render(input.files[0] ?? saved);
    }
  }

  openPhoto.addEventListener("click", () => {
    const size = Math.min(preview.naturalWidth, preview.naturalHeight);
    if (!size) return;
    viewerImage.width = size;
    viewerImage.src = previewUrl;
    viewer.showModal();
  });
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("close", () => viewerImage.removeAttribute("src"));

  input.addEventListener("change", () => {
    const file = input.files[0];
    if (file && (!["image/jpeg", "image/png"].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      input.value = "";
      photoMessage("Choose a JPEG or PNG photo up to 2 MB.", true);
      render();
      return;
    }
    photoMessage("");
    render(file ?? saved);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!upload.disabled) changePhoto("PUT", input.files[0]);
  });
  remove.addEventListener("click", () => {
    if (!remove.disabled) changePhoto("DELETE");
  });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted && previewUrl) URL.revokeObjectURL(previewUrl);
  });

  return {
    showBeforeCreation() {
      panel.hidden = false;
      fileDetail.textContent = "Save your profile to add a photo.";
    },
    load() {
      panel.hidden = false;
      document.getElementById("photo-privacy-link").hidden = false;
      if (location.hash === "#profile-photo") panel.scrollIntoView();
      return changePhoto("GET");
    },
  };
})();
