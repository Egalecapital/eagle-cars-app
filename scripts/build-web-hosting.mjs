/**
 * Build Eagle Cars WEB tĩnh cho shared hosting (OnePanel / LiteSpeed / Apache).
 *
 *   npm run build:web-hosting
 *
 * - Export với web.output "static" (qua EAGLE_WEB_OUTPUT=static, xem app.config.js).
 *   Cấu hình EAS (output "server") KHÔNG đổi.
 * - Route động: Expo Router sinh trang mẫu <route>/[param].html; chép thành
 *   <route>/_route.html và .htaccess rewrite từng route động về đúng trang mẫu
 *   (app tự đọc tham số từ URL). Không rewrite chung về index.html.
 * - 404: +not-found.html → 404.html (ErrorDocument).
 * - Quét secret trong bản build; có dấu hiệu secret → DỪNG, không đóng gói.
 * - Kết quả: web-hosting-build/public_html/ + web-hosting-build/eagle-cars-web-<ngày-giờ>.zip
 *   (ZIP chứa trực tiếp index.html + .htaccess ở cấp gốc → giải nén vào public_html).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'web-hosting-build');
const SITE = path.join(OUT, 'public_html');
const DOMAIN = 'eaglecapital.vn';

// [regex đường dẫn (không có "/" đầu), thư mục chứa _route.html, trang mẫu Expo Router]
const DYNAMIC = [
  ['^car/[^/]+/?$', 'car', 'car/[id].html'],
  ['^booking/[^/]+/?$', 'booking', 'booking/[carId].html'],
  ['^request/[^/]+/?$', 'request', 'request/[requestId].html'],
  ['^admin/request/[^/]+/?$', 'admin/request', 'admin/request/[requestId].html'],
  ['^admin/edit/[^/]+/?$', 'admin/edit', 'admin/edit/[requestId].html'],
  ['^admin/car/[^/]+/?$', 'admin/car', 'admin/car/[carId].html'],
];

// Dấu hiệu secret không được có trong bản web công khai. (supabase-js có sẵn
// chuỗi "sb_secret_" để nhận diện loại key — chỉ báo khi theo sau là giá trị.)
const SECRET_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]{6,}/,
  /service_role/,
  /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
  /\b[0-9]{8,10}:[A-Za-z0-9_-]{30,}\b/, // Telegram bot token
  /api\.telegram\.org/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function step(message) {
  console.log(`\n▶ ${message}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function htaccess() {
  const rules = DYNAMIC.map(([re, dir]) => `RewriteRule ${re} /${dir}/_route.html [L]`).join('\n');
  const domainRe = DOMAIN.replace(/\./g, '\\.');

  return `# Eagle Cars Web — Expo Router (web.output "static") trên LiteSpeed / Apache.
# Sinh tự động bởi scripts/build-web-hosting.mjs — không sửa tay.
Options -Indexes -MultiViews
DirectoryIndex index.html
DirectorySlash Off
ErrorDocument 404 /404.html

RewriteEngine On
RewriteBase /

# 1) www → tên miền gốc; http → https.
RewriteCond %{HTTP_HOST} ^www\\.${domainRe}$ [NC]
RewriteRule ^ https://${DOMAIN}%{REQUEST_URI} [R=301,L]
RewriteCond %{HTTPS} !=on
RewriteCond %{HTTP:X-Forwarded-Proto} !=https
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

# 2) File thật (JS, ảnh, favicon, .html) → trả nguyên.
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]

# 3) /explore → explore.html, /legal/privacy → legal/privacy.html …
RewriteCond %{DOCUMENT_ROOT}/$1.html -f
RewriteRule ^(.+?)/?$ /$1.html [L]

# 4) /admin → admin/index.html (thư mục có index.html, không redirect thêm "/").
RewriteCond %{DOCUMENT_ROOT}/$1/index.html -f
RewriteRule ^(.+?)/?$ /$1/index.html [L]

# 5) Route động → trang mẫu của Expo Router (app tự đọc tham số từ URL).
${rules}

# Ngoài các trường hợp trên → 404.html (ErrorDocument).

# Cache: file trong _expo/static có hash trong tên → cache lâu; HTML luôn kiểm tra lại.
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType image/png "access plus 1 month"
  ExpiresByType image/jpeg "access plus 1 month"
</IfModule>
`;
}

// ---------------------------------------------------------------------
step('Export web tĩnh (EAGLE_WEB_OUTPUT=static)');
fs.rmSync(OUT, { recursive: true, force: true });
// Một chuỗi lệnh (đường dẫn đã đặt trong ngoặc kép) — tránh truyền mảng tham số kèm shell.
const exported = spawnSync(`npx expo export --platform web --output-dir "${SITE}"`, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EAGLE_WEB_OUTPUT: 'static' },
});
if (exported.status !== 0) throw new Error('expo export thất bại');

step('Chuẩn bị route động, 404 và .htaccess');
for (const [, dir, template] of DYNAMIC) {
  const src = path.join(SITE, template);
  if (!fs.existsSync(src)) throw new Error(`Thiếu trang mẫu route động: ${template}`);
  fs.copyFileSync(src, path.join(SITE, dir, '_route.html'));
}
fs.copyFileSync(path.join(SITE, '+not-found.html'), path.join(SITE, '404.html'));
fs.writeFileSync(path.join(SITE, '.htaccess'), htaccess());

for (const required of ['index.html', '.htaccess', '404.html', 'favicon.ico', 'admin/index.html']) {
  if (!fs.existsSync(path.join(SITE, required))) throw new Error(`Thiếu ${required}`);
}

step('Quét secret trong bản build');
const files = walk(SITE);
const hits = [];
for (const file of files) {
  if (!/\.(html|js|json|css|txt|map|htaccess)$/.test(file) && path.basename(file) !== '.htaccess') continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const re of SECRET_PATTERNS) if (re.test(text)) hits.push(`${path.relative(SITE, file)} ~ ${re}`);
}
if (hits.length > 0) {
  console.error('PHÁT HIỆN dấu hiệu secret — DỪNG, không đóng gói:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`Sạch (${files.length} file).`);

step('Đóng gói ZIP');
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const zip = path.join(OUT, `eagle-cars-web-${stamp}.zip`);
// Tự tạo từng entry với đường dẫn "/" (chuẩn ZIP). ZipFile.CreateFromDirectory của
// .NET Framework (PowerShell 5.1) ghi "\" → giải nén trên hosting Linux sẽ ra file
// tên "admin\index.html" thay vì thư mục admin/. Giữ nguyên tên có [ ] và .htaccess.
const zipScript = path.join(OUT, 'make-zip.ps1');
fs.writeFileSync(
  zipScript,
  `param([string]$Src, [string]$Dst)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$root = (Resolve-Path -LiteralPath $Src).Path.TrimEnd('\\') + '\\'
$fs = [IO.File]::Open($Dst, [IO.FileMode]::CreateNew)
$zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $Src -Recurse -File -Force | ForEach-Object {
    $name = $_.FullName.Substring($root.Length).Replace('\\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name, [IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $zip.Dispose(); $fs.Dispose() }
`
);
const zipped = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', zipScript, '-Src', SITE, '-Dst', zip],
  { stdio: 'inherit' }
);
fs.rmSync(zipScript, { force: true });
if (zipped.status !== 0) throw new Error('Tạo ZIP thất bại');

console.log(`\nXONG\nThư mục: ${SITE}\nZIP:     ${zip}`);
