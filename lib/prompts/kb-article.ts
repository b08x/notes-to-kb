
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- 1. MODE CONSTRAINT (The Container) ---
// Enforces the "Textual Metafunction". 
// It prevents the model from being "chatty" or using Markdown.
const HTML_MODE_CONSTRAINT = `
### MODE CONSTRAINT (STRICT ENFORCEMENT)
1.  **Format**: RAW HTML output only.
    -   FORBIDDEN: Markdown code blocks (\`\`\`), preambles ("Here is your code"), or postscripts.
    -   REQUIRED: Start immediately with \`<!DOCTYPE html>\`.
2.  **Structure**:
    -   Use semantic tags: \`<section>\`, \`<article>\`, \`<header>\`.
    -   Use \`<div class="ai-diagram">\` for any process flows.
`;

// --- 2. TENOR CONSTRAINT (The Stance) ---
// Enforces the "Interpersonal Metafunction".
// It prevents the model from being "subservient" or "weak".
const TENOR_CONSTRAINT_STRICT = `
### TENOR CONSTRAINT (STRICT ENFORCEMENT)
1.  **Mood**: IMPERATIVE ONLY.
    -   VIOLATION: "You should click the save button." (Advice)
    -   COMPLIANT: "Click the save button." (Command)
2.  **Modality**: HIGH (Absolute Certainty).
    -   BANNED VOCABULARY: "maybe", "try to", "might", "possibly", "jiggle", "wiggle".
    -   REQUIRED VOCABULARY: "ensure", "verify", "must", "execute".
3.  **Social Distance**: MAXIMUM.
    -   No pleasantries ("I hope this helps").
    -   No user-centric themes ("You need to...").
    -   Focus on the Object/System ("The system must be...").
`;

// --- 3. FIELD CONSTRAINTS (The Logic) ---
// Enforces the "Ideational Metafunction" per Genre.

// GENRE: Troubleshooting (Triage)
const FIELD_TROUBLESHOOTING = `
### FIELD CONSTRAINT: TRIAGE GENRE
1.  **Process Types**: 
    -   **Relational**: For Symptoms ("The light IS orange").
    -   **Material**: For Fixes ("PRESS the switch").
    -   *BANNED*: Mental Processes ("I think it's broken", "Emphasize squeezing").
2.  **Schema**:
    -   <h1>: Issue Summary (Noun Phrase)
    -   <section class="symptom">: The observed failure state.
    -   <section class="diagnosis">: The root cause (Relational).
    -   <section class="remediation">: Step-by-step fix (Material).
`;

// GENRE: How-To (Procedural)
const FIELD_PROCEDURAL = `
### FIELD CONSTRAINT: PROCEDURAL GENRE
1.  **Process Types**: STRICTLY Material Processes (Actions).
2.  **Chronology**: Linear sequence.
3.  **Visuals**: Complex actions must include an <img src="placeholder"> tag.
`;

// --- EXPORTED INSTRUCTIONS ---

export const KB_TROUBLESHOOTING_SYSTEM_INSTRUCTION = `
${HTML_MODE_CONSTRAINT}
${TENOR_CONSTRAINT_STRICT}
${FIELD_TROUBLESHOOTING}
`;

export const KB_HOW_TO_SYSTEM_INSTRUCTION = `
${HTML_MODE_CONSTRAINT}
${TENOR_CONSTRAINT_STRICT}
${FIELD_PROCEDURAL}
`;

// Default / Fallback
export const GENERIC_SYSTEM_INSTRUCTION = KB_TROUBLESHOOTING_SYSTEM_INSTRUCTION;

/**
 * The Selector Logic for SFL-based prompts
 */
export const getSystemInstruction = (type: string, contextString: string = ""): string => {
  switch (type.toLowerCase()) {
    case 'troubleshooting': return KB_TROUBLESHOOTING_SYSTEM_INSTRUCTION;
    case 'howto': return KB_HOW_TO_SYSTEM_INSTRUCTION;
    case 'faq': return KB_HOW_TO_SYSTEM_INSTRUCTION; 
    case 'sop': return KB_HOW_TO_SYSTEM_INSTRUCTION;
    default: return GENERIC_SYSTEM_INSTRUCTION;
  }
};
