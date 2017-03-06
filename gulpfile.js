'use strict';

const Promise = require('bluebird');
const request = require('request');
const gulp = require('gulp');
const gUtil = require('gulp-util');
const typings = require('gulp-typings');
const tslint = require('gulp-tslint');
const mocha = require('gulp-mocha');
const fs = Promise.promisifyAll(require('fs-extra'));
const path = require('path');
const rimrafAsync = Promise.promisify(require('rimraf'));
const spawn = require('child_process').spawn;
const createExtension = require('tfx-cli/_build/exec/extension/create').createExtension;

const tasksDir = path.join(__dirname, 'Tasks');

// Promise<[{taskDir, taskDistDir, config}]>
const tasks = fs.readdirAsync(tasksDir)
    .map(f => path.join(tasksDir, f))
    .map(f => {
        return fs.statAsync(f).then(s => s.isDirectory() ? f : null);
    })
    .filter(f => f !== null)
    .map(t => {
        return {
            taskDir: t,
            config: require(path.join(t, 'config.json'))
        };
    });

gulp.task('default', ['test']);

gulp.task('info', () =>
    tasks.map(task => gUtil.log(`Task: ${gUtil.colors.cyan(path.basename(task.taskDir))}`))
);

/**
 * Creates a new extension.
 */
gulp.task('package', ['download-binaries', 'compile', 'test'], () =>
    createPackage(false)
);

/**
 * Creates an update for the extension (bumps the revision number).
 */
gulp.task('package-rev', ['download-binaries', 'compile', 'test'], () =>
    createPackage(true)
);

/**
 * Downloads binaries for each task that has a `binaries` fields in its `config.json`.
 */
gulp.task('download-binaries', () => tasks.filter(t => !!t.config.binaries).map(t => {
    const downloads = [];
    for (let version in t.config.binaries) {
        const url = t.config.binaries[version];
        const destDir = path.join(t.taskDir, t.config.paths.binaries, 'NuGet', version);
        const destFile = path.join(destDir, 'nuget.exe');

        downloads.push(fileExists(destFile).then(exists => {
            if (exists) {
                gUtil.log(`Target file ${gUtil.colors.magenta(destFile)} already exists, skipping download`);
            } else {
                gUtil.log(`Downloading ${gUtil.colors.magenta(url)} to ${gUtil.colors.magenta(destFile)}`);
                return fs.ensureDirAsync(destDir).then(() => {
                    const stream = request(url).pipe(fs.createWriteStream(destFile));
                    return streamToPromise(stream).then(() =>
                        gUtil.log(`Finished download of ${gUtil.colors.magenta(destFile)}`)
                    );
                });
            }
        }));
    }
    return Promise.all(downloads);
}));

gulp.task('install', () =>
    tasks
        .filter(t => fileExists(path.join(t.taskDir, 'package.json')))
        .map(t => spawnAsync('yarn', [], {cwd: t.taskDir}))
);

/**
 * Compiles all typescript files to javascript.
 */
gulp.task('compile', ['typings', 'tslint', 'install'], () =>
    // run tsc instead of gulp-typescript as mapping the output directory was tricky (we want .js files next to .js ones)
    spawnAsync(path.join(__dirname, 'node_modules', '.bin', 'tsc'), [], {shell: true})
);

gulp.task('tslint', () =>
    gulp.src(path.join(__dirname, 'Tasks', '!(node_modules)**', '*.ts'))
        .pipe(tslint({
            formatter: 'verbose'
        }))
        .pipe(tslint.report())
);

/**
 * Runs `typings install` on this project. This downloads typescript definition files for libraries we use.
 */
gulp.task('typings', () =>
    gulp.src(path.join(__dirname, 'typings.json'))
        .pipe(typings())
);

gulp.task('test', ['compile', 'download-binaries'], () =>
    gulp.src(path.join(__dirname, 'Tasks', '**', 'test-*.js'), {read: false})
        .pipe(mocha({reporter: 'spec'}))
);

/**
 * Cleans up all generated and downloaded code (not the typings definitions).
 */
gulp.task('clean', () => Promise.all([
    // remove all generated javascript files (from typescript)
    rimrafAsync(path.join(__dirname, 'Tasks', '**', '*.js?(.map)')),
    // remove the extension package
    rimrafAsync(path.join(__dirname, '*.vsix')),
    // remove any temporary directories
    rimrafAsync(path.join(__dirname, '**', 'tmp')),
    // remove javascript dependencies of tasks
    rimrafAsync(path.join(__dirname, 'Tasks', '**', 'node_modules')),
    // remove a task's binaries, if it has those
    tasks.filter(task => !!task.config.paths.binaries).map(task =>
        rimrafAsync(path.join(task.taskDir, task.config.paths.binaries))
    )
]));

function createPackage(revVersion) {
    return createExtension(
        // mergeSettings
        {
            root: __dirname,
            manifests: [path.join(__dirname, 'vss-extension.json')],
            manifestGlobs: [],
            bypassValidation: false,
            revVersion,
            locRoot: __dirname
        },
        // packageSettings
        {
            outputPath: __dirname,
            locRoot: __dirname
        }
    )
}

/**
 * Checks if a file exists.
 *
 * @param {string} path the path of the file
 * @returns {Promise<boolean>} resolved with `true` if the file exists, or `false` if not
 */
function fileExists(path) {
    return fs.statAsync(path)
        .then(() => true)
        .catch(() => false);
}

/**
 * Spawns a command.
 *
 * @param {string} command the file to execute
 * @param {string[]} args anyarguments to pass
 * @param {any} options options to pass to `child_process.spawn`
 * @returns {Promise} a promise that will be resolved or rejected when the process has ended
 */
function spawnAsync(command, args, options) {
    options.stdio = 'inherit';
    return streamToPromise(spawn(command, args, options));
}

function streamToPromise(stream) {
    return new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('close', resolve);
    });
}
