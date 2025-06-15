'use strict';

const gulp = require('gulp');

let paths;
const convertBytes = function(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) {
        return '0 Byte';
    }

    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));

    return Math.round(((bytes / Math.pow(1024, i) * 100)) / 100) + ' ' + sizes[i];
};


var argv            = require('yargs').argv,
    gutil           = require('gulp-util'),
    gulpif          = require('gulp-if'),
    uglify          = require('gulp-uglify'),
    buffer          = require('vinyl-buffer'),
    source          = require('vinyl-source-stream'),
    merge           = require('merge-stream'),
    sourcemaps      = require('gulp-sourcemaps'),
    browserify      = require('browserify'),
    watchifyModule  = require('watchify'),
    jsonminify      = require('gulp-jsonminify'),
    esmify          = require('esmify'),

    prod            = false,
    watchType       = 'js',
    watch           = false;

paths = {
    js: [
        { // admin
            in: './browser.js',
            out: './pkg/annotator.js',
        }
    ]
};

// -- DO NOT EDIT BELOW --

var compileJS = function(app, watching) {
    var _in   = app.in,
        _out  = app.out.split(/[\\/]/).pop(),
        _dest = app.out.substring(0, app.out.lastIndexOf('/')),
        _maps = './' + app.in.substring(0, app.in.lastIndexOf('/')).split(/[\\/]/).pop();

    if (!watching) {
        gutil.log(gutil.colors.blue('*'), 'Compiling', _in);
    }

    var bundle = browserify({
        entries: [_in],
        plugin: [esmify],
        standalone: 'annotator',
    });

    if (watching) {
        bundle = watchifyModule(bundle);
        bundle.on('log', function(msg) {
            var bytes = msg.match(/^(\d{1,})\s/)[1];
            msg = msg.replace(/^\d{1,}\sbytes/, convertBytes(bytes));
            gutil.log(gutil.colors.green('√'), 'Done, ', msg, '...');
        });
        bundle.on('update', function(files) {
            gutil.log(gutil.colors.red('>'), 'Change detected in', files.join(', '), '...');
            return bundleShare(bundle, _in, _out, _maps, _dest);
        });
    }

    return bundleShare(bundle, _in, _out, _maps, _dest);
};

var bundleShare = function(bundle, _in, _out, _maps, _dest) {
    return bundle.bundle()
        .on('error', function(error) {
            gutil.log('Browserify', '' + error);
        })
        .on('end', function() {
            gutil.log(gutil.colors.green('√'), 'Saved ' + _in);
        })
        .pipe(source(_out))
        .pipe(buffer())
        // sourcemaps start
        .pipe(gulpif(!prod, sourcemaps.init({ loadMaps: true })))
        .pipe(gulpif(prod, uglify()))
        .pipe(gulpif(!prod, sourcemaps.write('.')))
        // sourcemaps end
        .pipe(gulp.dest(_dest))
        .pipe(gulp.dest('/home/flowman/projects/platform/media/com_lms/js'));
};

var minifyJS = function() {
    var streams = [];
    paths.minify.forEach(function(app) {
        var _file = app.in.substring(app.in.lastIndexOf('/')).split(/[\\/]/).pop(),
            _dest = app.out.substring(0, app.out.lastIndexOf('/')),
            _ext  = _file.split('.').pop();

        gutil.log(gutil.colors.blue('*'), 'Minifying', app.in);

        streams.push(gulp.src(app.in)
            .on('end', function() {
                gutil.log(gutil.colors.green('√'), 'Saved ' + app.in);
            })
            .on('error', gutil.log)
            .pipe(gulpif(_ext == 'json', jsonminify(), uglify()))
            .pipe(gulp.dest(_dest)));
    });

    return merge(streams);
};

function minify(done) {
    if (!prod) { 
        done();
        return; 
    }

    return minifyJS();
}

function watchify() {
    if (watchType != 'js' && watchType != 'all') { return; }
    watch = true;

    // watch js
    paths.js.forEach(function(app) {
        // var _path = app.in.substring(0, app.in.lastIndexOf('/'));
        return compileJS(app, true);
    });

}

function js() {
    var streams = [];
    paths.js.forEach(function(app) {
        streams.push(compileJS(app));
    });

    return merge(streams);
}

exports.watchify = watchify;
exports.watch = gulp.series(watchify, function() {
    if (watchType != 'css' && watchType != 'all') { return; }

    // watch css
    paths.css.forEach(function(app) {
        var _path = app.in.substring(0, app.in.lastIndexOf('/'));
        gulp.watch(_path + '/**/*.scss', function(event) {
            gutil.log(gutil.colors.red('>'), 'File', event.path, 'was', event.type);
            return compileCSS(app);
        });
    });
});

exports.js = js;
exports.all = gulp.series(js, minify);
exports.defaults = gulp.series(js, minify)