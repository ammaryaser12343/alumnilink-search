const { request, message } = window.profileClient;
const form = document.getElementById("profile");
const toggle = document.getElementById("toggle-profile");
const save = form.querySelector('[type="submit"]');
const saveStatus = document.getElementById("profile-save-status");
let current;
form.elements.graduationYear.max = new Date().getUTCFullYear();

function renderStatus(profile) {
  current = profile;
  toggle.hidden = !profile;
  toggle.textContent = profile?.isActive ? "Deactivate profile" : "Reactivate profile";
}

function render(profile) {
  const profileLoaded = !current && profile;
  renderStatus(profile);
  for (const field of [
    "graduationYear",
    "company",
    "industry",
    "location",
    "contactEmail",
    "bio",
  ]) {
    form.elements[field].value = profile?.[field] ?? "";
  }
  form.elements.skills.value = profile?.skills.join(", ") ?? "";
  form.hidden = false;
  if (!profile) window.profilePhoto.showBeforeCreation();
  if (profileLoaded) window.profilePhoto.load();
}
(async () => {
  try {
    render((await request("/api/profiles/me")).profile);
  } catch (error) {
    if (error.code === "PROFILE_NOT_FOUND") render();
    else message(error.message, true);
  }
})();
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  save.disabled = true;
  toggle.disabled = true;
  message("", false, saveStatus);
  const fields = Object.fromEntries(new FormData(form));
  const body = {
    graduationYear: Number(fields.graduationYear),
    company: fields.company,
    industry: fields.industry,
    bio: fields.bio,
    contactEmail: fields.contactEmail.trim() || null,
    skills: fields.skills
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
  if (fields.location.trim() !== (current?.location ?? ""))
    body.location = fields.location.trim() || null;
  try {
    render(
      (
        await request(
          current ? "/api/profiles/me" : "/api/profiles",
          current ? "PATCH" : "POST",
          body,
        )
      ).profile,
    );
    message("Profile saved.", false, saveStatus);
  } catch (error) {
    message(error.message, true, saveStatus);
  } finally {
    save.disabled = false;
    toggle.disabled = false;
  }
});
toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  save.disabled = true;
  message("", false, saveStatus);
  try {
    const { profile } = await request("/api/profiles/me/status", "PATCH", {
      isActive: !current.isActive,
    });
    renderStatus(profile);
    const notice = profile.isActive
      ? "Your profile is back in the directory."
      : "Your profile is hidden from the directory.";
    message(notice, false, saveStatus);
  } catch (error) {
    message(error.message, true, saveStatus);
  } finally {
    toggle.disabled = false;
    save.disabled = false;
  }
});
