#!/usr/bin/env Rscript
# Independent official rENA 0.4.4 oracle. Never imports jENA or legacy goldens.
# Install the pinned source into a task-specific R_LIBS_USER before running.
# RENA_STANDARD_V3_ARTIFACT may point to the retained source tarball; otherwise
# download the exact artifact below. Its bytes must match the reviewed SHA256.
# Example: R_LIBS_USER=/tmp/task-rlib RENA_STANDARD_V3_ARTIFACT=/tmp/rENA_0.4.4.tar.gz
# Rscript --vanilla scripts/regen-standard-v3-goldens.R fixtures/goldens/rena-current-standard-v3.generated.json
# Infinity is encoded ONLY as the string "Infinity" in options/window arguments;
# consumers must decode those fields to numeric Infinity before invoking jENA.
# ena.make.set's official list API accepts dimensions=3 but returns all axes.
# Raw top-level matrix fields are untouched official outputs. Means additionally
# supplies canonicalMeansFrame, independently anchored to the named group roles
# entirely in R; consumers must use that fixed frame for directional acceptance.
# Preserve those actual outputs and variance; consumers may compare leading axes
# explicitly. Do not silently truncate outputs or renormalize their variance.

options(warn = 1)
invisible(Sys.setlocale('LC_COLLATE', 'C'))
RNGkind('Mersenne-Twister', 'Inversion', 'Rejection')
set.seed(340044)
for (package in c('rENA', 'jsonlite', 'digest')) {
  if (!requireNamespace(package, quietly = TRUE)) stop('Missing package: ', package)
}
expected_version <- '0.4.4'
artifact_sha <- '2aae98760ea6e304a90fba8efa95f546b61e9aeaf021c5de506b730a5606dc2e'
source_url <- 'https://cran.qe-libs.org/src/contrib/rENA_0.4.4.tar.gz'
stopifnot(as.character(utils::packageVersion('rENA')) == expected_version,
          as.character(utils::packageVersion('tma')) == '0.3.3',
          as.character(utils::packageVersion('libqe')) == '0.1.2.9002')
scoped_lib <- normalizePath(Sys.getenv('R_LIBS_USER'), mustWork = TRUE)
package_path <- normalizePath(find.package('rENA'), mustWork = TRUE)
for (package in c('rENA','tma','libqe')) {
  if (!startsWith(normalizePath(find.package(package)), paste0(scoped_lib, '/'))) {
    stop(package, ' must be installed in R_LIBS_USER')
  }
}
artifact <- Sys.getenv('RENA_STANDARD_V3_ARTIFACT')
if (!nzchar(artifact)) {
  artifact <- tempfile('rENA_0.4.4-', fileext = '.tar.gz')
  utils::download.file(source_url, artifact, mode = 'wb')
}
stopifnot(file.exists(artifact), digest::digest(file = artifact, algo = 'sha256') == artifact_sha)
script <- normalizePath(sub('^--file=', '', grep('^--file=', commandArgs(), value = TRUE)[[1]]))
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) stop('Expected one output JSON path')

# Fixed chronological order: three horizons, two rounds, eight units per round.
# Fixed sparse bit patterns give strict 0/1 input in BOTH weighting modes.
code_names <- c('A', 'B', 'C', 'D')
fixture <- expand.grid(unit = sprintf('U%d', 1:8), round = 1:2, horizon = c('H1','H2','H3'),
                       KEEP.OUT.ATTRS = FALSE, stringsAsFactors = FALSE)
fixture$group <- ifelse(fixture$unit %in% sprintf('U%d', 1:4), 'Positive', 'Negative')
fixture$row <- seq_len(nrow(fixture))
masks <- c(3,5,1,9,6,10,4,12, 2,9,6,5,8,3,10,1,
           5,2,10,3,12,1,9,6, 8,6,3,12,5,9,2,10,
           9,3,12,2,10,6,5,1, 6,8,5,10,1,12,3,9)
for (i in seq_along(code_names)) fixture[[code_names[i]]] <- as.integer(bitwAnd(masks, bitwShiftL(1L, i-1L)) != 0L)
fixture <- fixture[, c('row','unit','horizon','group',code_names)]
stopifnot(all(as.matrix(fixture[,code_names]) %in% c(0L,1L)))

plain_df <- function(x) {
  if (is.null(x)) return(list())
  out <- as.data.frame(x, stringsAsFactors = FALSE)
  # Strip rENA column classes only; preserve actual column names and row order.
  out[] <- lapply(out, function(col) { attributes(col) <- NULL; col })
  rownames(out) <- NULL
  out
}
encoded_window <- function(x) if (is.infinite(x)) 'Infinity' else x
positive <- sprintf('U%d', 1:4)
negative <- sprintf('U%d', 5:8)
make_config <- function(name, model, weight, window, back, forward, means = FALSE) {
  message('BEGIN ', name, ': model=', model, ' weight=', weight, ' window=', window,
          ' back=', back, ' forward=', forward, ' rotation=', if(means) 'means' else 'svd')
  accum <- rENA::ena.accumulate.data(
    units = fixture['unit'], conversation = fixture['horizon'], codes = fixture[code_names],
    metadata = fixture['group'], model = model,
    weight.by = if (weight == 'frequency') sum else 'binary',
    window = window, window.size.back = back, window.size.forward = forward,
    include.meta = TRUE, as.list = TRUE
  )
  # Explicit positive-minus-negative input: libqe::means_rotation uses a-b,
  # then orthogonal_svd uses QR Q columns, which may reverse the returned axis.
  groups <- list(list(positive, negative))
  set <- rENA::ena.make.set(
    accum, dimensions = 3, as.list = TRUE, center.align.to.origin = TRUE,
    rotation.by = if (means) rENA::ena.rotate.by.mean else rENA::ena.svd,
    rotation.params = if (means) groups else NULL
  )
  rotation_columns <- colnames(as.matrix(set$rotation$rotation.matrix))
  stopifnot(length(rotation_columns) >= 3L)
  for (x in list(as.matrix(set$line.weights), as.matrix(set$points),
                 as.matrix(set$rotation$rotation.matrix), as.matrix(set$rotation$nodes),
                 as.numeric(set$model$variance))) stopifnot(all(is.finite(x)))
  options <- list(units = list('unit'), conversation = list('horizon'), codes = as.list(code_names),
                  metadata = list('group'), networkType = 'standard', model = model,
                  weightBy = if(weight == 'frequency') 'sum' else 'binary',
                  window = window, windowSizeBack = encoded_window(back),
                  windowSizeForward = encoded_window(forward), includeMeta = TRUE,
                  dimensions = 3, centerAlignToOrigin = TRUE, nodePositionMethod = 'undirected',
                  rotation = if(means) list(method='mean', params=list(groups=groups)) else list(method='svd'))
  result <- list(
    options = options,
    rArguments = list(accumulate = list(units='unit', conversation='horizon', codes=as.list(code_names),
      metadata='group', model=model, weight.by=if(weight=='frequency') 'base::sum' else 'binary',
      window=window, window.size.back=encoded_window(back), window.size.forward=encoded_window(forward),
      include.meta=TRUE, as.list=TRUE),
      makeSet=list(dimensions=3, as.list=TRUE, center.align.to.origin=TRUE,
                   norm.by='rENA::fun_sphere_norm', node.position.method='rENA:::lws.positions.sq',
                   rotation.by=if(means) 'rENA::ena.rotate.by.mean' else 'rENA::ena.svd',
                   rotation.params=if(means) groups else NULL)),
    rowConnectionCounts = plain_df(accum$model$row.connection.counts),
    connectionCounts = plain_df(accum$connection.counts),
    unitLabels = as.list(accum$model$unit.labels), trajectories = plain_df(accum$trajectories),
    lineWeights = plain_df(set$line.weights), centeredPoints = plain_df(set$model$points.for.projection),
    points = plain_df(set$points), nodes = plain_df(set$rotation$nodes),
    centroids = plain_df(set$model$centroids),
    rotationMatrix = plain_df(set$rotation$rotation.matrix), rotationColumns = as.list(rotation_columns),
    variance = as.list(set$model$variance), centerVector = as.list(set$rotation$center.vec),
    dimensions = list(requested=3L, returned=length(rotation_columns)),
    rowCounts = list(input=nrow(fixture), rowConnections=nrow(accum$model$row.connection.counts),
                     connections=nrow(accum$connection.counts), points=nrow(set$points),
                     trajectories=if(is.null(accum$trajectories)) 0L else nrow(accum$trajectories))
  )
  if(means) {
    positive_rows <- set$points$unit %in% positive
    negative_rows <- set$points$unit %in% negative
    contrast <- mean(set$points$MR1[positive_rows]) - mean(set$points$MR1[negative_rows])
    result$meansDirection <- list(positive=as.list(positive), negative=as.list(negative),
      expression='mean(Positive) - mean(Negative)', returnedMR1Contrast=contrast,
      returnedAxisSign=sign(contrast),
      orientationBehavior='Official libqe orthogonal_svd returns QR Q axes; their signs can reverse the requested mean-difference vector.')
    # This is a separate declared frame, not comparison-time sign forgiveness.
    # Anchor solely to the predeclared group roles and official R projection.
    # Apply one identical MR1 reflection to all geometric objects. Variance and
    # other axes are unchanged. A zero contrast cannot define this contract.
    stopifnot(is.finite(contrast), contrast != 0)
    multiplier <- if(contrast > 0) 1 else -1
    orient <- function(x) {
      out <- plain_df(x)
      out$MR1 <- multiplier * out$MR1
      out
    }
    result$canonicalMeansFrame <- list(
      points=orient(set$points), nodes=orient(set$rotation$nodes),
      centroids=orient(set$model$centroids),
      rotationMatrix=orient(set$rotation$rotation.matrix),
      rotationColumns=as.list(rotation_columns), variance=as.list(set$model$variance),
      orientation=list(axis='MR1', multiplier=multiplier,
        source='Official R output plus predeclared Positive/Negative unit selectors; no jENA values.',
        rule='If mean(MR1[Positive])-mean(MR1[Negative]) is negative, multiply MR1 in rotationMatrix, points, nodes, and centroids by -1; otherwise use +1. Reject zero contrast.',
        rawMR1Contrast=contrast, canonicalMR1Contrast=multiplier*contrast)
    )
    message('MEANS ',name,': requested=Positive-minus-Negative returnedMR1Contrast=',format(contrast,digits=17),
            ' canonicalMultiplier=',multiplier)
  }
  message('END ', name, ': rowConnections=', result$rowCounts$rowConnections,
          ' connections=', result$rowCounts$connections, ' trajectories=', result$rowCounts$trajectories,
          ' returnedDimensions=', result$dimensions$returned)
  result
}
configs <- list()
add <- function(name, model, weight, window='MovingStanzaWindow', back=Inf, forward=0, means=FALSE) {
  configs[[name]] <<- make_config(name,model,weight,window,back,forward,means)
}
add('endpointMovingBinary','EndPoint','binary',back=1)
add('endpointMovingFrequency','EndPoint','frequency',back=3)
add('separateMovingBinary','SeparateTrajectory','binary',back=2,forward=2)
add('separateMovingFrequency','SeparateTrajectory','frequency',back=Inf)
add('accumulatedMovingBinary','AccumulatedTrajectory','binary',back=2,forward=Inf)
add('accumulatedMovingFrequency','AccumulatedTrajectory','frequency',back=Inf,forward=Inf)
for (prefix in c('endpoint','separate','accumulated')) {
  model <- c(endpoint='EndPoint',separate='SeparateTrajectory',accumulated='AccumulatedTrajectory')[[prefix]]
  for(weight in c('binary','frequency')) {
    add(paste0(prefix,'Conversation',if(weight=='binary') 'Binary' else 'Frequency'),
        model,weight,'Conversation',back=Inf,forward=0)
  }
}
add('endpointMovingMeans','EndPoint','binary',back=2,forward=1,means=TRUE)
add('endpointConversationMeans','EndPoint','binary','Conversation',back=Inf,forward=0,means=TRUE)

# Sort object keys recursively; data frame rows retain scientific input/output order.
sort_keys <- function(x) {
  if(is.data.frame(x)) return(x[,sort(names(x)),drop=FALSE])
  if(is.list(x)) {
    if(!is.null(names(x))) x <- x[order(names(x))]
    x <- lapply(x,sort_keys)
  }
  x
}
session <- sessionInfo()
package_names <- sort(unique(c(loadedNamespaces(), 'jsonlite', 'digest')))
dependencies <- setNames(lapply(package_names,function(p) as.character(utils::packageVersion(p))),package_names)
payload <- sort_keys(list(
  meta=list(schemaVersion=1L, rENAVersion=expected_version, packageSource='https://cran.qe-libs.org',
    packageSourceResolved='https://qe-libs.org/cran/', packageArtifactUrl=source_url,
    packageArtifactResolvedUrl='https://qe-libs.org/cran/src/contrib/rENA_0.4.4.tar.gz',
    packageArtifactSha256=artifact_sha, packageIndexVersionObserved='0.4.4.9000',
    packageStableVersionObserved='0.4.4', packageIndexObservationDate='2026-09-07',
    packageInstalledPath=package_path, rVersion=R.version.string, platform=R.version$platform,
    dependencyVersions=dependencies,
    dependencyProvenance=list(
      libqe=list(version='0.1.2.9002', developmentBuild=TRUE,
        packageArtifactUrl='https://cran.qe-libs.org/src/contrib/libqe_0.1.2.9002.tar.gz',
        packageArtifactSha256='4981e5a1958fd373cc0ed6e48b9b9226d575fe7db9e21f36a45554c811dd2d3a',
        installedPath=normalizePath(find.package('libqe')),
        installedLibrarySha256=digest::digest(file=system.file('libs',paste0('libqe',.Platform$dynlib.ext),package='libqe'),algo='sha256'),
        originalPinnedBuild=list(compiler='Apple clang 21.0.0 (clang-2100.1.1.101)', standard='gnu++17',
          scope='Task-only R_MAKEVARS_USER; global R configuration unchanged',
          FLIBS='/Library/Frameworks/R.framework/Resources/lib/libgfortran.5.dylib /Library/Frameworks/R.framework/Resources/lib/libquadmath.0.dylib')),
      tma=list(version='0.3.3', developmentBuild=FALSE,
        packageArtifactUrl='https://cran.qe-libs.org/src/contrib/tma_0.3.3.tar.gz',
        packageArtifactSha256='37eb602ffc67018ded88c3f99ff85c989e0674b0c4b09fca449c6c1a8dcca9d2',
        installedPath=normalizePath(find.package('tma')))),
    blas=session$BLAS, lapack=session$LAPACK,
    rng=list(kind=as.list(RNGkind()), seed=340044L),
    generatorScript='scripts/regen-standard-v3-goldens.R',
    generatorScriptSha256=digest::digest(file=script,algo='sha256'),
    generatedAt=format(Sys.time(),'%Y-%m-%dT%H:%M:%SZ',tz='UTC'),
    repeatability='Compare input, codes, configs exactly; generatedAt is a real clock, not computational data.',
    infinityEncoding='Decode string Infinity in options.windowSizeBack/windowSizeForward to numeric Infinity.',
    dimensionsBehavior='Official ena.make.set list API is called with dimensions=3; it returns all rotation axes. Outputs and variance are preserved without truncation.'),
  input=plain_df(fixture), codes=as.list(code_names), configs=configs
))
jsonlite::write_json(payload,args[[1]],auto_unbox=TRUE,pretty=TRUE,digits=16,null='null',na='null')
message('WROTE ',args[[1]],' with ',length(configs),' official R cases')
