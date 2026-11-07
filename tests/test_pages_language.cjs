// Run the real inline Pages script without dependencies or network access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const direct = 'https://halachabench.github.io/halacha-bench-results/index.html';
const source = 'https://github.com/agamrafaeli/halacha-bench-results/blob/example/index.html';
const preview = 'https://htmlpreview.github.io/?' + source;

function element(attributes = {}) {
  const listeners = {};
  const classes = new Set();
  return {
    attributes, listeners, style: {}, children: [], hidden: false,
    classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
    appendChild(child) { this.children.push(child); },
    click() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      (listeners.click || []).forEach(callback => callback(event));
      return event;
    }
  };
}

function boot(url = direct, languages = [], language) {
  const roots = {};
  const switches = [];
  for (const code of ['en', 'he']) {
    const section = html.split(`<div id="c-${code}"`)[1].split(code === 'en' ? '<!-- ============ HEBREW' : '<script>')[0];
    const screens = Array.from(section.matchAll(/<section\b/g), () => element());
    const buttons = Array.from(section.matchAll(/data-go="([^"]+)"/g), match => element({ 'data-go': match[1] }));
    const dots = element();
    const root = element();
    root.screens = screens;
    root.buttons = buttons;
    root.querySelectorAll = selector => {
      if (selector === '.screen') return screens;
      if (selector === '[data-go]') return buttons;
      throw new Error('Unmodelled root selector: ' + selector);
    };
    root.querySelector = selector => {
      if (selector === '.dots') return dots;
      const target = selector.match(/data-go="([^"]+)"/)[1];
      return buttons.find(button => button.getAttribute('data-go') === target);
    };
    roots[code] = root;
    switches.push(element({ hreflang: code === 'en' ? 'he' : 'en' }));
  }
  const windowEvents = {};
  const window = {
    location: new URL(url),
    addEventListener(name, callback) { (windowEvents[name] ||= []).push(callback); }
  };
  const document = {
    documentElement: { lang: 'he', dir: 'rtl' },
    title: '',
    getElementById(id) { return roots[id.slice(2)]; },
    createElement() { return element(); },
    querySelectorAll(selector) {
      assert.equal(selector, '.langswitch');
      return switches;
    }
  };
  vm.runInNewContext(script, { window, document, navigator: { languages, language }, URL, URLSearchParams });
  return {
    window, document, roots, switches,
    navigate(nextUrl) {
      window.location = new URL(nextUrl);
      (windowEvents.hashchange || []).forEach(callback => callback());
    },
    choose(code) {
      const link = switches.find(link => link.getAttribute('hreflang') === code);
      assert.equal(link.click().prevented, true, 'language clicks must not navigate to raw GitHub');
    }
  };
}

function isLanguage(page, code) {
  assert.equal(page.document.documentElement.lang, code);
  assert.equal(page.document.documentElement.dir, code === 'he' ? 'rtl' : 'ltr');
  assert.equal(page.roots.he.hidden, code !== 'he');
  assert.equal(page.roots.en.hidden, code !== 'en');
  assert.match(page.document.title, code === 'he' ? /האם AI/ : /can AI/);
}

test('HTML and missing locale default to visible Hebrew and RTL', () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /<div id="c-en"[^>]* hidden>/);
  assert.doesNotMatch(html.match(/<div id="c-he"[^>]*>/)[0], /hidden/);
  isLanguage(boot(), 'he');
});

test('only a primary English locale automatically selects English', () => {
  for (const locale of ['en', 'en-US', 'en-GB', 'EN_au']) isLanguage(boot(direct, [locale]), 'en');
  for (const locale of ['he', 'he-IL', 'iw-IL', 'fr-FR', 'de', 'ar', 'english', '']) isLanguage(boot(direct, [locale, 'en-US']), 'he');
  isLanguage(boot(direct, [], 'en-CA'), 'en');
});

test('explicit supported query overrides the primary browser locale', () => {
  for (const value of ['he', 'he-IL', 'IW']) isLanguage(boot(direct + '?lang=' + value, ['en-US']), 'he');
  for (const value of ['en', 'en-GB', 'EN']) isLanguage(boot(direct + '?lang=' + value, ['he-IL']), 'en');
  isLanguage(boot(direct + '?lang=fr', ['fr-FR']), 'he');
  isLanguage(boot(direct + '?lang=english', ['fr-FR']), 'he');
});

test('HTMLPreview nested source query is parsed correctly', () => {
  isLanguage(boot(preview + '?lang=he', ['en-US']), 'he');
  isLanguage(boot(preview + '?lang=en', ['he-IL']), 'en');
  isLanguage(boot(preview + '?other=value&lang=he', ['en-US']), 'he');
  isLanguage(boot(preview + '?other=a%26lang=en&lang=he', ['en-US']), 'he');
  isLanguage(boot(preview + '?other=a%23lang=en&lang=he', ['en-US']), 'he');
});

test('explicit hash wins over conflicting direct or nested queries', () => {
  isLanguage(boot(direct + '?lang=en#lang=he', ['en-US']), 'he');
  isLanguage(boot(preview + '?lang=he#lang=en', ['he-IL']), 'en');
  isLanguage(boot(preview + '#lang=he', ['en-US']), 'he');
});

test('preview toggle preserves wrapper and opaque source query', () => {
  const page = boot(preview, ['en-US']);
  const originalSearch = page.window.location.search;
  page.choose('he');
  isLanguage(page, 'he');
  assert.equal(page.window.location.hostname, 'htmlpreview.github.io');
  assert.equal(page.window.location.search, originalSearch);
  assert.equal(page.window.location.hash, '#lang=he');
  for (const link of page.switches) {
    const href = new URL(link.getAttribute('href'));
    assert.equal(href.hostname, 'htmlpreview.github.io');
    assert.equal(href.search, originalSearch);
    assert.equal(href.hash, '#lang=' + link.getAttribute('hreflang'));
  }
});

test('repeated toggles preserve the current screen and direction', () => {
  const page = boot(preview, ['en-US']);
  page.roots.en.goToScreen(2);
  for (let i = 0; i < 4; i++) {
    page.choose('he'); isLanguage(page, 'he'); assert.equal(page.roots.he.getScreen(), 2);
    page.choose('en'); isLanguage(page, 'en'); assert.equal(page.roots.en.getScreen(), 2);
  }
});

test('hash history and reload restore explicit language choices', () => {
  const page = boot(preview + '#lang=he', ['en-US']);
  const firstUrl = page.window.location.href;
  page.choose('en');
  const secondUrl = page.window.location.href;
  page.navigate(firstUrl); isLanguage(page, 'he');
  page.navigate(secondUrl); isLanguage(page, 'en');
  isLanguage(boot(firstUrl, ['en-US']), 'he');
  isLanguage(boot(secondUrl, ['he-IL']), 'en');
});
