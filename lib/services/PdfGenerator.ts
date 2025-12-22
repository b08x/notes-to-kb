/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export class PdfGenerator {
  /**
   * Generates a PDF from a given HTML string and triggers download.
   */
  async generate(htmlString: string, filename: string): Promise<void> {
    // Create a temporary container to render the HTML
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px'; // Render width
    container.style.backgroundColor = '#ffffff';
    container.innerHTML = htmlString;
    document.body.appendChild(container);

    try {
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4',
        compress: true
      });

      // Standard A4 width in pt is ~595.
      // We scale the 800px width to fit within 515pt (allowing for margins).
      await pdf.html(container, {
        callback: (doc) => {
          doc.save(filename);
        },
        x: 40,
        y: 40,
        width: 515,
        windowWidth: 800,
        autoPaging: 'text', // Tries to avoid breaking in the middle of a line of text
        margin: [40, 40, 40, 40],
        html2canvas: {
          scale: 1, // Higher scale leads to larger file size but better quality
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        }
      });
    } catch (error) {
      console.error("PDF generation failed:", error);
      throw error;
    } finally {
      document.body.removeChild(container);
    }
  }
}