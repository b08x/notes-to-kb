
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  AlignmentType,
  FileChild,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
  TableLayoutType,
} from "docx";

export class DocxGenerator {
  /**
   * Converts HTML string to a structured Standard-compliant DOCX Blob.
   */
  async generate(htmlString: string): Promise<Blob> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const body = doc.body;

    const children: FileChild[] = [];

    // Traverse top-level elements
    for (const node of Array.from(body.children)) {
      const parsedNodes = await this.parseNode(node);
      if (parsedNodes) {
        if (Array.isArray(parsedNodes)) {
          children.push(...parsedNodes);
        } else {
          children.push(parsedNodes);
        }
      }
    }

    const docx = new Document({
      styles: {
        paragraphStyles: [
          {
            id: "DocTitle",
            name: "Title",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 48, // 24pt
              bold: true,
              color: "000000",
            },
            paragraph: {
              spacing: { after: 300 }, 
              alignment: AlignmentType.LEFT,
            },
          },
          {
            id: "Heading1",
            name: "Heading 1", // Major Phase (H2)
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 36, // 18pt
              bold: true,
              color: "000000",
            },
            paragraph: {
              spacing: { before: 400, after: 200 },
              border: {
                bottom: { color: "E5E7EB", space: 1, style: BorderStyle.SINGLE, size: 6 },
              },
            },
          },
          {
            id: "Heading2",
            name: "Heading 2", // Step Header (H3)
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 28, // 14pt
              bold: true,
              color: "000000",
            },
            paragraph: {
              spacing: { before: 300, after: 150 },
            },
          },
          {
            id: "Heading3", 
            name: "Heading 3", // Task Header (H4)
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
               font: "Arial",
               size: 24, // 12pt
               bold: true,
               color: "374151"
            },
            paragraph: {
                spacing: { before: 200, after: 100 }
            }
          },
          {
            id: "Normal",
            name: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 20, // 10pt (Standard for professional docs)
              color: "1F2937",
            },
            paragraph: {
              spacing: { line: 276, before: 0, after: 160 }, // 1.15 line spacing
              alignment: AlignmentType.LEFT,
            },
          },
          {
             id: "Subtitle",
             name: "Subtitle",
             basedOn: "Normal",
             next: "Normal",
             quickFormat: true,
             run: {
                 font: "Courier New",
                 size: 18, // 9pt
                 color: "6B7280"
             },
             paragraph: {
                 spacing: { after: 300 }
             }
          }
        ],
      },
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
    });

    return await Packer.toBlob(docx);
  }

  private async parseNode(element: Element): Promise<FileChild | FileChild[] | null> {
    const tagName = element.tagName.toLowerCase();
    
    if (['style', 'script', 'head', 'meta', 'link', 'title', 'noscript'].includes(tagName)) {
        return null;
    }

    switch (tagName) {
      case "h1":
        return new Paragraph({ text: element.textContent || "", style: "DocTitle" });

      case "h2":
        return new Paragraph({ text: element.textContent || "", heading: HeadingLevel.HEADING_1 });

      case "h3":
        return new Paragraph({ text: element.textContent || "", heading: HeadingLevel.HEADING_2 });
      
      case "h4":
         return new Paragraph({ text: element.textContent || "", heading: HeadingLevel.HEADING_3 });

      case "p":
        if (element.classList.contains('metadata')) {
            return new Paragraph({ children: this.parseInlineChildren(element), style: "Subtitle" });
        }
        return new Paragraph({ children: this.parseInlineChildren(element), style: "Normal" });

      case "ul":
      case "ol":
        return this.parseList(element, 0);

      case "table":
        return this.parseTable(element as HTMLTableElement);

      case "img":
        return this.createImageRun(element as HTMLImageElement);
      
      case "div":
        if (element.classList.contains('warning-box') || element.classList.contains('warning')) {
           const paragraphs: Paragraph[] = [];
           const childElements = Array.from(element.children);
           for (const child of childElements) {
               const parsed = await this.parseNode(child);
               if (parsed) {
                   if (Array.isArray(parsed)) {
                       // Force style on all children of warning box
                       parsed.forEach(p => {
                           if (p instanceof Paragraph) {
                               p.addChildToStart(new TextRun({ text: "⚠️ ", bold: true }));
                           }
                       });
                       paragraphs.push(...parsed as Paragraph[]);
                   } else if (parsed instanceof Paragraph) {
                       paragraphs.push(parsed);
                   }
               }
           }
           return paragraphs;
        }
        if (element.textContent?.trim()) {
            const children = await Promise.all(Array.from(element.children).map(c => this.parseNode(c)));
            return children.flat().filter(c => c !== null) as FileChild[];
        }
        return null;

      default:
        if (element.textContent?.trim() && element.childNodes.length > 0) {
             return new Paragraph({ children: this.parseInlineChildren(element), style: "Normal" });
        }
        return null;
    }
  }

  private parseList(listEl: Element, level: number): Paragraph[] {
    const isOrdered = listEl.tagName.toLowerCase() === 'ol';
    const items: Paragraph[] = [];

    for (const li of Array.from(listEl.children)) {
      if (li.tagName.toLowerCase() === 'li') {
        // Collect text parts before any nested list
        const textParts: Element[] = [];
        const nestedLists: Element[] = [];
        
        li.childNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                if (['ul', 'ol'].includes(el.tagName.toLowerCase())) {
                    nestedLists.push(el);
                } else {
                    textParts.push(el);
                }
            }
        });

        items.push(new Paragraph({
          children: this.parseInlineChildren(li, true), // Filter out nested list elements from inline
          bullet: !isOrdered ? { level } : undefined,
          numbering: isOrdered ? { reference: "decimal-numbering", level } : undefined,
          style: "Normal",
          indent: { left: 720 * (level + 1) }
        }));

        // Handle nested
        nestedLists.forEach(nested => {
            items.push(...this.parseList(nested, level + 1));
        });
      }
    }
    return items;
  }

  private parseTable(tableEl: HTMLTableElement): Table {
    const rows: TableRow[] = [];
    const htmlRows = Array.from(tableEl.rows);

    for (const htmlRow of htmlRows) {
        const cells: TableCell[] = [];
        const htmlCells = Array.from(htmlRow.cells);

        for (const htmlCell of htmlCells) {
            cells.push(new TableCell({
                children: [new Paragraph({
                    children: this.parseInlineChildren(htmlCell),
                    style: "Normal",
                    spacing: { after: 0 }
                })],
                verticalAlign: VerticalAlign.CENTER,
                shading: htmlRow.parentElement?.tagName.toLowerCase() === 'thead' ? { fill: "F3F4F6", type: "solid", color: "F3F4F6" } : undefined,
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                },
                margins: { top: 100, bottom: 100, left: 100, right: 100 }
            }));
        }
        rows.push(new TableRow({ children: cells }));
    }

    return new Table({
        rows: rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.AUTOFIT,
        borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: "D1D5DB" },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: "D1D5DB" },
            left: { style: BorderStyle.SINGLE, size: 2, color: "D1D5DB" },
            right: { style: BorderStyle.SINGLE, size: 2, color: "D1D5DB" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
        }
    });
  }

  private parseInlineChildren(element: Element, skipLists = false): (TextRun | ImageRun)[] {
    const runs: (TextRun | ImageRun)[] = [];
    
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent?.trim() || node.textContent === " ") {
          runs.push(new TextRun({
             text: node.textContent,
             font: "Arial",
             size: 20
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        
        if (skipLists && ['ul', 'ol'].includes(tagName)) return;

        if (tagName === 'strong' || tagName === 'b') {
            runs.push(new TextRun({ text: el.textContent || "", bold: true, font: "Arial", size: 20 }));
        } else if (tagName === 'code') {
            runs.push(new TextRun({ text: el.textContent || "", font: "Courier New", size: 18, color: "3B82F6", shading: { fill: "F3F4F6" } }));
        } else if (tagName === 'br') {
            runs.push(new TextRun({ text: "", break: 1 }));
        } else if (tagName === 'img') {
            // We can't await inside sync loop easily, but ImageRun can take buffer if we pre-processed.
            // For inline images, we usually skip or treat as blocks in this parser version.
        } else {
             runs.push(new TextRun({ text: el.textContent || "", font: "Arial", size: 20 }));
        }
      }
    });

    return runs;
  }

  private async createImageRun(img: HTMLImageElement): Promise<Paragraph | null> {
    const src = img.src;
    if (!src) return null;

    try {
        let imageBuffer: ArrayBuffer;
        let naturalWidth = 0;
        let naturalHeight = 0;

        if (src.startsWith('data:')) {
            const base64Data = src.split(',')[1];
            const binaryString = window.atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            imageBuffer = bytes.buffer;

            await new Promise<void>((resolve) => {
                const tempImg = new Image();
                tempImg.onload = () => {
                    naturalWidth = tempImg.naturalWidth;
                    naturalHeight = tempImg.naturalHeight;
                    resolve();
                };
                tempImg.onerror = () => {
                     naturalWidth = 400; 
                     naturalHeight = 300;
                     resolve();
                };
                tempImg.src = src;
            });

        } else {
             return new Paragraph({ text: `[Image: ${img.alt || 'External Asset'}]`, style: "Normal" });
        }

        const MAX_WIDTH = 550; // Points
        let finalWidth = naturalWidth;
        let finalHeight = naturalHeight;

        if (naturalWidth > MAX_WIDTH) {
            const scaleFactor = MAX_WIDTH / naturalWidth;
            finalWidth = MAX_WIDTH;
            finalHeight = Math.round(naturalHeight * scaleFactor);
        }

        return new Paragraph({
            children: [
                new ImageRun({
                    data: imageBuffer,
                    transformation: { width: finalWidth, height: finalHeight }
                })
            ],
            spacing: { before: 200, after: 200 },
            alignment: AlignmentType.CENTER
        });

    } catch (e) {
        return new Paragraph({ text: "[Image Asset Reference Missing]" });
    }
  }
}
