// CloudFront Function of the site, viewer request: www sent to the bare domain, and its paths read
// as a static export lays them out (/about → /about.html, / → /index.html).
function handler(event) {
  var req = event.request;
  var host = req.headers.host ? req.headers.host.value : '';
  if (host.indexOf('www.') === 0) {
    var qs = Object.keys(req.querystring).map(function (k) {
      var v = req.querystring[k];
      return v.multiValue ? v.multiValue.map(function (m) { return k + '=' + m.value; }).join('&') : k + (v.value ? '=' + v.value : '');
    }).join('&');
    return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: 'https://' + host.slice(4) + req.uri + (qs ? '?' + qs : '') } } };
  }
  var uri = req.uri;
  if (uri === '/') req.uri = '/index.html';
  else if (uri.slice(-1) === '/') req.uri = uri.slice(0, -1) + '.html';
  else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) req.uri = uri + '.html';
  return req;
}
