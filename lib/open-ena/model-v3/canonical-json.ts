function canonicalize(value: unknown, active: WeakSet<object>, label: string): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`${label} must contain only finite JSON numbers.`);
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "undefined":
    case "bigint":
    case "symbol":
    case "function":
      throw new TypeError(`${label} contains a value that is not a JSON value.`);
    case "object":
      break;
  }

  if (active.has(value)) throw new TypeError(`${label} contains a cyclic reference.`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError(`${label} must be a dense plain JSON array.`);
      }
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || !keys.includes("length")) {
        throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
      }
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        if (keys[index] !== key) {
          throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(`${label}[${index}] must be an own enumerable data property, not an accessor.`);
        }
        entries.push(canonicalize(descriptor.value, active, `${label}[${index}]`));
      }
      return `[${entries.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain only plain JSON objects.`);
    }
    const keys = Reflect.ownKeys(value);
    const descriptors = new Map<string, PropertyDescriptor>();
    for (const key of keys) {
      if (typeof key !== "string") {
        throw new TypeError(`${label} must not contain symbol properties.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${label}.${key} must be an own enumerable data property, not an accessor.`);
      }
      descriptors.set(key, descriptor);
    }
    const entries = [...descriptors.keys()].sort().map((key) => {
      const descriptor = descriptors.get(key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError(`${label}.${key} must be an own enumerable data property.`);
      }
      return `${JSON.stringify(key)}:${canonicalize(descriptor.value, active, `${label}.${key}`)}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    active.delete(value);
  }
}

export function canonicalJsonV3(value: unknown): string {
  return canonicalize(value, new WeakSet<object>(), "value");
}

export async function sha256TextV3(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sha256CanonicalJsonV3(value: unknown): Promise<string> {
  return sha256TextV3(canonicalJsonV3(value));
}

export function deepFreezeV3<T>(value: T): T {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || (typeof candidate !== "object" && typeof candidate !== "function")) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor !== undefined && "value" in descriptor) visit(descriptor.value);
    }
    Object.freeze(candidate);
  };
  visit(value);
  return value;
}
