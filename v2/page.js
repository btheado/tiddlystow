function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function serializePageData(data) {
  return JSON.stringify(data).replace(/[<\u2028\u2029]/g, (char) => ({
    '<': '\\u003c',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029'
  }[char]));
}

function pageDataScript(data) {
  return `<script>window.TIDDLYSTOW_PAGE_DATA = ${serializePageData(data)};</script>`;
}

function getAssetUrl(path) {
  return new URL(path, self.registration.scope).href;
}

function renderHtmlPage({ title, stylesheets = [], head = '', body, scripts = [] }) {
  const stylesheetTags = stylesheets
    .map((href) => `<link rel="stylesheet" href="${escapeAttribute(getAssetUrl(href))}">`)
    .join('\n');
  const scriptTags = scripts
    .map((src) => `<script src="${escapeAttribute(getAssetUrl(src))}"></script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${stylesheetTags}
  ${head}
</head>
<body>
  ${body}
  ${scriptTags}
</body>
</html>`;
}
