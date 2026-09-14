import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from "pdf-lib";
import fs from "node:fs";
const file = process.argv[2];
const doc = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
console.log("pages:", doc.getPageCount(), "size:", fs.statSync(file).size);
doc.getPages().forEach((p, i) => {
  const annots = p.node.Annots();
  if (!annots) return;
  const list = [];
  for (let k = 0; k < annots.size(); k++) {
    const a = doc.context.lookup(annots.get(k));
    if (!(a instanceof PDFDict)) continue;
    const sub = a.get(PDFName.of("Subtype"))?.toString();
    const contents = a.get(PDFName.of("Contents"));
    const text = contents instanceof PDFHexString ? contents.decodeText() : contents instanceof PDFString ? contents.decodeText() : "";
    list.push(`${sub}${text ? ` "${text}"` : ""}`);
  }
  console.log(`page ${i + 1}: ${list.join(" | ")}`);
});
