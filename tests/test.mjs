'use strict';

import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import cp from 'node:child_process';
import test from 'tape';
import { rimraf } from 'rimraf';

const exec = promisify(cp.exec);
const before = test;
const after = test;
const tmpDir = 'tests/tmp';
const inputFile = `${tmpDir}/index.html`;
const outputFile = `${tmpDir}/output.html`;
const cssFiles = ['styles1.css', 'styles2.css', 'styles3.css'];
const jsFiles = ['script1.js', 'script2.js', 'script3.js'];
const jsFilesWildcard = '**/*.js';
const cssFilesWildcard = '**/*.css';
const revision = (await exec('git rev-parse HEAD')).toString().trim();

async function setup() {
  try {
    await fs.lstat(tmpDir);
  } catch (e) {
    await fs.mkdir(tmpDir);
  }

  await fs.writeFile(
    inputFile,
    `
        <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <title>Replacer</title>
                    <base href="/" />
                    <meta name="viewport" content="width=device-width, initial-scale=1">

                    <!-- inject:css -->
                    <link rel="stylesheet" href="/client/css/styles.css">
                    <!-- endinject -->

                </head>
                <body>

                    <div></div>

                    <!-- remove:development -->
                    <script src="lib/profiler.js"></script>
                    <!-- endremove -->

                    <script src="/src/jquery.js"></script>

                    <!-- inject:js -->
                    <script src="/client/js/build.js"></script>
                    <!-- endinject -->

                    <!-- remove:production -->
                    <script src="http://localhost:35729/livereload.js?snipver=1"></script>
                    <!-- endremove -->


                </body>
            </html>
            <!-- inject:git-hash -->
    `
  );

  for (const file of cssFiles) {
    await fs.writeFile(
      `${tmpDir}/${file}`,
      `
            body {
                padding: 0;
                margin: 10px;
            }
        `
    );
  }

  for (const file of jsFiles) {
    await fs.writeFile(
      `${tmpDir}/${file}`,
      `
            console.log('${file}');
        `
    );
  }
}

before('test setup', async (t) => {
  await setup();
  t.end();
});

test('test injection of all stylesheets in directory', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c ${tmpDir}`);
  const content = await fs.readFile(outputFile, 'utf-8');
  for (const file of cssFiles) {
    t.equal(content.includes(`${tmpDir}/${file}`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test injection of all javascripts in directory', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -j ${tmpDir}`);
  const content = await fs.readFile(outputFile, 'utf-8');
  for (const file of jsFiles) {
    t.equal(content.includes(`${tmpDir}/${file}`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test injection of single stylesheet', async (t) => {
  const cssFile = cssFiles[0];
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c ${tmpDir}/${cssFile}`);
  const content = await fs.readFile(outputFile, 'utf-8');
  t.equal(content.includes(`${tmpDir}/${cssFile}`), true, `expect ${cssFile} to be injected`);
  t.end();
});

test('test injection of single javascript', async (t) => {
  const jsFile = jsFiles[0];
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -j ${tmpDir}/${jsFile}`);
  const content = await fs.readFile(outputFile, 'utf-8');
  t.equal(content.includes(`${tmpDir}/${jsFile}`), true, `expect ${jsFile} to be injected`);
  t.end();
});

test('test injection of stylesheets with wildcard', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c '${cssFilesWildcard}'`);
  const content = await fs.readFile(outputFile, 'utf-8');
  for (const file of cssFiles) {
    t.equal(content.includes(`${tmpDir}/${file}`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test injection of javascripts with wildcard', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -j '${jsFilesWildcard}'`);
  const data = await fs.readFile(outputFile, 'utf-8');
  for (const file of jsFiles) {
    t.equal(data.includes(`${tmpDir}/${file}`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test injection of stylesheets with inline option', async (t) => {
  const cssFile = cssFiles[0];
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c ${tmpDir}/${cssFile} -I`);
  const content = await fs.readFile(outputFile, 'utf-8');
  const actual = `
            body {
                padding: 0;
                margin: 10px;
            }
  `.trim()
  t.equal(content.includes(actual), true, `expect ${cssFile} to be injected`);
  t.end();
});

test('test injection of javascripts with inline option', async (t) => {
  const jsFile = jsFiles[0];
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c ${tmpDir}/${jsFile} -I`);
  const content = await fs.readFile(outputFile, 'utf-8');
  const actual = `
            console.log('${jsFile}');
  `.trim()
  t.equal(content.includes(actual), true, `expect ${jsFile} to be injected`);
  t.end();
});

test('test injection of all stylesheets in directory with ignore', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c ${tmpDir} -g ${tmpDir}/`);
  const content = await fs.readFile(outputFile, 'utf-8');
  for (const file of cssFiles) {
    t.equal(content.includes(`\"${file}\"`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test injection of all javascripts in directory with ignore', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -j ${tmpDir} -g ${tmpDir}/`);
  const content = await fs.readFile(outputFile, 'utf-8');
  for (const file of jsFiles) {
    t.equal(content.includes(`\"${file}\"`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test injection of single stylesheet with ignore', async (t) => {
  const cssFile = cssFiles[0];
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c ${tmpDir}/${cssFile} -g ${tmpDir}/`);
  const content = await fs.readFile(outputFile, 'utf-8');
  t.equal(content.includes(`\"${cssFile}\"`), true, `expect ${cssFile} to be injected`);
  t.end();
});

test('test injection of single javascript with ignore', async (t) => {
  const jsFile = jsFiles[0];
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -j ${tmpDir}/${jsFile} -g ${tmpDir}/`);
  const content = await fs.readFile(outputFile, 'utf-8');
  t.equal(content.includes(`\"${jsFile}\"`), true, `expect ${jsFile} to be injected`);
  t.end();
});

test('test injection of stylesheets with wildcard with ignore', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -c '${cssFilesWildcard}' -g ${tmpDir}/`);
  const content = await fs.readFile(outputFile, 'utf-8');
  for (const file of cssFiles) {
    t.equal(content.includes(`\"${file}\"`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test injection of javascripts with wildcard with ignore', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -j '${jsFilesWildcard}' -g ${tmpDir}/`);
  const content = await fs.readFile(outputFile, 'utf-8');
  for (const file of jsFiles) {
    t.equal(content.includes(`\"${file}\"`), true, `expect ${file} to be injected`);
  }
  t.end();
});

test('test removal of development code', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -r development`);
  const devRegex = new RegExp('(<!-- remove:development -->)([\\s\\S]*?)(<!-- endremove -->)');
  const prodRegex = new RegExp('(<!-- remove:production -->)([\\s\\S]*?)(<!-- endremove -->)');
  const content = await fs.readFile(outputFile, 'utf-8');
  t.equal(devRegex.test(content), false, `expect development code to be removed`);
  t.equal(prodRegex.test(content), true, `expect production code to not be removed`);
  t.end();
});

test('test removal of production code', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -r production`);
  const prodRegex = new RegExp('(<!-- remove:production -->)([\\s\\S]*?)(<!-- endremove -->)');
  const devRegex = new RegExp('(<!-- remove:development -->)([\\s\\S]*?)(<!-- endremove -->)');

  const content = await fs.readFile(outputFile, 'utf-8');
  t.equal(prodRegex.test(content), false, `expect production code to be removed`);
  t.equal(devRegex.test(content), true, `expect development code to not be removed`);
  t.end();
});

test('test injection of git hash', async (t) => {
  await exec(`node postbuild.mjs -i ${inputFile} -o ${outputFile} -H`);
  const content = await fs.readFile(outputFile, 'utf-8');
  t.equal(content.includes(revision), true, `expect git hash to be injected`);
  t.end();
});

after('test cleanup', async (t) => {
  await rimraf(tmpDir);
  t.end();
});
