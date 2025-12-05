/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { KB_ARTICLE_SYSTEM_INSTRUCTION, GENERIC_SYSTEM_INSTRUCTION } from "../lib/prompts/kb-article";

// Using gemini-3-pro-preview for complex coding tasks.
const GEMINI_MODEL = 'gemini-3-pro-preview';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    image?: string; // base64
    mimeType?: string;
}

export async function bringToLife(
    history: ChatMessage[], 
    currentPrompt: string, 
    fileBase64?: string, 
    mimeType?: string,
    fileId?: string
): Promise<string> {
  const parts: any[] = [];
  
  // Construct context from history
  if (history.length > 0) {
      parts.push({ text: "HISTORY OF CONVERSATION:\n" });
      history.forEach(msg => {
          parts.push({ text: `${msg.role.toUpperCase()}: ${msg.text}\n` });
          if (msg.image && msg.mimeType) {
              parts.push({
                  inlineData: {
                      data: msg.image,
                      mimeType: msg.mimeType
                  }
              });
          }
      });
      parts.push({ text: "END HISTORY\n\n" });
  }

  // Determine context to select the right prompt
  // In a real app, this might be a UI toggle, but we'll use keyword detection for now
  const combinedText = (currentPrompt + " " + history.map(h => h.text).join(" ")).toLowerCase();
  const isKBContext = combinedText.includes("kb") || 
                      combinedText.includes("article") || 
                      combinedText.includes("documentation") || 
                      combinedText.includes("troubleshoot") || 
                      combinedText.includes("servicenow") ||
                      combinedText.includes("guide");

  const systemInstruction = isKBContext ? KB_ARTICLE_SYSTEM_INSTRUCTION : GENERIC_SYSTEM_INSTRUCTION;

  let finalPrompt = fileBase64 
    ? `NEW REQUEST: ${currentPrompt || (isKBContext ? "Convert this document into a ServiceNow KB Article." : "Bring this idea to life.")}`
    : `NEW REQUEST: ${currentPrompt}`;

  // Inject Image ID into the prompt text if provided
  if (fileBase64 && fileId) {
      finalPrompt = `[System: The following image has ID: "${fileId}"]\n` + finalPrompt;
  }

  parts.push({ text: finalPrompt });

  if (fileBase64 && mimeType) {
    parts.push({
      inlineData: {
        data: fileBase64,
        mimeType: mimeType,
      },
    });
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.5,
      },
    });

    let text = response.text || "<!-- Failed to generate content -->";

    // Cleanup if the model still included markdown fences despite instructions
    text = text.replace(/^```html\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');

    return text;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
}