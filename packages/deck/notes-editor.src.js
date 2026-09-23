// 발표 노트 편집기: 노션처럼 쓰는 자리에서 마크다운이 서식으로 바뀐다. 저장은 마크다운 문자열 그대로 한다.
// build-editor.mjs가 Tiptap까지 묶어 notes-editor.js 한 파일로 만들고, deck.js가 같은 폴더에서 불러온다.
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";

window.DeckNotesEditor = {
  // onChange(markdown)는 사용자가 고쳤을 때만 불린다. setMarkdown으로 바꾼 내용에는 불리지 않는다
  create({ element, label, placeholder, onChange, onSave }) {
    const editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({ link: { openOnClick: false } }),
        Placeholder.configure({ placeholder }),
        Markdown,
      ],
      editorProps: {
        attributes: { class: "notes-doc", "aria-label": label, "aria-multiline": "true", role: "textbox", spellcheck: "false" },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "s") {
            event.preventDefault();
            onSave();
            return true;
          }
          return false;
        },
      },
      onUpdate: () => onChange(editor.getMarkdown()),
    });
    return {
      setMarkdown(markdown) {
        editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
      },
      focus: () => editor.commands.focus(),
    };
  },
};
