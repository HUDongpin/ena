import { canonicalJsonByteLengthV3 } from "./model-v3/standard-closure-resource-budget";

/** Portable admission reserves a smaller fixed budget than a runtime export:
 * parsing, detached captures and canonical hash text may coexist. These are
 * policy limits independent of imported claims, not measured heap usage.
 */
export const BUNDLE_JSON_LIMITS_V3 = Object.freeze({
  bytes: 16 * 1024 * 1024,
  depth: 64,
  values: 1_000_000,
  arrayLength: 250_000,
});
const unsafe = new Set(["__proto__", "prototype", "constructor"]);
function fail(reason: string): never {
  throw new TypeError(`Bundle JSON contract: ${reason}.`);
}

/** Detach caller-owned data before asynchronous hashing; never execute accessors/toJSON. */
export function captureBundleJsonV3(input: unknown): unknown {
  let values = 0,
    structuralCharge = 0;
  const active = new WeakSet<object>();
  function visit(value: unknown, depth: number): unknown {
    if (
      depth > BUNDLE_JSON_LIMITS_V3.depth ||
      ++values > BUNDLE_JSON_LIMITS_V3.values
    )
      fail("depth or value limit exceeded");
    structuralCharge += 8;
    if (typeof value === "string") structuralCharge += value.length * 3;
    if (structuralCharge > BUNDLE_JSON_LIMITS_V3.bytes)
      fail("structural size limit exceeded");
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("numbers must be finite");
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== "object" || active.has(value))
      fail("requires acyclic plain JSON data");
    active.add(value);
    try {
      const array = Array.isArray(value),
        prototype = Object.getPrototypeOf(value);
      if (
        array
          ? prototype !== Array.prototype
          : prototype !== Object.prototype && prototype !== null
      )
        fail("requires plain objects and arrays");
      const length = array
        ? Object.getOwnPropertyDescriptor(value, "length")?.value
        : 0;
      if (
        array &&
        (!Number.isSafeInteger(length) ||
          length > BUNDLE_JSON_LIMITS_V3.arrayLength ||
          length + values > BUNDLE_JSON_LIMITS_V3.values)
      )
        fail("array size limit exceeded");
      const keys = Reflect.ownKeys(value);
      if (!array && keys.length > BUNDLE_JSON_LIMITS_V3.arrayLength)
        fail("container size limit exceeded");
      if (array && keys.length !== length + 1)
        fail("requires dense arrays without extra properties");
      const output: unknown[] | Record<string, unknown> = array ? [] : {};
      for (const key of keys) {
        if (array && key === "length") continue;
        if (typeof key !== "string" || unsafe.has(key)) fail("unsafe key");
        if (array && (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length))
          fail("invalid array key");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
          fail("accessors and hidden properties are forbidden");
        structuralCharge += key.length * 3;
        Object.defineProperty(output, key, {
          value: visit(descriptor.value, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return output;
    } finally {
      active.delete(value);
    }
  }
  const captured = visit(input, 0);
  // Counts escaping and finite-number widths without allocating a full text.
  canonicalJsonByteLengthV3(captured, BUNDLE_JSON_LIMITS_V3.bytes);
  return captured;
}

/** Small exact JSON reader: duplicate escaped keys cannot be erased by JSON.parse. */
export function parseBundleJsonV3(text: string): unknown {
  if (typeof text !== "string" || text.length > BUNDLE_JSON_LIMITS_V3.bytes)
    fail("size limit exceeded");
  if (new TextEncoder().encode(text).length > BUNDLE_JSON_LIMITS_V3.bytes)
    fail("UTF-8 size limit exceeded");
  let cursor = 0,
    values = 0;
  const whitespace = () => {
    while (/[\x20\t\r\n]/u.test(text[cursor] ?? "x")) cursor++;
  };
  function string(): string {
    const start = cursor++;
    while (cursor < text.length) {
      const character = text[cursor++];
      if (character === '"') {
        try {
          return JSON.parse(text.slice(start, cursor)) as string;
        } catch {
          fail("invalid string");
        }
      }
      if (character === "\\") cursor++;
    }
    return fail("unterminated string");
  }
  function value(depth: number): unknown {
    if (
      depth > BUNDLE_JSON_LIMITS_V3.depth ||
      ++values > BUNDLE_JSON_LIMITS_V3.values
    )
      fail("depth or value limit exceeded");
    whitespace();
    const first = text[cursor];
    if (first === '"') return string();
    if (first === "{" || first === "[") {
      const object = first === "{",
        end = object ? "}" : "]";
      const output: Record<string, unknown> | unknown[] = object ? {} : [];
      const keys = new Set<string>();
      let count = 0;
      cursor++;
      whitespace();
      if (text[cursor] === end) {
        cursor++;
        return output;
      }
      while (cursor < text.length) {
        if (++count > BUNDLE_JSON_LIMITS_V3.arrayLength)
          fail("container size limit exceeded");
        whitespace();
        let key = String(count - 1);
        if (object) {
          if (text[cursor] !== '"') fail("object key must be a string");
          key = string();
          if (unsafe.has(key)) fail("unsafe key");
          if (keys.has(key)) fail("duplicate key");
          keys.add(key);
          whitespace();
          if (text[cursor++] !== ":") fail("missing colon");
        }
        Object.defineProperty(output, key, {
          value: value(depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
        whitespace();
        const separator = text[cursor++];
        if (separator === end) return output;
        if (separator !== ",") fail("invalid separator");
      }
      return fail("unterminated container");
    }
    const match =
      /^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
        text.slice(cursor),
      );
    if (!match) fail("invalid value");
    cursor += match[0].length;
    const parsed: unknown = JSON.parse(match[0]);
    if (typeof parsed === "number" && !Number.isFinite(parsed))
      fail("numbers must be finite");
    return parsed;
  }
  const output = value(0);
  whitespace();
  if (cursor !== text.length) fail("trailing content");
  return output;
}
