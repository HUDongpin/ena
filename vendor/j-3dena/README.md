# Vendored j-3dENA package boundary

Open ENA installs the versioned `j-3dena` tarball in this directory. The adjacent
artifact receipt and CI custody record bind the reviewed upstream bytes. The
repository verifier checks those records before `npm ci`, then compares the
complete installed package tree and its `jena-js` workspace peer after install.
After `jena-js` is built, a separate runtime gate imports `j-3dena` by package
name and checks its source-bound build identity.

The package's `index.js` contains inlined SheetJS (`xlsx`) 0.20.3 code. Because
that code is bundled into the JavaScript artifact rather than installed as an npm
dependency, it is not covered by `npm audit`. The verifier instead locks the
SheetJS version, custody-archive source, SHA-256, Apache-2.0 license, and packaging
disposition recorded in `PROVENANCE.json`. The redistributed license is retained
at `THIRD_PARTY/SheetJS-LICENSE.txt` inside the tarball.

These checks establish an offline byte and metadata boundary. The custody JSON is
not a cryptographic signature and does not by itself prove GitHub execution; the
upstream workflow run, immutable commit, and artifact evidence remain separate
review evidence.
