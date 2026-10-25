import { build } from "esbuild";
await build({ entryPoints: ["lib/open-ena/endpoint-means-frame-2d.worker.ts"], outfile: "public/open-ena-2d-lapack/worker.js", bundle: true, platform: "browser", format: "iife", target: "es2022", minify: true, legalComments: "inline" });
