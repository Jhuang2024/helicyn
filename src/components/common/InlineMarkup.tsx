import { createElement, useMemo, type ReactNode } from 'react';
/** Imported simulation text may contain emphasis, never executable HTML or attributes. */
export function InlineMarkup({ text }: { text: string }) {
  const content = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = text;
    function render(node: Node, key: number): ReactNode {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (!(node instanceof Element)) return null;
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'iframe', 'object', 'svg', 'math'].includes(tag)) return null;
      const children = Array.from(node.childNodes).map(render);
      if (tag === 'br') return createElement('br', { key });
      return ['b', 'strong', 'em'].includes(tag) ? createElement(tag, { key }, children) : children;
    }
    return Array.from(template.content.childNodes).map(render);
  }, [text]);
  return <>{content}</>;
}
