
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
              size: 56, // 28pt to match h1 3.5rem
              bold: true,
              color: "111827",
            },
            paragraph: {
              spacing: { before: 0, after: 600 }, 
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
              color: "111827",
            },
            paragraph: {
              spacing: { before: 800, after: 400 },
              alignment: AlignmentType.LEFT,
              border: {
                left: { color: "3B82F6", space: 12, style: BorderStyle.SINGLE, size: 36 },
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
              spacing: { before: 600, after: 300 },
              alignment: AlignmentType.LEFT,
            },
          },
          {
            id: "Normal",
            name: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 22, // 11pt
              color: "374151",
            },
            paragraph: {
              spacing: { line: 360, before: 0, after: 240 }, // 1.5 line spacing for readability
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
              size: 18, 
              color: "111827",
            },
            paragraph: {
              spacing: { before: 200, after: 200 },
              shading: { fill: "F3F4F6" },
              indent: { left: 400 },
              alignment: AlignmentType.LEFT,
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
              }
            },
          }
        ],
      },
      sections: [
        {
          properties: {
              page: {
                  margin: {
                      top: 1440, // 1 inch
                      right: 1440,
                      bottom: 1440,
                      left: 1440,
                  }
              }
          },
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

    // Specialized handler for the Metadata block to preserve layout in Word
    if (element.classList.contains('metadata')) {
        return this.parseMetadata(element);
    }

    switch (tagName) {
      case "h1":
        return new Paragraph({ text: element.textContent || "", style: "DocTitle" });

      case "h2":
        return new Paragraph({ text: element.textContent || "", style: "Heading1" });

      case "h3":
        return new Paragraph({ text: element.textContent || "", style: "Heading2" });

      case "p":
        return new Paragraph({ children: this.parseInline(element), style: "Normal" });

      case "ul":
      case "ol":
        return this.parseList(element, 0);

      case "table":
        return this.parseTable(element as HTMLTableElement);

      case "img":
        return this.createImageRun(element as HTMLImageElement);
      
      case "pre":
        return new Paragraph({ text: element.textContent || "", style: "CodeBlock" });

      case "section":
      case "article":
      case "div":
        const classes = Array.from(element.classList).map(c => c.toLowerCase());
        const isCallout = classes.some(c => 
          ['note', 'warning', 'info', 'alert', 'callout', 'warning-box', 'symptom', 'diagnosis', 'remediation'].includes(c)
        );

        if (isCallout) {
            return this.parseCallout(element);
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
                    children: [new TextRun({ text: childNode.textContent, font: "Arial", size: 22 })],
                    style: "Normal"
                }));
            }
        }
        return subNodes.length > 0 ? subNodes : null;

      default:
        if (element.textContent?.trim()) {
             return new Paragraph({ children: this.parseInline(element), style: "Normal" });
        }
        return null;
    }
  }

  /**
   * Transforms a flex-based metadata paragraph into a Word table for alignment.
   */
  private parseMetadata(element: Element): Table {
      const items = Array.from(element.querySelectorAll('span')).map(s => s.textContent || "");
      const rows: TableRow[] = [];
      
      // We group metadata in pairs to create a compact 2-column grid in Word
      for (let i = 0; i < items.length; i += 2) {
          const cells = [
              new TableCell({
                  children: [new Paragraph({ 
                      children: [new TextRun({ text: items[i], size: 18, color: "6B7280", font: "Courier New", bold: true })],
                      spacing: { after: 100 }
                  })],
                  borders: { top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }
              })
          ];
          
          if (items[i+1]) {
              cells.push(new TableCell({
                  children: [new Paragraph({ 
                      children: [new TextRun({ text: items[i+1], size: 18, color: "6B7280", font: "Courier New", bold: true })],
                      spacing: { after: 100 }
                  })],
                  borders: { top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }
              }));
          }

          rows.push(new TableRow({ children: cells }));
      }

      return new Table({
          rows: rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
              top: { style: BorderStyle.NIL },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "F3F4F6" },
              left: { style: BorderStyle.NIL },
              right: { style: BorderStyle.NIL },
              insideHorizontal: { style: BorderStyle.NIL },
              insideVertical: { style: BorderStyle.NIL },
          },
          columnWidths: [4500, 4500] // Roughly half and half
      });
  }

  private async parseCallout(element: Element): Promise<Table> {
    const children: FileChild[] = [];
    
    // We handle the content of callouts specifically to maintain styling
    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const parsed = await this.parseNode(el);
            if (parsed) {
                if (Array.isArray(parsed)) children.push(...parsed);
                else children.push(parsed as any);
            }
        } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            children.push(new Paragraph({
                children: [new TextRun({ text: node.textContent, size: 22 })],
                style: "Normal",
                spacing: { after: 120 }
            }));
        }
    }

    if (children.length === 0) children.push(new Paragraph(""));

    let borderColor = "3B82F6"; // Default Blue
    let bgColor = "F9FAFB"; // Soft Gray
    
    const lowerClasses = Array.from(element.classList).map(c => c.toLowerCase());
    if (lowerClasses.includes('warning') || lowerClasses.includes('alert') || lowerClasses.includes('warning-box')) {
        borderColor = "EF4444"; 
        bgColor = "FEF2F2"; 
    } else if (lowerClasses.includes('note') || lowerClasses.includes('info')) {
        borderColor = "3B82F6";
        bgColor = "F0F7FF";
    }

    return new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: children as any,
                        shading: { fill: bgColor },
                        borders: {
                            left: { style: BorderStyle.SINGLE, size: 36, color: borderColor },
                            top: { style: BorderStyle.NIL },
                            right: { style: BorderStyle.NIL },
                            bottom: { style: BorderStyle.NIL },
                        },
                        margins: { top: 300, bottom: 300, left: 400, right: 300 },
                        verticalAlign: VerticalAlign.TOP,
                    }),
                ],
            }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        spacing: { before: 400, after: 400 }
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
          children: this.parseInline(inlineContent, { font: "Arial", size: 22 }, true),
          bullet: !isOrdered ? { level } : undefined,
          numbering: isOrdered ? { reference: "decimal-numbering", level } : undefined,
          style: "Normal",
          indent: { left: 720 * (level + 1), hanging: 360 }
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
                shading: htmlRow.parentElement?.tagName.toLowerCase() === 'thead' ? { fill: "F3F4F6" } : undefined,
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                },
                margins: { top: 150, bottom: 150, left: 150, right: 150 }
            }));
        }
        rows.push(new TableRow({ children: cells }));
    }

    return new Table({
        rows: rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.AUTOFIT,
        spacing: { before: 400, after: 400 },
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

  private parseInline(node: Node, currentStyles: any = { font: "Arial", size: 22 }, skipLists = false): (TextRun | ImageRun)[] {
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
             return null;
        }

        const aspectRatio = naturalWidth / naturalHeight;
        let finalWidth = naturalWidth * 0.75; // px to pt
        let finalHeight = naturalHeight * 0.75;

        const MAX_WIDTH = 450; 
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
            spacing: { before: 400, after: 400 },
            alignment: AlignmentType.CENTER
        });
    } catch (e) {
        return null;
    }
  }
}
