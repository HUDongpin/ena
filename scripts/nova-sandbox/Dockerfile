# build.mjs constructs a minimal trusted context and requires an immutable official Node image.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /opt/nova
COPY esbuild/lib/ ./node_modules/esbuild/lib/
COPY esbuild/package.json ./node_modules/esbuild/package.json
COPY esbuild-bin ./bin/esbuild
COPY harness.mjs execute.mjs assertions.mjs ./
ENV ESBUILD_BINARY_PATH=/opt/nova/bin/esbuild
USER 65532:65532
ENTRYPOINT []
CMD ["/usr/bin/timeout", "--signal=KILL", "25", "node", "/opt/nova/harness.mjs"]
