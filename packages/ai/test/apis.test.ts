import { afterAll, describe, expect, test } from "bun:test";
import { API_TYPES, DEFAULT_API, isApiType } from "../src/apis.ts";
import { endpointModel, fetchModelIds } from "../src/endpoint.ts";

// pi ships nine streaming implementations; six reach a browser. These check the
// six load, and that model listing speaks each family's own dialect.

type Seen = { url: string; headers: Record<string, string> };
let seen: Seen[] = [];

const server = Bun.serve({
  port: 0,
  fetch: (request) => {
    const url = new URL(request.url);
    seen.push({ url: request.url, headers: Object.fromEntries(request.headers) });
    if (url.pathname === "/google/models")
      return Response.json({ models: [{ name: "models/gemini-2.0-flash" }] });
    if (url.pathname === "/v1/models" || url.pathname === "/anthropic/v1/models")
      return Response.json({ data: [{ id: "a" }, { id: "b" }] });
    return Response.json({ error: { message: "no such route" } }, { status: 404 });
  },
});
afterAll(() => server.stop(true));

const base = (path = "") => `http://localhost:${server.port}${path}`;

describe("api types", () => {
  test("only the browser-viable implementations are offered", () => {
    expect([...API_TYPES]).toEqual([
      "openai-completions",
      "openai-responses",
      "azure-openai-responses",
      "anthropic-messages",
      "mistral-conversations",
      "google-generative-ai",
    ]);
    // The three pi has that cannot run here: node:zlib, GoogleAuth, and a node
    // http handler respectively.
    for (const absent of ["openai-codex-responses", "google-vertex", "bedrock-converse-stream"])
      expect(isApiType(absent)).toBe(false);
  });

  test("an unknown value is not an api type", () => {
    expect(isApiType("nonsense")).toBe(false);
    expect(isApiType(undefined)).toBe(false);
    expect(isApiType(7)).toBe(false);
  });

  test("every listed implementation actually loads", async () => {
    // Guards the dynamic-import table: a typo in a specifier would only show up
    // at runtime, on the first request the reader makes.
    const { apiFor } = await import("../src/apis.ts");
    for (const api of API_TYPES) {
      const implementation = await apiFor(api);
      expect(typeof implementation.stream).toBe("function");
    }
  });

  test("resolving twice returns the same implementation", async () => {
    const { apiFor } = await import("../src/apis.ts");
    expect(await apiFor("openai-completions")).toBe(await apiFor("openai-completions"));
  });
});

describe("endpointModel", () => {
  test("defaults to openai-completions, so an endpoint without an api is unchanged", () => {
    expect(endpointModel({ baseUrl: base(), apiKey: "k" }, "m").api).toBe(DEFAULT_API);
  });

  test("takes the api from the endpoint", () => {
    const model = endpointModel({ baseUrl: base(), apiKey: "k", api: "anthropic-messages" }, "m");
    expect(model.api).toBe("anthropic-messages");
  });

  test("a per-model api wins over the endpoint's, as in pi", () => {
    const model = endpointModel({ baseUrl: base(), apiKey: "k", api: "openai-completions" }, "m", {
      api: "openai-responses",
    });
    expect(model.api).toBe("openai-responses");
  });

  test("reasoning stays off unless a caller says otherwise", () => {
    expect(endpointModel({ baseUrl: base(), apiKey: "k" }, "m").reasoning).toBe(false);
    expect(
      endpointModel({ baseUrl: base(), apiKey: "k" }, "m", { reasoning: true }).reasoning,
    ).toBe(true);
  });

  test("carries a window a provider knows and the endpoint cannot publish", () => {
    const model = endpointModel({ baseUrl: base(), apiKey: "k" }, "m", { contextWindow: 200_000 });
    expect(model.contextWindow).toBe(200_000);
  });
});

describe("fetchModelIds", () => {
  test("authenticates OpenAI-family endpoints with a bearer token", async () => {
    seen = [];
    expect(await fetchModelIds({ baseUrl: base("/v1"), apiKey: "sk-test" })).toEqual(["a", "b"]);
    expect(seen[0]?.headers.authorization).toBe("Bearer sk-test");
  });

  test("uses Anthropic's own headers rather than a bearer token", async () => {
    seen = [];
    const ids = await fetchModelIds({
      // No `/v1` in the base: the Anthropic implementation appends its own, so
      // including it would produce `/v1/v1/messages` when streaming.
      baseUrl: base("/anthropic"),
      apiKey: "sk-ant",
      api: "anthropic-messages",
    });
    expect(ids).toEqual(["a", "b"]);
    const headers = seen[0]?.headers ?? {};
    expect(headers["x-api-key"]).toBe("sk-ant");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    // Without this header Anthropic refuses a cross-origin request outright.
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers.authorization).toBeUndefined();
  });

  test("passes Google's key in the query string and unqualifies its ids", async () => {
    seen = [];
    const ids = await fetchModelIds({
      baseUrl: base("/google"),
      apiKey: "goog key/&",
      api: "google-generative-ai",
    });
    expect(ids).toEqual(["gemini-2.0-flash"]);
    expect(seen[0]?.url).toContain(`key=${encodeURIComponent("goog key/&")}`);
    expect(seen[0]?.headers.authorization).toBeUndefined();
  });

  test("adds the version segment only for the families that expect it", async () => {
    seen = [];
    // Handed to the SDKs verbatim: OpenAI and Google want the version in the
    // base, Anthropic and Mistral append their own.
    await fetchModelIds({ baseUrl: base("/v1"), apiKey: "k" }).catch(() => {});
    await fetchModelIds({
      baseUrl: base("/anthropic"),
      apiKey: "k",
      api: "anthropic-messages",
    }).catch(() => {});
    await fetchModelIds({
      baseUrl: base("/anthropic"),
      apiKey: "k",
      api: "mistral-conversations",
    }).catch(() => {});
    expect(seen.map((request) => new URL(request.url).pathname)).toEqual([
      "/v1/models",
      "/anthropic/v1/models",
      "/anthropic/v1/models",
    ]);
  });

  test("reports the endpoint's own message on failure", async () => {
    await expect(fetchModelIds({ baseUrl: base("/nope"), apiKey: "k" })).rejects.toThrow(
      "no such route",
    );
  });
});
