import { promisify } from 'node:util';
import cp from 'node:child_process';
import fs from 'node:fs';
import fsPromise from 'node:fs/promises';
import path from 'node:path/posix';
import crypto from 'node:crypto';
import { glob, hasMagic } from 'glob';
import replaceStream from 'replacestream';
import { program } from 'commander';

function handleError(message) {
  console.error(message);
  process.exit(1);
}

function getFullPath(file) {
  return path.join(process.cwd(), file);
}

async function appendETagSHAToFilename(filename) {
  const sha = crypto.createHash('sha');
  const content = await fsPromise.readFile(filename, 'utf-8');
  sha.update(content);
  return `${filename}?etag=${sha.digest('hex').toString()}`;
}

async function patternToFileNames(pattern, extension) {
  if (hasMagic(pattern)) {
    const unwrappedPattern = pattern.replace(/^['"](.+)["']$/, '$1');
    return await glob(unwrappedPattern, { posix: true });
  }
  const stats = await fsPromise.lstat(pattern);
  if (stats.isDirectory()) {
    const fileNames = await fsPromise.readdir(pattern);
    return fileNames.filter((file) => file.endsWith(extension)).map((file) => path.join(pattern, file));
  }

  if (stats.isFile()) {
    return [pattern];
  }

  return [];
}

async function filePatternToScriptTags(pattern, { inline, ignore, etag }) {
  const fileNames = await patternToFileNames(pattern, '.js');
  const tags = [];
  for (const fileName of fileNames) {
    if (inline) {
      const content = await fsPromise.readFile(fileName, 'utf-8');
      tags.push(`<script>${content}</script>`);
    } else {
      let path = fileName;
      if (typeof ignore === 'string') {
        path = path.slice(ignore.length);
      }
      if (etag != null) {
        path = await appendETagSHAToFilename(path);
      }
      tags.push(`<script src="${path}"></script>`);
    }
  }
  return tags;
}

async function filePatternToStyleTags(pattern, { inline, ignore, etag }) {
  const fileNames = await patternToFileNames(pattern, '.css');
  const tags = [];
  for (const fileName of fileNames) {
    if (inline) {
      const content = await fsPromise.readFile(fileName, 'utf-8');
      tags.push(`<style>${content}</style>`);
    } else {
      let path = fileName;
      if (typeof ignore === 'string') {
        path = path.slice(ignore.length);
      }
      if (etag != null) {
        path = await appendETagSHAToFilename(path);
      }
      tags.push(`<link rel="stylesheet" href="${path}">`);
    }
  }
  return tags;
}

const options = program
  .version('1.1.0')
  .option('-i, --input <input>', 'Input file')
  .option('-o, --output <output>', 'Output file (defaults to input when omitted)')
  .option(
    '-c, --css <css>',
    "css file(s) to inject (file or directory). Wildcards can be used with quotation: '**/*.css'"
  )
  .option('-j, --js <js>', "js file(s) to inject (file or directory). Wildcards can be used with quotation: '**/*.js'")
  .option('-r, --remove <remove>', 'Remove condition')
  .option('-g, --ignore <path>', 'Prefix to remove from the injected filenames')
  .option('-H, --hash', 'Inject git hash of current commit')
  .option(
    '-e, --etag',
    'appends "?etag=fileHash" to every import (link, script) to avoid undesired caching in new deployments'
  )
  .option('-I, --inline', 'Inline the input(js and css) and embed it in html')
  .parse(process.argv)
  .opts();

if (options.input == null) {
  handleError('Please specify an input file');
}

const inputFile = getFullPath(options.input);
try {
  const stat = await fsPromise.lstat(inputFile);
  if (stat.isDirectory()) {
    handleError(`'${inputFile}' is a directory, please specify an input file`);
  }
  if (stat.isFile() === false) {
    handleError(`File '${inputFile}' not found`);
  }
} catch (e) {
  handleError(`File '${inputFile}' not found`);
}

const outputFile = options.output ? getFullPath(options.output) : inputFile;

let jsFiles = [];
if (options.js) {
  try {
    const { inline, ignore, etag } = options;
    jsFiles = await filePatternToScriptTags(options.js, { inline, ignore, etag });
  } catch (e) {
    handleError(`File or folder '${js}' not found`);
  }
}

let cssFiles = [];
if (options.css) {
  try {
    const { inline, ignore, etag } = options;
    cssFiles = await filePatternToStyleTags(options.css, { inline, ignore, etag });
  } catch (e) {
    handleError(`File or folder '${css}' not found`);
  }
}

let removeCondition = '';
if (options.remove) {
  removeCondition = options.remove.split(':').pop();
}

let revision = '';
if (options.hash) {
  revision = (await promisify(cp.exec)('git rev-parse HEAD')).toString().trim();
}

fs.createReadStream(inputFile)
  .pipe(
    replaceStream(/(<!-- inject:js -->)([\s\S]*?)(<!-- endinject -->)/gm, ($0) => {
      return jsFiles.length > 0 ? jsFiles.join('\n') : $0;
    })
  )
  .pipe(
    replaceStream(/(<!-- inject:css -->)([\s\S]*?)(<!-- endinject -->)/gm, ($0) => {
      return cssFiles.length > 0 ? cssFiles.join('\n') : $0;
    })
  )
  .pipe(replaceStream(/(<!-- inject:git-hash -->)/gm, `<!-- ${revision} -->`))
  .pipe(replaceStream(new RegExp(`(<!-- remove:${removeCondition} -->)([\\s\\S]*?)(<!-- endremove -->)`, 'gm'), ''))
  .pipe(fs.createWriteStream(outputFile));
