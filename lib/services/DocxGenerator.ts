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
  LevelFormat,
  AlignmentType,
  ConvertInchesToTwip,
  IParagraphOptions,
  FileChild,
  BorderStyle
} from "docx";

export class DocxGenerator {
  /**
   * Converts HTML string to a structured ServiceNow-compliant DOCX Blob.
   */
  async generate(htmlString: string): Promise<Blob> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const body = doc.body;

    const children: FileChild[] = [];

    // Traverse top-level elements
    for (const node of Array.from(body.children)) {
      const parsedNode = await this.parseNode(node);
      if (parsedNode) {
        if (Array.isArray(parsedNode)) {
          children.push(...parsedNode);
        } else {
          children.push(parsedNode);
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
              spacing: { after: 240 }, // 12pt
              alignment: AlignmentType.LEFT,
            },
          },
          {
            id: "Heading1",
            name: "Heading 1", // Maps to HTML H2 (Major Phase)
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
              spacing: { before: 240, after: 120 }, // 12pt before, 6pt after
            },
          },
          {
            id: "Heading2",
            name: "Heading 2", // Maps to HTML H3 (Step Header)
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
              spacing: { before: 240, after: 120 }, // 12pt before
            },
          },
          {
            id: "Heading3", 
            name: "Heading 3", // Maps to HTML H4 (Task Header)
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
               font: "Arial",
               size: 24, // 12pt
               bold: true,
               color: "000000"
            },
            paragraph: {
                spacing: { before: 240, after: 120 } // 12pt before
            }
          },
          {
            id: "Normal",
            name: "Normal",
            quickFormat: true,
            run: {
              font: "Arial",
              size: 22, // 11pt
              color: "000000",
            },
            paragraph: {
              spacing: { after: 200 }, // ~10pt
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
                 font: "Arial",
                 size: 20, // 10pt
                 color: "666666"
             },
             paragraph: {
                 spacing: { after: 240 }
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

    switch (tagName) {
      case "h1":
        // Document Title
        return new Paragraph({
          text: element.textContent || "",
          style: "DocTitle",
        });

      case "h2":
        // Major Phases -> Heading 1 (18pt)
        return new Paragraph({
          text: element.textContent || "",
          heading: HeadingLevel.HEADING_1,
        });

      case "h3":
        // Sequential Steps -> Heading 2 (14pt)
        return new Paragraph({
          text: element.textContent || "",
          heading: HeadingLevel.HEADING_2,
        });
      
      case "h4":
         // Specific Tasks -> Heading 3 (12pt)
         return new Paragraph({
             text: element.textContent || "",
             heading: HeadingLevel.HEADING_3
         });

      case "p":
        // Check for metadata class
        if (element.classList.contains('metadata')) {
            return new Paragraph({
                children: this.parseInlineChildren(element),
                style: "Subtitle"
            });
        }
        return new Paragraph({
          children: this.parseInlineChildren(element),
          style: "Normal",
        });

      case "ul":
        // Handle unordered lists
        const ulItems: Paragraph[] = [];
        for (const li of Array.from(element.children)) {
          if (li.tagName.toLowerCase() === 'li') {
            ulItems.push(new Paragraph({
              children: this.parseInlineChildren(li),
              bullet: {
                level: 0,
              },
              style: "Normal"
            }));
            
            // Handle nested lists inside LI
            const nestedUl = li.querySelector('ul');
            if (nestedUl) {
                for (const nestedLi of Array.from(nestedUl.children)) {
                    if (nestedLi.tagName.toLowerCase() === 'li') {
                        ulItems.push(new Paragraph({
                            children: this.parseInlineChildren(nestedLi),
                            bullet: {
                                level: 1
                            },
                            style: "Normal"
                        }));
                    }
                }
            }
          }
        }
        return ulItems;

      case "ol":
         // Handle ordered lists
         const olItems: Paragraph[] = [];
         for (const li of Array.from(element.children)) {
           if (li.tagName.toLowerCase() === 'li') {
             olItems.push(new Paragraph({
               children: this.parseInlineChildren(li),
               numbering: {
                 reference: "decimal-numbering",
                 level: 0,
               },
               style: "Normal"
             }));
           }
         }
         return olItems;

      case "img":
        return this.createImageRun(element as HTMLImageElement);
      
      case "div":
        if (element.classList.contains('warning-box') || element.classList.contains('warning')) {
           // Special handling for warning boxes - bold red text
           const paragraphs: Paragraph[] = [];
           const childPs = element.querySelectorAll('p');
           childPs.forEach(p => {
               paragraphs.push(new Paragraph({
                   children: [new TextRun({
                       text: p.textContent || "",
                       bold: true,
                       color: "FF0000", // Red
                       font: "Arial"
                   })],
               }));
           });
           const childUls = element.querySelectorAll('ul li');
           childUls.forEach(li => {
              paragraphs.push(new Paragraph({
                   children: [new TextRun({
                       text: li.textContent || "",
                       bold: true,
                       color: "FF0000",
                       font: "Arial"
                   })],
                   bullet: { level: 0 }
               }));
           });
           return paragraphs;
        }
        // Generic div fallthrough
        return new Paragraph({
            text: element.textContent || "",
            style: "Normal"
        });

      default:
        // Fallback for unknown block elements
        if (element.textContent?.trim()) {
           return new Paragraph({
               text: element.textContent || "",
               style: "Normal"
           });
        }
        return null;
    }
  }

  private parseInlineChildren(element: Element): (TextRun | ImageRun)[] {
    const runs: (TextRun | ImageRun)[] = [];
    
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
          runs.push(new TextRun({
             text: node.textContent,
             font: "Arial",
             size: 22
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        
        if (tagName === 'strong' || tagName === 'b') {
            runs.push(new TextRun({
                text: el.textContent || "",
                bold: true,
                font: "Arial",
                size: 22
            }));
        } else if (tagName === 'code') {
            runs.push(new TextRun({
                text: el.textContent || "",
                font: "Courier New",
                size: 22 // 11pt matches body
            }));
        } else if (tagName === 'span' && el.classList.contains('warning')) {
            runs.push(new TextRun({
                text: el.textContent || "",
                bold: true,
                color: "FF0000",
                font: "Arial",
                size: 22
            }));
        } else if (tagName === 'br') {
            runs.push(new TextRun({
                text: "\n"
            }));
        } else {
             runs.push(new TextRun({
                 text: el.textContent || "",
                 font: "Arial",
                 size: 22
             }));
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
        
        // Dimensions
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

            // Load image to get dimensions
            await new Promise<void>((resolve, reject) => {
                const tempImg = new Image();
                tempImg.onload = () => {
                    naturalWidth = tempImg.naturalWidth;
                    naturalHeight = tempImg.naturalHeight;
                    resolve();
                };
                tempImg.onerror = () => {
                     // If loading fails, fallback to defaults
                     console.warn("Could not load image to get dimensions");
                     naturalWidth = 400; 
                     naturalHeight = 300;
                     resolve();
                };
                tempImg.src = src;
            });

        } else {
             return new Paragraph({
                 text: `[Image: ${img.alt || 'External Image'}]`,
                 style: "Normal"
             });
        }

        // Scale proportionally
        const MAX_WIDTH = 650;
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
                    transformation: {
                        width: finalWidth,
                        height: finalHeight
                    }
                })
            ],
            spacing: { after: 120 }, // 6pt spacing
            alignment: AlignmentType.CENTER // Spec says Center aligned
        });

    } catch (e) {
        console.warn("Failed to process image for DOCX", e);
        return new Paragraph({ text: "[Image Upload Failed]" });
    }
  }
}