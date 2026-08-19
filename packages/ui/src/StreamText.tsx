import type { Element, ElementContent, Root, RootContent } from "hast";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

/* Answers arrive as markdown, so they render as markdown — GFM tables, lists,
 * links and fenced code included. Raw HTML in a reply is left as text:
 * react-markdown drops it unless `rehype-raw` is added, and a model's output is
 * untrusted input. */

type Node = RootContent | ElementContent;

const span = (className: string, children: ElementContent[]): Element => ({
  type: "element",
  tagName: "span",
  properties: { className: [className] },
  children,
});

/** Code is quoted verbatim — splitting it would inject spans into the source. */
const isCode = (parent: Root | Element): boolean =>
  parent.type === "element" && (parent.tagName === "code" || parent.tagName === "pre");

/* Markdown leaves whitespace text nodes between block elements. They carry no
 * words, and wrapping them would put a span where only `<tr>`/`<td>` may go. */
const isBlank = (node: Node): boolean => node.type === "text" && node.value.trim() === "";

const lastMeaningful = (node: Root | Element): Node | undefined => {
  const kids: readonly Node[] = node.children;
  return kids.filter((child) => !isBlank(child)).at(-1);
};

/* Each word becomes its own span so it can resolve out of blur as it arrives.
 * The spans are position-free, so react-markdown keys them by index within the
 * parent: appending a word leaves earlier keys untouched and only the new word
 * animates. */
const splitWords = (tree: Root): void => {
  visit(tree, "text", (node, index, parent) => {
    if (parent === undefined || index === undefined || isCode(parent) || isBlank(node)) return;
    const words = node.value.split(/(?<=\s)/).filter((word) => word !== "");
    if (words.length === 0) return;
    parent.children.splice(
      index,
      1,
      ...words.map((word) => span("stream-word", [{ type: "text", value: word }])),
    );
    return index + words.length;
  });
};

/** Trails the caret behind the last word, wherever the reply currently ends. */
const appendCaret = (tree: Root): void => {
  let node: Root | Element = tree;
  for (;;) {
    const last = lastMeaningful(node);
    if (last?.type !== "element" || lastMeaningful(last)?.type !== "element") break;
    node = last;
  }
  node.children.push(span("stream-caret", []));
};

/* Block spacing lives on the wrapper; every element below carries only what
 * makes it read as that element, in design tokens. */
const components: Components = {
  h1: ({ children }) => <h1 className="text-[17px] font-semibold text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[15px] font-semibold text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[13.5px] font-semibold text-ink">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-ink underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-chip bg-inset px-1 py-0.5 font-mono text-[12px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-card bg-inset p-3 shadow-hairline [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-line-strong pl-3 text-ink-2">{children}</blockquote>
  ),
  hr: () => <hr className="border-line" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line px-2 py-1 text-left">{children}</td>,
};

/** A streamed answer, rendered as markdown, word by word. */
export function StreamText({ text, done }: { text: string; done: boolean }) {
  return (
    <div
      data-testid="stream-text"
      className="space-y-3 text-[13px] leading-relaxed break-words text-ink"
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          () => (tree: Root) => {
            splitWords(tree);
            if (!done) appendCaret(tree);
          },
        ]}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
}
