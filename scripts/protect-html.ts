#!/usr/bin/env npx tsx
/**
 * Protect HTML redesign files from casual inspection/copying.
 * Injects anti-inspect-element protections sufficient for non-technical prospects.
 *
 * Usage:
 *   npx tsx scripts/protect-html.ts input.html [output.html]
 *   npx tsx scripts/protect-html.ts input.html --agency "Nome Agenzia"
 *
 * If output is omitted, writes to input.protected.html
 *
 * Protections:
 *   - Right-click disabled
 *   - F12, Ctrl+Shift+I, Ctrl+U blocked
 *   - Text selection disabled (CSS + JS)
 *   - DevTools detection (debugger trap)
 *   - Transparent watermark overlay
 *   - No-cache meta tags
 */
import * as fs from "fs";
import * as path from "path";

// ── Arg parsing ──────────────────────────────────────────────────

function parseArgs(argv: string[]): { input: string; output: string; agency: string } {
  let input = "";
  let output = "";
  let agency = "WebAgency AI";

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--agency" && i + 1 < argv.length) {
      agency = argv[++i];
    } else if (!input) {
      input = argv[i];
    } else if (!output) {
      output = argv[i];
    }
  }

  if (!input) {
    console.error("Usage: npx tsx scripts/protect-html.ts input.html [output.html] [--agency 'Name']");
    process.exit(1);
  }

  if (!output) {
    const ext = path.extname(input);
    output = input.replace(ext, `.protected${ext}`);
  }

  return { input, output, agency };
}

// ── Protection snippets ──────────────────────────────────────────

function getProtectionCSS(): string {
  return `<style>
/* Anti-copy protection */
body{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;}
::selection{background:transparent;}
::-moz-selection{background:transparent;}
img{-webkit-user-drag:none;user-drag:none;pointer-events:none;}
</style>`;
}

function getProtectionJS(): string {
  return `<script>
// Anti-inspect protections
(function(){
  // Disable right-click
  document.addEventListener('contextmenu',function(e){e.preventDefault();return false;});

  // Disable keyboard shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S)
  document.addEventListener('keydown',function(e){
    if(e.key==='F12')e.preventDefault();
    if(e.ctrlKey&&e.shiftKey&&(e.key==='I'||e.key==='i'||e.key==='J'||e.key==='j'))e.preventDefault();
    if(e.ctrlKey&&(e.key==='U'||e.key==='u'||e.key==='S'||e.key==='s'))e.preventDefault();
    if(e.metaKey&&e.altKey&&(e.key==='I'||e.key==='i'||e.key==='J'||e.key==='j'))e.preventDefault();
    if(e.metaKey&&(e.key==='U'||e.key==='u'||e.key==='S'||e.key==='s'))e.preventDefault();
  });

  // Disable drag
  document.addEventListener('dragstart',function(e){e.preventDefault();});

  // DevTools detection via debugger trap
  (function dt(){
    const t=new Date();debugger;
    if(new Date()-t>100){document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><h1>Anteprima non disponibile</h1></div>';}
    setTimeout(dt,1000);
  })();
})();
</script>`;
}

function getWatermarkCSS(agency: string): string {
  return `<style>
/* Watermark overlay */
body::after{
  content:'${agency.replace(/'/g, "\\'")}';
  position:fixed;top:0;left:0;width:100%;height:100%;
  display:flex;align-items:center;justify-content:center;
  font-size:80px;font-family:sans-serif;font-weight:700;
  color:rgba(0,0,0,0.03);
  transform:rotate(-30deg);
  pointer-events:none;
  z-index:99999;
  white-space:nowrap;
  letter-spacing:8px;
}
</style>`;
}

function getNoCacheMeta(): string {
  return `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">`;
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const { input, output, agency } = parseArgs(process.argv);

  if (!fs.existsSync(input)) {
    console.error(`Error: File not found: ${input}`);
    process.exit(1);
  }

  let html = fs.readFileSync(input, "utf-8");

  // Inject no-cache meta into <head>
  const noCacheMeta = getNoCacheMeta();
  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n${noCacheMeta}`);
  } else if (html.includes("<head ")) {
    html = html.replace(/<head\s[^>]*>/, (match) => `${match}\n${noCacheMeta}`);
  } else {
    // No <head> tag — wrap everything
    html = `<!DOCTYPE html><html><head>${noCacheMeta}</head><body>${html}</body></html>`;
  }

  // Inject protection CSS + watermark before </head>
  const protCSS = getProtectionCSS();
  const watermark = getWatermarkCSS(agency);
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${protCSS}\n${watermark}\n</head>`);
  }

  // Inject protection JS before </body>
  const protJS = getProtectionJS();
  if (html.includes("</body>")) {
    html = html.replace("</body>", `${protJS}\n</body>`);
  } else {
    html += `\n${protJS}`;
  }

  fs.writeFileSync(output, html, "utf-8");

  const inputSize = fs.statSync(input).size;
  const outputSize = fs.statSync(output).size;
  console.log(`Protected: ${input} → ${output}`);
  console.log(`Size: ${(inputSize / 1024).toFixed(1)}KB → ${(outputSize / 1024).toFixed(1)}KB`);
  console.log(`Agency watermark: ${agency}`);
}

main();
