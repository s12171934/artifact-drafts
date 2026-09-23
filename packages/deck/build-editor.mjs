// notes-editor.src.js를 Tiptap과 함께 한 파일(IIFE)로 묶는다. npm publish 전(prepublishOnly)과 로컬 서버(serve.mjs)가 쓴다.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL(".", import.meta.url));
export const editorSourcePath = `${packageDirectory}notes-editor.src.js`;

export async function buildEditor({ write = true } = {}) {
  const result = await build({
    entryPoints: [editorSourcePath],
    outfile: `${packageDirectory}notes-editor.js`,
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    legalComments: "eof",
    write,
  });
  return write ? null : result.outputFiles[0].text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildEditor();
  console.log("packages/deck/notes-editor.js");
}
