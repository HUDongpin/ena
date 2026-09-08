type CapturedOwnDescriptorV3 = {
  key: PropertyKey;
  descriptor: PropertyDescriptor | undefined;
};

function captureOwnDescriptorsV3(value: object): CapturedOwnDescriptorV3[] {
  // Proxy meta-traps cannot be eliminated, but one own-key/descriptor capture
  // prevents all subsequent inspection from invoking ordinary `get` behavior.
  return Reflect.ownKeys(value).map((key) => ({
    key,
    descriptor: Object.getOwnPropertyDescriptor(value, key),
  }));
}

export function snapshotPlainJsonRecordV3(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain JSON object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain JSON object.`);
  }
  const captured = captureOwnDescriptorsV3(value);
  const dataProperties = captured.map(({ key, descriptor }) => {
    if (typeof key !== "string") {
      throw new TypeError(`${label} must contain only string-named data properties.`);
    }
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label}.${key} must be an own enumerable data property, not an accessor.`);
    }
    return { key, value: descriptor.value };
  });
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const { key, value: propertyValue } of dataProperties) {
    Object.defineProperty(snapshot, key, {
      value: propertyValue,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return snapshot;
}

export function snapshotDenseJsonArrayV3(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be a dense plain JSON array.`);
  }
  const captured = captureOwnDescriptorsV3(value);
  const lengthCapture = captured.find(({ key }) => key === "length");
  const lengthDescriptor = lengthCapture?.descriptor;
  if (lengthDescriptor === undefined
    || lengthDescriptor.enumerable
    || !("value" in lengthDescriptor)
    || typeof lengthDescriptor.value !== "number"
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0) {
    throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
  }
  const length = lengthDescriptor.value;
  if (captured.length !== length + 1) {
    throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
  }
  const snapshot = new Array<unknown>(length);
  let elementCount = 0;
  for (const { key, descriptor } of captured) {
    if (key === "length") continue;
    if (typeof key !== "string"
      || !/^(0|[1-9]\d*)$/u.test(key)
      || !Number.isSafeInteger(Number(key))) {
      throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
    }
    const index = Number(key);
    if (index >= length) {
      throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
    }
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label}[${key}] must be an own enumerable data property, not an accessor.`);
    }
    snapshot[index] = descriptor.value;
    elementCount += 1;
  }
  if (elementCount !== length) {
    throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
  }
  return snapshot;
}

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
      const snapshot = snapshotDenseJsonArrayV3(value, label);
      const entries: string[] = [];
      for (let index = 0; index < snapshot.length; index += 1) {
        entries.push(canonicalize(snapshot[index], active, `${label}[${index}]`));
      }
      return `[${entries.join(",")}]`;
    }

    const snapshot = snapshotPlainJsonRecordV3(value, label);
    const entries = Object.keys(snapshot).sort().map((key) => {
      return `${JSON.stringify(key)}:${canonicalize(snapshot[key], active, `${label}.${key}`)}`;
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
