const gulp = require('gulp');
const path = require('path');

// Copy SVG icons to dist folder
function copyIcons() {
	return gulp
		.src('nodes/**/*.svg')
		.dest('dist/nodes');
}

// Build task that copies icons
gulp.task('build:icons', copyIcons);

// Default task
gulp.task('default', gulp.series('build:icons'));

