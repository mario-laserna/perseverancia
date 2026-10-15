import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__sceneReady, null, { timeout: 30000 });
await p.mouse.move(640, 360); await p.mouse.down();
for (let i = 1; i <= 10; i++) { await p.mouse.move(640 + i * 60, 360); await p.waitForTimeout(150); }
await p.mouse.up(); await p.waitForTimeout(6000);
await p.screenshot({ path: 'screenshots/orbit.png' });
await b.close();
