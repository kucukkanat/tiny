/**
 * One JSON Schema, read three ways: by the model, by the compiler, and by the
 * validator that runs before `execute`.
 *
 * A tool's parameters were written down twice — as JSON Schema, because that is
 * what goes to the model, and again as hand-rolled runtime checks, because
 * `execute` received `Record<string, unknown>` and had to narrow it itself.
 * Every tool in this repo opened with its own `text(args, "path")` helper. Two
 * copies of one decision, compiling fine and free to drift.
 *
 * So the schema stays the single source. `Infer` reads it at the type level and
 * `schemaProblems` reads the same object at runtime, which is what lets
 * `defineTool` hand `execute` an argument that is both typed and checked.
 *
 * The supported subset is what a tool's parameters actually use: objects with
 * properties, arrays, the five primitive types, `enum`, and `required`. Anything
 * outside it infers as `unknown` and validates as "present", which is the honest
 * answer — `$ref`, `oneOf` and the rest are not modelled rather than
 * half-modelled.
 */

/** A JSON Schema object, as loose at the type level as the format is. */
export type JsonSchema = { readonly [key: string]: unknown };

type Primitives = {
  string: string;
  number: number;
  integer: number;
  boolean: boolean;
  null: null;
};

/** Collapses an intersection into one object, so hovers read as a shape. */
type Flat<T> = { [K in keyof T]: T[K] } & {};

type InferProperties<P, Required extends string> = Flat<
  { readonly [K in Extract<keyof P, Required>]: Infer<P[K]> } & {
    readonly [K in Exclude<keyof P, Required>]?: Infer<P[K]>;
  }
>;

/** The TypeScript type a value satisfying `S` has. */
export type Infer<S> = S extends { readonly enum: readonly (infer E)[] }
  ? E
  : S extends { readonly type: "object" }
    ? S extends { readonly properties: infer P }
      ? S extends { readonly required: readonly (infer R)[] }
        ? InferProperties<P, R & string>
        : InferProperties<P, never>
      : { readonly [key: string]: unknown }
    : S extends { readonly type: "array" }
      ? S extends { readonly items: infer I }
        ? readonly Infer<I>[]
        : readonly unknown[]
      : S extends { readonly type: infer T extends keyof Primitives }
        ? Primitives[T]
        : unknown;

/**
 * Where in the arguments a problem is, spelled the way a caller wrote it.
 *
 * Quoted, so a field called `content` reads as a field and not as prose, and
 * dotted for anything nested — `"options.depth"` rather than a bare `depth` the
 * model has to locate.
 */
const at = (path: readonly string[]): string =>
  path.length === 0 ? "arguments" : `"${path.join(".")}"`;

/** What a value is, in the words a schema would use for it. */
const typeName = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

const matchesType = (type: string, value: unknown): boolean => {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    default:
      // A type this validator does not model. Saying "fine" is the honest
      // answer: refusing would reject arguments the model was right to send.
      return true;
  }
};

const check = (schema: unknown, value: unknown, path: readonly string[], into: string[]): void => {
  if (typeof schema !== "object" || schema === null) return;
  const node = schema as Record<string, unknown>;

  const options = node.enum;
  if (Array.isArray(options)) {
    if (!options.includes(value))
      into.push(`${at(path)} must be one of ${options.map((o) => JSON.stringify(o)).join(", ")}`);
    return;
  }

  const type = node.type;
  if (typeof type === "string" && !matchesType(type, value)) {
    // What was sent, not just what was wanted: the model is the reader, and it
    // corrects a call faster when the message names both halves.
    const wanted = type === "integer" ? "an integer" : `a ${type}`;
    into.push(`${at(path)} must be ${wanted}, not ${typeName(value)}`);
    // No point checking an object's properties when it is not an object.
    return;
  }

  if (Array.isArray(node.required) && typeof value === "object" && value !== null) {
    for (const key of node.required)
      if (typeof key === "string" && (value as Record<string, unknown>)[key] === undefined)
        into.push(`${at([...path, key])} is required`);
  }

  const properties = node.properties;
  if (
    typeof properties === "object" &&
    properties !== null &&
    typeof value === "object" &&
    value !== null
  ) {
    for (const [key, child] of Object.entries(properties)) {
      const held = (value as Record<string, unknown>)[key];
      // Absent is the required check's business, above; only present values
      // are checked against their own schema.
      if (held !== undefined) check(child, held, [...path, key], into);
    }
  }

  if (node.items !== undefined && Array.isArray(value))
    for (const [index, item] of value.entries())
      check(node.items, item, [...path, String(index)], into);
};

/**
 * Every way `value` fails `schema`, as messages meant to be read by a model.
 *
 * A list rather than the first failure, because a model correcting one argument
 * at a time takes one round trip per mistake.
 */
export const schemaProblems = (schema: JsonSchema, value: unknown): readonly string[] => {
  const problems: string[] = [];
  check(schema, value, [], problems);
  return problems;
};
