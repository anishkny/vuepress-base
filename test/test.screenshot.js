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
    await page.goto('http://localhost:24981/', {
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
        throw new Error(`Actual screenshot did not match expected golden.\n` +
          `  Number of differing pixels: [${numDiffPixels}]\n` +
          `  Actual: ${workdir}/actual.png\n  Diff: ${workdir}/diff.png\n` +
          `If this is epxected, please re-run test with GENERATE_GOLDEN_SCREENSHOTS=1`);
      }
    }
  });

});
