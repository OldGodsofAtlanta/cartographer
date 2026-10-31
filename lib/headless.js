// Renders maps without a window: the editor's own drawing code, driven in headless Chromium through the
// page's window.cartographer API. Start once, render many; calls are queued, one map at a time.
// Used by scripts/render.js and mcp-server.js. Set CHROMIUM_PATH to use an installed Chrome.

import { chromium } from 'playwright';
import { startServer } from '../server.js';

export class Renderer {
  constructor({ editor = false } = {}) {
    this.editor = editor; // show the editor's controls (for screenshots) rather than the bare sheet
    this.queue = Promise.resolve();
    this.warnings = [];
  }

  async start() {
    if (this.page) return;
    if (!this.starting) this.starting = this.#launch();
    await this.starting;
  }

  async #launch() {
    this.server = await startServer(0);
    const port = this.server.address().port;
    this.browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await this.browser.newPage({ viewport: { width: 1500, height: 1000 } });
    page.on('pageerror', (e) => this.warnings.push(e.message));
    page.on('console', (m) => m.type() === 'error' && this.warnings.push(m.text()));
    await page.goto(`http://localhost:${port}/${this.editor ? '' : '?headless=1'}`);
    await page.waitForFunction(() => window.cartographer);
    await page.evaluate(() => window.cartographer.ready);
    this.page = page;
  }

  #serial(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  // Draws a project (whole or partial; see app/project.js) and exports it once per entry in
  // `outputs` ([{type: 'png'|'jpg'|'svg', dpi}]). Returns the resolved project, the features drawn
  // per layer, layers whose files are missing, any page warnings, and a Buffer per output.
  render(project, outputs = [{ type: 'png' }]) {
    return this.#serial(async () => {
      await this.start();
      this.warnings = [];
      const r = await this.page.evaluate(
        async ([spec, outs]) => {
          const loaded = await window.cartographer.load(spec);
          const files = [];
          for (const o of outs) {
            const blob = await window.cartographer.exportBlob(o.type, o.dpi || undefined);
            const buf = new Uint8Array(await blob.arrayBuffer());
            let s = '';
            for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            files.push(btoa(s));
          }
          return { project: loaded.project, stats: loaded.stats, missing: loaded.missing, backdrops: loaded.backdrops, files };
        },
        [project, outputs],
      );
      return { ...r, files: r.files.map((b) => Buffer.from(b, 'base64')), warnings: this.warnings.filter((w) => !w.includes('favicon')) };
    });
  }

  // A screenshot of the page as it stands (the editor, if started with editor: true).
  screenshot(path) {
    return this.#serial(async () => {
      await this.start();
      await this.page.screenshot({ path });
    });
  }

  async close() {
    await this.browser?.close().catch(() => {});
    await new Promise((r) => (this.server ? this.server.close(r) : r()));
    this.page = null;
    this.starting = null;
  }
}
