import type { Heading } from "./render.ts";
import { hrefFrom, type Page, pages, rootFrom, sections } from "./site.ts";

export const REPO_URL = "https://github.com/kucukkanat/tiny";

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );

const sidebar = (current: Page): string =>
  sections
    .map(
      (section) => `<div class="nav-group">
        <p class="nav-title">${escapeHtml(section.title)}</p>
        <ul>${section.pages
          .map((page) => {
            const active = page.slug === current.slug;
            return `<li><a href="${hrefFrom(current, page)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(
              page.title,
            )}</a></li>`;
          })
          .join("")}</ul>
      </div>`,
    )
    .join("");

const onThisPage = (headings: readonly Heading[]): string => {
  if (headings.length === 0) return "";
  return `<nav class="toc" aria-label="On this page">
      <p class="nav-title">On this page</p>
      <ul>${headings
        .map(
          (heading) =>
            `<li class="depth-${heading.depth}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`,
        )
        .join("")}</ul>
    </nav>`;
};

/** Previous/next, in the order `sections` declares — the reading order. */
const pager = (current: Page): string => {
  const index = pages.findIndex((page) => page.slug === current.slug);
  const previous = index > 0 ? pages[index - 1] : undefined;
  const next = index >= 0 && index < pages.length - 1 ? pages[index + 1] : undefined;
  if (previous === undefined && next === undefined) return "";
  const link = (page: Page, direction: "Previous" | "Next") =>
    `<a class="pager-link ${direction.toLowerCase()}" href="${hrefFrom(current, page)}">
       <span class="pager-dir">${direction}</span>
       <span class="pager-title">${escapeHtml(page.title)}</span>
     </a>`;
  return `<nav class="pager">${previous === undefined ? "<span></span>" : link(previous, "Previous")}${
    next === undefined ? "<span></span>" : link(next, "Next")
  }</nav>`;
};

export type ShellInput = {
  readonly page: Page;
  readonly body: string;
  readonly headings: readonly Heading[];
  readonly description: string;
};

export const shell = ({ page, body, headings, description }: ShellInput): string => {
  const root = rootFrom(page) === "" ? "./" : rootFrom(page);
  const title = page.slug === "" ? "Tiny plugin docs" : `${page.title} · Tiny plugin docs`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <link rel="icon" href="${root}assets/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${root}assets/tokens.css" />
    <link rel="stylesheet" href="${root}assets/docs.css" />
    <script type="module" src="${root}assets/docs.js" defer></script>
  </head>
  <body>
    <a class="skip" href="#content">Skip to content</a>
    <header class="topbar">
      <button class="nav-toggle" type="button" data-testid="nav-toggle" aria-expanded="false" aria-controls="sidebar">
        <span aria-hidden="true">☰</span><span class="sr-only">Menu</span>
      </button>
      <a class="brand" href="${root}">
        <img src="${root}assets/icon.svg" alt="" width="20" height="20" />
        <span>Tiny <span class="brand-dim">plugins</span></span>
      </a>
      <div class="search" data-testid="search">
        <input
          id="search-input"
          type="search"
          placeholder="Search the docs"
          autocomplete="off"
          spellcheck="false"
          aria-label="Search the docs"
          data-root="${root}"
          data-testid="search-input"
        />
        <kbd>/</kbd>
        <ul id="search-results" class="search-results" hidden data-testid="search-results"></ul>
      </div>
      <nav class="topbar-links">
        <a href="${root}app/" data-testid="open-app">Open the app</a>
        <a href="${REPO_URL}" target="_blank" rel="noreferrer noopener">GitHub</a>
      </nav>
    </header>

    <div class="layout">
      <aside class="sidebar" id="sidebar" data-testid="sidebar">${sidebar(page)}</aside>
      <main id="content" class="content" data-testid="content">
        <article class="prose">${body}</article>
        ${pager(page)}
      </main>
      ${onThisPage(headings)}
    </div>
  </body>
</html>
`;
};
