import React from "react";
import "@/renderer/components/Markdown/SimpleMarkdown.scss";

type MarkdownBlock =
  | {
      kind: "heading";
      level: 1 | 2 | 3;
      text: string;
    }
  | {
      kind: "paragraph";
      text: string;
    }
  | {
      kind: "list";
      items: string[];
    };

type InlineSegment =
  | {
      kind: "text";
      value: string;
    }
  | {
      kind: "strong";
      value: string;
    }
  | {
      kind: "code";
      value: string;
    }
  | {
      kind: "link";
      value: string;
      target: string;
    };

type Props = {
  markdown: string;
  className?: string;
  onLinkClick?: (target: string) => void;
};

const parseInlineSegments = (text: string): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({
        kind: "text",
        value: text.slice(cursor, match.index),
      });
    }

    const token = match[0];
    if (token.startsWith("[") && token.includes("](")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        segments.push({
          kind: "link",
          value: linkMatch[1],
          target: linkMatch[2],
        });
      }
    } else if (token.startsWith("**")) {
      segments.push({
        kind: "strong",
        value: token.slice(2, -2),
      });
    } else {
      segments.push({
        kind: "code",
        value: token.slice(1, -1),
      });
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    segments.push({
      kind: "text",
      value: text.slice(cursor),
    });
  }

  return segments;
};

const renderInlineText = (text: string, onLinkClick?: (target: string) => void) => (
  parseInlineSegments(text).map((segment, index) => {
    if (segment.kind === "strong") {
      return <strong key={`${segment.kind}-${index}`}>{segment.value}</strong>;
    }

    if (segment.kind === "code") {
      return <code key={`${segment.kind}-${index}`}>{segment.value}</code>;
    }

    if (segment.kind === "link") {
      return (
        <button
          key={`${segment.kind}-${index}`}
          type="button"
          className="simple-markdown__link"
          onClick={() => onLinkClick?.(segment.target)}
        >
          {segment.value}
        </button>
      );
    }

    return <React.Fragment key={`${segment.kind}-${index}`}>{segment.value}</React.Fragment>;
  })
);

const flushParagraph = (blocks: MarkdownBlock[], paragraphLines: string[]) => {
  if (paragraphLines.length === 0) {
    return;
  }

  blocks.push({
    kind: "paragraph",
    text: paragraphLines.join(" "),
  });
  paragraphLines.splice(0, paragraphLines.length);
};

const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      kind: "list",
      items: listItems,
    });
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph(blocks, paragraphLines);
      flushList();
      return;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmedLine);
    if (headingMatch) {
      flushParagraph(blocks, paragraphLines);
      flushList();
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      return;
    }

    if (trimmedLine.startsWith("- ")) {
      flushParagraph(blocks, paragraphLines);
      listItems.push(trimmedLine.slice(2).trim());
      return;
    }

    flushList();
    paragraphLines.push(trimmedLine);
  });

  flushParagraph(blocks, paragraphLines);
  flushList();

  return blocks;
};

export default function SimpleMarkdown({ markdown, className, onLinkClick }: Props) {
  const blocks = parseMarkdownBlocks(markdown);

  return (
    <div className={["simple-markdown", className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const HeadingTag = `h${block.level}` as "h1" | "h2" | "h3";
          return (
            <HeadingTag key={`${block.kind}-${index}`}>
              {renderInlineText(block.text, onLinkClick)}
            </HeadingTag>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={`${block.kind}-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineText(item, onLinkClick)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`${block.kind}-${index}`}>
            {renderInlineText(block.text, onLinkClick)}
          </p>
        );
      })}
    </div>
  );
}
