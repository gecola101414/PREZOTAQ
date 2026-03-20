import { GoogleGenAI, Type } from "@google/genai";

export const maxDuration = 60; // 60 seconds timeout for Vercel Hobby plan

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { description, siteAddress, customPrompt, priceHistory, files, parsedFilesText } = req.body;
    
    const model = "gemini-3.1-pro-preview";
    
    const historyContext = priceHistory && priceHistory.length > 0 
      ? `\n\nRIFERIMENTI PREZZI STORICI (Usa questi prezzi se le voci sono simili a quelle richieste):\n${priceHistory.map((h: any) => `- ${h.description}: €${h.unitPrice}/${h.unit}`).join('\n')}`
      : "";

    const parsedFilesContext = parsedFilesText 
      ? `\n\nDATI ESTRATTI DAI FILE CARICATI:\n${parsedFilesText}`
      : "";

    const textPart = {
      text: `
        Sei un esperto geometra e computista italiano. 
        Il tuo compito è generare un preventivo professionale e dettagliato per un lavoro edile.
        ${description ? `Basati su questa descrizione fornita: "${description}".` : "Basati sui dati estratti dai file allegati."}
        L'indirizzo del cantiere è: "${siteAddress}".

        IMPORTANTE: Analizza l'indirizzo fornito ("${siteAddress}") per determinare la provincia e il comune. 
        Usa i prezzi medi di mercato coerenti con quella specifica area geografica (riferimento Prezziari Regionali o DEI).
        ${historyContext}
        ${parsedFilesContext}

        ${customPrompt ? `PRESCRIZIONI SPECIFICHE DELL'UTENTE PER QUESTO PREVENTIVO (MANDATORIE):\n"${customPrompt}"\nSegui rigorosamente queste istruzioni aggiuntive.` : ""}

        REGOLE SUI FILE CARICATI (PDF):
        Se è stato caricato un file PDF:
        1. DEVI considerare TUTTE le voci presenti nel documento.
        2. Crea il preventivo tenendo conto delle quantità indicate nel file e applicando un prezzo di mercato tale da garantire un utile del 20%.
        3. Eventuali integrazioni o descrizioni aggiuntive fornite dall'utente (es. tramite le categorie WBS) devono essere considerate come elementi aggiuntivi rispetto a quelli estratti dal PDF.

        REGOLE SULLA LINGUA (MANDATORIO):
        1. Rileva automaticamente la lingua usata dall'utente nella descrizione e nelle prescrizioni (es. Arabo, Francese, Inglese, Italiano).
        2. L'anteprima del preventivo (i campi principali del JSON come jobTitle, specifications, items, notes, ecc.) DEVE essere generata nella STESSA LINGUA usata dall'utente.
        3. DEVI generare anche una versione tradotta in ITALIANO di tutti i campi testuali all'interno dell'oggetto "pdfData". Questo servirà per generare il PDF ufficiale in italiano.

        REGOLE DI STRUTTURA (WBS):
        Usa PRIORITARIAMENTE le categorie WBS fornite nelle intestazioni "### Categoria" nel testo della descrizione. 
        Se l'utente ha rinominato le categorie, DEVI usare esattamente i nomi forniti nelle intestazioni.
        Mantieni l'ordine delle categorie così come appaiono nella descrizione.
        
        REGOLE DI NUMERAZIONE E ORDINE:
        Se la descrizione di una voce inizia con un numero seguito da un punto (es. "1. Demolizione...", "2. Rifacimento..."), 
        DEVI rispettare rigorosamente questa numerazione e l'ordine indicato nel preventivo finale.
        
        REGOLE DI CONTENUTO:
        1. Genera un "Capitolato Descrittivo" (campo 'specifications') estremamente tecnico e professionale. 
           Suddividilo internamente per categorie WBS (es. "IMPIANTO DI CANTIERE: ...", "DEMOLIZIONI: ...").
           Ogni punto o descrizione di lavoro deve iniziare su una NUOVA RIGA (usa il carattere \\n).
           Se l'utente ha fornito una numerazione nelle descrizioni, riportala anche nel capitolato.
        2. Suddividi il lavoro in voci di computo metrico chiare, assegnando a ciascuna la relativa categoria 'wbs'.
        3. Se hai stimato le misure, spiega brevemente i criteri di stima nel campo 'estimatedDimensionsExplanation'.
        4. PRIORITÀ PREZZI (MANDATORIA): Se nel "RIFERIMENTI PREZZI STORICI" trovi voci identiche o molto simili, DEVI USARE QUEI PREZZI.
        5. Restituisci i dati in formato JSON.

        Il JSON deve avere questa struttura:
        {
          "jobTitle": "Titolo sintetico del lavoro",
          "province": "Provincia rilevata",
          "specifications": "Breve capitolato descrittivo dei lavori...",
          "items": [
            {
              "description": "Descrizione dettagliata della voce",
              "quantity": 10.5,
              "unit": "mq/mc/cad/m",
              "unitPrice": 25.0,
              "total": 262.5,
              "wbs": "Categoria WBS di appartenenza"
            }
          ],
          "notes": "Note legali standard, validità preventivo, esclusione IVA, ecc.",
          "estimatedDimensionsExplanation": "Spiegazione di come sono state calcolate le quantità stimate",
          "totalAmount": 0,
          "pdfData": {
            "jobTitle": "Titolo in italiano",
            "specifications": "Capitolato in italiano",
            "items": [
              {
                "description": "Descrizione in italiano",
                "quantity": 10.5,
                "unit": "mq/mc/cad/m",
                "unitPrice": 25.0,
                "total": 262.5,
                "wbs": "Categoria WBS in italiano"
              }
            ],
            "notes": "Note in italiano",
            "estimatedDimensionsExplanation": "Spiegazione in italiano"
          }
        }
      `
    };

    const parts: any[] = [textPart];
    
    if (files && files.length > 0) {
      files.forEach((f: any) => {
        parts.push({
          inlineData: {
            mimeType: f.mimeType,
            data: f.data
          }
        });
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

    const response = await ai.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            jobTitle: { type: Type.STRING },
            province: { type: Type.STRING },
            specifications: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  unitPrice: { type: Type.NUMBER },
                  total: { type: Type.NUMBER },
                  wbs: { type: Type.STRING }
                },
                required: ["description", "quantity", "unit", "unitPrice", "total", "wbs"]
              }
            },
            notes: { type: Type.STRING },
            estimatedDimensionsExplanation: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            pdfData: {
              type: Type.OBJECT,
              properties: {
                jobTitle: { type: Type.STRING },
                specifications: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      description: { type: Type.STRING },
                      quantity: { type: Type.NUMBER },
                      unit: { type: Type.STRING },
                      unitPrice: { type: Type.NUMBER },
                      total: { type: Type.NUMBER },
                      wbs: { type: Type.STRING }
                    },
                    required: ["description", "quantity", "unit", "unitPrice", "total", "wbs"]
                  }
                },
                notes: { type: Type.STRING },
                estimatedDimensionsExplanation: { type: Type.STRING }
              },
              required: ["jobTitle", "specifications", "items", "notes", "estimatedDimensionsExplanation"]
            }
          },
          required: ["jobTitle", "province", "specifications", "items", "notes", "estimatedDimensionsExplanation", "totalAmount"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    res.status(200).json(result);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      res.status(429).json({ error: "RATE_LIMIT" });
    } else {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  }
}
