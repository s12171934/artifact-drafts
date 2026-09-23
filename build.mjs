// Publish build: inline each draft's local <script src> into dist/, leaving official CDN links as they are.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const draftsDirectory = new URL("./drafts/", import.meta.url).pathname;
const distDirectory = new URL("./dist/", import.meta.url).pathname;

const allowedScriptOrigins = ["https://cdnjs.cloudflare.com/", "https://cdn.jsdelivr.net/npm/", "https://cdn.tailwindcss.com", "https://code.jquery.com/"];
const scriptTagPattern = /<script\b([^>]*?)\bsrc="([^"]+)"([^>]*)>\s*<\/script>/g;

async function inlineLocalScripts(draftPath) {
  const html = await readFile(join(draftsDirectory, draftPath), "utf8");
  const replacements = [];
  for (const match of html.matchAll(scriptTagPattern)) {
    const [tag, attributesBefore, source, attributesAfter] = match;
    if (/^(https?:)?\/\//.test(source)) {
      if (!allowedScriptOrigins.some((origin) => source.startsWith(origin))) {
        throw new Error(`${draftPath}: ${source} is not on the Artifact CDN allowlist — use an allowlisted official link or a local file`);
      }
      continue;
    }
    const scriptPath = join(draftsDirectory, dirname(draftPath), source);
    const scriptBody = (await readFile(scriptPath, "utf8")).replace(/<\/script/gi, "<\\/script");
    const attributes = `${attributesBefore} ${attributesAfter}`.trim();
    replacements.push([tag, `<script${attributes ? " " + attributes : ""}>\n${scriptBody.trimEnd()}\n</script>`]);
  }
  return replacements.reduce((built, [tag, inlined]) => built.replace(tag, () => inlined), html);
}

const requestedPages = process.argv.slice(2);
const draftPages = requestedPages.length
  ? requestedPages.map((page) => page.replace(/^drafts\//, ""))
  : (await readdir(draftsDirectory, { recursive: true })).filter((entry) => entry.endsWith(".html"));

for (const draftPath of draftPages) {
  const outputPath = join(distDirectory, draftPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await inlineLocalScripts(draftPath));
  console.log(`drafts/${draftPath} → dist/${draftPath}`);
}
