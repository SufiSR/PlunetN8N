// gulpfile.js
'use strict';

const { src, dest } = require('gulp');

/**
 * Copy node icons (SVG) into dist while preserving the folder structure,
 * so the icon path next to the compiled node file still works.
 * Example: nodes/Plunet/plunet.svg  ->  dist/nodes/Plunet/plunet.svg
 */
function buildIcons() {
  return src('nodes/**/*.svg', { base: 'nodes' })
    .pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
