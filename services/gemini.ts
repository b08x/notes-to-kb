
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { getSystemInstruction, GENERIC_SYSTEM_INSTRUCTION } from "../lib/prompts/kb-article";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    images?: { data: string; mimeType: string }[];
}

export interface Attachment {
    data: string; // base64
    mimeType: string;
    id?: string;
}

export async function bringToLife(
    history: ChatMessage[], 
    currentPrompt: string, 
    attachments: Attachment[] = [],
    templateType: string = 'auto',
    onChunk?: (text: string) => void,
    modelName: string = 'gemini-3-pro-preview'
): Promise<string> {
  const parts: any[] = [];
  
  // Construct context from history
  if (history.length > 0) {
      parts.push({ text: "HISTORY OF CONVERSATION:\n" });
      history.forEach(msg => {
          parts.push({ text: `${msg.role.toUpperCase()}: ${msg.text}\n` });
          if (msg.images && msg.images.length > 0) {
              msg.images.forEach(img => {
                  parts.push({
                      inlineData: {
                          data: img.data,
                          mimeType: img.mimeType
                      }
                  });
              });
          }
      });
      parts.push({ text: "END HISTORY\n\n" });
  }

  // Determine context to select the right prompt
  const combinedText = (currentPrompt + " " + history.map(h => h.text).join(" ")).toLowerCase();
  const isKBContext = combinedText.includes("kb") || 
                      combinedText.includes("article") || 
                      combinedText.includes("documentation") || 
                      combinedText.includes("troubleshoot") || 
                      combinedText.includes("guide");

  // Logic: If explicitly asking for generic generation (e.g. "make a game"), use Generic.
  // Otherwise, if it's KB context OR a specific KB template is selected, use KB logic.
  let systemInstruction = GENERIC_SYSTEM_INSTRUCTION;
  
  if (isKBContext || templateType !== 'auto') {
      systemInstruction = getSystemInstruction(templateType, combinedText);
  }

  let finalPrompt = attachments.length > 0
    ? `NEW REQUEST: ${currentPrompt || (isKBContext ? `Convert these documents into a ${templateType === 'auto' ? 'Standard KB Article' : templateType.toUpperCase() + ' document'}.` : "Bring this idea to life.")}`
    : `NEW REQUEST: ${currentPrompt}`;

  // Inject Image IDs into the prompt text if provided
  if (attachments.length > 0) {
      const ids = attachments.filter(a => a.id).map(a => `ID: "${a.id}"`).join(", ");
      if (ids) {
          finalPrompt = `[System: The following images have IDs: ${ids}]\n` + finalPrompt;
      }
  }

  parts.push({ text: finalPrompt });

  // Add all current attachments
  attachments.forEach(att => {
      parts.push({
          inlineData: {
              data: att.data,
              mimeType: att.mimeType,
          },
      });
  });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.5,
      },
    });

    let fullText = "";
    for await (const chunk of responseStream) {
        const textChunk = chunk.text;
        if (textChunk) {
            fullText += textChunk;
            if (onChunk) {
                onChunk(fullText);
            }
        }
    }

    let text = fullText || "<!-- Failed to generate content -->";

    // CLEANUP LOGIC: Strip markdown fences and conversational preambles
    
    // 1. Remove Markdown Fences first (often wraps the code)
    text = text.replace(/^```html\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');

    // 2. Find the start of the HTML document
    const doctypeIdx = text.indexOf('<!DOCTYPE');
    const htmlIdx = text.indexOf('<html');
    
    // Determine the earliest valid start tag
    let startIdx = -1;
    if (doctypeIdx !== -1 && htmlIdx !== -1) {
        startIdx = Math.min(doctypeIdx, htmlIdx);
    } else if (doctypeIdx !== -1) {
        startIdx = doctypeIdx;
    } else if (htmlIdx !== -1) {
        startIdx = htmlIdx;
    }

    // 3. Slice if we found a valid start (removes "Here is your code:" text)
    if (startIdx > 0) {
        text = text.substring(startIdx);
    }

    return text;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
}
