const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.PORT) || 8787;
const HOST = "0.0.0.0";
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "shared-files");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function send(res, status, data, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function safeName(name) {
  return path.basename(name).replace(/[^\w.\- ()]/g, "_").slice(0, 150) || "file";
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Website open karna
  if (req.method === "GET" && url.pathname === "/") {
    const htmlPath = path.join(ROOT, "index.html");

    if (!fs.existsSync(htmlPath)) {
      return send(res, 404, "index.html nahi mili. File ka naam check karo.");
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(htmlPath).pipe(res);
  }

  // Shared files ki list
  if (req.method === "GET" && url.pathname === "/api/files") {
    try {
      const files = fs.readdirSync(UPLOAD_DIR)
        .filter(name => fs.statSync(path.join(UPLOAD_DIR, name)).isFile())
        .map(name => ({
          name,
          displayName: name.replace(/^\d+_/, ""),
          size: fs.statSync(path.join(UPLOAD_DIR, name)).size,
          url: "/download/" + encodeURIComponent(name)
        }));

      return send(res, 200, JSON.stringify(files), "application/json; charset=utf-8");
    } catch {
      return send(res, 500, JSON.stringify({ error: "Files list nahi mil saki" }), "application/json");
    }
  }

  // File upload
  if (req.method === "POST" && url.pathname === "/api/upload") {
    const originalName = safeName(
      decodeURIComponent(req.headers["x-file-name"] || "file")
    );

    const storedName = Date.now() + "_" + originalName;
    const destination = path.join(UPLOAD_DIR, storedName);
    const output = fs.createWriteStream(destination, { flags: "wx" });

    req.pipe(output);

    output.on("finish", () => {
      return send(
        res,
        200,
        JSON.stringify({ success: true, filename: storedName }),
        "application/json; charset=utf-8"
      );
    });

    output.on("error", () => {
      try {
        fs.unlinkSync(destination);
      } catch {}
      if (!res.headersSent) send(res, 500, "File save nahi ho saki");
    });

    req.on("aborted", () => {
      output.destroy();
      try {
        fs.unlinkSync(destination);
      } catch {}
    });

    return;
  }

  // File download
  if (req.method === "GET" && url.pathname.startsWith("/download/")) {
    let requestedName;

    try {
      requestedName = decodeURIComponent(url.pathname.slice("/download/".length));
    } catch {
      return send(res, 400, "Invalid file name");
    }

    const name = path.basename(requestedName);
    if (!name || name !== requestedName || name.includes("..")) {
      return send(res, 400, "Invalid file name");
    }

    const filePath = path.join(UPLOAD_DIR, name);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return send(res, 404, "File nahi mili");
    }

    const originalName = name.replace(/^\d+_/, "").replace(/["\r\n]/g, "_");

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": fs.statSync(filePath).size,
      "Content-Disposition": `attachment; filename="${originalName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store"
    });

    return fs.createReadStream(filePath).pipe(res);
  }

  return send(res, 404, "Page nahi mili");
});

server.listen(PORT, HOST, () => {
  console.log("\n================================");
  console.log(" QuickShare successfully started!");
  console.log("================================");
  console.log(`Is laptop par: http://localhost:${PORT}`);

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const net of interfaces || []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`Doosre laptop par: http://${net.address}:${PORT}`);
      }
    }
  }

  console.log("\nDono laptops same Wi-Fi par hone chahiye.");
  console.log("Band karne ke liye Ctrl + C dabao.\n");
});