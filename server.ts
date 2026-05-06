import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Rota de Informações do Sistema
  app.get("/api/info", (req, res) => {
    res.json({
      status: "online",
      engine: "React AI Labs Proprietary v4.8",
      runtime: "AI Studio Client-Side SDK",
      uptime: process.uptime()
    });
  });

  // Middlewares Vite / Estáticos
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Servidor React AI Labs rodando em http://localhost:${PORT}`);
    console.log(`📡 Processamento de IA movido para o SDK Client-Side\n`);
  });
}

startServer();
