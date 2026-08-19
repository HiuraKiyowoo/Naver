const http = require('http');

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
  const parsed = new URL(req.url, 'http://localhost');
  const handler = routes[parsed.pathname];

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Bungkus res supaya punya .status().json() kayak Express
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.end(JSON.stringify(data)); };

  // Parse query
  req.query = Object.fromEntries(parsed.searchParams.entries());

  if (!handler) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  try { await handler(req, res); }
  catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(3001, () => console.log('API server: http://localhost:3001'));
