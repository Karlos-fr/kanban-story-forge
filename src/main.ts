import "./style.css";

type StoryStatus = "draft" | "ready" | "in_progress" | "blocked" | "review" | "done";
type ModalMode = "closed" | "create" | "edit" | "detail";

type Story = {
  id: string;
  title: string;
  status: StoryStatus;
  priority: string;
  persona: string;
  need: string;
  benefit: string;
  tags: string[];
  sources: string[];
  acceptance: ChecklistItem[];
  dor: ChecklistItem[];
  dod: ChecklistItem[];
  notes: string;
  created: string;
  updated: string;
};

type ChecklistItem = {
  text: string;
  done: boolean;
};

type FormElements = HTMLFormElement & {
  storyId: HTMLInputElement;
  title: HTMLInputElement;
  status: HTMLSelectElement;
  priority: HTMLSelectElement;
  persona: HTMLInputElement;
  need: HTMLInputElement;
  benefit: HTMLInputElement;
  tags: HTMLInputElement;
  sources: HTMLTextAreaElement;
  acceptance: HTMLTextAreaElement;
  dor: HTMLTextAreaElement;
  dod: HTMLTextAreaElement;
  notes: HTMLTextAreaElement;
};

const storageKey = "kanban-story-forge:v1";
const storyApiUrl = "/api/stories";
const statuses: StoryStatus[] = ["draft", "ready", "in_progress", "blocked", "review", "done"];
const statusLabels: Record<StoryStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done"
};

const statusHints: Record<StoryStatus, string> = {
  draft: "A cadrer",
  ready: "Pret a faire",
  in_progress: "En cours",
  blocked: "Bloque",
  review: "A relire",
  done: "Termine"
};

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) {
  throw new Error("Missing #app");
}
const app = appElement;

let stories: Story[] = [];
let selectedId = "";
let query = "";
let modalMode: ModalMode = "closed";
let draggedStoryId = "";
let persistenceMode = "Chargement";

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

void initialize();

async function initialize(): Promise<void> {
  stories = await loadStories();
  render();
}

function render(restoreSearchFocus = false): void {
  const filtered = getFilteredStories();
  const selected = stories.find((story) => story.id === selectedId);

  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand">
          ${boardIcon("brand-icon")}
          <div>
            <h1>Kanban Story Forge</h1>
            <p>${stories.length} US - ${completionRate()}% done - ${escapeHtml(persistenceMode)}</p>
          </div>
        </div>
        <nav class="actions" aria-label="Actions">
          <button class="icon-button primary" type="button" data-action="create" title="Creer une US">
            ${icon("plus")}<span>Nouvelle US</span>
          </button>
          <button class="icon-button" type="button" data-action="export-json" title="Exporter le backlog JSON">
            ${icon("download")}<span>Export</span>
          </button>
          <button class="icon-button" type="button" data-action="import-json" title="Importer un backlog JSON">
            ${icon("upload")}<span>Import</span>
          </button>
          <input id="importFile" type="file" accept="application/json,.json" hidden />
        </nav>
      </header>

      <section class="toolbar" aria-label="Filtres">
        <label class="search">
          ${icon("search")}
          <input id="storySearch" type="search" placeholder="Rechercher par US, tag, statut, source..." value="${escapeHtml(query)}" />
        </label>
      </section>

      <section class="workspace">
        <div class="kanban" aria-label="Tableau kanban">
          ${statuses.map((status) => renderColumn(status, filtered)).join("")}
        </div>
      </section>

      ${modalMode === "create" ? renderFormModal() : ""}
      ${modalMode === "edit" && selected ? renderFormModal(selected) : ""}
      ${modalMode === "detail" && selected ? renderDetailModal(selected) : ""}
    </main>
  `;

  bindEvents();

  if (restoreSearchFocus) {
    const search = app.querySelector<HTMLInputElement>("#storySearch");
    search?.focus();
    search?.setSelectionRange(query.length, query.length);
  }
}

function bindEvents(): void {
  app.querySelector<HTMLInputElement>("#storySearch")?.addEventListener("input", (event) => {
    query = (event.target as HTMLInputElement).value;
    render(true);
  });

  app.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action ?? ""));
  });

  app.querySelectorAll<HTMLButtonElement>("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.storyId ?? selectedId;
      modalMode = "detail";
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-open-story-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.openStoryId ?? selectedId;
      modalMode = "detail";
      render();
    });
  });

  app.querySelectorAll<HTMLElement>("[data-drop-status]").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      const status = column.dataset.dropStatus as StoryStatus;
      void moveStory(draggedStoryId, status);
    });
  });

  app.querySelectorAll<HTMLElement>("[draggable='true'][data-drag-story-id]").forEach((card) => {
    card.addEventListener("dragstart", () => {
      draggedStoryId = card.dataset.dragStoryId ?? "";
    });
    card.addEventListener("dragend", () => {
      draggedStoryId = "";
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal();
    });
  });

  app.querySelector<HTMLElement>(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  });

  app.querySelector<HTMLFormElement>("#storyForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveFromForm(event.currentTarget as FormElements);
  });

  app.querySelector<HTMLInputElement>("#importFile")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void importJson(file);
    }
    input.value = "";
  });
}

function handleAction(action: string): void {
  if (action === "create") {
    modalMode = "create";
    render();
  } else if (action === "edit") {
    modalMode = "edit";
    render();
  } else if (action === "detail") {
    modalMode = "detail";
    render();
  } else if (action === "delete") {
    void deleteSelected();
  } else if (action === "export-json") {
    download("kanban-story-forge-backlog.json", JSON.stringify({ stories }, null, 2), "application/json");
  } else if (action === "import-json") {
    app.querySelector<HTMLInputElement>("#importFile")?.click();
  } else if (action === "export-md") {
    const story = stories.find((item) => item.id === selectedId);
    if (story) {
      download(`${story.id.toLowerCase()}.md`, storyToMarkdown(story), "text/markdown");
    }
  } else if (action === "reset-seed") {
    stories = seedStories();
    selectedId = "";
    void saveStories();
    render();
  }
}

function closeModal(): void {
  if (modalMode === "detail") {
    selectedId = "";
  }
  modalMode = "closed";
  render();
}

function renderColumn(status: StoryStatus, filtered: Story[]): string {
  const items = filtered.filter((story) => story.status === status);
  return `
    <section class="kanban-column status-${status}" data-drop-status="${status}">
      <h2>
        <span>${statusIcon(status)}${statusLabels[status]}</span>
        <strong>${items.length}</strong>
      </h2>
      <p>${statusHints[status]}</p>
      <div class="story-list">
        ${items.map(renderCard).join("") || `<div class="column-empty">Aucune US</div>`}
      </div>
    </section>
  `;
}

function renderCard(story: Story): string {
  const active = story.id === selectedId ? " active" : "";
  const dorDone = countDone(story.dor);
  const dodDone = countDone(story.dod);
  return `
    <article class="story-card${active}" draggable="true" data-drag-story-id="${story.id}">
      <button type="button" data-story-id="${story.id}" title="Selectionner ${escapeHtml(story.id)}">
        <span class="story-id">${escapeHtml(story.id)}</span>
        <strong>${escapeHtml(story.title)}</strong>
        <span class="story-line">${escapeHtml(story.priority)} - ${escapeHtml(story.persona || "Utilisateur")}</span>
      </button>
      <div class="tag-row">${story.tags.slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="card-progress">
        <span>DOR ${dorDone}/${story.dor.length}</span>
        <span>DOD ${dodDone}/${story.dod.length}</span>
      </div>
      <button class="open-card" type="button" data-open-story-id="${story.id}" title="Ouvrir la fiche">${icon("expand")}</button>
    </article>
  `;
}

function renderFormModal(story?: Story): string {
  const isEdit = Boolean(story);
  const draft = story ?? createBlankStory();
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="story-modal form-modal" role="dialog" aria-modal="true" aria-labelledby="story-form-title">
        <button class="modal-close" type="button" aria-label="Fermer" data-close-modal>${icon("x")}</button>
        <h2 id="story-form-title">${isEdit ? "Modifier l'US" : "Creer une US"}</h2>
        <form id="storyForm">
          <div class="form-grid">
            <label>ID<input name="storyId" value="${escapeHtml(draft.id)}" required /></label>
            <label>Titre<input name="title" value="${escapeHtml(draft.title)}" required /></label>
            <label>Statut${renderStatusSelect(draft.status)}</label>
            <label>Priorite${renderPrioritySelect(draft.priority)}</label>
            <label>En tant que<input name="persona" value="${escapeHtml(draft.persona)}" /></label>
            <label>Je veux<input name="need" value="${escapeHtml(draft.need)}" /></label>
            <label class="wide">Afin de<input name="benefit" value="${escapeHtml(draft.benefit)}" /></label>
            <label class="wide">Tags<input name="tags" value="${escapeHtml(draft.tags.join(", "))}" placeholder="ux, api, mobile" /></label>
            <label class="wide">Sources<textarea name="sources" rows="3">${escapeHtml(draft.sources.join("\n"))}</textarea></label>
            <label class="wide">Criteres d'acceptation<textarea name="acceptance" rows="4">${escapeHtml(checklistToText(draft.acceptance))}</textarea></label>
            <label>DOR<textarea name="dor" rows="5">${escapeHtml(checklistToText(draft.dor))}</textarea></label>
            <label>DOD<textarea name="dod" rows="5">${escapeHtml(checklistToText(draft.dod))}</textarea></label>
            <label class="wide">Notes<textarea name="notes" rows="5">${escapeHtml(draft.notes)}</textarea></label>
          </div>
          <footer class="modal-actions">
            <button class="icon-button primary" type="submit">${icon("save")}<span>Enregistrer</span></button>
            <button class="icon-button" type="button" data-close-modal>${icon("x")}<span>Annuler</span></button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderDetailModal(story: Story): string {
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="story-modal" role="dialog" aria-modal="true" aria-labelledby="story-detail-title">
        <button class="modal-close" type="button" aria-label="Fermer" data-close-modal>${icon("x")}</button>
        <div class="modal-title-row">
          <div>
            <span class="story-id">${escapeHtml(story.id)}</span>
            <h2 id="story-detail-title">${escapeHtml(story.title)}</h2>
          </div>
          <span class="status-pill status-${story.status}">${statusLabels[story.status]}</span>
        </div>
        <p class="story-user">${renderUserStory(story)}</p>
        <div class="modal-toolbox">
          <button class="icon-button primary" type="button" data-action="edit" title="Modifier">${icon("edit")}<span>Modifier</span></button>
          <button class="icon-button" type="button" data-action="export-md" title="Exporter en Markdown">${icon("file")}<span>Markdown</span></button>
          <button class="icon-button danger" type="button" data-action="delete" title="Supprimer">${icon("trash")}<span>Supprimer</span></button>
        </div>
        <dl class="story-fields">
          <div><dt>Statut</dt><dd>${statusLabels[story.status]}</dd></div>
          <div><dt>Priorite</dt><dd>${escapeHtml(story.priority)}</dd></div>
          <div><dt>Cree</dt><dd>${escapeHtml(story.created)}</dd></div>
          <div><dt>MAJ</dt><dd>${escapeHtml(story.updated)}</dd></div>
        </dl>
        ${renderChecklist("Acceptance", story.acceptance)}
        ${renderChecklist("DOR", story.dor)}
        ${renderChecklist("DOD", story.dod)}
        <section class="field-block">
          <h3>Markdown</h3>
          <pre>${escapeHtml(storyToMarkdown(story))}</pre>
        </section>
      </section>
    </div>
  `;
}

function renderStatusSelect(current: StoryStatus): string {
  return `
    <select name="status">
      ${statuses.map((status) => `<option value="${status}"${status === current ? " selected" : ""}>${statusLabels[status]}</option>`).join("")}
    </select>
  `;
}

function renderPrioritySelect(current: string): string {
  const values = ["P0", "P1", "P2", "P3"];
  return `
    <select name="priority">
      ${values.map((value) => `<option value="${value}"${value === current ? " selected" : ""}>${value}</option>`).join("")}
    </select>
  `;
}

async function saveFromForm(form: FormElements): Promise<void> {
  const now = today();
  const existing = stories.find((story) => story.id === selectedId);
  const next: Story = {
    id: normalizeId(form.storyId.value),
    title: form.title.value.trim(),
    status: form.status.value as StoryStatus,
    priority: form.priority.value,
    persona: form.persona.value.trim(),
    need: form.need.value.trim(),
    benefit: form.benefit.value.trim(),
    tags: splitInlineList(form.tags.value),
    sources: splitLines(form.sources.value),
    acceptance: parseChecklist(form.acceptance.value),
    dor: parseChecklist(form.dor.value),
    dod: parseChecklist(form.dod.value),
    notes: form.notes.value.trim(),
    created: existing?.created ?? now,
    updated: now
  };

  const duplicate = stories.some((story) => story.id === next.id && story.id !== existing?.id);
  if (duplicate) {
    window.alert(`Une US existe deja avec l'ID ${next.id}.`);
    return;
  }

  const previousId = existing?.id ?? next.id;

  if (modalMode === "edit" && existing) {
    stories = stories.map((story) => (story.id === existing.id ? next : story));
  } else {
    stories = [...stories, next];
  }

  selectedId = next.id;
  modalMode = "closed";
  await saveStory(next, previousId);
  render();
}

async function moveStory(id: string, status: StoryStatus): Promise<void> {
  if (!id || !statuses.includes(status)) {
    return;
  }
  const updated = stories.find((story) => story.id === id);
  if (!updated) {
    return;
  }
  const next = { ...updated, status, updated: today() };
  stories = stories.map((story) => (story.id === id ? next : story));
  selectedId = id;
  await saveStory(next, id);
  render();
}

async function deleteSelected(): Promise<void> {
  const selected = stories.find((story) => story.id === selectedId);
  if (!selected || !window.confirm(`Supprimer ${selected.id} ?`)) {
    return;
  }
  stories = stories.filter((story) => story.id !== selected.id);
  selectedId = "";
  modalMode = "closed";
  await deleteStory(selected.id);
  render();
}

function importJson(file: File): Promise<void> {
  return new Promise((resolve) => {
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = Array.isArray(parsed) ? parsed : parsed.stories;
      if (!Array.isArray(imported)) {
        throw new Error("Format JSON invalide");
      }
      stories = imported.map(normalizeStory);
      selectedId = "";
      await saveStories();
      render();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import impossible");
    } finally {
      resolve();
    }
  });
  reader.readAsText(file);
  });
}

function getFilteredStories(): Story[] {
  const needle = query.trim().toLowerCase();
  const ordered = [...stories].sort((a, b) => a.id.localeCompare(b.id));
  if (!needle) {
    return ordered;
  }
  return ordered.filter((story) => {
    const haystack = [
      story.id,
      story.title,
      story.status,
      story.priority,
      story.persona,
      story.need,
      story.benefit,
      story.tags.join(" "),
      story.sources.join(" "),
      story.notes
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

async function loadStories(): Promise<Story[]> {
  const fileStories = await loadStoriesFromFiles();
  if (fileStories) {
    persistenceMode = "fichiers JSON";
    if (fileStories.length > 0) {
      return fileStories;
    }
    const seeded = seedStories();
    await saveStoriesToFiles(seeded);
    return seeded;
  }

  persistenceMode = "stockage navigateur";
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    return seedStories();
  }
  try {
    const parsed = JSON.parse(stored);
    const imported = Array.isArray(parsed) ? parsed : parsed.stories;
    return Array.isArray(imported) ? imported.map(normalizeStory) : seedStories();
  } catch {
    return seedStories();
  }
}

async function saveStories(): Promise<void> {
  if (persistenceMode === "fichiers JSON") {
    await saveStoriesToFiles(stories);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify({ stories }, null, 2));
}

async function saveStory(story: Story, previousId: string): Promise<void> {
  if (persistenceMode !== "fichiers JSON") {
    await saveStories();
    return;
  }

  const response = await fetch(`${storyApiUrl}/${encodeURIComponent(previousId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(story)
  });
  if (!response.ok) {
    throw new Error(`Sauvegarde impossible pour ${story.id}`);
  }
}

async function deleteStory(id: string): Promise<void> {
  if (persistenceMode !== "fichiers JSON") {
    await saveStories();
    return;
  }

  const response = await fetch(`${storyApiUrl}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Suppression impossible pour ${id}`);
  }
}

async function loadStoriesFromFiles(): Promise<Story[] | undefined> {
  try {
    const response = await fetch(storyApiUrl);
    if (!response.ok) {
      return undefined;
    }
    const parsed = await response.json();
    const imported = Array.isArray(parsed) ? parsed : parsed.stories;
    return Array.isArray(imported) ? imported.map(normalizeStory) : [];
  } catch {
    return undefined;
  }
}

async function saveStoriesToFiles(nextStories: Story[]): Promise<void> {
  const response = await fetch(storyApiUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stories: nextStories })
  });
  if (!response.ok) {
    throw new Error("Sauvegarde fichier impossible");
  }
}

function normalizeStory(value: unknown): Story {
  const source = value as Partial<Story>;
  return {
    id: normalizeId(source.id ?? nextStoryId()),
    title: String(source.title ?? "Nouvelle User Story"),
    status: statuses.includes(source.status as StoryStatus) ? (source.status as StoryStatus) : "draft",
    priority: String(source.priority ?? "P2"),
    persona: String(source.persona ?? ""),
    need: String(source.need ?? ""),
    benefit: String(source.benefit ?? ""),
    tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
    sources: Array.isArray(source.sources) ? source.sources.map(String) : [],
    acceptance: normalizeChecklist(source.acceptance),
    dor: normalizeChecklist(source.dor),
    dod: normalizeChecklist(source.dod),
    notes: String(source.notes ?? ""),
    created: String(source.created ?? today()),
    updated: String(source.updated ?? today())
  };
}

function normalizeChecklist(items: unknown): ChecklistItem[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    if (typeof item === "string") {
      return { text: item, done: false };
    }
    const candidate = item as Partial<ChecklistItem>;
    return {
      text: String(candidate.text ?? ""),
      done: Boolean(candidate.done)
    };
  }).filter((item) => item.text);
}

function seedStories(): Story[] {
  const now = today();
  return [
    {
      id: "US-0001",
      title: "Cadrer le besoin utilisateur",
      status: "ready",
      priority: "P0",
      persona: "Product owner",
      need: "decrire une User Story complete",
      benefit: "aligner l'equipe avant implementation",
      tags: ["discovery", "story"],
      sources: ["atelier produit", "feedback support"],
      acceptance: [
        { text: "La persona est explicite", done: true },
        { text: "Le benefice utilisateur est formule", done: true },
        { text: "Les criteres d'acceptation sont testables", done: false }
      ],
      dor: [
        { text: "Objectif metier valide", done: true },
        { text: "Dependances identifiees", done: true }
      ],
      dod: [
        { text: "US relue par l'equipe", done: false },
        { text: "US exportee en Markdown", done: false }
      ],
      notes: "Exemple generique pour cadrer une User Story sans dependance a un domaine particulier.",
      created: now,
      updated: now
    },
    {
      id: "US-0002",
      title: "Construire le parcours de creation",
      status: "in_progress",
      priority: "P1",
      persona: "Chef de projet",
      need: "creer une US depuis le navigateur",
      benefit: "alimenter le backlog sans modifier des fichiers a la main",
      tags: ["kanban", "creation"],
      sources: ["besoin equipe agile"],
      acceptance: [
        { text: "Le formulaire permet de saisir titre, statut, priorite et criteres", done: true },
        { text: "La sauvegarde persiste apres rechargement", done: true },
        { text: "L'US peut etre exportee", done: false }
      ],
      dor: [{ text: "Champs minimum definis", done: true }],
      dod: [{ text: "Creation testee dans le navigateur", done: false }],
      notes: "",
      created: now,
      updated: now
    },
    {
      id: "US-0003",
      title: "Synchroniser avec une sauvegarde portable",
      status: "draft",
      priority: "P2",
      persona: "Equipe projet",
      need: "importer et exporter le backlog",
      benefit: "partager l'etat du kanban entre postes",
      tags: ["json", "backup"],
      sources: [],
      acceptance: [
        { text: "Export JSON complet", done: false },
        { text: "Import JSON avec validation minimale", done: false }
      ],
      dor: [{ text: "Format cible documente", done: false }],
      dod: [{ text: "Import/export verifies sur un fichier reel", done: false }],
      notes: "",
      created: now,
      updated: now
    }
  ];
}

function createBlankStory(): Story {
  const now = today();
  return {
    id: nextStoryId(),
    title: "",
    status: "draft",
    priority: "P2",
    persona: "",
    need: "",
    benefit: "",
    tags: [],
    sources: [],
    acceptance: [{ text: "", done: false }],
    dor: [{ text: "", done: false }],
    dod: [{ text: "", done: false }],
    notes: "",
    created: now,
    updated: now
  };
}

function nextStoryId(): string {
  const numbers = stories
    .map((story) => Number(story.id.match(/\d+$/)?.[0] ?? 0))
    .filter((value) => Number.isFinite(value));
  const next = Math.max(0, ...numbers) + 1;
  return `US-${String(next).padStart(4, "0")}`;
}

function normalizeId(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return nextStoryId();
  }
  return raw.toUpperCase().replace(/\s+/g, "-");
}

function parseChecklist(value: string): ChecklistItem[] {
  return splitLines(value).map((line) => {
    const done = /^\[(x|X)\]\s+/.test(line) || /^-\s+\[(x|X)\]\s+/.test(line);
    const text = line
      .replace(/^-\s+/, "")
      .replace(/^\[(x|X| )\]\s+/, "")
      .trim();
    return { text, done };
  }).filter((item) => item.text);
}

function checklistToText(items: ChecklistItem[]): string {
  return items.map((item) => `[${item.done ? "x" : " "}] ${item.text}`).join("\n");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitInlineList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countDone(items: ChecklistItem[]): number {
  return items.filter((item) => item.done).length;
}

function completionRate(): number {
  if (!stories.length) {
    return 0;
  }
  return Math.round((stories.filter((story) => story.status === "done").length / stories.length) * 100);
}

function renderChecklist(title: string, items: ChecklistItem[]): string {
  return `
    <section class="field-block">
      <h3>${title}</h3>
      <ul class="checklist">
        ${items.length ? items.map((item) => `<li class="${item.done ? "done" : "todo"}">${item.done ? icon("check") : icon("box")}${escapeHtml(item.text)}</li>`).join("") : `<li class="muted">Aucun item</li>`}
      </ul>
    </section>
  `;
}

function renderUserStory(story: Story): string {
  const persona = story.persona || "utilisateur";
  const need = story.need || "realiser une action";
  const benefit = story.benefit || "obtenir une valeur claire";
  return `En tant que ${escapeHtml(persona)}, je veux ${escapeHtml(need)} afin de ${escapeHtml(benefit)}.`;
}

function storyToMarkdown(story: Story): string {
  const frontmatter = [
    "---",
    `id: ${story.id}`,
    `title: ${story.title}`,
    `status: ${story.status}`,
    `priority: ${story.priority}`,
    `tags: [${story.tags.join(", ")}]`,
    `created: ${story.created}`,
    `updated: ${story.updated}`,
    "---"
  ].join("\n");

  return `${frontmatter}

## User Story

En tant que ${story.persona || "..."}, je veux ${story.need || "..."} afin de ${story.benefit || "..."}.

## Sources

${markdownList(story.sources)}

## Acceptance

${markdownChecklist(story.acceptance)}

## DOR

${markdownChecklist(story.dor)}

## DOD

${markdownChecklist(story.dod)}

## Notes

${story.notes || "-"}
`;
}

function markdownList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "-";
}

function markdownChecklist(items: ChecklistItem[]): string {
  return items.length ? items.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`).join("\n") : "- [ ]";
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function boardIcon(className: string): string {
  return `
    <svg class="${className}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="4.5" y="5" width="23" height="22" rx="4"></rect>
      <path d="M11 5V3.8h10V5"></path>
      <rect x="8" y="9" width="4.8" height="13" rx="1.2"></rect>
      <rect x="14" y="9" width="4.8" height="10" rx="1.2"></rect>
      <rect x="20" y="9" width="4.8" height="15" rx="1.2"></rect>
    </svg>
  `;
}

function statusIcon(status: StoryStatus): string {
  const iconName: Record<StoryStatus, string> = {
    draft: "edit",
    ready: "check",
    in_progress: "play",
    blocked: "block",
    review: "search",
    done: "shield"
  };
  return icon(iconName[status], "lane-icon");
}

function icon(name: string, className = "icon"): string {
  const paths: Record<string, string> = {
    plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
    upload: '<path d="M12 21V9"></path><path d="m7 14 5-5 5 5"></path><path d="M5 3h14"></path>',
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m16 16 4 4"></path>',
    refresh: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"></path><path d="M20 4v4.7h-4.7"></path><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"></path><path d="M4 20v-4.7h4.7"></path>',
    edit: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path>',
    expand: '<path d="M8 3H3v5"></path><path d="M16 3h5v5"></path><path d="M21 16v5h-5"></path><path d="M3 16v5h5"></path>',
    file: '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v5h5"></path>',
    trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M7 7l1 14h8l1-14"></path>',
    x: '<path d="M6 6l12 12"></path><path d="M18 6 6 18"></path>',
    save: '<path d="M5 3h12l2 2v16H5z"></path><path d="M8 3v7h8"></path><path d="M8 21v-7h8v7"></path>',
    check: '<path d="M20 7 10 17l-5-5"></path>',
    box: '<rect x="5" y="5" width="14" height="14" rx="2"></rect>',
    play: '<path d="M8 5v14l11-7-11-7Z"></path>',
    block: '<circle cx="12" cy="12" r="9"></circle><path d="M6 6l12 12"></path>',
    shield: '<path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z"></path><path d="m8.5 12 2.2 2.2 4.8-5"></path>'
  };
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] ?? paths.box}</svg>`;
}
