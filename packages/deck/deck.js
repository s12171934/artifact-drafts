// 덱 틀: 슬라이드 내용은 deck.html의 <template id="slides"> 안 <slide> 태그에 있고,
// 이 파일은 그 슬라이드를 읽어 보여 주고, 넘기고, 창끼리 동기화하는 로직만 가진다.
//
// 슬라이드 스크립트(<script type="text/slide">)는 슬라이드가 화면에 붙을 때마다 실행되고 `slide`를 받는다.
//   slide.root         이 슬라이드의 DOM (.slide)
//   slide.values       덱 전체가 공유하는 조작 값
//   slide.interactive  이 화면에서 조작할 수 있는가 (미리보기, 권한 없는 청중은 false)
//   slide.set(patch, { debounce })  조작 값을 바꾼다. 발표자와 청중 창에 양방향으로 동기화된다
//   slide.onUpdate(fn)              조작 값이 바뀔 때마다 fn(values). 붙은 직후에도 한 번 불린다
//
// 동기화 문서 (artifact db, 없으면 같은 브라우저 탭끼리 BroadcastChannel)
//   presentation/current   현재 슬라이드. 편집 권한이 있는 사람이 발표자 창이나 청중 창에서 넘기면 양쪽이 따라간다
//   presentation/controls  조작 값. 발표자와 청중 모두 쓰고 모두 따라간다
//   data/users/<id>/speakerNotes  각자의 발표 노트 (마크다운)
//
// 발표 노트 편집기는 같은 폴더의 notes-editor.js(Tiptap 번들)를 불러와 textarea 자리에 붙인다. 못 불러오면 textarea로 쓴다.

// ---- 슬라이드 읽기 ----
// 인라인되면 src가 없으므로 편집기를 불러오지 않는다
const frameBase = document.currentScript?.src || "";
const source = document.getElementById("slides");
const setupRegistry = (window.__deckSlideSetups = {});

// 슬라이드 스크립트를 함수로 등록한다. eval 대신 인라인 스크립트 요소로 넣는다
function compileSetup(id, code) {
  const element = document.createElement("script");
  element.textContent = `window.__deckSlideSetups[${JSON.stringify(id)}] = function (slide) {\n${code}\n};`;
  document.head.append(element);
  element.remove();
  return setupRegistry[id] ?? null;
}

// <notes> 안의 마크다운은 태그에 맞춰 들여쓰므로 공통 들여쓰기를 걷어낸다. 남겨 두면 코드 블록으로 읽힌다
function dedent(text) {
  const lines = text.replace(/^\s*\n/, "").trimEnd().split("\n");
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)[0].length));
  return Number.isFinite(indent) ? lines.map((line) => line.slice(indent)).join("\n") : "";
}

function readSlide(element) {
  const script = element.querySelector('script[type="text/slide"]');
  const notes = element.querySelector("notes");
  const body = document.createDocumentFragment();
  for (const node of element.childNodes) if (node !== script && node !== notes) body.append(node.cloneNode(true));
  return {
    id: element.id,
    label: element.getAttribute("label") || element.id,
    section: element.getAttribute("section"),
    className: element.getAttribute("class") ?? "",
    footer: element.hasAttribute("footer"),
    notes: notes ? dedent(notes.textContent) : "",
    body,
    setup: script ? compileSetup(element.id, script.textContent) : null,
  };
}

const deck = {
  title: source.dataset.title || document.title,
  url: source.dataset.url ?? "",
  slides: [...source.content.querySelectorAll("slide")].map(readSlide),
};
const indexOfSlide = (id) => deck.slides.findIndex((slide) => slide.id === id);

function sectionOf(index) {
  let current = "";
  for (const slide of deck.slides.slice(0, index + 1)) if (slide.section) current = slide.section;
  return current;
}

// ---- 상태 ----
const modes = ["solo", "presenter", "audience"];
const hashToken = location.hash.slice(1);
// 이 창이 쓴 값이 구독으로 되돌아왔을 때 알아보기 위한 표식
const clientId = Math.random().toString(36).slice(2);

function initialMode() {
  if (modes.includes(hashToken)) return hashToken;
  try { return modes.includes(localStorage.getItem("deckMode")) ? localStorage.getItem("deckMode") : "solo"; } catch { return "solo"; }
}

// 슬라이드 목록 방향은 이 브라우저에만 기억한다
const stripOrientations = ["horizontal", "vertical"];
function initialStrip() {
  try { return stripOrientations.includes(localStorage.getItem("deckStrip")) ? localStorage.getItem("deckStrip") : "horizontal"; } catch { return "horizontal"; }
}
// 전체 펼치기 고정도 이 브라우저에만 기억한다. 고정하면 슬라이드를 골라도 펼친 목록이 접히지 않는다
function initialGridPinned() {
  try { return localStorage.getItem("deckGridPinned") === "true"; } catch { return false; }
}

let state = {
  mode: initialMode(),
  strip: initialStrip(),
  grid: initialGridPinned(),
  gridPinned: initialGridPinned(),
  index: Math.max(0, indexOfSlide(hashToken)),
  values: {},
  canPresent: true,
  canInteract: true,
  sync: { state: "idle", text: "" },
};

const sharedPosition = () => ({ slideId: deck.slides[state.index].id, from: clientId });
const sharedControls = () => ({ values: state.values, from: clientId });
// 청중 창에서 넘긴 슬라이드도 공유할 수 있는가. 권한이 없으면 그 창에서만 넘어간다
const sharesPosition = () => state.mode === "presenter" || (state.mode === "audience" && state.canPresent);
const sameValues = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function setState(patch, options = {}) {
  const previous = state;
  state = { ...state, ...patch };
  render();
  if (options.remote) return;
  const movedSlide = "index" in patch && patch.index !== previous.index;
  if ((sharesPosition() && movedSlide) || (state.mode === "presenter" && patch.mode === "presenter")) channels.position.publish(sharedPosition());
}

// 조작 값은 슬라이드를 다시 붙이지 않고 onUpdate만 부른다. 드래그 중인 슬라이더가 끊기지 않는다
function setValues(patch, options = {}) {
  const values = { ...state.values, ...patch };
  if (sameValues(values, state.values)) return;
  state = { ...state, values };
  updateValues();
  if (!options.remote && state.mode !== "solo") channels.controls.publish(sharedControls(), options.debounce);
}

let lastPosition = null;
let lastControls = null;

function applyPosition(body) {
  if (body) {
    lastPosition = body;
    if (body.from === clientId) return;
  }
  if (!lastPosition || state.mode === "solo") return;
  const index = indexOfSlide(lastPosition.slideId);
  if (index >= 0 && index !== state.index) setState({ index }, { remote: true });
}

function applyControls(body) {
  if (body) {
    if (body.from === clientId) return;
    lastControls = body.values && typeof body.values === "object" ? body.values : {};
  }
  if (!lastControls || state.mode === "solo" || sameValues(lastControls, state.values)) return;
  state = { ...state, values: { ...lastControls } };
  updateValues();
}

// ---- 동기화 ----
// 한 문서에는 한 번에 하나의 쓰기만: 진행 중이면 마지막 값만 남겨 두었다가 이어서 쓴다
function createWriter({ onWritten, onRefused }) {
  return {
    write: null,
    pending: null,
    writing: false,
    timer: 0,

    publish(body, debounce) {
      if (!this.write) return;
      this.pending = body;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), debounce ? 250 : 0);
    },

    async flush() {
      if (this.writing || !this.pending) return;
      this.writing = true;
      while (this.pending) {
        const body = this.pending;
        this.pending = null;
        try {
          await this.write(body).catch(async (error) => {
            if (error?.code !== "unavailable") throw error;
            await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));
            return this.write(body);
          });
          onWritten();
        } catch (error) {
          if (error?.code === "invalid_argument") onRefused();
          else setSync("error", "동기화가 끊겼습니다. 페이지를 새로 여세요");
        }
      }
      this.writing = false;
    },
  };
}

let syncKind = "none";
let sayHello = null;
const otherSide = () => (state.mode === "audience" ? "발표자" : "청중");

const channels = {
  position: createWriter({
    onWritten: () => setSync("live", syncKind === "db" ? `${otherSide()} 화면에 반영됨` : `이 브라우저의 ${otherSide()} 탭에 반영됨`),
    onRefused: () => setSync("error", "편집 권한이 없어 슬라이드 위치를 공유할 수 없습니다"),
  }),
  controls: createWriter({
    onWritten: () => setSync("live", `조작한 값이 ${otherSide()} 화면에 반영됨`),
    onRefused: () => {
      state = { ...state, canInteract: false };
      render();
      setSync("error", "이 슬라이드를 조작할 권한이 없습니다");
    },
  }),
};

function setSync(syncState, text) {
  state = { ...state, sync: { state: syncState, text } };
  renderStatus();
}

async function connectSync() {
  const db = window.claude?.use ? await window.claude.use("db") : null;
  if (db) {
    const user = await window.claude.use("user");
    const canPresent = user ? await user.canEdit() : true;
    const canWrite = user ? await user.can("data.write") : null;
    const positionRef = db.doc("presentation/current");
    const controlsRef = db.doc("presentation/controls");
    syncKind = "db";
    channels.position.write = (body) => positionRef.set(body);
    channels.controls.write = (body) => controlsRef.set(body);
    positionRef.onSnapshot(
      (snap) => {
        if (snap.exists) applyPosition(snap.data());
        if (state.mode === "audience" && snap.data()?.from !== clientId) {
          setSync(snap.exists ? "live" : "idle", snap.exists ? "발표자를 따라가는 중" : "발표가 아직 시작되지 않았습니다");
        }
      },
      () => setSync("error", "발표 연결이 끊겼습니다. 페이지를 새로 여세요"),
    );
    controlsRef.onSnapshot(
      (snap) => { if (snap.exists) applyControls(snap.data()); },
      () => setSync("error", "조작 연결이 끊겼습니다. 페이지를 새로 여세요"),
    );
    state = { ...state, canPresent, canInteract: canWrite !== false };
    if (!canPresent && state.mode === "presenter") state = { ...state, mode: "audience" };
    render();
    if (state.mode === "presenter") channels.position.publish(sharedPosition());
    const viewerId = user ? await user.id() : null;
    if (viewerId) notes.connect(db.doc(`data/users/${viewerId}/speakerNotes`));
    else notes.unavailable("로그인한 편집자만 노트를 저장할 수 있습니다");
    return;
  }
  notes.unavailable("노트 저장은 퍼블리시된 페이지에서만 됩니다");
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("deck-presentation");
    syncKind = "local";
    channels.position.write = async (body) => channel.postMessage({ kind: "position", body });
    channels.controls.write = async (body) => channel.postMessage({ kind: "controls", body });
    channel.addEventListener("message", ({ data }) => {
      // 새로 열린 청중 탭이 인사하면 발표자 탭이 현재 위치와 조작 값을 다시 보낸다
      if (data?.hello) {
        if (state.mode === "presenter") {
          channels.position.publish(sharedPosition());
          channels.controls.publish(sharedControls());
        }
        return;
      }
      if (data?.kind === "position") {
        applyPosition(data.body);
        if (state.mode === "audience" && data.body?.from !== clientId) setSync("live", "발표자 탭을 따라가는 중 (로컬)");
      }
      if (data?.kind === "controls") applyControls(data.body);
    });
    sayHello = () => channel.postMessage({ hello: true });
    if (state.mode === "audience") sayHello();
  }
  render();
}

// ---- 발표 노트: 슬라이드별로 고쳐 쓰면 입력이 멈출 때 이 사람의 db 개인 영역에 자동 저장된다 ----
// 내용은 마크다운 문자열이다. 편집기가 붙기 전과 못 붙었을 때는 textarea에 원문을 그대로 보인다
const notesInput = document.getElementById("notesInput");
// 입력이 멈추고 이만큼 지나면 저장한다. 실패하면 retryDelay 뒤에 다시 시도한다
const autosaveDelay = 3000;
const retryDelay = 5000;
const notesStatus = document.getElementById("notesStatus");

const notes = {
  ref: null,
  saved: {},
  drafts: {},
  shownSlide: null,
  saving: false,
  message: "",
  editor: null,
  timer: 0,
  refused: false,
  failed: false,

  textFor(slide) {
    return this.drafts[slide.id] ?? this.saved[slide.id] ?? slide.notes;
  },

  async connect(ref) {
    this.ref = ref;
    try {
      const snap = await ref.get();
      this.saved = snap.exists ? { ...(snap.data().bySlide ?? {}) } : {};
      this.message = "";
    } catch {
      this.message = "저장된 노트를 불러오지 못했습니다";
    }
    this.shownSlide = null;
    this.render();
    // 불러오기 전에 쓴 내용이 있으면 이어서 저장한다
    this.schedule();
  },

  unavailable(message) {
    this.ref = null;
    this.message = message;
    this.render();
  },

  edit(value) {
    this.drafts[deck.slides[state.index].id] = value;
    if (this.ref) {
      this.message = "";
      this.failed = false;
    }
    this.render();
    this.schedule();
  },

  schedule(delay = autosaveDelay) {
    clearTimeout(this.timer);
    if (this.ref && !this.refused) this.timer = setTimeout(() => this.save(), delay);
  },

  // 창을 닫거나 다른 탭으로 갈 때처럼 기다릴 수 없으면 바로 저장한다
  flush() {
    clearTimeout(this.timer);
    this.save();
  },

  async save() {
    if (!this.ref || this.refused || this.saving || !Object.keys(this.drafts).length) return;
    const next = { ...this.saved, ...this.drafts };
    const written = { ...this.drafts };
    this.saving = true;
    this.render();
    try {
      await this.ref.set({ bySlide: next });
      this.saved = next;
      // 저장하는 동안 더 고친 내용은 초안으로 남긴다
      for (const [id, text] of Object.entries(written)) if (this.drafts[id] === text) delete this.drafts[id];
      this.failed = false;
      this.message = `저장됨 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch (error) {
      this.refused = error?.code === "invalid_argument";
      this.failed = !this.refused;
      this.message = this.refused ? "이 계정으로는 노트를 저장할 수 없습니다" : "저장하지 못했습니다. 잠시 뒤 다시 시도합니다";
      if (this.failed) this.schedule(retryDelay);
    }
    this.saving = false;
    this.render();
    // 저장하는 동안 더 쓴 내용은 이어서 저장한다
    if (!this.refused && !this.failed && Object.keys(this.drafts).length) this.schedule();
  },

  render() {
    const slide = deck.slides[state.index];
    // 입력 중인 커서를 지키려고 슬라이드가 바뀔 때만 내용을 바꾼다
    if (this.shownSlide !== slide.id) {
      if (this.editor) this.editor.setMarkdown(this.textFor(slide));
      else notesInput.value = this.textFor(slide);
      this.shownSlide = slide.id;
    }
    const unsaved = Object.keys(this.drafts).length;
    if (this.saving) notesStatus.textContent = "저장 중…";
    else notesStatus.textContent = this.message || (unsaved ? "입력을 멈추면 저장됩니다" : this.ref ? "변경 사항 없음" : "");
    notesStatus.dataset.state = unsaved && (!this.ref || this.refused || this.failed) ? "dirty" : "idle";
  },
};

notesInput.addEventListener("input", () => notes.edit(notesInput.value));
// Cmd/Ctrl+S는 기다리지 않고 바로 저장한다
notesInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "s") {
    event.preventDefault();
    notes.flush();
  }
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") notes.flush(); });
window.addEventListener("pagehide", () => notes.flush());

function loadNotesEditor() {
  if (!frameBase) return;
  const script = document.createElement("script");
  script.src = new URL("notes-editor.js", frameBase).href;
  script.addEventListener("load", () => {
    if (!window.DeckNotesEditor) return;
    const host = document.createElement("div");
    host.className = "notes notes-rich";
    try {
      notes.editor = window.DeckNotesEditor.create({
        element: host,
        label: "발표 노트",
        placeholder: "할 말을 쓰세요. # 제목, - 목록, **굵게**, `코드`가 바로 서식으로 바뀝니다",
        onChange: (markdown) => notes.edit(markdown),
        onSave: () => notes.flush(),
      });
    } catch (error) {
      console.error("notes editor failed", error);
      return;
    }
    // textarea에 쓰던 중이면 그 내용을 이어받는다
    notes.shownSlide = null;
    notesInput.replaceWith(host);
    document.querySelector('label[for="notesInput"]')?.addEventListener("click", () => notes.editor.focus());
    notes.render();
  });
  script.addEventListener("error", () => console.warn("notes editor could not load; using plain text notes"));
  document.head.append(script);
}

// ---- 슬라이드 붙이기 ----
// host 안에 슬라이드를 새로 만들고 슬라이드 스크립트를 실행한다
function mountSlide(host, slide, { interactive, preview = false }) {
  const root = document.createElement("div");
  root.className = `slide ${slide.className}`.trim();
  root.append(slide.body.cloneNode(true));
  if (slide.footer) {
    const footer = document.createElement("div");
    footer.className = "footer";
    const title = document.createElement("span");
    title.textContent = deck.title;
    const page = document.createElement("span");
    page.textContent = `${indexOfSlide(slide.id) + 1} / ${deck.slides.length}`;
    footer.append(title, page);
    root.append(footer);
  }
  // 미리보기는 본 슬라이드와 id가 겹치지 않도록 id·for를 지운다. 슬라이드 스크립트는 data-* 로 요소를 찾는다
  if (preview) {
    root.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    root.querySelectorAll("[for]").forEach((element) => element.removeAttribute("for"));
  }
  host.replaceChildren(root);

  const updaters = [];
  const api = {
    root,
    interactive,
    get values() { return state.values; },
    set: (patch, options) => { if (interactive) setValues(patch, options); },
    onUpdate: (fn) => { updaters.push(fn); },
  };
  try { slide.setup?.(api); } catch (error) { console.error(`slide "${slide.id}" script failed`, error); }
  if (!interactive) root.querySelectorAll("input, button, select, textarea").forEach((control) => { control.disabled = true; });

  const mounted = {
    slide,
    interactive,
    update() {
      for (const fn of updaters) {
        try { fn(state.values); } catch (error) { console.error(`slide "${slide.id}" update failed`, error); }
      }
    },
  };
  mounted.update();
  return mounted;
}

// ---- 렌더 ----
const layout = document.getElementById("layout");
const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const presenterPanel = document.getElementById("presenterPanel");
const nav = document.getElementById("nav");
const strip = document.getElementById("strip");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const syncStatus = document.getElementById("syncStatus");
const fullscreenButton = document.getElementById("fullscreenButton");
const presenterModeButton = document.getElementById("presenterModeButton");
const stripTools = document.getElementById("stripTools");
const gridButton = document.getElementById("gridButton");
const gridPinButton = document.getElementById("gridPinButton");

// 슬라이드 목록: 각 항목이 해당 슬라이드를 축소해 보여 준다. 누르면 그 슬라이드로 가고 펼친 목록은 (고정하지 않았으면) 접힌다
const stripItems = deck.slides.map((slide, index) => {
  const button = document.createElement("button");
  button.type = "button";
  const frame = document.createElement("div");
  frame.className = "viewport preview";
  frame.inert = true;
  const target = document.createElement("div");
  target.className = "canvas";
  frame.append(target);
  const label = document.createElement("span");
  label.textContent = `${index + 1}. ${slide.label}`;
  button.append(frame, label);
  button.addEventListener("click", () => setState({ index, grid: state.gridPinned }));
  strip.append(button);
  return { slide, button, frame, target, mounted: mountSlide(target, slide, { interactive: false, preview: true }) };
});

let current = null;
let renderedIndex = -1;
let renderedStrip = "";

function updateValues() {
  current?.update();
  for (const item of stripItems) item.mounted.update();
}

function render() {
  const slide = deck.slides[state.index];
  const isAudience = state.mode === "audience";
  const isPresenter = state.mode === "presenter";
  const canOperate = !isAudience || (state.canInteract && syncKind !== "none");

  if (!current || current.slide !== slide || current.interactive !== canOperate) {
    current = mountSlide(canvas, slide, { interactive: canOperate });
  }

  nav.hidden = isAudience;
  strip.hidden = isAudience;
  stripTools.hidden = isAudience;
  presenterPanel.hidden = !isPresenter;
  const showGrid = state.grid && !isAudience;
  layout.dataset.mode = state.mode;
  layout.dataset.strip = state.strip;
  layout.toggleAttribute("data-grid", showGrid);
  for (const button of stripTools.querySelectorAll("[data-strip]")) button.setAttribute("aria-pressed", String(button.dataset.strip === state.strip));
  gridButton.setAttribute("aria-expanded", String(showGrid));
  gridButton.setAttribute("aria-pressed", String(showGrid));
  gridButton.textContent = showGrid ? "목록 접기" : "전체 펼치기";
  gridPinButton.setAttribute("aria-pressed", String(state.gridPinned));
  if (isPresenter) renderPresenterPanel();

  const section = sectionOf(state.index);
  document.getElementById("counter").textContent = `${section ? `${section} · ` : ""}${state.index + 1} / ${deck.slides.length}`;
  prevButton.disabled = state.index === 0;
  nextButton.disabled = state.index === deck.slides.length - 1;
  for (const item of stripItems) item.button.setAttribute("aria-current", String(item.slide === slide));
  for (const button of document.querySelectorAll("#modes button")) button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  presenterModeButton.hidden = !state.canPresent;
  renderStatus();
  fitAll();
  // 목록 배치가 바뀌었으면 바로, 슬라이드만 바뀌었으면 부드럽게 현재 항목을 가운데로 가져온다
  const stripLayout = `${state.strip}/${showGrid}`;
  if (!isAudience && (renderedIndex !== state.index || renderedStrip !== stripLayout)) scrollStripTo(state.index, renderedStrip === stripLayout);
  renderedIndex = state.index;
  renderedStrip = stripLayout;
}

function scrollStripTo(index, smooth) {
  const { button } = stripItems[index];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  strip.scrollTo({
    left: button.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2,
    top: button.offsetTop - (strip.clientHeight - button.offsetHeight) / 2,
    behavior: smooth && !reduceMotion ? "smooth" : "auto",
  });
}

function renderPresenterPanel() {
  notes.render();
  const audienceLink = document.getElementById("audienceLink");
  audienceLink.replaceChildren();
  if (deck.url) {
    const link = document.createElement("a");
    link.href = `${deck.url}#audience`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "청중 창 새로 열기";
    audienceLink.append(link, " — 열린 창에서 전체화면을 누르세요.");
  } else {
    audienceLink.textContent = "이 덱의 링크를 다른 창이나 화면에서 열고 '청중'을 고르세요.";
  }
}

function renderStatus() {
  const { mode, sync: currentSync } = state;
  let text = currentSync.text;
  if (mode === "solo") text = "혼자 보기: 다른 창과 연동하지 않습니다";
  else if (!text) {
    if (syncKind === "none") text = "이 환경에서는 창 연동을 쓸 수 없습니다";
    else if (mode === "presenter") text = "넘기는 슬라이드와 조작 값이 청중 화면에 반영됩니다";
    else if (state.canPresent) text = "발표자를 기다리는 중 · 방향키로 넘기면 발표자 화면도 함께 넘어갑니다";
    else text = state.canInteract ? "발표자를 기다리는 중 · 슬라이드 안의 조작은 발표자에게도 전달됩니다" : "발표자를 기다리는 중";
  }
  syncStatus.textContent = text;
  syncStatus.dataset.state = mode === "solo" ? "idle" : currentSync.state;
}

// 1920×1080 캔버스를 박스 안에 맞춰 축소하고 가운데 둔다
const fitTargets = new Map([[viewport, canvas], ...stripItems.map((item) => [item.frame, item.target])]);
function fit(box, target) {
  const scale = Math.min(box.clientWidth / 1920, box.clientHeight / 1080);
  const x = (box.clientWidth - 1920 * scale) / 2;
  const y = (box.clientHeight - 1080 * scale) / 2;
  target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
function fitAll() {
  fit(viewport, canvas);
  if (!strip.hidden) for (const item of stripItems) fit(item.frame, item.target);
}

// ---- 조작 ----
function go(delta) {
  setState({ index: Math.min(deck.slides.length - 1, Math.max(0, state.index + delta)) });
}

function setMode(mode) {
  try { localStorage.setItem("deckMode", mode); } catch {}
  setSync(mode === "audience" && lastPosition ? "live" : "idle", mode === "audience" && lastPosition ? "발표자를 따라가는 중" : "");
  setState({ mode });
  applyControls();
  if (mode === "audience") {
    applyPosition();
    sayHello?.();
  }
}

async function toggleFullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (viewport.classList.contains("filled")) return setFilled(false);
  try { await viewport.requestFullscreen(); } catch { setFilled(true); }
}
function setStrip(orientation) {
  try { localStorage.setItem("deckStrip", orientation); } catch {}
  setState({ strip: orientation });
}

// 고정을 켜면 목록을 펼치고, 끄면 펼친 상태는 그대로 둔다. 목록 접기를 누르면 고정도 풀린다
function setGridPinned(pinned) {
  try { localStorage.setItem("deckGridPinned", String(pinned)); } catch {}
  setState({ gridPinned: pinned, grid: pinned || state.grid });
}
function setGrid(open) {
  if (!open && state.gridPinned) {
    try { localStorage.setItem("deckGridPinned", "false"); } catch {}
    setState({ grid: false, gridPinned: false });
  } else setState({ grid: open });
}

function setFilled(on) {
  viewport.classList.toggle("filled", on);
  fullscreenButton.textContent = on ? "닫기" : "전체화면";
  fitAll();
}
document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "닫기" : "전체화면";
});

document.getElementById("deckTitle").textContent = deck.title;
for (const button of document.querySelectorAll("#modes button")) button.addEventListener("click", () => setMode(button.dataset.mode));

prevButton.addEventListener("click", () => go(-1));
nextButton.addEventListener("click", () => go(1));
fullscreenButton.addEventListener("click", toggleFullscreen);
for (const button of stripTools.querySelectorAll("[data-strip]")) button.addEventListener("click", () => setStrip(button.dataset.strip));
gridButton.addEventListener("click", () => setGrid(!state.grid));
gridPinButton.addEventListener("click", () => setGridPinned(!state.gridPinned));
document.addEventListener("keydown", (event) => {
  // 노트를 쓰거나 슬라이더를 움직이는 동안에는 단축키를 쓰지 않는다
  if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
  // 목록 방향과 상관없이 왼쪽·위쪽은 이전, 오른쪽·아래쪽은 다음이다
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) { event.preventDefault(); go(1); }
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); go(-1); }
  if (event.key === "Escape" && viewport.classList.contains("filled")) setFilled(false);
  else if (event.key === "Escape" && state.grid && !state.gridPinned) setState({ grid: false });
  if (event.key === "f") toggleFullscreen();
});
// 목록 배치를 바꾸면 미리보기 칸마다 크기가 달라지므로 칸 하나하나를 지켜본다
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) fit(entry.target, fitTargets.get(entry.target));
});
for (const box of fitTargets.keys()) resizeObserver.observe(box);

render();
connectSync();
loadNotesEditor();
