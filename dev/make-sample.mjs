import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFArray } from "pdf-lib";
import fs from "node:fs";

const doc = await PDFDocument.create();
doc.setTitle("Folio Sample Document");
doc.setAuthor("Folio PDF");
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";
const titles = ["Introduction", "Getting started", "Annotations", "Organizing pages", "Forms and signatures", "Appendix"];
for (let i = 0; i < 6; i++) {
  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.23, 0.51, 0.96) });
  page.drawText(`Chapter ${i + 1}: ${titles[i]}`, { x: 48, y: 760, size: 20, font: bold, color: rgb(1, 1, 1) });
  let y = 690;
  for (let line = 0; line < 14; line++) {
    const words = lorem.split(" ");
    const start = (line * 7 + i * 3) % words.length;
    const text = words.slice(start).concat(words.slice(0, start)).join(" ").slice(0, 95);
    page.drawText(text, { x: 48, y, size: 11, font, color: rgb(0.15, 0.15, 0.18) });
    y -= 22;
  }
  page.drawText(`Page ${i + 1} of 6`, { x: 270, y: 32, size: 9, font, color: rgb(0.5, 0.5, 0.55) });
  if (i === 4) {
    const form = doc.getForm();
    page.drawText("Name:", { x: 48, y: 330, size: 12, font: bold });
    const name = form.createTextField("name");
    name.addToPage(page, { x: 110, y: 320, width: 260, height: 26 });
    page.drawText("I agree:", { x: 48, y: 290, size: 12, font: bold });
    const agree = form.createCheckBox("agree");
    agree.addToPage(page, { x: 110, y: 284, width: 20, height: 20 });
    page.drawText("Signature:", { x: 48, y: 240, size: 12, font: bold });
    page.drawLine({ start: { x: 130, y: 236 }, end: { x: 420, y: 236 }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
  }
}
// Outline
const ctx = doc.context;
const outlineRef = ctx.nextRef();
const itemRefs = titles.map(() => ctx.nextRef());
const pages = doc.getPages();
itemRefs.forEach((ref, i) => {
  const dict = ctx.obj({
    Title: PDFString.of(`Chapter ${i + 1}: ${titles[i]}`),
    Parent: outlineRef,
    Dest: ctx.obj([pages[i].ref, PDFName.of("XYZ"), null, 792, null]),
  });
  if (i > 0) dict.set(PDFName.of("Prev"), itemRefs[i - 1]);
  if (i < itemRefs.length - 1) dict.set(PDFName.of("Next"), itemRefs[i + 1]);
  ctx.assign(ref, dict);
});
ctx.assign(outlineRef, ctx.obj({ Type: "Outlines", First: itemRefs[0], Last: itemRefs[itemRefs.length - 1], Count: itemRefs.length }));
doc.catalog.set(PDFName.of("Outlines"), outlineRef);
fs.writeFileSync("dev/sample.pdf", await doc.save());
console.log("wrote dev/sample.pdf", fs.statSync("dev/sample.pdf").size, "bytes");
