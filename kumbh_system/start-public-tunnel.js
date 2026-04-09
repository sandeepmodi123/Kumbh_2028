const fs = require('fs');
const path = require('path');
const localtunnel = require('localtunnel');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 8090 });
    const out = {
      url: tunnel.url,
      createdAt: new Date().toISOString()
    };
    const outPath = path.join(__dirname, 'public_tunnel_url.txt');
    fs.writeFileSync(outPath, `${out.url}\n${out.createdAt}\n`, 'utf8');
    console.log(`PUBLIC_URL ${out.url}`);

    tunnel.on('close', () => {
      fs.appendFileSync(outPath, 'TUNNEL_CLOSED\n', 'utf8');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      await tunnel.close();
      process.exit(0);
    });
  } catch (err) {
    console.error('TUNNEL_ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
