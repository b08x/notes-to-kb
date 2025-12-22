
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
      
      case "svg":
        return this.createImageRunFromSvg(element as SVGSVGElement);
      
      case "div":
        const classes = Array.from(element.classList);
        const isCallout = classes.some(c => 
          ['note', 'warning', 'info', 'alert', 'callout', 'warning-box'].includes(c.toLowerCase())
        );

        if (isCallout) {
            return this.parseCallout(element);
        }

        // Special check for graphics containers
        if (element.classList.contains('ai-diagram') || element.classList.contains('flowchart')) {
            const svg = element.querySelector('svg');
            if (svg) return this.createImageRunFromSvg(svg);
        }

        // For generic divs, recurse into elements but also handle direct text nodes
        const subNodes: FileChild[] = [];
        for (const childNode of Array.from(element.childNodes)) {
            if (childNode.nodeType === Node.ELEMENT_NODE) {
                const parsed = await this.parseNode(childNode as Element);
                if (parsed) {
                    if (Array.isArray(parsed)) subNodes.push(...parsed);
                    else subNodes.push(parsed);
                }
            } else if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent?.trim()) {
                subNodes.push(new Paragraph({
                    children: [new TextRun({ text: childNode.textContent, font: "Arial", size: 20 })],
                    style: "Normal"
                }));
            }
        }
        return subNodes.length > 0 ? subNodes : null;

      default:
        if (element.textContent?.trim() && element.childNodes.length > 0) {
             return new Paragraph({ children: this.parseInlineChildren(element), style: "Normal" });
        }
        return null;
    }
  }

  private async parseCallout(element: Element): Promise<Table> {
    const children: FileChild[] = [];
    
    // We must handle mixed content: text nodes and elements.
    // Example: <div class="note"><strong>Note:</strong> some text here</div>
    const currentInlineRuns: (TextRun | ImageRun)[] = [];

    const flushInlineRuns = () => {
        if (currentInlineRuns.length > 0) {
            children.push(new Paragraph({
                children: [...currentInlineRuns],
                style: "Normal",
                spacing: { before: 0, after: 100 }
            }));
            currentInlineRuns.length = 0;
        }
    };

    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent?.trim() || node.textContent === " ") {
                currentInlineRuns.push(new TextRun({
                    text: node.textContent,
                    font: "Arial",
                    size: 20
                }));
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const tagName = el.tagName.toLowerCase();

            // If it's an inline formatting tag, add it to current runs
            if (['strong', 'b', 'i', 'em', 'code', 'span', 'a'].includes(tagName)) {
                currentInlineRuns.push(...this.parseInlineChildren(el));
            } else {
                // It's a block element (p, ul, table). Flush existing text first.
                flushInlineRuns();
                const parsed = await this.parseNode(el);
                if (parsed) {
                    if (Array.isArray(parsed)) children.push(...parsed);
                    else children.push(parsed);
                }
            }
        }
    }
    flushInlineRuns();

    // Determine visual style based on class
    let borderColor = "3B82F6"; // Default Blue (Note/Info)
    let bgColor = "F0F7FF"; // Very light blue
    
    const lowerClasses = Array.from(element.classList).map(c => c.toLowerCase());
    if (lowerClasses.includes('warning') || lowerClasses.includes('alert') || lowerClasses.includes('warning-box')) {
        borderColor = "EF4444"; // Red (Warning/Alert)
        bgColor = "FEF2F2"; // Very light red
    }

    return new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: children as any,
                        shading: { fill: bgColor },
                        borders: {
                            left: { style: BorderStyle.SINGLE, size: 30, color: borderColor },
                            top: { style: BorderStyle.NIL },
                            right: { style: BorderStyle.NIL },
                            bottom: { style: BorderStyle.NIL },
                        },
                        margins: { top: 200, bottom: 200, left: 300, right: 300 },
                        verticalAlign: VerticalAlign.CENTER,
                    }),
                ],
            }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        spacing: { before: 200, after: 200 }
    });
  }

  private parseList(listEl: Element, level: number): Paragraph[] {
    const isOrdered = listEl.tagName.toLowerCase() === 'ol';
    const items: Paragraph[] = [];

    for (const li of Array.from(listEl.children)) {
      if (li.tagName.toLowerCase() === 'li') {
        const nestedLists: Element[] = [];
        li.childNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                if (['ul', 'ol'].includes(el.tagName.toLowerCase())) {
                    nestedLists.push(el);
                }
            }
        });

        items.push(new Paragraph({
          children: this.parseInlineChildren(li, true),
          bullet: !isOrdered ? { level } : undefined,
          numbering: isOrdered ? { reference: "decimal-numbering", level } : undefined,
          style: "Normal",
          indent: { left: 720 * (level + 1) }
        }));

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
        } else if (tagName === 'i' || tagName === 'em') {
            runs.push(new TextRun({ text: el.textContent || "", italic: true, font: "Arial", size: 20 }));
        } else if (tagName === 'br') {
            runs.push(new TextRun({ text: "", break: 1 }));
        } else if (tagName === 'img') {
            // Usually images aren't inside inline contexts for technical docs but handled just in case
        } else {
             runs.push(new TextRun({ text: el.textContent || "", font: "Arial", size: 20 }));
        }
      }
    });

    return runs;
  }

  private async createImageRunFromSvg(svgEl: SVGSVGElement): Promise<Paragraph | null> {
    try {
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
        const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        await new Promise<void>((resolve, reject) => {
            img.onload = () => {
                const scale = 2; // Better resolution
                canvas.width = (img.width || 800) * scale;
                canvas.height = (img.height || 600) * scale;
                if (ctx) {
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }
                resolve();
            };
            img.onerror = reject;
            img.src = dataUrl;
        });

        const pngBase64 = canvas.toDataURL('image/png').split(',')[1];
        const binaryString = window.atob(pngBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const MAX_WIDTH = 500;
        let finalWidth = img.width || 400;
        let finalHeight = img.height || 300;
        if (finalWidth > MAX_WIDTH) {
            const ratio = MAX_WIDTH / finalWidth;
            finalWidth = MAX_WIDTH;
            finalHeight = finalHeight * ratio;
        }

        return new Paragraph({
            children: [
                new ImageRun({
                    data: bytes.buffer,
                    transformation: { width: finalWidth, height: finalHeight }
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
        });
    } catch (e) {
        console.error("Failed to convert SVG to Image for DOCX", e);
        return new Paragraph({ text: "[Technical Diagram: SVG Conversion Error]" });
    }
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
