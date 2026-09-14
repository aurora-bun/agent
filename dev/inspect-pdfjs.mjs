import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const [file, password] = process.argv.slice(2);
const data = new Uint8Array(fs.readFileSync(file));
const pdf = await getDocument({ data, password, standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" }).promise;
const info = (await pdf.getMetadata()).info;
console.log("pages:", pdf.numPages, "encrypt:", info.EncryptFilterName);
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const annots = await page.getAnnotations();
  if (annots.length) console.log(`page ${i}:`, annots.map(a => a.subtype + (a.contentsObj?.str ? ` "${a.contentsObj.str}"` : "")).join(" | "));
}
await pdf.loadingTask.destroy();
