// Local preview for Artifact drafts: same skeleton, CSP allowlist, and theme stamping as the published viewer.
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join, extname, normalize } from "node:path";

const draftsDirectory = new URL("./drafts/", import.meta.url).pathname;
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
watch(draftsDirectory, { recursive: true }, () => {
  for (const subscriber of reloadSubscribers) subscriber.write("data: reload\n\n");
});

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
<span>theme</span><span id="themeButtons"></span><span>width</span><span id="widthButtons"></span>
<span id="reloadStatus"></span></nav>
<main><iframe id="frame" src="/raw/${draftPath}"></iframe></main>
<script>
const frame = document.getElementById("frame");
const state = { theme: localStorage.getItem("theme") ?? "system", width: localStorage.getItem("width") ?? "full" };
const themeOptions = ["system", "light", "dark"], widthOptions = { full: "100%", tablet: "768px", phone: "400px" };
function applyState() {
  const root = frame.contentDocument?.documentElement;
  if (root) { if (state.theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", state.theme); }
  frame.style.width = widthOptions[state.width];
  document.querySelectorAll("nav button").forEach((button) => button.setAttribute("aria-pressed", state[button.dataset.key] === button.dataset.value));
  localStorage.setItem("theme", state.theme); localStorage.setItem("width", state.width);
}
function addButtons(containerId, key, values) {
  for (const value of values) {
    const button = document.createElement("button");
    Object.assign(button.dataset, { key, value }); button.textContent = value;
    button.onclick = () => { state[key] = value; applyState(); };
    document.getElementById(containerId).append(button);
  }
}
addButtons("themeButtons", "theme", themeOptions); addButtons("widthButtons", "width", Object.keys(widthOptions));
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
    const isRawPage = url.pathname.startsWith("/raw/");
    const relativePath = isRawPage ? url.pathname.slice("/raw/".length) : url.pathname.slice(1);
    const filePath = resolveInsideDrafts(relativePath);
    await stat(filePath);
    const fileContents = await readFile(filePath);
    const headers = { "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream", "content-security-policy": artifactContentSecurityPolicy, "cache-control": "no-store" };
    response.writeHead(200, headers);
    response.end(isRawPage && extname(filePath) === ".html" ? publishSkeletonHead + fileContents + "</body></html>" : fileContents);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
    response.end(String(error.message));
  }
}).listen(port, () => console.log(`Artifact drafts preview → http://localhost:${port}`));
