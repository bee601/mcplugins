let plugins = [];
let nextPage = 0;
let loading = false;
let requestId = 0;

const state = { search: '', sources: new Set(), platforms: new Set(), editions: new Set(), prices: new Set(), version: 'all', quick: 'all', sort: 'relevance', saved: new Set(), view: 'catalog' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function init() {
  buildFilterOptions();
  bindEvents();
  loadPlugins(true);
  if (window.lucide) lucide.createIcons();
}

function buildFilterOptions() {
  const options = {
    sourceFilters: ['Modrinth', 'Spigot'],
    platformFilters: ['Paper', 'Spigot', 'Fabric', 'Quilt', 'Velocity', 'Folia', 'NeoForge', 'Forge'],
    editionFilters: ['Java Edition', 'Bedrock Edition', 'Bukkit', 'Spigot', 'Paper', 'Fabric', 'Quilt', 'NeoForge', 'Forge', 'Velocity', 'Folia'],
    priceFilters: ['Free', 'Paid']
  };
  Object.entries(options).forEach(([id, values]) => {
    $(`#${id}`).innerHTML = values.map((value) => `<label class="check-option"><input type="checkbox" value="${value}" data-filter="${id.replace('Filters', '')}" />${value}</label>`).join('');
  });
  $$('[data-filter]').forEach((input) => input.addEventListener('change', (event) => {
    const collection = state[`${event.target.dataset.filter}s`];
    event.target.checked ? collection.add(event.target.value) : collection.delete(event.target.value);
    loadPlugins(true);
  }));
}

function bindEvents() {
  let searchTimer;
  $('#searchInput').addEventListener('input', (event) => { state.search = event.target.value.trim(); clearTimeout(searchTimer); searchTimer = setTimeout(() => loadPlugins(true), 280); });
  $('#filterToggle').addEventListener('click', () => { const panel = $('#filtersPanel'); panel.hidden = !panel.hidden; });
  $('#versionFilter').addEventListener('change', (event) => { state.version = event.target.value; loadPlugins(true); });
  $('#sortSelect').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  $('#clearFilters').addEventListener('click', clearFilters);
  $('#loadMore').addEventListener('click', () => loadPlugins(false));
  $('#activeFilters').addEventListener('click', (event) => {
    const filter = event.target.closest('[data-remove-filter]');
    if (!filter) return;
    removeActiveFilter(filter.dataset.removeFilter, filter.dataset.value);
  });
  $$('.source-tab').forEach((tab) => tab.addEventListener('click', () => {
    const source = tab.dataset.source;
    state.sources = source === 'all' ? new Set() : new Set([source]);
    $$('.source-tab').forEach((item) => item.classList.toggle('active', item === tab));
    syncCheckboxes(); loadPlugins(true);
  }));
  $$('.chip').forEach((chip) => chip.addEventListener('click', () => { state.quick = chip.dataset.quick; if (state.quick === 'skript') { state.search = 'skript'; $('#searchInput').value = 'skript'; } if (state.quick === 'downloads') { state.sort = 'downloads'; $('#sortSelect').value = 'downloads'; } $$('.chip').forEach((item) => item.classList.toggle('active', item === chip)); state.view = 'catalog'; loadPlugins(true); }));
  $('#savedButton').addEventListener('click', () => { state.view = state.view === 'saved' ? 'catalog' : 'saved'; state.quick = 'all'; $$('.chip').forEach((item) => item.classList.toggle('active', item.dataset.quick === 'all')); render(); });
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => { if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('#searchInput').focus(); } if (event.key === 'Escape') closeDrawer(); });
  $('#resultsGrid').addEventListener('click', (event) => { const saveButton = event.target.closest('[data-save]'); if (saveButton) { toggleSaved(saveButton.dataset.save); return; } const card = event.target.closest('[data-plugin]'); if (card) openDrawer(card.dataset.plugin); });
}

async function loadPlugins(reset) {
  if (loading) return;
  if (reset) { plugins = []; nextPage = 0; requestId += 1; renderLoading(); }
  const currentRequest = requestId;
  loading = true;
  const selectedSources = state.sources.size ? [...state.sources] : ['Modrinth', 'Spigot'];
  const tasks = selectedSources.map((source) => source === 'Modrinth' ? fetchModrinth(nextPage) : fetchSpigot(nextPage));
  try {
    const batches = await Promise.all(tasks);
    if (currentRequest !== requestId) return;
    plugins = mergePluginResults([...plugins, ...batches.flat()]);
    nextPage += 1;
    render();
    $('#loadMoreWrap').hidden = batches.every((batch) => batch.length === 0) || plugins.length === 0;
  } catch (error) {
    if (currentRequest === requestId) renderError(error);
  } finally { loading = false; }
}

async function fetchModrinth(page) {
  const query = state.search ? `&query=${encodeURIComponent(state.search.split(/\s+/)[0])}` : '';
  const facet = encodeURIComponent('[["project_type:plugin"]]');
  const index = state.sort === 'updated' ? 'updated' : state.sort === 'popular' ? 'downloads' : 'relevance';
  const response = await fetch(`https://api.modrinth.com/v2/search?facets=${facet}&limit=50&offset=${page * 50}&index=${index}${query}`);
  if (!response.ok) throw new Error('Modrinth is unavailable right now');
  const data = await response.json();
  return data.hits.map((item) => ({ id: `modrinth-${item.project_id}`, name: item.title, creator: item.author, source: 'Modrinth', sources: ['Modrinth'], platform: platformFromModrinth(item), editions: detectPluginEditions(platformFromModrinth(item), item.categories || []), versions: item.versions?.map((version) => version.split('.').slice(0, 2).join('.')) || ['1.21', '1.20'], price: 'Free', icon: (item.title || 'M')[0].toUpperCase(), iconUrl: item.icon_url, iconClass: 'icon-green', category: item.categories?.[0] || 'Minecraft plugin', downloads: formatNumber(item.downloads), downloadValue: item.downloads || 0, downloadSources: [{ source: 'Modrinth', value: item.downloads || 0 }], updatedAt: item.date_modified, updated: relativeDate(item.date_modified), age: ageInDays(item.date_modified), popularity: item.follows || item.downloads, description: item.description || 'Minecraft plugin from the Modrinth project index.', url: `https://modrinth.com/plugin/${item.slug}`, links: [{ label: 'Modrinth project', url: `https://modrinth.com/plugin/${item.slug}` }, item.source_url && { label: 'Source code', url: item.source_url }, item.issues_url && { label: 'Issues', url: item.issues_url }, item.wiki_url && { label: 'Wiki', url: item.wiki_url }].filter(Boolean) }));
}

async function fetchSpigot(page) {
  const route = state.search ? `search/resources/${encodeURIComponent(state.search.split(/\s+/)[0])}` : 'resources';
  const response = await fetch(`https://api.spiget.org/v2/${route}?size=50&page=${page}&sort=-downloads`);
  if (!response.ok) throw new Error('Spigot is unavailable right now');
  const data = await response.json();
  return data.map((item) => ({ id: `spigot-${item.id}`, name: item.name, creator: item.author?.name || 'Unknown creator', source: 'Spigot', sources: ['Spigot'], platform: ['Spigot', 'Paper'], editions: detectPluginEditions(['Spigot', 'Paper'], [item.tag || 'Minecraft plugin']), versions: (item.testedVersions || []).map((version) => version.split('.').slice(0, 2).join('.')), price: item.premium ? 'Paid' : 'Free', icon: (item.name || 'S')[0].toUpperCase(), iconUrl: item.icon?.url ? `https://www.spigotmc.org/${item.icon.url}` : '', iconClass: 'icon-blue', category: item.tag || 'Minecraft plugin', downloads: formatNumber(item.downloads || 0), downloadValue: item.downloads || 0, downloadSources: [{ source: 'Spigot', value: item.downloads || 0 }], updatedAt: item.updateDate, updated: relativeDate(item.updateDate), age: ageInDays(item.updateDate), popularity: item.rating?.average || item.downloads || 0, description: stripHtml(item.description) || 'Minecraft plugin from the Spigot resource index.', url: `https://www.spigotmc.org/resources/${item.id}/`, links: [{ label: 'Spigot resource', url: `https://www.spigotmc.org/resources/${item.id}/` }, item.links?.R2l0aHVi && { label: 'GitHub', url: item.links.R2l0aHVi }, item.links?.discussion && { label: 'Discussion', url: item.links.discussion }].filter(Boolean) }));
}

function platformFromModrinth(item) { const categories = (item.categories || []).map((category) => category.toLowerCase()); const platforms = ['Fabric', 'Quilt', 'Paper', 'Spigot', 'Velocity'].filter((platform) => categories.includes(platform.toLowerCase())); return platforms.length ? platforms : ['Paper']; }
function detectPluginEditions(platforms = [], categories = []) {
  const editions = new Set(['Java Edition']);
  const labels = [...(platforms || []), ...(categories || [])].join(' ').toLowerCase();
  if (/(bedrock|pocket)/.test(labels)) editions.add('Bedrock Edition');
  if (/(bukkit)/.test(labels)) editions.add('Bukkit');
  if (/(spigot)/.test(labels)) editions.add('Spigot');
  if (/(paper)/.test(labels)) editions.add('Paper');
  if (/(fabric)/.test(labels)) editions.add('Fabric');
  if (/(quilt)/.test(labels)) editions.add('Quilt');
  if (/(velocity)/.test(labels)) editions.add('Velocity');
  if (/(folia)/.test(labels)) editions.add('Folia');
  if (/(forge|neoforge)/.test(labels)) editions.add('NeoForge');
  return [...editions];
}
function stripHtml(value) { return String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim(); }
function formatNumber(value) { if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`; if (value >= 1000) return `${(value / 1000).toFixed(0)}K`; return String(value); }
function formatExactDate(value) { const time = new Date(value).getTime(); if (!Number.isFinite(time)) return 'Date unavailable'; return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(time)); }
function ageInDays(value) { const time = new Date(value).getTime(); return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86400000)) : 999; }
function relativeDate(value) { const days = ageInDays(value); if (days === 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 30) return `${days} days ago`; if (days < 365) return `${Math.floor(days / 30)} months ago`; return 'over a year ago'; }
function mergePluginResults(items) {
  const merged = new Map();
  items.forEach((plugin) => {
    const key = plugin.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existing = merged.get(key);
    if (!existing) { merged.set(key, { ...plugin, sources: [...(plugin.sources || [plugin.source])], downloadSources: [...(plugin.downloadSources || [])], links: [...(plugin.links || [])] }); return; }
    existing.sources = [...new Set([...existing.sources, ...(plugin.sources || [plugin.source])])];
    existing.source = existing.sources.join(' + ');
    existing.downloadSources = [...existing.downloadSources, ...(plugin.downloadSources || [])];
    existing.downloadValue = Math.max(existing.downloadValue || 0, plugin.downloadValue || 0);
    existing.downloads = formatNumber(existing.downloadValue);
    existing.links = [...existing.links, ...(plugin.links || [])].filter((link, index, links) => link && links.findIndex((item) => item.url === link.url) === index);
  });
  return [...merged.values()];
}

function getFilteredPlugins() {
  const searchTerms = state.search.toLowerCase().split(/[\s\-_()[\],.]+/).filter(Boolean);
  let list = plugins.filter((plugin) => {
    const haystack = `${plugin.name} ${plugin.creator} ${plugin.category} ${plugin.description}`.toLowerCase();
    const matchesSearch = !searchTerms.length || searchTerms.every((term) => haystack.includes(term));
    const matchesSource = !state.sources.size || (plugin.sources || [plugin.source]).some((source) => state.sources.has(source));
    const matchesPlatform = !state.platforms.size || [...state.platforms].some((platform) => plugin.platform.includes(platform));
    const matchesEdition = !state.editions.size || (plugin.editions || ['Java Edition']).some((edition) => state.editions.has(edition));
    const matchesPrice = !state.prices.size || state.prices.has(plugin.price === 'Free' ? 'Free' : 'Paid');
    const matchesVersion = state.version === 'all' || plugin.versions.includes(state.version);
    const matchesQuick = state.quick === 'all' || (state.quick === 'free' && plugin.price === 'Free') || (state.quick === 'updated' && plugin.age <= 7) || (state.quick === 'popular' && plugin.popularity >= 95) || (state.quick === 'downloads' && plugin.downloadValue > 0) || (state.quick === 'skript') || (state.quick === 'saved' && state.saved.has(plugin.id));
    return matchesSearch && matchesSource && matchesPlatform && matchesEdition && matchesPrice && matchesVersion && matchesQuick;
  });
  if (state.sort === 'downloads') list.sort((a, b) => b.downloadValue - a.downloadValue);
  if (state.sort === 'popular') list.sort((a, b) => b.popularity - a.popularity);
  if (state.sort === 'updated') list.sort((a, b) => a.age - b.age);
  if (state.sort === 'price-low') list.sort((a, b) => (a.price === 'Free' ? 0 : Number(a.price.slice(1))) - (b.price === 'Free' ? 0 : Number(b.price.slice(1))));
  return list;
}

function render() {
  const list = state.view === 'saved' ? plugins.filter((plugin) => state.saved.has(plugin.id)) : getFilteredPlugins();
  $('#viewTitle').innerHTML = `${state.view === 'saved' ? 'Saved bookmarks' : 'Plugin directory'} <span id="resultCount">${list.length.toLocaleString()} result${list.length === 1 ? '' : 's'}</span>`;
  $('#resultCount').textContent = `${list.length.toLocaleString()} result${list.length === 1 ? '' : 's'}`;
  $('#filterCount').textContent = state.sources.size + state.platforms.size + state.editions.size + state.prices.size + (state.version !== 'all' ? 1 : 0);
  $('#savedCount').textContent = state.saved.size;
  renderActiveFilters();
  $('#resultsGrid').innerHTML = list.length ? list.map(pluginCard).join('') : `<div class="empty-state"><i data-lucide="${state.view === 'saved' ? 'bookmark' : 'search-x'}"></i><h3>${state.view === 'saved' ? 'No bookmarks yet.' : 'No plugins match that search.'}</h3><p>${state.view === 'saved' ? 'Save a plugin with the bookmark icon to keep it here.' : 'Try clearing a filter or searching for a broader feature.'}</p></div>`;
  $('#loadMoreWrap').hidden = loading || !plugins.length;
  if (window.lucide) lucide.createIcons();
}

function renderActiveFilters() {
  const active = [
    ...[...state.sources].map((value) => ({ group: 'sources', value, label: `Source: ${value}` })),
    ...[...state.platforms].map((value) => ({ group: 'platforms', value, label: `Platform: ${value}` })),
    ...[...state.editions].map((value) => ({ group: 'editions', value, label: `Edition: ${value}` })),
    ...[...state.prices].map((value) => ({ group: 'prices', value, label: `Price: ${value}` })),
    ...(state.version !== 'all' ? [{ group: 'version', value: state.version, label: `Version: ${state.version}.x` }] : []),
    ...(state.quick !== 'all' && state.quick !== 'skript' ? [{ group: 'quick', value: state.quick, label: state.quick === 'downloads' ? 'Most downloaded' : state.quick }] : []),
    ...(state.quick === 'skript' ? [{ group: 'quick', value: 'skript', label: 'Skript resources' }] : []),
  ];
  const container = $('#activeFilters');
  container.hidden = !active.length;
  container.innerHTML = active.length ? `<span class="active-filters-label">ACTIVE</span>${active.map((filter) => `<button class="active-filter" data-remove-filter="${filter.group}" data-value="${filter.value}">${filter.label}<i data-lucide="x"></i></button>`).join('')}<button class="active-clear" data-remove-filter="all">Clear all</button>` : '';
  if (window.lucide) lucide.createIcons();
}

function removeActiveFilter(group, value) {
  if (group === 'all') { clearFilters(); return; }
  if (group === 'version') state.version = 'all';
  else if (group === 'quick') { state.quick = 'all'; if (value === 'skript') { state.search = ''; $('#searchInput').value = ''; } }
  else state[group].delete(value);
  syncCheckboxes();
  loadPlugins(true);
}

function renderLoading() { $('#resultsGrid').innerHTML = `<div class="empty-state loading-state"><i data-lucide="loader-circle"></i><h3>Searching live plugin indexes...</h3><p>Pulling current results from Modrinth and Spigot.</p></div>`; $('#loadMoreWrap').hidden = true; if (window.lucide) lucide.createIcons(); }
function renderError(error) { $('#resultsGrid').innerHTML = `<div class="empty-state"><i data-lucide="wifi-off"></i><h3>Live sources could not be reached.</h3><p>${error.message}. Check your connection and try again.</p><button class="clear-filters" onclick="loadPlugins(true)">Try again</button></div>`; $('#loadMoreWrap').hidden = true; if (window.lucide) lucide.createIcons(); }

function pluginCard(plugin) {
  const saved = state.saved.has(plugin.id);
  const icon = plugin.iconUrl ? `<img src="${escapeHtml(plugin.iconUrl)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span hidden>${plugin.icon}</span>` : `<span>${plugin.icon}</span>`;
  const downloadText = (plugin.downloadSources || []).map((entry) => `${entry.source}: ${formatNumber(entry.value)}`).join(' · ');
  const exactDate = plugin.updatedAt ? formatExactDate(plugin.updatedAt) : 'Date unavailable';
  return `<article class="plugin-card" data-plugin="${plugin.id}"><div class="card-top"><span class="plugin-icon ${plugin.iconClass}">${icon}</span><div class="card-actions"><button data-save="${plugin.id}" class="${saved ? 'saved' : ''}" title="${saved ? 'Remove from saved' : 'Save plugin'}" aria-label="${saved ? 'Remove from saved' : 'Save plugin'}"><i data-lucide="bookmark"></i></button><button title="Open plugin details" aria-label="Open plugin details"><i data-lucide="arrow-up-right"></i></button></div></div><h3>${escapeHtml(plugin.name)}</h3><p class="description">${escapeHtml(plugin.description)}</p><div class="meta-row"><span title="${escapeHtml(downloadText)}"><i data-lucide="download"></i>${escapeHtml(downloadText)}</span><span title="Updated ${escapeHtml(exactDate)}"><i data-lucide="clock-3"></i>${plugin.updated}</span></div><div class="card-bottom"><span class="source-name"><i class="source-dot ${(plugin.sources?.[0] || plugin.source).toLowerCase()}"></i>${plugin.source}</span><span class="price-tag ${plugin.price === 'Free' ? 'free' : 'paid'}">${plugin.price}</span></div></article>`;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function toggleSaved(id) { if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id); render(); }
function clearFilters() { state.sources.clear(); state.platforms.clear(); state.editions.clear(); state.prices.clear(); state.version = 'all'; state.quick = 'all'; $('#versionFilter').value = 'all'; $$('.chip').forEach((item) => item.classList.toggle('active', item.dataset.quick === 'all')); $$('.source-tab').forEach((item) => item.classList.toggle('active', item.dataset.source === 'all')); syncCheckboxes(); loadPlugins(true); }
function syncCheckboxes() { $$('input[data-filter]').forEach((input) => { const target = state[`${input.dataset.filter}s`]; input.checked = target?.has(input.value) || false; }); }
function openDrawer(id) {
  const plugin = plugins.find((item) => item.id === id);
  if (!plugin) return;
  const icon = plugin.iconUrl ? `<img src="${escapeHtml(plugin.iconUrl)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span hidden>${plugin.icon}</span>` : plugin.icon;
  const links = (plugin.links || []).map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>${escapeHtml(link.label)}</a>`).join('');
  const detailsDate = plugin.updatedAt ? formatExactDate(plugin.updatedAt) : 'Date unavailable';
  $('#drawerContent').innerHTML = `<div class="drawer-hero"><span class="plugin-icon ${plugin.iconClass}">${icon}</span><h2 id="drawerTitle">${escapeHtml(plugin.name)}</h2><p>${escapeHtml(plugin.description)}</p></div><div class="drawer-details"><div class="detail-item"><span>CREATOR</span><strong>${escapeHtml(plugin.creator)}</strong></div><div class="detail-item"><span>SOURCE</span><strong>${plugin.source}</strong></div><div class="detail-item"><span>PLATFORM</span><strong>${plugin.platform.join(', ')}</strong></div><div class="detail-item"><span>EDITION</span><strong>${(plugin.editions || ['Java Edition']).join(', ')}</strong></div><div class="detail-item"><span>VERSION</span><strong>${plugin.versions.length ? plugin.versions.map((version) => `${version}.x`).join(', ') : 'Not listed'}</strong></div><div class="detail-item"><span>LAST UPDATED</span><strong>${plugin.updated} · ${detailsDate}</strong></div><div class="detail-item"><span>DOWNLOADS</span><strong>${plugin.downloads}</strong></div><div class="detail-item"><span>PRICE</span><strong>${plugin.price}</strong></div></div><div class="download-row"><select id="downloadMode"><option value="open">Open official download page</option><option value="copy">Copy download link</option></select><button class="drawer-cta" id="downloadAction"><i data-lucide="download"></i> Download</button></div><div class="drawer-links"><span>PROJECT LINKS</span>${links || '<small>No additional links listed</small>'}</div><div class="drawer-note"><i data-lucide="info"></i><span>Relative time labels are based on the current clock: “today” means within the last 24 hours, “yesterday” means within 48 hours, and the exact timestamp is shown here.</span></div>`;
  $('#drawerBackdrop').hidden = false;
  $('#detailsDrawer').classList.add('open');
  $('#detailsDrawer').setAttribute('aria-hidden', 'false');
  if (window.lucide) lucide.createIcons();
  $('#downloadAction').addEventListener('click', () => {
    if ($('#downloadMode').value === 'copy') {
      navigator.clipboard?.writeText(plugin.url);
      return;
    }
    window.open(plugin.url, '_blank', 'noopener');
  });
}
function closeDrawer() { $('#detailsDrawer').classList.remove('open'); $('#detailsDrawer').setAttribute('aria-hidden', 'true'); setTimeout(() => { $('#drawerBackdrop').hidden = true; }, 250); }
init();
