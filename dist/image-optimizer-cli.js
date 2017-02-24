/* eslint-disable no-console */
const Promise = require('bluebird');
const TaskQueue = require('cwait').TaskQueue;
const Table = require('cli-table');
const fs = require('fs-extra');
const gm = require('gm').subClass({ imageMagick: true });
const imagemin = require('imagemin');
const imageminJpegRecompress = require('imagemin-jpeg-recompress');

const queue = new TaskQueue(Promise, 8);

Promise.promisifyAll(fs);
Promise.promisifyAll(gm.prototype);

const getContents = dir =>
  fs.statAsync(dir)
    .then((stats) => {
      if (!stats.isDirectory()) {
        return Promise.reject(new Error('The path parameter must be a directory'));
      }

      return fs.readdirAsync(dir);
    })
    .catch(err => Promise.reject(err));

const getFileStats = input => fs.statAsync(input);

const resize = (input, output, params) =>
  gm(input).resize(params.width, params.height).writeAsync(output);

const minify = (input, output) =>
  imagemin([`${input}/*.jpg`], output, { plugins: [imageminJpegRecompress()] });

const summary = (dir, allowedType) =>
  getContents(dir)
  .then(files => files.filter(file => allowedType.indexOf(file.split('.').pop()) !== -1))
  .then(files => Promise.map(files, file => getFileStats(`${dir}/${file}`)))
  .then(stats => stats.map(stat => stat.size))
  .then((sizes) => {
    const min = Math.ceil(Math.min.apply(null, sizes) / 1000);
    const max = Math.ceil(Math.max.apply(null, sizes) / 1000);

    const sum = sizes.reduce((result, value) => result + value, 0);
    const avg = Math.ceil(sum / sizes.length / 1000);

    return { min, max, avg, totalFiles: sizes.length };
  });

const filterFileExtension = (files, allowedType) => new Promise((resolve, reject) => {
  if (files.length === 0) {
    reject(new Error('The path parameter is an empty directory'));
  }

  resolve(files.filter((file) => {
    const ext = file.split('.').pop();
    return allowedType.indexOf(ext) !== -1;
  }));
});

const resizeOrCopy = (files, inputDir, outputDir, outputType, width, height) =>
  Promise.map(files, queue.wrap((file) => {
    const inputFilePath = `${inputDir}/${file}`;
    const outputFilePath = `${outputDir}/${file.replace(/\..*/, '')}.${outputType}`;

    const fileStats = getFileStats(inputFilePath);

    return fileStats.then((stats) => {
      /*
        file above 150 kb will be processed and minified,
        otherwise it will be untouched and copied as is
      */
      let processing;
      if (stats.size > 150000) {
        const params = { width, height };
        processing = resize(inputFilePath, outputFilePath, params);
      } else {
        processing = fs.copyAsync(inputFilePath, outputFilePath);
      }

      return processing;
    });
  }));

const main = (program) => {
  const inputDir = program.input;
  const outputDir = program.output;
  const height = program.height || null;
  const width = program.width || null;
  const outputType = program.outputType || 'jpg';
  const forceResize = program.forceResize;
  const allowedType = ['jpg', 'png'];

  try {
    if (!inputDir) throw new Error('input directory is required');
    if (!outputDir) throw new Error('output directory is required');

    if (forceResize) {
      if (!width) throw new Error('output image width is required');
      if (!height) throw new Error('output image height is required');
    }
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }

  console.time('Time Elapsed');

  getContents(inputDir).then(files => filterFileExtension(files, allowedType))
  .then((files) => {
    const processing = height || width
      ? resizeOrCopy(files, inputDir, outputDir, outputType, width, height)
      : Promise.resolve();

    return processing;
  })
  .then(() => {
    const source = height || width ? outputDir : inputDir;
    return minify(source, outputDir);
  })
  .then(() => Promise.all([summary(inputDir, allowedType), summary(outputDir, allowedType)]))
  .then((result) => {
    const table = new Table({
      head: ['Files', 'Max Size', 'Min Size', 'Avg Size'],
    });

    table.push(
      [`${result[0].totalFiles}`, `${result[0].max} KB`, `${result[0].min} KB`, `${result[0].avg} KB`],
      [`${result[1].totalFiles}`, `${result[1].max} KB`, `${result[1].min} KB`, `${result[1].avg} KB`]);

    console.log(table.toString());
    console.timeEnd('Time Elapsed');
  })
  .catch(err => console.log(err.message));
};

module.exports = main;
