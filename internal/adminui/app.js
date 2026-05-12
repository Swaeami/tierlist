const EXPORT_WIDTH = 512;
const EXPORT_HEIGHT = 512;
const WEBP_QUALITY = 0.86;

const icons = {
  drag: `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"
        stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
    </svg>
  `,
  palette: `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3C7.03 3 3 6.58 3 11c0 3.7 2.82 6.82 6.66 7.73.7.17 1.08-.48.86-1.14-.37-1.1.42-2.09 1.58-2.09h1.8c3.92 0 7.1-2.8 7.1-6.25C21 5.8 16.97 3 12 3Z"
        stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M7.5 10.5h.01M10 7.8h.01M14.2 7.8h.01M16.8 10.5h.01"
        stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `,
  trash: `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14M10 11v6M14 11v6M9 7l.7-2h4.6L15 7M7 7l1 13h8l1-13"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `
};

let data = {
  title: "",
  description: "",
  tiers: [],
  items: []
};

let tierDrag = null;
let cardDrag = null;
let toastTimer = null;

let cropQueue = [];
let cropIndex = 0;
let cropPointer = null;

const fileInput = document.querySelector("#fileInput");
const uploadModal = document.querySelector("#uploadModal");
const pasteZone = document.querySelector("#pasteZone");
const cropEditor = document.querySelector("#cropEditor");
const cropList = document.querySelector("#cropList");
const cropFrame = document.querySelector("#cropFrame");
const cropImage = document.querySelector("#cropImage");
const cropLabelInput = document.querySelector("#cropLabelInput");
const cropZoomInput = document.querySelector("#cropZoomInput");
const titleInput = document.querySelector("#tierlistTitle");
const descriptionInput = document.querySelector("#tierlistDescription");

document.querySelector("#saveButton").addEventListener("click", saveData);
document.querySelector("#addTierButton").addEventListener("click", addTier);
document.querySelector("#uploadButton").addEventListener("click", openUploadModal);
document.querySelector("#closeUploadModalButton").addEventListener("click", closeUploadModal);
document.querySelector("#chooseFilesButton").addEventListener("click", openUpload);
document.querySelector("#uploadCroppedButton").addEventListener("click", uploadCroppedQueue);

titleInput.addEventListener("input", () => {
  data.title = titleInput.value;
});

descriptionInput.addEventListener("input", () => {
  data.description = descriptionInput.value;
});

cropLabelInput.addEventListener("input", () => {
  const item = cropQueue[cropIndex];
  if (!item) return;

  item.label = cropLabelInput.value;
  updateCropListItemText(cropIndex);
});

cropZoomInput.addEventListener("input", () => {
  const item = cropQueue[cropIndex];
  if (!item) return;

  item.zoom = Number(cropZoomInput.value);
  clampCrop(item);
  renderCropImage();
});

cropFrame.addEventListener("wheel", (event) => {
  const item = cropQueue[cropIndex];
  if (!item) return;

  event.preventDefault();

  const rect = cropFrame.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;

  const oldDisplay = getCropDisplay(item);
  const imageX = (pointerX - item.x) / oldDisplay.scale;
  const imageY = (pointerY - item.y) / oldDisplay.scale;

  const delta = -event.deltaY * 0.0015;
  item.zoom = Math.min(4, Math.max(1, item.zoom * (1 + delta)));

  cropZoomInput.value = String(item.zoom);

  const newDisplay = getCropDisplay(item);
  item.x = pointerX - imageX * newDisplay.scale;
  item.y = pointerY - imageY * newDisplay.scale;

  clampCrop(item);
  renderCropImage();
}, { passive: false });

function showToast(message, type = "success") {
  const toast = document.querySelector("#toast");

  clearTimeout(toastTimer);

  toast.textContent = message;
  toast.className = `toast ${type} show`;

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function uid() {
  return crypto.randomUUID();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function adminImageUrl(image) {
  return image.replace("./", "/site/");
}

function isUploadModalOpen() {
  return uploadModal.classList.contains("open");
}

function openUpload() {
  fileInput.click();
}

function openUploadModal() {
  uploadModal.classList.add("open");
  uploadModal.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    if (!pasteZone.classList.contains("hidden")) {
      pasteZone.focus();
    } else {
      cropLabelInput.focus();
    }
  }, 0);
}

function closeUploadModal() {
  uploadModal.classList.remove("open");
  uploadModal.setAttribute("aria-hidden", "true");
}

async function loadData() {
  try {
    const res = await fetch("/api/data");

    if (!res.ok) {
      throw new Error("Cannot load data");
    }

    data = await res.json();

    data.title ??= "";
    data.description ??= "";
    data.tiers ??= [];
    data.items ??= [];

    titleInput.value = data.title;
    descriptionInput.value = data.description;

    render();
  } catch (error) {
    showToast("Не удалось загрузить данные", "error");
    console.error(error);
  }
}

async function saveData() {
  data.title = titleInput.value.trim();
  data.description = descriptionInput.value.trim();

  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      throw new Error("Save failed");
    }

    showToast("Сохранено", "success");
  } catch (error) {
    showToast("Ошибка сохранения", "error");
    console.error(error);
  }
}

async function addFilesToCropQueue(files) {
  const images = [...files].filter((file) => file.type.startsWith("image/"));

  if (!images.length) return;

  openUploadModal();

  const startIndex = cropQueue.length;

  for (const file of images) {
    const image = await loadImageFromFile(file);
    const item = createCropItem(file, image);
    cropQueue.push(item);
  }

  showCropEditor();
  renderCropList();
  selectCropItem(startIndex);

  showToast(`В очередь добавлено: ${images.length}`, "success");
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      resolve({
        file,
        image,
        url,
        name: file.name
      });
    };

    image.onerror = reject;
    image.src = url;
  });
}

function createCropItem(file, loaded) {
  return {
    id: uid(),
    file,
    name: loaded.name,
    url: loaded.url,
    image: loaded.image,
    label: "",
    zoom: 1,
    x: 0,
    y: 0,
    baseScale: 1,
    initialized: false
  };
}

function showCropEditor() {
  pasteZone.classList.add("hidden");
  cropEditor.classList.remove("hidden");
}

function showEmptyUploadState() {
  cropEditor.classList.add("hidden");
  pasteZone.classList.remove("hidden");
}

function selectCropItem(index) {
  if (!cropQueue[index]) return;

  cropIndex = index;

  const item = cropQueue[cropIndex];
  cropLabelInput.value = item.label || "";
  cropZoomInput.value = String(item.zoom || 1);
  cropImage.src = item.url;

  requestAnimationFrame(() => {
    initCropItemIfNeeded(item);
    renderCropImage();
    renderCropList();
  });
}

function renderCropList() {
    cropList.innerHTML = "";
  
    cropQueue.forEach((item, index) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `crop-list-item ${index === cropIndex ? "active" : ""}`;
      node.dataset.cropIndex = String(index);
  
      node.innerHTML = `
        <img src="${escapeHtml(getCropPreviewDataUrl(item))}" alt="" />
        <span>${escapeHtml(item.label || item.name)}</span>
  
        <button class="crop-remove-button" type="button" title="Убрать из загрузки">
          ${icons.trash}
        </button>
      `;
  
      node.addEventListener("click", () => selectCropItem(index));
  
      node.querySelector(".crop-remove-button").addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeCropItem(index);
      });
  
      cropList.append(node);
    });
  }
  function removeCropItem(index) {
    const item = cropQueue[index];
    if (!item) return;
  
    URL.revokeObjectURL(item.url);
  
    cropQueue.splice(index, 1);
  
    if (!cropQueue.length) {
      cropIndex = 0;
      cropImage.removeAttribute("src");
      cropLabelInput.value = "";
      cropZoomInput.value = "1";
      cropList.innerHTML = "";
      showEmptyUploadState();
      return;
    }
  
    if (cropIndex >= cropQueue.length) {
      cropIndex = cropQueue.length - 1;
    }
  
    if (index < cropIndex) {
      cropIndex -= 1;
    }
  
    selectCropItem(cropIndex);
  }

function updateCropListItemText(index) {
  const item = cropQueue[index];
  const node = cropList.querySelector(`[data-crop-index="${index}"] span`);

  if (item && node) {
    node.textContent = item.label || item.name;
  }
}

function updateCropListItemPreview(index) {
  const item = cropQueue[index];
  const image = cropList.querySelector(`[data-crop-index="${index}"] img`);

  if (item && image) {
    image.src = getCropPreviewDataUrl(item);
  }
}

function getCropPreviewDataUrl(item) {
  if (!item?.initialized) {
    return item?.url || "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;

  const ctx = canvas.getContext("2d");
  const frame = cropFrame.getBoundingClientRect();
  const display = getCropDisplay(item);

  const scaleX = canvas.width / frame.width;
  const scaleY = canvas.height / frame.height;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    item.image,
    item.x * scaleX,
    item.y * scaleY,
    display.width * scaleX,
    display.height * scaleY
  );

  return canvas.toDataURL("image/webp", 0.82);
}

function initCropItemIfNeeded(item) {
  if (item.initialized) return;

  const frame = cropFrame.getBoundingClientRect();

  const baseScale = Math.max(
    frame.width / item.image.naturalWidth,
    frame.height / item.image.naturalHeight
  );

  item.baseScale = baseScale;
  item.zoom = 1;

  const displayWidth = item.image.naturalWidth * baseScale;
  const displayHeight = item.image.naturalHeight * baseScale;

  item.x = (frame.width - displayWidth) / 2;
  item.y = (frame.height - displayHeight) / 2;
  item.initialized = true;

  clampCrop(item);
}

function getCropDisplay(item) {
  const frame = cropFrame.getBoundingClientRect();
  const scale = item.baseScale * item.zoom;
  const width = item.image.naturalWidth * scale;
  const height = item.image.naturalHeight * scale;

  return {
    frame,
    scale,
    width,
    height
  };
}

function clampCrop(item) {
  const { frame, width, height } = getCropDisplay(item);

  if (width <= frame.width) {
    item.x = (frame.width - width) / 2;
  } else {
    item.x = Math.min(0, Math.max(frame.width - width, item.x));
  }

  if (height <= frame.height) {
    item.y = (frame.height - height) / 2;
  } else {
    item.y = Math.min(0, Math.max(frame.height - height, item.y));
  }
}

function renderCropImage() {
  const item = cropQueue[cropIndex];
  if (!item) return;

  initCropItemIfNeeded(item);
  clampCrop(item);

  const { width, height } = getCropDisplay(item);

  cropImage.style.width = `${width}px`;
  cropImage.style.height = `${height}px`;
  cropImage.style.transform = `translate(${item.x}px, ${item.y}px)`;

  updateCropListItemPreview(cropIndex);
}

cropFrame.addEventListener("pointerdown", (event) => {
  const item = cropQueue[cropIndex];
  if (!item) return;

  cropPointer = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    itemX: item.x,
    itemY: item.y
  };

  cropFrame.setPointerCapture(event.pointerId);
});

cropFrame.addEventListener("pointermove", (event) => {
  const item = cropQueue[cropIndex];
  if (!item || !cropPointer || cropPointer.id !== event.pointerId) return;

  item.x = cropPointer.itemX + event.clientX - cropPointer.startX;
  item.y = cropPointer.itemY + event.clientY - cropPointer.startY;

  clampCrop(item);
  renderCropImage();
});

cropFrame.addEventListener("pointerup", (event) => {
  if (cropPointer?.id === event.pointerId) {
    cropPointer = null;
  }
});

async function exportCropItem(item) {
  initCropItemIfNeeded(item);

  const frame = cropFrame.getBoundingClientRect();
  const display = getCropDisplay(item);

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const scaleX = EXPORT_WIDTH / frame.width;
  const scaleY = EXPORT_HEIGHT / frame.height;

  ctx.drawImage(
    item.image,
    item.x * scaleX,
    item.y * scaleY,
    display.width * scaleX,
    display.height * scaleY
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
  });

  if (!blob) {
    throw new Error("Cannot export webp");
  }

  return blob;
}

async function uploadCroppedQueue() {
  if (!cropQueue.length) return;

  const form = new FormData();

  try {
    for (const item of cropQueue) {
      const blob = await exportCropItem(item);
      const filename = `${slugifyFileName(item.label || item.name || "cover")}.webp`;

      form.append("covers", blob, filename);
      form.append("labels", item.label || "");
    }

    const res = await fetch("/api/upload", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      throw new Error("Upload failed");
    }

    const result = await res.json();
    data.items.push(...result.items);

    cropQueue.forEach((item) => URL.revokeObjectURL(item.url));
    cropQueue = [];
    cropIndex = 0;

    showEmptyUploadState();
    closeUploadModal();
    render();

    showToast(`Добавлено: ${result.items.length}`, "success");
  } catch (error) {
    showToast("Ошибка загрузки", "error");
    console.error(error);
  }
}

function slugifyFileName(value) {
  return String(value || "cover")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "cover";
}

function addTier() {
  data.tiers.push({
    id: uid(),
    label: "New",
    color: "#cccccc"
  });

  render();
}

function getTierLabelMetrics(text) {
  const value = String(text || "");
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const longestWordLength = words.reduce((max, word) => {
    return Math.max(max, [...word].length);
  }, 0);

  const totalLength = [...value].length;

  return {
    longestWordLength,
    totalLength
  };
}

function getTierLabelLayout(text) {
  const metrics = getTierLabelMetrics(text);

  const width = Math.min(
    310,
    Math.max(
      115,
      80 + metrics.longestWordLength * 12,
      60 + metrics.totalLength * 5
    )
  );

  const fontSize = Math.max(
    14,
    Math.min(
      28,
      28 - Math.max(0, metrics.totalLength - 14) * 0.6
    )
  );

  return {
    width,
    fontSize
  };
}

function getSharedTierLabelLayout() {
  const layouts = data.tiers.map((tier) => getTierLabelLayout(tier.label));

  return {
    width: Math.max(115, ...layouts.map((layout) => layout.width)),
    fontSize: Math.min(28, ...layouts.map((layout) => layout.fontSize))
  };
}

function applyTierTitleLayout(section, labelEl, text, sharedLayout = null) {
  const ownLayout = getTierLabelLayout(text);
  const layout = sharedLayout || getSharedTierLabelLayout();

  section.style.gridTemplateColumns = `${layout.width}px 1fr`;
  labelEl.style.fontSize = `${Math.min(ownLayout.fontSize, layout.fontSize)}px`;
}

function applyAllTierTitleLayouts() {
  const sharedLayout = getSharedTierLabelLayout();

  document.querySelectorAll(".tier[data-tier-id]").forEach((section) => {
    const tier = data.tiers.find((item) => item.id === section.dataset.tierId);
    const label = section.querySelector(".tier-main-label");

    if (tier && label) {
      applyTierTitleLayout(section, label, tier.label, sharedLayout);
    }
  });
}

function updateTierColor(id, value) {
  const tier = data.tiers.find((tier) => tier.id === id);
  if (!tier) return;

  tier.color = value;

  const section = document.querySelector(`.tier[data-tier-id="${CSS.escape(id)}"]`);

  if (section) {
    section.style.setProperty("--tier-color", value);
  }
}

function updateTierLabel(id, value) {
  const tier = data.tiers.find((tier) => tier.id === id);
  if (!tier) return;

  tier.label = value.trim() || "Untitled";
  applyAllTierTitleLayouts();
}

function deleteTier(id) {
  if (!confirm("Удалить тир? Игры из него станут нераспределёнными.")) return;

  data.items = data.items.map((item) => {
    if (item.tierId === id) return { ...item, tierId: null };
    return item;
  });

  data.tiers = data.tiers.filter((tier) => tier.id !== id);
  render();
}

function reorderTiersFromDom() {
  const orderedIds = [...document.querySelectorAll("#tierlist .tier[data-tier-id]")]
    .map((node) => node.dataset.tierId);

  data.tiers = orderedIds
    .map((id) => data.tiers.find((tier) => tier.id === id))
    .filter(Boolean);
}

function editLabel(itemId) {
  const item = data.items.find((item) => item.id === itemId);
  if (!item) return;

  const next = prompt("Лейбл под картинкой. Оставь пустым, чтобы скрыть.", item.label || "");

  if (next === null) return;

  item.label = next.trim();
  render();
}

function deleteItem(itemId) {
  if (!confirm("Удалить картинку из тирлиста? Файл картинки останется в site/covers.")) return;

  data.items = data.items.filter((item) => item.id !== itemId);
  render();
}

function syncItemsFromCardDom() {
  const ordered = [];

  document.querySelectorAll("[data-tier-dropzone]").forEach((zone) => {
    const tierId = zone.dataset.tierId || null;

    zone.querySelectorAll(".card[data-item-id]").forEach((card) => {
      const item = data.items.find((candidate) => candidate.id === card.dataset.itemId);

      if (item) {
        item.tierId = tierId;
        ordered.push(item);
      }
    });
  });

  data.items.forEach((item) => {
    if (!ordered.includes(item)) {
      ordered.push(item);
    }
  });

  data.items = ordered;
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.itemId = item.id;

  card.innerHTML = `
    <span class="card-image-wrap">
      <img src="${escapeHtml(adminImageUrl(item.image))}" alt="" title="Нажми, чтобы изменить label" />
    </span>

    <div class="card-label ${item.label ? "" : "empty"}" title="${escapeHtml(item.label || "")}">
      ${escapeHtml(item.label || "")}
    </div>

    <div class="card-tools">
      <button class="secondary" type="button">Label</button>
      <button class="danger" type="button">×</button>
    </div>
  `;

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    startCardPointerDrag(event, card);
  });

  card.querySelector("img").addEventListener("click", () => {
    if (cardDrag?.didDrag) return;
    editLabel(item.id);
  });

  card.querySelector(".card-tools button:nth-child(1)").addEventListener("click", () => editLabel(item.id));
  card.querySelector(".card-tools button:nth-child(2)").addEventListener("click", () => deleteItem(item.id));

  return card;
}

function setupDropzone(element, tierId) {
  element.dataset.tierDropzone = "true";
  element.dataset.tierId = tierId || "";

  element.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
}

function startCardPointerDrag(event, card) {
  event.preventDefault();

  const rect = card.getBoundingClientRect();

  cardDrag = {
    card,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    placeholder: null,
    didDrag: false
  };

  document.addEventListener("pointermove", moveCardPointerDrag);
  document.addEventListener("pointerup", endCardPointerDrag, { once: true });
}

function beginCardFloating() {
  if (!cardDrag || cardDrag.placeholder) return;

  const { card, width, height } = cardDrag;
  const rect = card.getBoundingClientRect();
  const placeholder = document.createElement("div");

  placeholder.className = "card-placeholder";
  placeholder.style.width = `${width}px`;
  placeholder.style.height = `${height}px`;

  card.parentNode.insertBefore(placeholder, card.nextSibling);

  cardDrag.placeholder = placeholder;
  cardDrag.didDrag = true;

  card.classList.add("card-floating");
  card.style.left = `${rect.left}px`;
  card.style.top = `${rect.top}px`;
  card.style.width = `${width}px`;
}

function moveCardPointerDrag(event) {
  if (!cardDrag) return;

  const distance = Math.hypot(
    event.clientX - cardDrag.startX,
    event.clientY - cardDrag.startY
  );

  if (distance > 5 && !cardDrag.placeholder) {
    beginCardFloating();
  }

  if (!cardDrag.placeholder) return;

  const { card, placeholder, offsetX, offsetY } = cardDrag;

  card.style.left = `${event.clientX - offsetX}px`;
  card.style.top = `${event.clientY - offsetY}px`;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const zone = target?.closest("[data-tier-dropzone]");

  document.querySelectorAll("[data-tier-dropzone]").forEach((node) => {
    node.classList.toggle("dragover", node === zone);
  });

  if (!zone) return;

  const beforeNode = getCardInsertBefore(zone, event.clientX, event.clientY);

  if (beforeNode) {
    zone.insertBefore(placeholder, beforeNode);
  } else {
    zone.appendChild(placeholder);
  }
}

function getCardInsertBefore(zone, x, y) {
  const cards = [...zone.querySelectorAll(".card:not(.card-floating)")];

  for (const card of cards) {
    const box = card.getBoundingClientRect();
    const sameRow = y >= box.top - 8 && y <= box.bottom + 8;

    if (sameRow && x < box.left + box.width / 2) {
      return card;
    }

    if (y < box.top + box.height / 2) {
      return card;
    }
  }

  return null;
}

function endCardPointerDrag() {
  document.removeEventListener("pointermove", moveCardPointerDrag);

  document.querySelectorAll("[data-tier-dropzone]").forEach((node) => {
    node.classList.remove("dragover");
  });

  if (!cardDrag) return;

  const { card, placeholder, didDrag } = cardDrag;

  if (!didDrag || !placeholder) {
    cardDrag = null;
    return;
  }

  card.classList.remove("card-floating");
  card.style.left = "";
  card.style.top = "";
  card.style.width = "";

  placeholder.parentNode.insertBefore(card, placeholder);
  placeholder.remove();

  syncItemsFromCardDom();

  cardDrag = null;
}

function startTierPointerDrag(event, section) {
  event.preventDefault();

  const root = document.querySelector("#tierlist");
  const rect = section.getBoundingClientRect();
  const placeholder = document.createElement("div");

  placeholder.className = "tier-placeholder";
  placeholder.style.height = `${rect.height}px`;

  section.parentNode.insertBefore(placeholder, section.nextSibling);

  tierDrag = {
    section,
    placeholder,
    root,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };

  section.classList.add("tier-floating");
  section.style.left = `${rect.left}px`;
  section.style.top = `${rect.top}px`;
  section.style.width = `${rect.width}px`;
  section.style.height = `${rect.height}px`;

  document.addEventListener("pointermove", moveTierPointerDrag);
  document.addEventListener("pointerup", endTierPointerDrag, { once: true });
}

function moveTierPointerDrag(event) {
  if (!tierDrag) return;

  const { section, placeholder, root, offsetX, offsetY } = tierDrag;

  section.style.left = `${event.clientX - offsetX}px`;
  section.style.top = `${event.clientY - offsetY}px`;

  const movableTiers = [...root.querySelectorAll(".tier[data-tier-id]:not(.tier-floating)")];

  let beforeNode = null;

  for (const node of movableTiers) {
    const box = node.getBoundingClientRect();

    if (event.clientY < box.top + box.height / 2) {
      beforeNode = node;
      break;
    }
  }

  if (beforeNode) {
    root.insertBefore(placeholder, beforeNode);
  } else {
    root.appendChild(placeholder);
  }
}

function endTierPointerDrag() {
  if (!tierDrag) return;

  const { section, placeholder } = tierDrag;

  section.classList.remove("tier-floating");
  section.style.left = "";
  section.style.top = "";
  section.style.width = "";
  section.style.height = "";

  placeholder.parentNode.insertBefore(section, placeholder);
  placeholder.remove();

  reorderTiersFromDom();

  tierDrag = null;

  document.removeEventListener("pointermove", moveTierPointerDrag);
}

function createTierSection(tier) {
  const section = document.createElement("section");
  section.className = "tier";
  section.dataset.tierId = tier.id;
  section.style.setProperty("--tier-color", tier.color || "#cccccc");

  const side = document.createElement("aside");
  side.className = "tier-side";

  side.innerHTML = `
    <button class="icon-button tier-drag-handle" type="button" title="Перетащить тир">
      ${icons.drag}
    </button>

    <div class="tier-top-actions">
      <div class="tier-object-actions">
        <button class="icon-button palette-button" type="button" title="Изменить цвет тира">
          ${icons.palette}
        </button>

        <input type="color" value="${escapeHtml(tier.color || "#cccccc")}" aria-label="Цвет тира" />

        <button class="icon-button danger" type="button" title="Удалить тир">
          ${icons.trash}
        </button>
      </div>
    </div>

    <div class="tier-main-label" contenteditable="true" spellcheck="false" title="Переименовать">
      ${escapeHtml(tier.label)}
    </div>

    <div class="tier-bottom-actions"></div>
  `;

  const dragHandle = side.querySelector(".tier-drag-handle");
  const paletteButton = side.querySelector(".palette-button");
  const deleteButton = side.querySelector(".danger");
  const colorInput = side.querySelector("input[type='color']");
  const label = side.querySelector(".tier-main-label");

  dragHandle.addEventListener("pointerdown", (event) => startTierPointerDrag(event, section));

  paletteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    colorInput.click();
  });

  colorInput.addEventListener("input", (event) => {
    updateTierColor(tier.id, event.target.value);
  });

  deleteButton.addEventListener("click", () => deleteTier(tier.id));

  label.addEventListener("input", () => {
    updateTierLabel(tier.id, label.textContent);
  });

  label.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      label.blur();
    }
  });

  const dropzone = document.createElement("div");
  dropzone.className = "dropzone";

  setupDropzone(dropzone, tier.id);

  data.items
    .filter((item) => item.tierId === tier.id)
    .forEach((item) => dropzone.append(createCard(item)));

  section.append(side, dropzone);

  return section;
}

function renderUnranked() {
  const root = document.querySelector("#unrankedDropzone");
  root.innerHTML = "";

  setupDropzone(root, null);

  data.items
    .filter((item) => !item.tierId)
    .forEach((item) => root.append(createCard(item)));
}

function render() {
  renderUnranked();

  const root = document.querySelector("#tierlist");
  root.innerHTML = "";

  data.tiers.forEach((tier) => {
    root.append(createTierSection(tier));
  });

  applyAllTierTitleLayouts();
}

fileInput.addEventListener("change", () => {
  addFilesToCropQueue([...fileInput.files]);
  fileInput.value = "";
});

function handleUploadPaste(event) {
  if (!isUploadModalOpen()) return;

  const files = [];

  for (const item of event.clipboardData?.items || []) {
    if (item.kind === "file") {
      const file = item.getAsFile();

      if (file && file.type.startsWith("image/")) {
        files.push(file);
      }
    }
  }

  if (files.length) {
    event.preventDefault();
    addFilesToCropQueue(files);
  }
}

uploadModal.addEventListener("paste", handleUploadPaste);

pasteZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  pasteZone.classList.add("dragover");
});

pasteZone.addEventListener("dragleave", () => {
  pasteZone.classList.remove("dragover");
});

pasteZone.addEventListener("drop", (event) => {
  event.preventDefault();
  pasteZone.classList.remove("dragover");

  const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
  addFilesToCropQueue(files);
});

cropEditor.addEventListener("dragover", (event) => {
  event.preventDefault();
});

cropEditor.addEventListener("drop", (event) => {
  event.preventDefault();

  const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
  addFilesToCropQueue(files);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeUploadModal();
  }
});

loadData();