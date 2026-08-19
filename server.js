const http = require('http');
const url  = require('url');

const routes = {
  '/api/home':        require('./api/home'),
  '/api/archive':     require('./api/archive'),
  '/api/search':      require('./api/search'),
  '/api/taxonomies':  require('./api/taxonomies'),
  '/api/detail':      require('./api/detail'),
  '/api/chapters':    require('./api/chapters'),
  '/api/chapter':     require('./api/chapter'),
  '/api/hover':       require('./api/hover'),
  '/api/reading-nav': require('./api/reading-nav'),
};

const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const handler = routes[parsed.pathname];
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!handler) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Not found' })); }
  req.query = parsed.query;
  try { await handler(req, res); }
  catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
});

server.listen(3001, () => console.log('API server: http://localhost:3001'));
