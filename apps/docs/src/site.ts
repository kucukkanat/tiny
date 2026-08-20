/**
 * The site's table of contents — the one place a page is declared.
 *
 * Build order, sidebar order and the search index all read from this list, so a
 * page that is not here does not exist. `slug: ""` is the home page and is the
 * only page written to `dist/index.html`; every other page becomes
 * `dist/<slug>/index.html`, which keeps URLs extensionless without needing any
 * server rewrite — GitHub Pages serves directory indexes as-is.
 */
export type Page = {
  /** URL segment; `""` for the home page. */
  readonly slug: string;
  /** File under `content/`, and what an internal markdown link points at. */
  readonly file: string;
  readonly title: string;
  /** One line, shown under the title in the sidebar's card and in search. */
  readonly blurb: string;
};

export type Section = {
  readonly title: string;
  readonly pages: readonly Page[];
};

export const sections: readonly Section[] = [
  {
    title: "Start here",
    pages: [
      {
        slug: "",
        file: "index.md",
        title: "Tiny plugins",
        blurb: "What a plugin is, and the two ways one reaches the app.",
      },
      {
        slug: "quickstart",
        file: "quickstart.md",
        title: "Quickstart",
        blurb: "Write a plugin, ship it in the build, then install one at runtime.",
      },
    ],
  },
  {
    title: "Building plugins",
    pages: [
      {
        slug: "anatomy",
        file: "anatomy.md",
        title: "Anatomy of a plugin",
        blurb: "The factory, and everything it may register.",
      },
      {
        slug: "context",
        file: "context.md",
        title: "The context object",
        blurb: "Dialogs, chat state, storage and navigation — the ctx reference.",
      },
      {
        slug: "slots",
        file: "slots.md",
        title: "Slots and rendering",
        blurb: "Putting React into the app, and what happens when it throws.",
      },
      {
        slug: "tools",
        file: "tools.md",
        title: "Tools for the model",
        blurb: "registerTool, and how a call becomes a result.",
      },
      {
        slug: "providers",
        file: "providers.md",
        title: "Providers",
        blurb: "Adding an endpoint to the model picker, and what pi's version does not port.",
      },
    ],
  },
  {
    title: "Runtime plugins",
    pages: [
      {
        slug: "runtime",
        file: "runtime.md",
        title: "How runtime plugins work",
        blurb: "Loading code the build never saw, and why it is allowed to.",
      },
      {
        slug: "publishing",
        file: "publishing.md",
        title: "Publishing a plugin",
        blurb: "Naming, packaging and serving something others can install.",
      },
    ],
  },
  {
    title: "Reference",
    pages: [
      {
        slug: "host",
        file: "host.md",
        title: "Hosting the plugin system",
        blurb: "Mounting PluginHost in an app of your own.",
      },
      {
        slug: "pi-compat",
        file: "pi-compat.md",
        title: "pi compatibility",
        blurb: "What is inherited, degraded, omitted and added.",
      },
    ],
  },
];

export const pages: readonly Page[] = sections.flatMap((section) => section.pages);

/** Relative prefix from a page back to the site root — `""` at home, `"../"` below it. */
export const rootFrom = (page: Page): string => (page.slug === "" ? "" : "../");

/** The href of `target` as written on `from`, so the site works at any base path. */
export const hrefFrom = (from: Page, target: Page): string =>
  target.slug === "" ? `${rootFrom(from)}` || "./" : `${rootFrom(from)}${target.slug}/`;
