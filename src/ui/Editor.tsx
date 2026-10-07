import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#e8e6e1' },
    '.cm-content': { fontFamily: 'var(--mono)', padding: '12px 0', caretColor: '#e8b04a' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '21px', fontSize: '13px' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#5c626b' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 14px 0 12px', minWidth: '44px' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#b9bcc2' },
    '.cm-cursor': { borderLeftColor: '#e8b04a', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgba(232,176,74,0.22) !important' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(255,255,255,0.08)', outline: 'none' },
    '.cm-line.cm-errline': { backgroundColor: 'rgba(239,107,94,0.12)' },
  },
  { dark: true },
);

const style = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.processingInstruction, t.moduleKeyword, t.definitionKeyword], color: '#cf9df0' },
  { tag: [t.typeName, t.standard(t.typeName)], color: '#7cc6d8' },
  { tag: [t.string, t.character], color: '#a9d38e' },
  { tag: [t.number, t.bool, t.null], color: '#f0a868' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#626973', fontStyle: 'italic' },
  { tag: t.operator, color: '#b9bcc2' },
]);

export function Editor({ value, onChange, onRun }: { value: string; onChange: (v: string) => void; onRun?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onRun });
  cb.current = { onChange, onRun };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          EditorState.tabSize.of(4),
          keymap.of([
            { key: 'Mod-Enter', run: () => (cb.current.onRun?.(), true) },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          cpp(),
          syntaxHighlighting(style),
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    document.fonts?.ready.then(() => v.requestMeasure());
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="editor-wrap" ref={host} />;
}
