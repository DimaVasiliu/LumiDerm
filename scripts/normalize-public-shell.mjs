import { readFile, writeFile } from 'node:fs/promises';

const files = [
  'lumi-derm-website/index.html',
  'lumi-derm-website/pages/about.html',
  'lumi-derm-website/pages/booking.html',
  'lumi-derm-website/pages/contact.html',
  'lumi-derm-website/pages/cookies.html',
  'lumi-derm-website/pages/gallery.html',
  'lumi-derm-website/pages/policies.html',
  'lumi-derm-website/pages/privacy.html',
  'lumi-derm-website/pages/services.html',
  'lumi-derm-website/pages/terms.html',
];

for (const file of files) {
  let html = await readFile(file, 'utf8');

  if (!html.includes('class="skip-link"')) {
    html = html.replace(
      /<body([^>]*)>/,
      '<body$1><a class="skip-link" href="#main-content">Skip to main content</a>',
    );
  }
  if (!/<main\b[^>]*\bid="main-content"/.test(html)) {
    html = html.replace(/<main(\s|>)/, '<main id="main-content" tabindex="-1"$1');
  } else if (!/<main\b[^>]*\btabindex=/.test(html)) {
    html = html.replace(/<main\b/, '<main tabindex="-1"');
  }
  html = html.replace(
    /<nav class="nav-menu"(?![^>]*aria-label)/g,
    '<nav class="nav-menu" aria-label="Primary navigation"',
  );
  html = html.replaceAll('style.css?v=20260620-cells', 'style.css?v=20260628-stabilise');
  html = html.replaceAll('responsive.css?v=20260620-cells', 'responsive.css?v=20260628-stabilise');
  html = html.replaceAll('main.js?v=20260620-cells', 'main.js?v=20260628-stabilise');
  html = html.replace(
    /\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^>]+><\/script>/g,
    '',
  );

  if (!html.includes('data-cookie-settings')) {
    html = html.replace(
      /<div class="footer-bottom">/,
      '<div class="footer-bottom"><button class="cookie-settings-link" type="button" data-cookie-settings>Cookie settings</button><span>',
    );
    html = html.replace(
      /(<div class="footer-bottom"><button[\s\S]*?<span>[^<]*)<\/div>/,
      '$1</span></div>',
    );
  }

  await writeFile(file, html);
}

console.log(`Normalised ${files.length} public page shells.`);
