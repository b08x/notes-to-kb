
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
    
    // Ignore non-content tags
    if (['style', 'script', 'head', 'meta', 'link', 'title', 'noscript'].includes(tagName)) {
        return null;
    }

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
        // Generic div fallthrough - if it has content, treat as paragraph
        if (element.textContent?.trim() && !element.querySelector('p, div, ul, ol, h1, h2, h3, h4')) {
             return new Paragraph({
                children: this.parseInlineChildren(element),
                style: "Normal"
            });
        }
        return null;

      default:
        // Fallback for unknown block elements that contain text
        if (element.textContent?.trim() && element.childNodes.length > 0) {
            // Check if it's just text or inline nodes
            const hasBlockChildren = Array.from(element.children).some(c => 
                ['p', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'table'].includes(c.tagName.toLowerCase())
            );
            
            if (!hasBlockChildren) {
                 return new Paragraph({
                    children: this.parseInlineChildren(element),
                    style: "Normal"
                 });
            }
        }
        return null;
    }
  }

  private parseInlineChildren(element: Element): (TextRun | ImageRun)[] {
    const runs: (TextRun | ImageRun)[] = [];
    
    // Attempt to extract inline styles from the parent element to pass down to children text
    const htmlEl = element as HTMLElement;
    let inheritedColor: string | undefined = undefined;
    let inheritedSize: number | undefined = undefined;

    if (htmlEl.style) {
        if (htmlEl.style.color) {
            inheritedColor = this.parseColor(htmlEl.style.color);
        }
        if (htmlEl.style.fontSize) {
            inheritedSize = this.parseFontSize(htmlEl.style.fontSize);
        }
    }

    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
          runs.push(new TextRun({
             text: node.textContent,
             font: "Arial",
             size: inheritedSize || 22,
             color: inheritedColor || undefined
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        
        // Check local styles for the inline element
        const childHtmlEl = el as HTMLElement;
        let childColor = inheritedColor;
        let childSize = inheritedSize || 22;

        if (childHtmlEl.style) {
            if (childHtmlEl.style.color) {
                const c = this.parseColor(childHtmlEl.style.color);
                if (c) childColor = c;
            }
            if (childHtmlEl.style.fontSize) {
                const s = this.parseFontSize(childHtmlEl.style.fontSize);
                if (s) childSize = s;
            }
        }

        if (tagName === 'strong' || tagName === 'b') {
            runs.push(new TextRun({
                text: el.textContent || "",
                bold: true,
                font: "Arial",
                size: childSize,
                color: childColor
            }));
        } else if (tagName === 'code') {
            runs.push(new TextRun({
                text: el.textContent || "",
                font: "Courier New",
                size: childSize,
                color: childColor
            }));
        } else if (tagName === 'span') {
             // Handle span with warning class specifically
            if (el.classList.contains('warning')) {
                runs.push(new TextRun({
                    text: el.textContent || "",
                    bold: true,
                    color: "FF0000",
                    font: "Arial",
                    size: childSize
                }));
            } else {
                // Generic span, apply styles
                runs.push(new TextRun({
                    text: el.textContent || "",
                    font: "Arial",
                    size: childSize,
                    color: childColor
                }));
            }
        } else if (tagName === 'br') {
            runs.push(new TextRun({
                text: "\n"
            }));
        } else {
             runs.push(new TextRun({
                 text: el.textContent || "",
                 font: "Arial",
                 size: childSize,
                 color: childColor
             }));
        }
      }
    });

    return runs;
  }

  private parseColor(color: string): string | undefined {
      if (!color) return undefined;
      // Handle hex
      if (color.startsWith('#')) return color.substring(1);
      // Handle rgb
      if (color.startsWith('rgb')) {
          const match = color.match(/\d+/g);
          if (match && match.length >= 3) {
              const r = parseInt(match[0]).toString(16).padStart(2, '0');
              const g = parseInt(match[1]).toString(16).padStart(2, '0');
              const b = parseInt(match[2]).toString(16).padStart(2, '0');
              return `${r}${g}${b}`;
          }
      }
      return undefined;
  }

  private parseFontSize(sizeStr: string): number | undefined {
      if (!sizeStr) return undefined;
      const match = sizeStr.match(/(\d+(\.\d+)?)/);
      if (match) {
          const val = parseFloat(match[1]);
          // Approximate conversion: 1px = 1.5 half-points (assuming 96dpi where 1px=0.75pt, and docx uses half-points)
          // 16px -> 12pt -> 24 half-points.
          return Math.round(val * 1.5);
      }
      return undefined;
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

        // Check if inline styles have width override
        if (img.style && img.style.width) {
             const w = parseFloat(img.style.width);
             if (!isNaN(w)) {
                 // Assume pixel intent, but check if it's small or large
                 // If user set style="width: 50%", we can't easily parse that without context
                 // But visual editor sets pixels? Or %?
                 // The visual editor sets style.maxWidth?
                 // Let's stick to natural dimensions logic capped at MAX_WIDTH for robustness
             }
        }
        
        // Simple resizing
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
