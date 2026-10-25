/** Browser-only display compatibility with rENA's one-contrast Means rotation.
 * The fitted jENA model is never replaced. See public/open-ena-2d-lapack/provenance.json.
 */
export const ENDPOINT_LAPACK_2D_HASHES = {
  blas: "d831496cc1d1e2748519439a0ea509ba966b56db10d13132db52331a270aac74",
  lapack: "df8ca333754f0dd95715df437f6e6d633e4ffbff0176bcb11c15fe3e5dd4e387",
} as const;

export interface EndpointLapack2D { rightSvd(data: number[][]): number[][] }
export function assertEndpointMatrix2D(data: number[][]) {
  const n = data[0]?.length;
  if (!Array.isArray(data) || data.length < 2 || !n || n > 256 || data.length * n > 250_000
    || data.some(row => !Array.isArray(row) || row.length !== n || row.some(x => !Number.isFinite(x)))) {
    throw new TypeError("2D Means display replay requires a finite bounded matrix.");
  }
}

export async function instantiateEndpointLapack2D(blas: Uint8Array, lapack: Uint8Array): Promise<EndpointLapack2D> {
  for (const [bytes, hash] of [[blas, ENDPOINT_LAPACK_2D_HASHES.blas], [lapack, ENDPOINT_LAPACK_2D_HASHES.lapack]] as const) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
    if (Array.from(digest, x => x.toString(16).padStart(2, "0")).join("") !== hash) throw new Error("2D LAPACK asset integrity check failed.");
  }
  const memory = new WebAssembly.Memory({ initial: 256, maximum: 256 });
  const table = new WebAssembly.Table({ initial: 128, maximum: 128, element: "anyfunc" });
  const stack = new WebAssembly.Global({ value: "i32", mutable: true }, 16 * 1024 * 1024);
  const heapLimit = 12 * 1024 * 1024;
  let cursor = 1024 * 1024;
  const providers: Record<string, (...args: number[]) => number> = {};
  const globals: Record<string, number> = {};
  const bytes = new Uint8Array(memory.buffer), view = new DataView(memory.buffer);
  const fail = (name: string) => () => { throw new Error(`Unsupported 2D LAPACK runtime path: ${name}`); };
  const env = {
    memory, __indirect_function_table: table, __stack_pointer: stack,
    xerbla_: fail("invalid argument"), __divdc3: fail("complex divide"), __muldc3: fail("complex multiply"), cabs: fail("complex absolute"), csqrt: fail("complex sqrt"),
    pow: Math.pow, cos: Math.cos, sin: Math.sin, atan2: Math.atan2, log: Math.log, log10: Math.log10, logf: Math.log,
    __powidf2: (v: number, n: number) => { let x = v, out = 1, k = Math.abs(n); while (k) { if (k % 2) out *= x; x *= x; k = Math.floor(k / 2); } return n < 0 ? 1 / out : out; },
    lround: (v: number) => v < 0 ? -Math.round(-v) : Math.round(v), lroundf: (v: number) => v < 0 ? -Math.round(-v) : Math.round(v),
    memcmp: (a: number, b: number, n: number) => { for (let i = 0; i < n; i++) if (bytes[a + i] !== bytes[b + i]) return bytes[a + i] - bytes[b + i]; return 0; },
    __cxa_atexit: () => 0, pthread_mutex_init: () => 0, pthread_mutex_destroy: () => 0,
    _ZNSt9exceptionD2Ev: fail("exception destructor"), vfprintf: fail("runtime output"), abort: fail("abort"),
  };
  const unusedGlobals = new Set(["_ZTVSt18bad_variant_access", "_ZTVSt9exception", "stderr"]);
  for (const [asset, base, tableBase] of [[blas, 65536, 1], [lapack, 131072, 16]] as const) {
    const module = await WebAssembly.compile(new Uint8Array(asset));
    const got: Record<string, WebAssembly.Global> = {};
    for (const imp of WebAssembly.Module.imports(module)) if (imp.module === "GOT.mem") {
      got[imp.name] = new WebAssembly.Global({ value: "i32", mutable: true }, globals[imp.name] ?? 0);
    }
    const instance = await WebAssembly.instantiate(module, { env: { ...env, ...providers,
      __memory_base: new WebAssembly.Global({ value: "i32", mutable: false }, base),
      __table_base: new WebAssembly.Global({ value: "i32", mutable: false }, tableBase),
    }, "GOT.mem": got });
    for (const [name, value] of Object.entries(instance.exports)) if (value instanceof WebAssembly.Global) globals[name] = base + Number(value.value);
    for (const [name, value] of Object.entries(got)) {
      if (!(name in globals) && !unusedGlobals.has(name)) throw new Error(`Unresolved 2D LAPACK global: ${name}`);
      value.value = globals[name] ?? 0;
    }
    for (const [name, value] of Object.entries(instance.exports)) if (typeof value === "function") providers[name] = value as (...args: number[]) => number;
    providers.__wasm_call_ctors();
  }
  function allocate(n: number) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid 2D LAPACK allocation.");
    const pointer = Math.ceil(cursor / 8) * 8;
    if (pointer + n > heapLimit) throw new Error("2D LAPACK workspace limit exceeded.");
    cursor = pointer + n;
    return pointer;
  }
  const integer = (n: number) => { const p = allocate(4); view.setInt32(p, n, true); return p; };
  return { rightSvd(data) {
    assertEndpointMatrix2D(data);
    const initial = cursor, savedStack = stack.value;
    try {
      const m = data.length, n = data[0].length, k = Math.min(m, n);
      const job = integer(83), pm = integer(m), pn = integer(n), a = allocate(m * n * 8), lda = integer(m);
      const s = allocate(k * 8), u = allocate(m * k * 8), ldu = integer(m), vt = allocate(k * n * 8), ldvt = integer(k);
      const lwork = integer(-1), iw = allocate(8 * k * 4), info = integer(0), query = allocate(8);
      const fill = () => { for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) view.setFloat64(a + 8 * (j * m + i), data[i][j], true); };
      const run = (work: number) => providers.dgesdd_(job, pm, pn, a, lda, s, u, ldu, vt, ldvt, work, lwork, iw, info, 1);
      fill(); run(query);
      if (view.getInt32(info, true) !== 0) throw new Error("2D LAPACK workspace query failed.");
      const workLength = Math.ceil(view.getFloat64(query, true));
      const work = allocate(workLength * 8);
      view.setInt32(lwork, workLength, true); fill(); run(work);
      if (view.getInt32(info, true) !== 0) throw new Error("2D LAPACK convergence failed.");
      const output = Array.from({ length: n }, (_, j) => Array.from({ length: k }, (_, i) => view.getFloat64(vt + 8 * (j * k + i), true)));
      if (output.some(row => row.some(x => !Number.isFinite(x)))) throw new Error("2D LAPACK returned nonfinite values.");
      return output;
    } finally { cursor = initial; stack.value = savedStack; }
  } };
}

export const multiplyEndpointMatrix2D = (a: number[][], b: number[][]) => a.map(row => b[0].map((_, j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));
const center = (data: number[][]) => {
  const means = data[0].map((_, j) => data.reduce((sum, row) => sum + row[j], 0) / data.length);
  return data.map(row => row.map((v, j) => v - means[j]));
};

/** Full basis is required: webENA's camera uses points and group CIs on ALL axes.
 * R's qr.Q uses its native one-column Householder, without a positive-loading rule.
 */
export function replayEndpointMeansBasis2D(data: number[][], groups: number[], runtime: EndpointLapack2D) {
  assertEndpointMatrix2D(data);
  if (data[0].length < 2 || groups.length !== data.length || groups.some(x => ![-1, 0, 1].includes(x)) || !groups.includes(-1) || !groups.includes(1)) throw new TypeError("2D Means replay requires two populated contrast groups.");
  const p = center(data), n = p[0].length;
  const negative = p.filter((_, i) => groups[i] === -1), positive = p.filter((_, i) => groups[i] === 1);
  let w = p[0].map((_, j) => negative.reduce((s, r) => s + r[j], 0) / negative.length - positive.reduce((s, r) => s + r[j], 0) / positive.length);
  const norm = Math.sqrt(w.reduce((s, v) => s + v * v, 0));
  if (!Number.isFinite(norm) || norm < 1e-12) throw new Error("2D Means contrast is not estimable.");
  w = w.map(v => v / norm);
  const a = Math.sqrt(w.reduce((s, v) => s + v * v, 0)) * (w[0] === 0 ? 1 : Math.sign(w[0]));
  const v = w.map(x => x / a); v[0] += 1;
  const q = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) - v[i] * v[j] / v[0]));
  const rest = q.map(row => row.slice(1));
  const deflated = p.map(row => { const dot = row.reduce((s, x, j) => s + x * w[j], 0); return row.map((x, j) => x - dot * w[j]); });
  // prcomp centers the complement a second time before LAPACK DGESDD.
  const inner = runtime.rightSvd(center(multiplyEndpointMatrix2D(deflated, rest)));
  return multiplyEndpointMatrix2D(rest, inner).map((row, i) => [q[i][0], ...row]);
}
export const replayEndpointMeansDirections2D = (data: number[][], groups: number[], runtime: EndpointLapack2D) => replayEndpointMeansBasis2D(data, groups, runtime).map(row => row.slice(0, 2));
