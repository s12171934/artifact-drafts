// Local preview for Artifact drafts: same skeleton, CSP allowlist, and theme stamping as the published viewer.
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join, extname, normalize } from "node:path";

const draftsDirectory = new URL("./drafts/", import.meta.url).pathname;
const deckSamplesPath = new URL("./dev/deck-samples.html", import.meta.url).pathname;
const deckPackageDirectory = new URL("./packages/deck/", import.meta.url).pathname;
// 덱 틀은 CDN 대신 packages/deck의 작업본을 쓴다. 퍼블리시본에는 CDN 링크가 그대로 남는다
const deckCdnPattern = /https:\/\/cdn\.jsdelivr\.net\/npm\/@s-dante\/artifact-deck@[^/"]+\//g;
const localDeckPrefix = "/__deck/";
const port = Number(process.env.PORT ?? 5178);

const artifactContentSecurityPolicy = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/npm/ https://cdn.tailwindcss.com https://code.jquery.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

const publishSkeletonHead = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>`;

const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".csv": "text/csv" };

const reloadSubscribers = new Set();
const notifyReload = () => { for (const subscriber of reloadSubscribers) subscriber.write("data: reload\n\n"); };
watch(draftsDirectory, { recursive: true }, notifyReload);
watch(deckSamplesPath, notifyReload);
watch(deckPackageDirectory, (_event, fileName) => {
  if (fileName === "notes-editor.src.js") builtEditor = null;
  if (fileName === "deck.js" || fileName === "notes-editor.src.js") notifyReload();
});

// notes-editor.js는 번들이라 요청 때 메모리로 빌드하고, 소스가 바뀔 때까지 재사용한다
let builtEditor = null;
async function serveDeckFile(fileName, response) {
  const headers = { "content-type": "text/javascript", "content-security-policy": artifactContentSecurityPolicy, "cache-control": "no-store" };
  if (fileName === "deck.js") {
    response.writeHead(200, headers);
    response.end(await readFile(join(deckPackageDirectory, "deck.js")));
    return;
  }
  if (fileName === "notes-editor.js") {
    const { buildEditor } = await import(join(deckPackageDirectory, "build-editor.mjs"));
    builtEditor ??= buildEditor({ write: false });
    try {
      const bundle = await builtEditor;
      response.writeHead(200, headers);
      response.end(bundle);
    } catch (error) {
      builtEditor = null;
      throw error;
    }
    return;
  }
  const notFound = new Error(`no such deck file: ${fileName}`);
  notFound.code = "ENOENT";
  throw notFound;
}

// Deck drafts get dev/deck-samples.html's slides appended to their slide template (styles to the page end), only while serving.
async function injectDeckSamples(pageHtml) {
  // The last match: deck templates also mention the tag in their syntax comment above the real one.
  const templateStart = [...pageHtml.matchAll(/<template\s+id="slides"/g)].at(-1)?.index;
  if (templateStart === undefined) return pageHtml;
  const templateEnd = pageHtml.indexOf("</template>", templateStart);
  if (templateEnd === -1) return pageHtml;
  const samples = (await readFile(deckSamplesPath, "utf8")).replace(/<!--[\s\S]*?-->/g, "");
  const styles = samples.match(/<style>[\s\S]*?<\/style>/g)?.join("\n") ?? "";
  const slides = samples.replace(/<style>[\s\S]*?<\/style>/g, "");
  return pageHtml.slice(0, templateEnd) + slides + pageHtml.slice(templateEnd) + styles;
}

function resolveInsideDrafts(relativePath) {
  const resolvedPath = normalize(join(draftsDirectory, decodeURIComponent(relativePath)));
  if (!resolvedPath.startsWith(draftsDirectory)) throw new Error(`path escapes drafts/: ${relativePath}`);
  return resolvedPath;
}

async function listDraftPages() {
  const entries = await readdir(draftsDirectory, { recursive: true });
  return entries.filter((entry) => entry.endsWith(".html")).sort();
}

function previewShell(draftPath) {
  return `<!doctype html><meta charset="utf-8"><title>${draftPath} · preview</title>
<style>
body{margin:0;height:100vh;display:flex;flex-direction:column;font:13px system-ui;background:#e7e5e4;color:#1c1917}
nav{display:flex;gap:12px;align-items:center;padding:8px 12px;background:#fff;border-bottom:1px solid #d6d3d1;flex-wrap:wrap}
nav a{color:inherit}nav button{font:inherit;padding:3px 9px;border:1px solid #a8a29e;background:#fff;border-radius:4px;cursor:pointer}
nav button[aria-pressed=true]{background:#1c1917;color:#fff}
main{flex:1;display:flex;justify-content:center;overflow:auto}
iframe{border:0;background:#fff;width:100%;height:100%;transition:width .15s}
</style>
<nav><a href="/">← drafts</a><strong>${draftPath}</strong>
<span>theme</span><span id="themeButtons"></span><span>width</span><span id="widthButtons"></span><span>deck samples</span><span id="samplesButtons"></span>
<span id="reloadStatus"></span></nav>
<main><iframe id="frame" src="/raw/${draftPath}"></iframe></main>
<script>
const frame = document.getElementById("frame");
const state = { theme: localStorage.getItem("theme") ?? "system", width: localStorage.getItem("width") ?? "full", samples: localStorage.getItem("samples") ?? "on" };
const themeOptions = ["system", "light", "dark"], widthOptions = { full: "100%", tablet: "768px", phone: "400px" };
function applyState() {
  const root = frame.contentDocument?.documentElement;
  if (root) { if (state.theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", state.theme); }
  frame.style.width = widthOptions[state.width];
  const src = "/raw/${draftPath}" + (state.samples === "off" ? "?samples=off" : "");
  if (frame.getAttribute("src") !== src) frame.setAttribute("src", src);
  document.querySelectorAll("nav button").forEach((button) => button.setAttribute("aria-pressed", state[button.dataset.key] === button.dataset.value));
  localStorage.setItem("theme", state.theme); localStorage.setItem("width", state.width); localStorage.setItem("samples", state.samples);
}
function addButtons(containerId, key, values) {
  for (const value of values) {
    const button = document.createElement("button");
    Object.assign(button.dataset, { key, value }); button.textContent = value;
    button.onclick = () => { state[key] = value; applyState(); };
    document.getElementById(containerId).append(button);
  }
}
addButtons("themeButtons", "theme", themeOptions); addButtons("widthButtons", "width", Object.keys(widthOptions)); addButtons("samplesButtons", "samples", ["on", "off"]);
frame.addEventListener("load", applyState); applyState();
new EventSource("/events").onmessage = () => {
  frame.contentWindow.location.reload();
  document.getElementById("reloadStatus").textContent = "reloaded " + new Date().toLocaleTimeString();
};
</script>`;
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === "/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      reloadSubscribers.add(response);
      request.on("close", () => reloadSubscribers.delete(response));
      return;
    }
    if (url.pathname === "/") {
      const links = (await listDraftPages()).map((page) => `<li><a href="/view/${page}">${page}</a></li>`).join("");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><meta charset="utf-8"><title>Artifact drafts</title><body style="font:14px system-ui;padding:24px"><h1>Artifact drafts</h1><ul>${links}</ul>`);
      return;
    }
    if (url.pathname.startsWith("/view/")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(previewShell(url.pathname.slice("/view/".length)));
      return;
    }
    if (url.pathname.startsWith(localDeckPrefix)) {
      await serveDeckFile(url.pathname.slice(localDeckPrefix.length), response);
      return;
    }
    const isRawPage = url.pathname.startsWith("/raw/");
    const relativePath = isRawPage ? url.pathname.slice("/raw/".length) : url.pathname.slice(1);
    const filePath = resolveInsideDrafts(relativePath);
    await stat(filePath);
    const fileContents = await readFile(filePath);
    const headers = { "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream", "content-security-policy": artifactContentSecurityPolicy, "cache-control": "no-store" };
    response.writeHead(200, headers);
    if (isRawPage && extname(filePath) === ".html") {
      const draftHtml = String(fileContents).replace(deckCdnPattern, localDeckPrefix);
      const pageHtml = url.searchParams.get("samples") === "off" ? draftHtml : await injectDeckSamples(draftHtml);
      response.end(publishSkeletonHead + pageHtml + "</body></html>");
    } else {
      response.end(fileContents);
    }
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
    response.end(String(error.message));
  }
}).listen(port, () => console.log(`Artifact drafts preview → http://localhost:${port}`));
