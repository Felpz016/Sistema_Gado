// Gera a pasta dist/ pronta para publicar.  Uso: npm run build   (ou npm run dev para testar em http://localhost:8080)
// dist/           site de vendas
// dist/app/       o sistema (funciona sem internet)
import { build, context } from "esbuild";
import { cpSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const serve = process.argv.includes("--serve");
rmSync("dist", { recursive: true, force: true });
cpSync("public", "dist/app", { recursive: true });
cpSync("site", "dist", { recursive: true }); // site de vendas na raiz, sistema em /app/

const opts = {
  entryPoints: { app: "src/main.js" },
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  sourcemap: false,
  target: ["es2020", "safari14"],
  outdir: "dist/app",
  chunkNames: "chunks/[name]-[hash]",
  legalComments: "linked",
};
await build(opts);

// Service worker com a lista de arquivos e uma versão que muda quando qualquer arquivo muda.
const arquivos = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (!/\.(map|txt|LEGAL\.txt)$/.test(f) && f !== "sw.js") arquivos.push(p);
});
walk("dist/app");
const h = createHash("sha256");
arquivos.sort().forEach((f) => h.update(readFileSync(f)));
const versao = h.digest("hex").slice(0, 12);
const lista = ["./", ...arquivos.map((f) => "./" + relative("dist/app", f).replaceAll("\\", "/"))];
writeFileSync("dist/app/sw.js", readFileSync("sw.template.js", "utf8")
  .replace("__VERSAO__", versao)
  .replace("__ARQUIVOS__", JSON.stringify(lista, null, 2)));
console.log(`dist/ pronto · versão ${versao} · ${lista.length} arquivos no cache`);

if (serve) {
  const ctx = await context(opts);
  const { port } = await ctx.serve({ servedir: "dist", port: 8080 });
  console.log(`Site em http://localhost:${port} · sistema em http://localhost:${port}/app/`);
}
