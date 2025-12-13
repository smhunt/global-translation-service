import { createServer } from "https";
import { parse } from "url";
import next from "next";
import fs from "fs";
import path from "path";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3010", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync(path.join(process.cwd(), "certs", "key.pem")),
  cert: fs.readFileSync(path.join(process.cwd(), "certs", "cert.pem")),
};

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  }).listen(port, hostname, () => {
    console.log(`> Ready on https://dev.ecoworks.ca:${port}`);
    console.log(`> Also accessible via https://10.10.10.24:${port}`);
  });
});
