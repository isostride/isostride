// CloudFront Function of the app, viewer request: its paths as its static export lays them out
// (/run → /run.html, /run/ → /run.html, / → /index.html).
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  if (uri === '/') req.uri = '/index.html';
  else if (uri.slice(-1) === '/') req.uri = uri.slice(0, -1) + '.html';
  else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) req.uri = uri + '.html';
  return req;
}
