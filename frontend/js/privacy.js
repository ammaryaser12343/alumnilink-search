const { request, message } = window.profileClient;
const form = document.getElementById("privacy");
const fields = [...form.querySelectorAll('input[type="checkbox"]')];
const detailsStatus = document.getElementById("details-status");
const audienceEndpoint = "/api/profiles/me/photo/audience";
const audienceForm = document.getElementById("photo-visibility");
const audienceOptions = [...audienceForm.elements.audience];
const audienceSave = audienceForm.querySelector('button[type="submit"]');
const audienceStatus = document.getElementById("photo-visibility-status");
let savedAudience;
let audienceBusy = false;

function updateAudienceControls() {
  const disabled = audienceBusy || !savedAudience;
  for (const option of audienceOptions) option.disabled = disabled;
  audienceSave.disabled = disabled || audienceForm.elements.audience.value === savedAudience;
}

async function loadAudience() {
  try {
    ({ audience: savedAudience } = await request(audienceEndpoint));
    audienceForm.elements.audience.value = savedAudience;
  } catch (error) {
    message(error.message, true, audienceStatus);
  } finally {
    updateAudienceControls();
  }
}

(async () => {
  try {
    const { privacy } = await request("/api/profiles/me/privacy");
    for (const input of fields) input.checked = privacy[input.name] === true;
    form.hidden = false;
    audienceForm.hidden = false;
    if (location.hash === "#photo-visibility") audienceForm.scrollIntoView();
    await loadAudience();
  } catch (error) {
    message(error.message, true);
  }
})();

document.getElementById("select-all-privacy").addEventListener("click", () => {
  for (const field of fields) field.checked = true;
  message("", false, detailsStatus);
});

form.addEventListener("change", () => message("", false, detailsStatus));
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  message("", false, detailsStatus);
  const choices = Object.fromEntries(fields.map((input) => [input.name, input.checked]));
  try {
    await request("/api/profiles/me/privacy", "PATCH", choices);
    message("Details saved.", false, detailsStatus);
  } catch (error) {
    message(error.message, true, detailsStatus);
  } finally {
    submit.disabled = false;
  }
});

audienceForm.addEventListener("change", () => {
  message("", false, audienceStatus);
  updateAudienceControls();
});

audienceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (audienceSave.disabled) return;
  const audience = audienceForm.elements.audience.value;
  audienceBusy = true;
  updateAudienceControls();
  try {
    ({ audience: savedAudience } = await request(audienceEndpoint, "PATCH", { audience }));
    audienceForm.elements.audience.value = savedAudience;
    message("Photo visibility saved.", false, audienceStatus);
  } catch (error) {
    message(error.message, true, audienceStatus);
  } finally {
    audienceBusy = false;
    updateAudienceControls();
  }
});
