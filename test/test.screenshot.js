const fs = require('fs');
const pixelmatch = require('pixelmatch');
const PNG = require('pngjs').PNG;
const puppeteer = require('puppeteer');
const readImage = (img) => { return PNG.sync.read(fs.readFileSync(img)) };
const tempdir = require('tempdir');
const goldenScreenshotDir = `${__dirname}/golden-screenshots`;

describe('Screenshot tests', () => {

  let browser = null;

  before(async () => {
    // Ensure golden screenshot exists
    if (!fs.existsSync(`${goldenScreenshotDir}/expected.png`)) {
      throw new Error(`Expected golden screenshot file not found: [${goldenScreenshotDir}/expected.png]. ` +
        'You can generate one by setting environment variable GENERATE_GOLDEN_SCREENSHOTS=1 and rerunning this test.');
    }
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should match golden screenshot', async () => {
    const workdir = await tempdir();
    const page = await browser.newPage();
    await page.goto('http://localhost:8080/', {
      waitUntil: 'networkidle0',
    });
    page.setViewport({ width: 800, height: 600 });
    await page.screenshot({
      fullPage: true,
      path: `${workdir}/actual.png`,
    });
    if (process.env.GENERATE_GOLDEN_SCREENSHOTS) {
      if (!fs.existsSync(goldenScreenshotDir)) {
        fs.mkdirSync(goldenScreenshotDir);
      }
      fs.copyFileSync(`${workdir}/actual.png`, `${goldenScreenshotDir}/expected.png`);
      console.log(`Generated expected golden screenshot file: [${goldenScreenshotDir}/expected.png]`);
    } else {
      // Compare actual screenshot with expected golden screenshot
      const imgExp = await readImage(`${goldenScreenshotDir}/expected.png`);
      const imgAct = await readImage(`${workdir}/actual.png`);
      const diff = new PNG({ width: imgExp.width, height: imgExp.height });
      const numDiffPixels = pixelmatch(imgExp.data, imgAct.data, diff.data,
        imgExp.width, imgAct.height, { threshold: 0.1 });
      if (numDiffPixels > 0) {
        diff.pack().pipe(fs.createWriteStream(`${workdir}/diff.png`));
        fs.copyFileSync(`${goldenScreenshotDir}/expected.png`, `${workdir}/expected.png`);
        fs.writeFileSync(`${workdir}/index.html`,
          'Expected:<br><img src="expected.png"><hr>Actual:<br><img src="actual.png"><hr>Diff:<br><img src="diff.png">');
        if (process.env.CI && process.env.SURGE_LOGIN && process.env.SURGE_TOKEN) {
          console.log('Uploading screenshot diff to: http://vuepress-base.surge.sh/');
          require('child_process').execSync(`SURGE_TOKEN=${process.env.SURGE_TOKEN} npx surge ${workdir} vuepress-base.surge.sh`, { stdio: [0, 1, 2] });
        }
        throw new Error([
          `Actual screenshot did not match expected golden. Number of differing pixels: [${numDiffPixels}]`,
          `  Expected: ${goldenScreenshotDir}/expected.png`,
          `    Actual: ${workdir}/actual.png`,
          `      Diff: ${workdir}/diff.png`,
          `To regenerate golden screenshots, please re-run test with GENERATE_GOLDEN_SCREENSHOTS=1`
        ].join("\n"));
      }
    }
  });

});
