#!/usr/bin/env node
const program = require('commander');
const main = require('./image-optimizer-cli');

program
  .version('1.0.0')
  .option('-i, --input <path>', '[MANDATORY] Specify path to input directory.')
  .option('-o, --output <path>', '[MANDATORY] Specify path to output directory')
  .option('-h, --height <n>', 'Set height of the output image')
  .option('-w, --width <n>', 'Set width of the output image')
  .option('-e, --output-ext <ext>', 'Set type of the output image')
  .option('-a, --allowed-ext <ext>', 'Only allow specifics input image [jpg]', 'jpg')
  .option('-R, --force-resize', 'Force height and width regardless the aspect ratio')
  .parse(process.argv);

main(program);
