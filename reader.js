const ISSUES = Object.freeze({
  "01": { title: "Synthesis / Τεύχος 01", pdf: "./issues/synthesis-issue-01.pdf", page: "./issue-01.html", pages: 32 },
  "02": { title: "Synthesis / Τεύχος 02", pdf: "./issues/synthesis-issue-02.pdf", page: "./issue-02.html", pages: 42 }
});

const parameters = new URLSearchParams(window.location.search);
const issueId = Object.hasOwn(ISSUES, parameters.get("issue")) ? parameters.get("issue") : "02";
const issue = ISSUES[issueId];
const requestedPage = Number(parameters.get("page"));
let pageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, issue.pages) : 1;
let zoom = 1;
let documentPdf;
let pdfjs;
let renderTask;
let textTask;
let renderVersion = 0;
let resizeTimeout;
let pendingPageScroll = false;

const elements = {
  title: document.querySelector("#reader-title"),
  status: document.querySelector("#reader-status"),
  viewport: document.querySelector("#reader-viewport"),
  page: document.querySelector("#reader-page"),
  form: document.querySelector("#page-form"),
  number: document.querySelector("#page-number"),
  total: document.querySelector("#page-total"),
  previous: document.querySelector("#previous-page"),
  next: document.querySelector("#next-page"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomLevel: document.querySelector("#zoom-level"),
  fit: document.querySelector("#fit-width"),
  fullscreen: document.querySelector("#fullscreen"),
  workspace: document.querySelector("#reader-workspace"),
  textDetails: document.querySelector("#reader-text"),
  text: document.querySelector("#page-text")
};

document.title = `${issue.title} · Αναγνωστήριο`;
elements.title.textContent = issue.title;
document.querySelector("#issue-link").href = issue.page;
for (const id of ["open-pdf", "download-pdf"]) document.getElementById(id).href = issue.pdf;
document.querySelector("#download-pdf").download = `synthesis-issue-${issueId}.pdf`;
elements.number.value = String(pageNumber);
elements.number.max = String(issue.pages);
elements.total.textContent = String(issue.pages);

function setStatus(message, error = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", error);
}

function updateControls() {
  const ready = Boolean(documentPdf);
  elements.number.disabled = !ready;
  elements.number.value = String(pageNumber);
  elements.previous.disabled = !ready || pageNumber <= 1;
  elements.next.disabled = !ready || pageNumber >= documentPdf?.numPages;
  elements.zoomOut.disabled = !ready || zoom <= .6;
  elements.zoomIn.disabled = !ready || zoom >= 3;
  elements.fit.disabled = !ready;
  elements.zoomLevel.value = `${Math.round(zoom * 100)}%`;
}

function updateAddress() {
  const address = new URL(window.location.href);
  address.searchParams.set("issue", issueId);
  address.searchParams.set("page", String(pageNumber));
  window.history.replaceState(null, "", address);
}

function fitScale(page) {
  const naturalWidth = page.getViewport({ scale: 1 }).width;
  const style = window.getComputedStyle(elements.viewport);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(1, elements.viewport.clientWidth - horizontalPadding) / naturalWidth;
}

function finishPageNavigation() {
  if (!pendingPageScroll) return;
  pendingPageScroll = false;
  if (document.fullscreenElement === elements.workspace) {
    elements.workspace.scrollTo({ top: 0, behavior: "instant" });
  } else {
    elements.workspace.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
  }
}

async function renderPage() {
  if (!documentPdf) return;
  const version = ++renderVersion;
  const targetPage = pageNumber;
  renderTask?.cancel();
  textTask?.cancel();
  renderTask = undefined;
  textTask = undefined;
  elements.viewport.setAttribute("aria-busy", "true");
  setStatus(`Φόρτωση σελίδας ${targetPage}…`);
  updateControls();
  updateAddress();

  try {
    const page = await documentPdf.getPage(targetPage);
    if (version !== renderVersion) return;
    const viewport = page.getViewport({ scale: fitScale(page) * zoom });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas unavailable");
    // Bound pixel count as well as device density for large pages on mobile.
    const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16000000 / (viewport.width * viewport.height)));
    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${issue.title}, σελίδα ${targetPage} από ${documentPdf.numPages}. Το κείμενο διατίθεται και κάτω από τη σελίδα.`);

    const currentRender = page.render({
      canvasContext: context,
      canvas,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    });
    renderTask = currentRender;
    const textContentPromise = page.getTextContent().catch(() => null);
    await currentRender.promise;
    if (version !== renderVersion) return;

    const textContent = await textContentPromise;
    if (version !== renderVersion) return;
    const layer = document.createElement("div");
    layer.className = "textLayer";
    layer.setAttribute("aria-hidden", "true");
    layer.style.setProperty("--scale-factor", String(viewport.scale));
    layer.style.setProperty("--total-scale-factor", String(viewport.scale));
    if (textContent) {
      try {
        const currentText = new pdfjs.TextLayer({ textContentSource: textContent, container: layer, viewport });
        textTask = currentText;
        await currentText.render();
      } catch (error) {
        if (version !== renderVersion) return;
        // Canvas and the plain-text alternative remain available if layering fails.
        layer.replaceChildren();
      }
    }
    if (version !== renderVersion) return;

    elements.page.style.width = `${viewport.width}px`;
    elements.page.style.height = `${viewport.height}px`;
    elements.page.setAttribute("aria-label", `Σελίδα ${targetPage} από ${documentPdf.numPages}`);
    elements.page.replaceChildren(canvas, layer);
    const text = textContent?.items.filter((item) => typeof item.str === "string").map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`).join("").trim() || "";
    elements.text.textContent = text;
    elements.textDetails.hidden = !text;
    elements.textDetails.querySelector("summary").textContent = `Κείμενο σελίδας ${targetPage}`;
    elements.viewport.setAttribute("aria-busy", "false");
    setStatus(`Σελίδα ${targetPage} από ${documentPdf.numPages}`);
    renderTask = undefined;
    textTask = undefined;
    finishPageNavigation();
  } catch (error) {
    if (version !== renderVersion || error?.name === "RenderingCancelledException") return;
    elements.viewport.setAttribute("aria-busy", "false");
    setStatus("Η σελίδα δεν μπόρεσε να εμφανιστεί. Δοκίμασε ξανά ή άνοιξε το πλήρες PDF από τον σύνδεσμο παρακάτω.", true);
    finishPageNavigation();
  }
}

function goToPage(number) {
  if (!documentPdf) return;
  const nextPage = Math.max(1, Math.min(documentPdf.numPages, Math.trunc(number)));
  if (!Number.isFinite(nextPage)) {
    elements.number.value = String(pageNumber);
    return;
  }
  if (nextPage !== pageNumber) {
    pageNumber = nextPage;
    pendingPageScroll = true;
    elements.viewport.scrollLeft = 0;
    elements.viewport.scrollTop = 0;
    renderPage();
  } else {
    elements.number.value = String(pageNumber);
    if (elements.status.classList.contains("is-error")) renderPage();
  }
}

function changeZoom(value) {
  if (!documentPdf) return;
  zoom = Math.round(Math.max(.6, Math.min(3, value)) * 100) / 100;
  renderPage();
}

elements.previous.addEventListener("click", () => goToPage(pageNumber - 1));
elements.next.addEventListener("click", () => goToPage(pageNumber + 1));
elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  goToPage(elements.number.valueAsNumber);
});
elements.number.addEventListener("change", () => goToPage(elements.number.valueAsNumber));
elements.zoomIn.addEventListener("click", () => changeZoom(zoom + .2));
elements.zoomOut.addEventListener("click", () => changeZoom(zoom - .2));
elements.fit.addEventListener("click", () => changeZoom(1));

document.addEventListener("keydown", (event) => {
  if (!documentPdf || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
  const target = event.target;
  if (target instanceof Element && (target.closest("input, textarea, select, [contenteditable='true']") || target.isContentEditable)) return;
  const actions = {
    ArrowLeft: () => goToPage(pageNumber - 1),
    ArrowRight: () => goToPage(pageNumber + 1),
    PageUp: () => goToPage(pageNumber - 1),
    PageDown: () => goToPage(pageNumber + 1),
    Home: () => goToPage(1),
    End: () => goToPage(documentPdf.numPages),
    "+": () => changeZoom(zoom + .2),
    "=": () => changeZoom(zoom + .2),
    "-": () => changeZoom(zoom - .2),
    "0": () => changeZoom(1)
  };
  if (Object.hasOwn(actions, event.key)) {
    event.preventDefault();
    actions[event.key]();
  }
});

if (document.fullscreenEnabled && elements.workspace.requestFullscreen) {
  elements.fullscreen.hidden = false;
  elements.fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await elements.workspace.requestFullscreen();
    } catch (error) {
      setStatus("Η πλήρης οθόνη δεν είναι διαθέσιμη σε αυτό το πρόγραμμα περιήγησης.", true);
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === elements.workspace;
    elements.fullscreen.setAttribute("aria-pressed", String(active));
    elements.fullscreen.setAttribute("aria-label", active ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη");
    elements.fullscreen.lastElementChild.textContent = active ? "Έξοδος" : "Πλήρης οθόνη";
  });
}

let observedWidth = elements.viewport.clientWidth;
const scheduleResize = () => {
  const width = elements.viewport.clientWidth;
  if (width === observedWidth) return;
  observedWidth = width;
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => renderPage(), 150);
};
if ("ResizeObserver" in window) new ResizeObserver(scheduleResize).observe(elements.viewport);
else window.addEventListener("resize", scheduleResize);

async function loadIssue() {
  try {
    pdfjs = await import("./assets/vendor/pdfjs/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./assets/vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;
    const loading = pdfjs.getDocument({
      url: new URL(issue.pdf, import.meta.url).href,
      standardFontDataUrl: new URL("./assets/vendor/pdfjs/standard_fonts/", import.meta.url).href,
      wasmUrl: new URL("./assets/vendor/pdfjs/wasm/", import.meta.url).href,
      isEvalSupported: false
    });
    documentPdf = await loading.promise;
    pageNumber = Math.min(pageNumber, documentPdf.numPages);
    elements.total.textContent = String(documentPdf.numPages);
    elements.number.max = String(documentPdf.numPages);
    await renderPage();
  } catch (error) {
    elements.viewport.setAttribute("aria-busy", "false");
    elements.viewport.hidden = true;
    setStatus("Το αναγνωστήριο δεν μπόρεσε να ανοίξει. Μπορείς να διαβάσεις ή να κατεβάσεις το πλήρες PDF από τους συνδέσμους παρακάτω.", true);
  }
}

loadIssue();
