import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Hash all compiled outputs; omit only framework runtime bookkeeping. */
export function immutableBuildManifestV3(root) {
  // Next 16's file-system-cache writes scoped response data here, separately
  // from immutable server/app route seeds and compiled server/chunk modules.
  const mutableDirectories = ["cache", "diagnostics", "server/route-cache"];
  const visit = (directory, prefix = "") => readdirSync(directory).sort().flatMap(name => {
    const relative = prefix ? `${prefix}/${name}` : name;
    if (mutableDirectories.some(path => relative === path || relative.startsWith(`${path}/`))
      || relative === "trace" || relative === "trace-build") return [];
    const full = join(directory, name);
    return statSync(full).isDirectory() ? visit(full, relative)
      : [{ path: relative, sha256: createHash("sha256").update(readFileSync(full)).digest("hex") }];
  });
  return visit(root);
}
