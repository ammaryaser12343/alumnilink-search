// Search page. Owner: Ammar.
const form = document.getElementById('search-form');
const message = document.getElementById('message');
const resultsBox = document.getElementById('results');
const prevButton = document.getElementById('prev-page');
const nextButton = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const pager = document.querySelector('.pager');
const industrySelect = document.getElementById('industry');

const contactDialog = document.getElementById('contact-dialog');
const contactForm = document.getElementById('contact-form');
const contactMessage = document.getElementById('contact-message');
const contactStatus = document.getElementById('contact-status');
const contactSend = document.getElementById('contact-send');
const user = currentUser();

let currentPage = 1;
let contactTarget = null;

INDUSTRIES.forEach((industry) => {
  const option = document.createElement('option');
  option.value = industry;
  option.textContent = industry;
  industrySelect.append(option);
});
document.getElementById('gradYear').max = new Date().getFullYear();

function buildQuery(page) {
  const params = new URLSearchParams();
  const near = document.getElementById('near').value.trim();
  for (const field of ['q', 'location', 'industry', 'gradYear', 'near', 'radiusKm', 'sort']) {
    const value = document.getElementById(field).value.trim();
    // Distance options only make sense with a place, so they are not sent without one.
    if (!near && (field === 'radiusKm' || (field === 'sort' && value === 'distance'))) continue;
    if (value) params.set(field, value);
  }
  params.set('page', page);
  return params.toString();
}

// Every value goes in with textContent, never innerHTML, so profile text cannot run as code.
// Hidden fields are simply missing from the API answer, so each part is added only if present.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function has(value) {
  return value !== undefined && value !== null && value !== '';
}

// "Mariam Hassan" -> "MH"
function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

const MAX_SKILLS_SHOWN = 5;

// "Software · Class of 2020 · Cairo · 3 km away" (only the parts the alum shows).
// On the result rows the city is a button that filters by it.
function metaLine(alumnus, clickableCity) {
  const meta = element('p', 'card-meta');
  const addPart = (part) => {
    if (meta.childNodes.length) meta.append(element('span', 'sep', '·'));
    meta.append(part);
  };
  if (has(alumnus.industry)) addPart(alumnus.industry);
  if (has(alumnus.graduationYear)) addPart(`Class of ${alumnus.graduationYear}`);
  if (has(alumnus.location)) {
    if (clickableCity) {
      const city = element('button', 'text-button', alumnus.location);
      city.type = 'button';
      city.title = `Show alumni in ${alumnus.location}`;
      city.addEventListener('click', () => searchFor('location', alumnus.location));
      addPart(city);
    } else {
      addPart(alumnus.location);
    }
  }
  if (typeof alumnus.distanceKm === 'number') addPart(`${alumnus.distanceKm} km away`);
  return meta;
}

// Skill tags; each one is a button that searches for that skill.
// max = how many to show before "+N" (null shows them all).
function skillList(skills, max) {
  const tags = element('ul', 'skill-tags');
  tags.setAttribute('aria-label', 'Skills');
  const shown = max ? skills.slice(0, max) : skills;
  shown.forEach((skill) => {
    const item = element('li');
    const button = element('button', 'tag tag-button', skill);
    button.type = 'button';
    button.title = `Search for ${skill}`;
    button.addEventListener('click', () => {
      if (profileDialog.open) profileDialog.close();
      searchFor('q', skill);
    });
    item.append(button);
    tags.append(item);
  });
  if (max && skills.length > max) tags.append(element('li', 'tag tag-more', `+${skills.length - max}`));
  return tags;
}

function renderCard(alumnus) {
  // Row: photo | name, company, meta line, bio, skills | button (added by renderResults)
  const card = element('article', 'result-card');

  // The photo (or initials) is a button that opens the profile view.
  // The .avatar span inside is where the profile photo is placed when it loads.
  const avatarButton = element('button', 'avatar-button');
  avatarButton.type = 'button';
  avatarButton.setAttribute('aria-label', `View ${alumnus.name}'s profile`);
  const avatar = element('span', 'avatar', initials(alumnus.name));
  avatar.setAttribute('aria-hidden', 'true');
  // Bigger copy of the photo, shown while the mouse is over it (see .photo-peek in styles.css)
  const peek = element('img', 'photo-peek');
  peek.alt = '';
  peek.hidden = true;
  avatarButton.append(avatar, peek);
  avatarButton.addEventListener('mouseenter', () => {
    const photo = avatar.querySelector('img');
    if (!photo) return;
    peek.src = photo.src;
    peek.hidden = false;
  });
  avatarButton.addEventListener('mouseleave', () => { peek.hidden = true; });
  avatarButton.addEventListener('click', () => { peek.hidden = true; openProfile(alumnus, avatar); });
  card.append(avatarButton);

  const main = element('div', 'card-main');
  const title = element('div', 'card-title');
  const heading = element('h3');
  const nameButton = element('button', 'name-button', alumnus.name);
  nameButton.type = 'button';
  nameButton.addEventListener('click', () => openProfile(alumnus, avatar));
  heading.append(nameButton);
  title.append(heading);
  if (has(alumnus.company)) title.append(element('p', 'card-company', alumnus.company));
  main.append(title);

  const meta = metaLine(alumnus, true);
  if (meta.childNodes.length) main.append(meta);

  if (has(alumnus.bio)) main.append(element('p', 'card-bio', alumnus.bio));

  if (Array.isArray(alumnus.skills) && alumnus.skills.length > 0) {
    main.append(skillList(alumnus.skills, MAX_SKILLS_SHOWN));
  }
  card.append(main);
  return card;
}

// ---------- Profile view ----------
// Clicking a name or photo shows that alum's profile in a window: large photo,
// details, full bio and every skill. It only uses what the search already returned,
// so hidden fields stay hidden here too.
const profileDialog = document.getElementById('profile-dialog');
const profileView = document.getElementById('profile-view');

function canRequest(alumnus) {
  return user && (user.role === 'student' || user.role === 'alumni') && !alumnus.isMine;
}

function openProfile(alumnus, avatar) {
  const photoBox = element('div', 'profile-photo-large');
  const photo = avatar.querySelector('img');
  if (photo) {
    const big = element('img');
    big.src = photo.src;
    big.alt = `Photo of ${alumnus.name}`;
    photoBox.append(big);
  } else {
    photoBox.textContent = initials(alumnus.name);
    photoBox.setAttribute('aria-hidden', 'true');
  }

  const head = element('div', 'profile-head');
  head.append(photoBox, element('h3', '', alumnus.name));
  head.querySelector('h3').id = 'profile-name';
  if (has(alumnus.company)) head.append(element('p', 'card-company', alumnus.company));
  const meta = metaLine(alumnus, false);
  if (meta.childNodes.length) head.append(meta);

  const body = element('div', 'profile-body');
  if (has(alumnus.bio)) {
    body.append(element('h4', '', 'About'), element('p', 'profile-bio', alumnus.bio));
  }
  if (Array.isArray(alumnus.skills) && alumnus.skills.length > 0) {
    body.append(element('h4', '', 'Skills'), skillList(alumnus.skills, null));
  }

  const actions = element('div', 'dialog-buttons');
  const close = element('button', 'secondary', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => profileDialog.close());
  actions.append(close);
  if (canRequest(alumnus)) {
    const ask = element('button', 'contact-button');
    ask.type = 'button';
    ask.dataset.alumniId = alumnus.id;
    showRequestState(ask);
    ask.addEventListener('click', () => {
      profileDialog.close();
      openContactDialog(alumnus);
    });
    actions.append(ask);
  }

  profileView.replaceChildren(head, body, actions);
  if (!body.childNodes.length) body.remove();
  profileDialog.showModal();
}

// Clicking the dark area around the window closes it.
profileDialog.addEventListener('click', (event) => {
  if (event.target === profileDialog) profileDialog.close();
});

function renderEmptyState(text) {
  const box = element('div', 'empty-state');
  box.append(element('h3', '', 'No alumni match your search'));
  box.append(element('p', '', text));
  const clear = element('button', 'secondary', 'Clear all filters');
  clear.type = 'button';
  clear.addEventListener('click', clearAll);
  box.append(clear);
  resultsBox.replaceChildren(box);
}

function renderResults(results) {
  resultsBox.replaceChildren();
  const avatars = new Map();
  results.forEach((alumnus) => {
    const card = renderCard(alumnus);
    avatars.set(alumnus.id, card.querySelector('.avatar'));

    // Students and alumni can ask an alum for contact details, but not on their own card.
    if (canRequest(alumnus)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'contact-button';
      button.dataset.alumniId = alumnus.id;
      button.addEventListener('click', () => openContactDialog(alumnus));
      showRequestState(button);
      card.append(button);
    }

    resultsBox.append(card);
  });
  loadDirectoryPhotos(avatars);
}

async function loadDirectoryPhotos(avatars) {
  if (!avatars.size) return;
  const profileBase = window.ALUMNILINK?.PROFILE_API_URL ?? API.profile.replace(/\/api\/?$/, '');
  const query = new URLSearchParams({ ids: [...avatars.keys()].join(',') });
  try {
    const { photos } = await apiRequest(`${profileBase}/api/profiles/directory/photos?${query}`);
    for (const [id, encoded] of Object.entries(photos)) {
      const avatar = avatars.get(id);
      if (!avatar?.isConnected) continue;
      const image = document.createElement('img');
      image.alt = '';
      image.src = 'data:image/webp;base64,' + encoded;
      avatar.replaceChildren(image);
    }
  } catch {
    // Directory cards retain their initials if photos are unavailable.
  }
}

// Grey placeholder rows shown while the results load.
function renderLoadingCards() {
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const row = element('div', 'result-card skeleton');
    const lines = element('span', 'bone-lines');
    lines.append(element('span', 'bone bone-line'), element('span', 'bone bone-line short'));
    row.append(element('span', 'bone bone-avatar'), lines, element('span', 'bone bone-button'));
    rows.push(row);
  }
  resultsBox.replaceChildren(...rows);
}

async function search(page) {
  message.textContent = 'Searching...';
  resultsBox.setAttribute('aria-busy', 'true');
  renderLoadingCards();
  prevButton.disabled = true;
  nextButton.disabled = true;
  showActiveFilters();
  const query = buildQuery(page);
  try {
    const data = await apiRequest(`${API.search}/alumni?${query}`);
    currentPage = data.page;
    // A search with no filters counts the whole directory, which the stats line uses.
    if (query === 'page=1') {
      directoryTotal = data.total;
      showStats();
    }
    const place = data.near ? ` within ${data.near.radiusKm} km of ${data.near.name}` : '';
    if (data.total === 0) {
      renderEmptyState(`Nothing found${place}. Try a shorter search, another city or fewer filters.`);
    } else {
      renderResults(data.results);
    }

    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
    pager.hidden = data.total === 0;
    message.textContent = data.total === 0
      ? 'No results'
      : `${data.total} ${data.total === 1 ? 'alum' : 'alumni'} found${place}`;
    showActiveIndustry();
    // "Showing 11-20 of 23"
    const first = (currentPage - 1) * data.pageSize + 1;
    const last = first + data.results.length - 1;
    pageInfo.textContent = `Showing ${first}–${last} of ${data.total} · Page ${currentPage} of ${totalPages}`;
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
  } catch (error) {
    resultsBox.replaceChildren();
    pageInfo.textContent = '';
    prevButton.disabled = true;
    nextButton.disabled = true;
    message.textContent = error.status === 401
      ? 'Please log in to search the directory.'
      : error.message;
  } finally {
    resultsBox.removeAttribute('aria-busy');
  }
}

// Used by the clickable skill tags, city names and filter pills: set one field and search again.
function searchFor(field, value) {
  document.getElementById(field).value = value;
  if (field === 'q') saveRecentSearch(value);
  search(1);
  document.querySelector('.search-hero').scrollIntoView({ block: 'start' });
}

// ---------- Filters in use ----------
// One pill per filled-in filter, e.g. "Location: Cairo x". Clicking it removes that filter.
const activeBox = document.getElementById('active-filters');

function filterPill(text, clearFields) {
  const pill = element('button', 'filter-pill', text);
  pill.type = 'button';
  pill.setAttribute('aria-label', `Remove filter: ${text}`);
  pill.append(element('span', 'pill-x', '×'));
  pill.addEventListener('click', () => {
    clearFields.forEach((field) => { document.getElementById(field).value = ''; });
    search(1);
  });
  return pill;
}

function showActiveFilters() {
  const value = (field) => document.getElementById(field).value.trim();
  const pills = [];
  if (value('q')) pills.push(filterPill(`"${value('q')}"`, ['q']));
  if (value('location')) pills.push(filterPill(`Location: ${value('location')}`, ['location']));
  if (value('industry')) pills.push(filterPill(value('industry'), ['industry']));
  if (value('gradYear')) pills.push(filterPill(`Class of ${value('gradYear')}`, ['gradYear']));
  if (value('near')) {
    pills.push(filterPill(`Within ${value('radiusKm') || 50} km of ${value('near')}`, ['near', 'radiusKm']));
  }
  if (pills.length > 1) {
    const clear = element('button', 'link-button', 'Clear all');
    clear.type = 'button';
    clear.addEventListener('click', clearAll);
    pills.push(clear);
  }
  activeBox.replaceChildren(...pills);
  activeBox.hidden = pills.length === 0;
}

// ---------- "Request sent" on cards ----------
// alumni profile id -> status of the newest request this user sent to them.
const sentRequests = new Map();

function showRequestState(button) {
  const status = sentRequests.get(button.dataset.alumniId);
  if (status === 'pending') {
    button.textContent = 'Request sent';
    button.disabled = true;
  } else if (status === 'accepted') {
    button.textContent = 'Contact shared';
    button.disabled = true;
  } else {
    // No request yet, or the last one was declined: they may ask again.
    button.textContent = 'Request contact';
    button.disabled = false;
  }
}

function refreshRequestButtons() {
  resultsBox.querySelectorAll('.contact-button').forEach(showRequestState);
}

// Students get their sent list in "requests", alumni in "sent" (see GET /api/contact-requests).
async function loadSentRequests() {
  if (!user || (user.role !== 'student' && user.role !== 'alumni')) return;
  try {
    const data = await apiRequest(`${API.search}/contact-requests`);
    const sent = data.role === 'alumni' ? data.sent : data.requests;
    // The list is newest first, so the first request seen for each alum is the latest one.
    (sent || []).forEach((request) => {
      if (!sentRequests.has(request.alumniId)) sentRequests.set(request.alumniId, request.status);
    });
    refreshRequestButtons();
  } catch (error) {
    // Buttons simply stay as "Request contact"; the API still blocks duplicates.
  }
}

// ---------- Directory stats in the top banner ----------
let directoryTotal = null;
let filterOptions = null;

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function showStats() {
  const box = document.getElementById('directory-stats');
  if (directoryTotal === null || !filterOptions) return;
  const industries = filterOptions.industries.filter((item) => item.count > 0).length;
  const cities = filterOptions.locations.length;
  // The API returns at most 20 places, so 20 means "20 or more".
  const cityText = cities >= 20 ? '20+ cities' : plural(cities, 'city', 'cities');
  box.replaceChildren();
  [plural(directoryTotal, 'alum', 'alumni'), plural(industries, 'industry', 'industries'), cityText]
    .forEach((text, index) => {
      if (index > 0) box.append(element('span', 'stat-dot', '·'));
      const [number, ...words] = text.split(' ');
      const stat = element('span', 'stat');
      stat.append(element('strong', '', number), ` ${words.join(' ')}`);
      box.append(stat);
    });
  box.hidden = false;
}

function openContactDialog(alumnus) {
  contactTarget = alumnus;
  document.getElementById('contact-name').textContent = alumnus.name;
  contactMessage.value = '';
  contactStatus.textContent = '';
  contactSend.disabled = false;
  contactDialog.showModal();
}

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = contactMessage.value.trim();
  if (text.length < 10 || text.length > 500) {
    contactStatus.textContent = 'Your message must be between 10 and 500 characters.';
    return;
  }
  contactSend.disabled = true;
  contactStatus.textContent = 'Sending...';
  try {
    await apiRequest(`${API.search}/contact-requests`, {
      method: 'POST',
      body: JSON.stringify({ alumniId: contactTarget.id, message: text })
    });
    contactStatus.textContent = 'Request sent. You will see the answer on the Contact requests page.';
    sentRequests.set(contactTarget.id, 'pending');
    refreshRequestButtons();
  } catch (error) {
    contactStatus.textContent = error.message;
    contactSend.disabled = false;
  }
});
document.getElementById('contact-cancel').addEventListener('click', () => contactDialog.close());

form.addEventListener('submit', (event) => {
  event.preventDefault();
  saveRecentSearch(document.getElementById('q').value.trim());
  search(1);
});
// Sorting sits above the results, so changing it searches straight away.
document.getElementById('sort').addEventListener('change', () => search(1));

// Empties every field (including the search bar and Sort, which belong to the form) and searches again.
function clearAll() {
  form.reset();
  search(1);
}
document.getElementById('clear-filters').addEventListener('click', clearAll);

// ---------- Recent searches ----------
// Kept only in this browser (localStorage), one list per signed-in user, at most 5.
// Browser storage can be switched off, so every read and write is wrapped in try/catch.
const recentBox = document.getElementById('recent-searches');
const recentList = document.getElementById('recent-list');
const recentKey = `alumnilink.recentSearches.${user ? user.id : 'guest'}`;
const MAX_RECENT = 5;

function readRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(recentKey) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [];
  } catch (error) {
    return [];
  }
}

function saveRecentSearch(text) {
  if (!text) return;
  const others = readRecent().filter((item) => item.toLowerCase() !== text.toLowerCase());
  try {
    localStorage.setItem(recentKey, JSON.stringify([text, ...others].slice(0, MAX_RECENT)));
  } catch (error) {
    // Storage blocked: the search still works, it just is not remembered.
  }
  showRecent();
}

function chip(text, onClick) {
  const button = element('button', 'chip', text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function showRecent() {
  const items = readRecent();
  recentList.replaceChildren(...items.map((text) => chip(text, () => {
    document.getElementById('q').value = text;
    saveRecentSearch(text);
    search(1);
  })));
  recentBox.hidden = items.length === 0;
}

document.getElementById('clear-recent').addEventListener('click', () => {
  try {
    localStorage.removeItem(recentKey);
  } catch (error) {
    // Nothing to clear if storage is blocked.
  }
  showRecent();
});

// ---------- Industry chips ----------
// One click filters by an industry; clicking the selected one again removes the filter.
const industryBox = document.getElementById('industry-chips');
const industryList = document.getElementById('industry-list');
const MAX_INDUSTRY_CHIPS = 6;

function showIndustryChips(industries) {
  const top = industries.filter((item) => item.count > 0)
    .sort((first, second) => second.count - first.count)
    .slice(0, MAX_INDUSTRY_CHIPS);
  industryList.replaceChildren(...top.map((item) => {
    const button = chip(`${item.name} (${item.count})`, () => {
      industrySelect.value = industrySelect.value === item.name ? '' : item.name;
      search(1);
    });
    button.dataset.industry = item.name;
    return button;
  }));
  industryBox.hidden = top.length === 0;
  showActiveIndustry();
}

// Marks the chip that matches the Industry filter, so both always agree.
function showActiveIndustry() {
  for (const button of industryList.querySelectorAll('.chip')) {
    button.setAttribute('aria-pressed', String(button.dataset.industry === industrySelect.value));
  }
}
prevButton.addEventListener('click', () => search(currentPage - 1));
nextButton.addEventListener('click', () => search(currentPage + 1));

// Fills a <datalist> so the browser suggests values while typing.
function fillSuggestions(input, listId, items) {
  let list = document.getElementById(listId);
  if (!list) {
    list = document.createElement('datalist');
    list.id = listId;
    document.body.append(list);
    input.setAttribute('list', listId);
  }
  list.replaceChildren(...items.map((item) => {
    const option = document.createElement('option');
    option.value = item.name;
    return option;
  }));
}

// GET /api/alumni/filters: industry counts, year range, common skills and places.
// The page still works with the plain lists above if this call fails.
async function loadFilterOptions() {
  try {
    const options = await apiRequest(`${API.search}/alumni/filters`);
    for (const option of industrySelect.options) {
      const match = options.industries.find((item) => item.name === option.value);
      if (match) option.textContent = `${match.name} (${match.count})`;
    }
    const year = document.getElementById('gradYear');
    if (options.graduationYears.min) year.min = options.graduationYears.min;
    if (options.graduationYears.max) year.max = options.graduationYears.max;
    fillSuggestions(document.getElementById('q'), 'skill-suggestions', options.skills);
    fillSuggestions(document.getElementById('location'), 'location-suggestions', options.locations);
    showIndustryChips(options.industries);
    filterOptions = options;
    showStats();
  } catch (error) {
    // Not signed in or service down: the search itself shows the message.
  }
}

// On phones the filters start folded so the results are visible first.
if (window.matchMedia('(max-width: 900px)').matches) {
  document.getElementById('filters-box').open = false;
}

// Pressing "/" anywhere on the page (except while typing in a field) jumps to the search box.
document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
  if (event.key !== '/' || typing || event.ctrlKey || event.metaKey || event.altKey || contactDialog.open || profileDialog.open) return;
  event.preventDefault();
  document.getElementById('q').focus();
});

showRecent();
loadFilterOptions();
loadSentRequests();
search(1);
