import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMarkdownDocument,
  parseMarkdownInline,
} from "../ui/src/utils/markdownDoc.ts";

test("parses headings and paragraphs with inline formatting", () => {
  const blocks = parseMarkdownDocument(
    "# Title\n\nThis is **bold**, _italic_, `code`, and a [link](https://example.com).",
  );

  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].type === "heading" ? blocks[0].level : null, 1);
  assert.equal(blocks[1].type, "paragraph");
  if (blocks[1].type === "paragraph") {
    assert.deepEqual(
      blocks[1].children.map((node) => node.type),
      ["text", "strong", "text", "em", "text", "code", "text", "link", "text"],
    );
  }
});

test("keeps links only for safe URLs", () => {
  const safe = parseMarkdownInline("[safe](https://example.com)");
  assert.equal(safe[0].type, "link");
  assert.equal(
    safe[0].type === "link" ? safe[0].href : null,
    "https://example.com",
  );

  const unsafe = parseMarkdownInline("[click](javascript:alert(1))");
  assert.deepEqual(unsafe, [{ type: "text", value: "click" }]);
});

test("parses fenced code blocks", () => {
  const blocks = parseMarkdownDocument('```python\nprint("hi")\n```');
  assert.deepEqual(blocks[0], {
    type: "code",
    language: "python",
    value: 'print("hi")',
  });
});

test("parses task lists and nested lists", () => {
  const blocks = parseMarkdownDocument("- [x] done\n- [ ] todo\n  - child");
  assert.equal(blocks[0].type, "list");
  if (blocks[0].type === "list") {
    assert.equal(blocks[0].ordered, false);
    assert.equal(blocks[0].items.length, 2);
    assert.equal(blocks[0].items[0].checked, true);
    assert.equal(blocks[0].items[1].checked, false);
    assert.equal(blocks[0].items[1].nested[0]?.type, "list");
  }
});

test("parses GFM tables with alignment", () => {
  const blocks = parseMarkdownDocument("| A | B |\n| :--- | ---: |\n| 1 | 2 |");
  assert.equal(blocks[0].type, "table");
  if (blocks[0].type === "table") {
    assert.deepEqual(blocks[0].align, ["left", "right"]);
    assert.equal(blocks[0].header.length, 2);
    assert.equal(blocks[0].rows.length, 1);
  }
});

test("parses blockquotes and horizontal rules", () => {
  const blocks = parseMarkdownDocument("> quoted\n\n---");
  assert.equal(blocks[0].type, "blockquote");
  assert.equal(blocks[1].type, "hr");
});

test("parses triple emphasis as bold italic", () => {
  const nodes = parseMarkdownInline("***both***");
  assert.equal(nodes[0].type, "strong");
  assert.equal(
    nodes[0].type === "strong" ? nodes[0].children[0].type : null,
    "em",
  );
});

test("preserves internal underscores and escapes", () => {
  assert.deepEqual(parseMarkdownInline("some_variable_name"), [
    { type: "text", value: "some_variable_name" },
  ]);
  assert.deepEqual(parseMarkdownInline("\\*not italic\\*"), [
    { type: "text", value: "*not italic*" },
  ]);
});
