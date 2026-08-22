/** One JSON Schema, read three ways: by the model, by `Infer` at the type level, and by
 * `schemaProblems` at runtime. Supported subset: objects, arrays, primitives, `enum`,
 * `required`; anything else infers as `unknown` and validates as "present". */

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

// Quoted and dotted (`"options.depth"`) so the model can locate the field.
const at = (path: readonly string[]): string =>
  path.length === 0 ? "arguments" : `"${path.join(".")}"`;

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
      // An unmodelled type passes; refusing would reject arguments the model was right to send.
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
    const wanted = type === "integer" ? "an integer" : `a ${type}`;
    into.push(`${at(path)} must be ${wanted}, not ${typeName(value)}`);
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
      if (held !== undefined) check(child, held, [...path, key], into);
    }
  }

  if (node.items !== undefined && Array.isArray(value))
    for (const [index, item] of value.entries())
      check(node.items, item, [...path, String(index)], into);
};

/** Every way `value` fails `schema`, as messages meant to be read by a model —
 * a list, so one round trip fixes every mistake. */
export const schemaProblems = (schema: JsonSchema, value: unknown): readonly string[] => {
  const problems: string[] = [];
  check(schema, value, [], problems);
  return problems;
};
