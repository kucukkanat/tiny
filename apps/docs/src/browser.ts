/**
 * Everything the built site runs in the browser: a search box and the mobile
 * nav toggle. Deliberately tiny and dependency-free — the pages are static HTML
 * and stay readable with this file blocked.
 */

import type { SearchEntry } from "./site.ts";

type Hit = { readonly url: string; readonly title: string; readonly detail: string };

const MAX_HITS = 8;

/**
 * Ranks a page against a query: title matches beat heading matches beat body
 * matches, and every term must appear somewhere. Substring matching is enough
 * for a site this size and costs nothing to build.
 */
const score = (entry: SearchEntry, terms: readonly string[]): number => {
  const title = entry.title.toLowerCase();
  const headings = entry.headings.map((heading) => heading.text.toLowerCase()).join(" ");
  const body = `${entry.blurb} ${entry.text}`.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.includes(term)) total += 10;
    else if (headings.includes(term)) total += 4;
    else if (body.includes(term)) total += 1;
    else return 0;
  }
  return total;
};

/** The first heading a term appears in, so a hit can point at a section. */
const deepLink = (entry: SearchEntry, terms: readonly string[]): Hit => {
  const match = entry.headings.find((heading) =>
    terms.some((term) => heading.text.toLowerCase().includes(term)),
  );
  return match === undefined
    ? { url: entry.url, title: entry.title, detail: entry.blurb }
    : { url: `${entry.url}#${match.id}`, title: entry.title, detail: match.text };
};

const search = (input: HTMLInputElement, list: HTMLUListElement) => {
  const root = input.dataset.root ?? "./";
  let entries: readonly SearchEntry[] | undefined;

  const load = async (): Promise<readonly SearchEntry[]> => {
    if (entries !== undefined) return entries;
    const response = await fetch(`${root}assets/search.json`);
    entries = (await response.json()) as readonly SearchEntry[];
    return entries;
  };

  const show = (hits: readonly Hit[], query: string) => {
    list.hidden = hits.length === 0 && query === "";
    if (query === "") {
      list.innerHTML = "";
      list.hidden = true;
      return;
    }
    list.hidden = false;
    list.innerHTML =
      hits.length === 0
        ? '<li class="empty">No matches</li>'
        : hits
            .map(
              (hit) =>
                `<li><a href="${root}${hit.url}"><strong>${hit.title}</strong><span>${hit.detail}</span></a></li>`,
            )
            .join("");
  };

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    if (query === "") return show([], "");
    void load().then((loaded) => {
      const terms = query.split(/\s+/);
      const hits = loaded
        .map((entry) => ({ entry, rank: score(entry, terms) }))
        .filter(({ rank }) => rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, MAX_HITS)
        .map(({ entry }) => deepLink(entry, terms));
      show(hits, query);
    });
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      show([], "");
      input.blur();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      list.querySelector("a")?.focus();
    }
  });

  // `/` is the near-universal docs shortcut; it must not steal a keystroke
  // meant for a field the reader is already typing in.
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      input.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (!list.contains(event.target) && event.target !== input) show([], "");
  });
};

const navToggle = (button: HTMLButtonElement, sidebar: HTMLElement) => {
  button.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
};

const input = document.getElementById("search-input");
const results = document.getElementById("search-results");
if (input instanceof HTMLInputElement && results instanceof HTMLUListElement)
  search(input, results);

const toggle = document.querySelector(".nav-toggle");
const sidebar = document.getElementById("sidebar");
if (toggle instanceof HTMLButtonElement && sidebar !== null) navToggle(toggle, sidebar);
