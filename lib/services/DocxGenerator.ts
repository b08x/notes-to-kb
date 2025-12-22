
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
              color: "111827",
            },
            paragraph: {
              spacing: { after: 400 }, 
              alignment: AlignmentType.LEFT,
            },
          },
          {
            id: "Heading1",
            name: "Heading 1", // Maps to H2 in our HTML
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 32, // 16pt
              bold: true,
              color: "1F2937",
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
            name: "Heading 2", // Maps to H3 in our HTML
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 24, // 12pt
              bold: true,
              color: "1F2937",
            },
            paragraph: {
              spacing: { before: 300, after: 150 },
            },
          },
          {
            id: "Normal",
            name: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 21, // ~10.5pt
              color: "374151",
            },
            paragraph: {
              spacing: { line: 276, before: 0, after: 160 }, // 1.15 line spacing
              alignment: AlignmentType.LEFT,
            },
          },
          {
            id: "CodeBlock",
            name: "Code Block",
            basedOn: "Normal",
            quickFormat: true,
            run: {
              font: "Courier New",
              size: 18, // 9pt
              color: "111827",
            },
            paragraph: {
              spacing: { before: 120, after: 120 },
              shading: { fill: "F3F4F6" },
              indent: { left: 240 },
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
              }
            },
          },
          {
             id: "Subtitle",
             name: "Subtitle", // Used for .metadata class
             basedOn: "Normal",
             next: "Normal",
             quickFormat: true,
             run: {
                 font: "Courier New",
                 size: 18, 
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

      case "p":
        if (element.classList.contains('metadata')) {
            return new Paragraph({ children: this.parseInline(element), style: "Subtitle" });
        }
        return new Paragraph({ children: this.parseInline(element), style: "Normal" });

      case "ul":
      case "ol":
        return this.parseList(element, 0);

      case "table":
        return this.parseTable(element as HTMLTableElement);

      case "img":
        return this.createImageRun(element as HTMLImageElement);
      
      case "svg":
        return this.createImageRunFromSvg(element as SVGSVGElement);
      
      case "pre":
        return new Paragraph({ text: element.textContent || "", style: "CodeBlock" });

      case "div":
        const classes = Array.from(element.classList).map(c => c.toLowerCase());
        const isCallout = classes.some(c => 
          ['note', 'warning', 'info', 'alert', 'callout', 'warning-box'].includes(c)
        );

        if (isCallout) {
            return this.parseCallout(element);
        }

        if (classes.includes('ai-diagram') || classes.includes('flowchart')) {
            const svg = element.querySelector('svg');
            if (svg) return this.createImageRunFromSvg(svg);
        }

        // Recursive block parsing
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
                    children: [new TextRun({ text: childNode.textContent, font: "Arial", size: 21 })],
                    style: "Normal"
                }));
            }
        }
        return subNodes.length > 0 ? subNodes : null;

      default:
        // Attempt to render unknown block tags as basic paragraphs
        if (element.textContent?.trim()) {
             return new Paragraph({ children: this.parseInline(element), style: "Normal" });
        }
        return null;
    }
  }

  private async parseCallout(element: Element): Promise<Table> {
    const children: FileChild[] = [];
    let currentInlineRuns: (TextRun | ImageRun)[] = [];

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
            const text = node.textContent;
            if (text) {
                currentInlineRuns.push(new TextRun({
                    text: text,
                    font: "Arial",
                    size: 21
                }));
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const tagName = el.tagName.toLowerCase();

            if (['strong', 'b', 'i', 'em', 'code', 'span', 'a', 'u', 's'].includes(tagName)) {
                currentInlineRuns.push(...this.parseInline(el));
            } else {
                flushInlineRuns();
                const parsed = await this.parseNode(el);
                if (parsed) {
                    if (Array.isArray(parsed)) children.push(...parsed);
                    else children.push(parsed as any);
                }
            }
        }
    }
    flushInlineRuns();

    let borderColor = "3B82F6"; 
    let bgColor = "F0F7FF"; 
    
    const lowerClasses = Array.from(element.classList).map(c => c.toLowerCase());
    if (lowerClasses.includes('warning') || lowerClasses.includes('alert') || lowerClasses.includes('warning-box')) {
        borderColor = "EF4444"; 
        bgColor = "FEF2F2"; 
    }

    return new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: (children.length > 0 ? children : [new Paragraph("")]) as any,
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
        spacing: { before: 300, after: 300 }
    });
  }

  private parseList(listEl: Element, level: number): Paragraph[] {
    const isOrdered = listEl.tagName.toLowerCase() === 'ol';
    const items: Paragraph[] = [];

    for (const li of Array.from(listEl.children)) {
      if (li.tagName.toLowerCase() === 'li') {
        const nestedLists: Element[] = [];
        const inlineContent = document.createElement('div');
        
        li.childNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                if (['ul', 'ol'].includes(el.tagName.toLowerCase())) {
                    nestedLists.push(el);
                } else {
                  inlineContent.appendChild(el.cloneNode(true));
                }
            } else {
              inlineContent.appendChild(node.cloneNode(true));
            }
        });

        items.push(new Paragraph({
          children: this.parseInline(inlineContent, { font: "Arial", size: 21 }, true),
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
                    children: this.parseInline(htmlCell),
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

  /**
   * Recursive inline parser to capture nested formatting.
   */
  private parseInline(node: Node, currentStyles: any = { font: "Arial", size: 21 }, skipLists = false): (TextRun | ImageRun)[] {
    const runs: (TextRun | ImageRun)[] = [];
    
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) {
          runs.push(new TextRun({
            text: child.textContent,
            ...currentStyles
          }));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        
        if (skipLists && (tag === 'ul' || tag === 'ol')) return;
        
        const nextStyles = { ...currentStyles };
        if (tag === 'strong' || tag === 'b') nextStyles.bold = true;
        if (tag === 'em' || tag === 'i') nextStyles.italic = true;
        if (tag === 'u') nextStyles.underline = {};
        if (tag === 's' || tag === 'strike' || tag === 'del') nextStyles.strike = true;
        if (tag === 'code') {
          nextStyles.font = "Courier New";
          nextStyles.size = 18;
          nextStyles.color = "3B82F6";
          nextStyles.shading = { fill: "F3F4F6" };
        }
        if (tag === 'br') {
          runs.push(new TextRun({ text: "", break: 1 }));
          return;
        }

        runs.push(...this.parseInline(el, nextStyles, skipLists));
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
                const scale = 2; 
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
        const bytes = new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i));

        const viewBox = svgEl.viewBox.baseVal;
        const width = viewBox.width || svgEl.width.baseVal.value || 400;
        const height = viewBox.height || svgEl.height.baseVal.value || 300;
        
        const MAX_WIDTH = 500; // Word points
        let finalWidth = width;
        let finalHeight = height;
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
        return new Paragraph({ text: "[Visual Asset Rendering Error]" });
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
            imageBuffer = new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i)).buffer;

            await new Promise<void>((resolve) => {
                const tempImg = new Image();
                tempImg.onload = () => {
                    naturalWidth = tempImg.naturalWidth;
                    naturalHeight = tempImg.naturalHeight;
                    resolve();
                };
                tempImg.onerror = () => { naturalWidth = 400; naturalHeight = 300; resolve(); };
                tempImg.src = src;
            });
        } else {
             return new Paragraph({ text: `[Image: ${img.alt || 'Asset Reference'}]` });
        }

        const parsePx = (val: string | null) => {
          if (!val) return null;
          const num = parseInt(val, 10);
          return isNaN(num) ? null : num;
        };

        const reqWidth = parsePx(img.getAttribute('width')) || parsePx(img.style.width);
        const reqHeight = parsePx(img.getAttribute('height')) || parsePx(img.style.height);
        
        const aspectRatio = naturalWidth / naturalHeight;
        let finalWidth = reqWidth || naturalWidth;
        let finalHeight = reqHeight || (reqWidth ? reqWidth / aspectRatio : naturalHeight);

        if (reqHeight && !reqWidth) {
          finalWidth = reqHeight * aspectRatio;
        }

        // Scale factor: Browser pixels to Word points
        finalWidth *= 0.75;
        finalHeight *= 0.75;

        // Content area width constraint (~500 points for A4/Letter)
        const MAX_WIDTH = 500; 
        if (finalWidth > MAX_WIDTH) {
            const scale = MAX_WIDTH / finalWidth;
            finalWidth = MAX_WIDTH;
            finalHeight *= scale;
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
        return new Paragraph({ text: "[Image Asset Data Missing]" });
    }
  }
}
