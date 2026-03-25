import { getTranslation, Language } from './translations';
import React, { useState, useRef, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, 
  FileText, 
  MapPin, 
  Ruler, 
  Send, 
  Printer, 
  Download, 
  Plus, 
  Trash2, 
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  FolderOpen,
  Search,
  X,
  Edit2,
  Mic,
  MicOff,
  Upload,
  Volume2,
  Briefcase,
  Calendar,
  Settings
} from 'lucide-react';
import { cn } from './lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI, Type } from "@google/genai";

export interface QuoteItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  wbs: string;
}

export interface QuoteData {
  clientInfo: {
    name: string;
    address: string;
  };
  province: string;
  jobTitle: string;
  specifications: string;
  items: QuoteItem[];
  notes: string;
  estimatedDimensionsExplanation: string;
  totalAmount: number;
  pdfData: {
    jobTitle: string;
    specifications: string;
    items: QuoteItem[];
    notes: string;
    estimatedDimensionsExplanation: string;
  };
}

export interface PriceReference {
  description: string;
  unitPrice: number;
  unit: string;
}

interface CompanyData {
  name: string;
  address: string;
  vatNumber: string;
  phone: string;
  email: string;
  website?: string;
  logo?: string;
}

interface SavedQuote {
  id: string;
  shortCode?: string; // e.g. "1/2024"
  name: string;
  date: string;
  data: QuoteData;
  inputs?: {
    siteAddress: string;
    description: string;
    dimensions?: string; // Legacy
    customPrompt?: string;
    clientName: string;
    wbsCategories?: string[];
    wbsDescriptions?: Record<string, string>;
  };
}

async function generateQuote(description: string, siteAddress: string, lang: 'it' | 'ro' | 'ar' | 'sq', customPrompt?: string, priceHistory?: any[], files?: any[], parsedFilesText?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chiave API mancante. Verifica la configurazione nelle impostazioni.");
  }
  const ai = new GoogleGenAI({ apiKey: (apiKey as string) });
  const model = "gemini-3-flash-preview";
  
  const historyContext = priceHistory && priceHistory.length > 0 
    ? `\n\nRIFERIMENTI PREZZI STORICI (Usa questi prezzi se le voci sono simili a quelle richieste):\n${priceHistory.map((h: any) => `- ${h.description}: €${h.unitPrice}/${h.unit}`).join('\n')}`
    : "";

  const parsedFilesContext = parsedFilesText 
    ? `\n\nDATI ESTRATTI DAI FILE CARICATI:\n${parsedFilesText}`
    : "";

  const textPart = {
    text: `
      Sei un esperto geometra e computista.
      Il tuo compito è generare un preventivo professionale e dettagliato per un lavoro edile.
      
      LINGUA:
      1. L'app è dedicata ad artigiani.
      2. Genera i campi principali (jobTitle, specifications, items, notes, estimatedDimensionsExplanation) SEMPRE E RIGOROSAMENTE NELLA LINGUA SELEZIONATA: ${lang === 'it' ? 'Italiano' : lang === 'ro' ? 'Rumeno' : lang === 'ar' ? 'Arabo (SCRITTURA DA DESTRA A SINISTRA)' : 'Albanese'}.
      3. Genera i campi all'interno di "pdfData" SEMPRE E RIGOROSAMENTE IN LINGUA ITALIANA.

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
        "jobTitle": "Titolo sintetico del lavoro (nella lingua rilevata)",
        "province": "Provincia rilevata",
        "specifications": "Breve capitolato descrittivo dei lavori (nella lingua rilevata)...",
        "items": [
          {
            "description": "Descrizione dettagliata della voce (nella lingua rilevata)",
            "quantity": 10.5,
            "unit": "mq/mc/cad/m",
            "unitPrice": 25.0,
            "total": 262.5,
            "wbs": "Categoria WBS di appartenenza (nella lingua rilevata)"
          }
        ],
        "notes": "Note legali standard, validità preventivo, esclusione IVA, ecc. (nella lingua rilevata)",
        "estimatedDimensionsExplanation": "Spiegazione di come sono state calcolate le quantità stimate (nella lingua rilevata)",
        "totalAmount": 0,
        "pdfData": {
          "jobTitle": "Titolo sintetico del lavoro in italiano",
          "specifications": "Breve capitolato descrittivo dei lavori in italiano",
          "items": [
            {
              "description": "Descrizione dettagliata della voce in italiano",
              "quantity": 10.5,
              "unit": "mq/mc/cad/m",
              "unitPrice": 25.0,
              "total": 262.5,
              "wbs": "Categoria WBS di appartenenza in italiano"
            }
          ],
          "notes": "Note legali standard in italiano",
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
          },
          totalAmount: { type: Type.NUMBER }
        },
        required: ["jobTitle", "province", "specifications", "items", "notes", "estimatedDimensionsExplanation", "totalAmount", "pdfData"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response");
  }

  try {
    return JSON.parse(response.text);
  } catch (parseError) {
    console.error("Failed to parse Gemini response:", response.text);
    throw new Error("Failed to parse AI response as JSON");
  }
}

const DictationButton = ({ onAppendText, isListening, onToggle }: { onAppendText: (text: string) => void, isListening: boolean, onToggle: () => void }) => {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "p-2 rounded-lg transition-all flex items-center justify-center shrink-0 h-10 w-10",
        isListening 
          ? "bg-red-100 text-red-600 shadow-sm shadow-red-500/20" 
          : "bg-black/5 text-black/40 hover:bg-emerald-100 hover:text-emerald-600"
      )}
      title={isListening ? "Ferma dettatura" : "Avvia dettatura vocale (rileva automaticamente la lingua)"}
    >
      {isListening ? (
        <div className="flex items-center justify-center gap-[3px] h-4 w-4">
          <div className="w-[3px] bg-red-600 rounded-full animate-eq"></div>
          <div className="w-[3px] bg-red-600 rounded-full animate-eq-delay-1"></div>
          <div className="w-[3px] bg-red-600 rounded-full animate-eq-delay-2"></div>
        </div>
      ) : (
        <Mic size={18} />
      )}
    </button>
  );
};

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
            <AlertCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ops! Qualcosa è andato storto</h1>
          <p className="text-gray-600 mb-6 max-w-md">
            L'applicazione ha riscontrato un errore imprevisto. Prova a ricaricare la pagina o a ripristinare l'app se il problema persiste.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => window.location.reload()}
              className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-emerald-700 transition-colors"
            >
              Ricarica Pagina
            </button>
            <button
              onClick={() => {
                if (confirm("Attenzione: questo cancellerà tutti i preventivi salvati localmente. Vuoi procedere?")) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="bg-red-50 text-red-600 px-6 py-2 rounded-xl font-medium hover:bg-red-100 transition-colors"
            >
              Ripristina App
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="bg-gray-100 text-gray-900 px-6 py-2 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              Riprova
            </button>
          </div>
          {this.state.error && (
            <pre className="mt-8 p-4 bg-gray-50 rounded-lg text-left text-xs text-gray-500 max-w-full overflow-auto border border-gray-100">
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

const ConfirmModal = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel,
  confirmText = "Conferma",
  cancelText = "Annulla",
  type = "danger"
}: { 
  isOpen: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "primary" | "success";
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
      >
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600">{message}</p>
        </div>
        <div className="bg-gray-50 p-4 flex gap-3 justify-end">
          <button 
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-white transition-colors",
              type === "danger" ? "bg-red-600 hover:bg-red-700" : 
              type === "success" ? "bg-emerald-600 hover:bg-emerald-700" : 
              "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [siteAddress, setSiteAddress] = useState('');
  const [description, setDescription] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [clientName, setClientName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteName, setQuoteName] = useState<string>('');
  const [currentLang, setCurrentLang] = useState<'it' | 'ro' | 'ar' | 'sq'>('it');
  const [wbsCategories, setWbsCategories] = useState<string[]>([
    "Impianto di cantiere e sicurezza",
    "Demolizioni e rimozioni",
    "Opere edili",
    "Impianti",
    "Intonaci e finiture",
    "Infissi e porte"
  ]);

  useEffect(() => {
    setWbsCategories([
      getTranslation(currentLang, 'wbsSicurezza'),
      getTranslation(currentLang, 'wbsDemolizioni'),
      getTranslation(currentLang, 'wbsOpereEdili'),
      getTranslation(currentLang, 'wbsImpianti'),
      getTranslation(currentLang, 'wbsIntonaci'),
      getTranslation(currentLang, 'wbsInfissi'),
      getTranslation(currentLang, 'wbsOpereCompletamento'),
      getTranslation(currentLang, 'wbsOpereEsterne'),
      getTranslation(currentLang, 'wbsIsolamento')
    ]);
  }, [currentLang]);

  const [wbsDescriptions, setWbsDescriptions] = useState<Record<string, string>>({});
  const [vatRate, setVatRate] = useState<number>(22);
  const [newWbsName, setNewWbsName] = useState('');
  const [isAddingWbs, setIsAddingWbs] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [activeDictationField, setActiveDictationField] = useState<string | null>(null);
  const activeFieldRef = useRef<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const lastProcessedResultIndex = useRef(0);
  const lastTranscriptRef = useRef("");
  const transcriptBufferRef = useRef("");

  const getDictationLangTag = (lang: string) => {
    switch(lang) {
      case 'it': return 'it-IT';
      case 'ro': return 'ro-RO';
      case 'ar': return 'ar-SA';
      case 'sq': return 'sq-AL';
      default: return 'it-IT';
    }
  };

  useEffect(() => {
    activeFieldRef.current = activeDictationField;
    if (!activeDictationField) {
      lastTranscriptRef.current = "";
    }
  }, [activeDictationField]);

  const [companyData, setCompanyData] = useState<CompanyData>({
    name: '',
    address: '',
    vatNumber: '',
    phone: '',
    email: '',
    website: ''
  });

  useEffect(() => {
    const loaded = localStorage.getItem('savedQuotes');
    if (loaded) {
      try {
        const parsed = JSON.parse(loaded);
        if (Array.isArray(parsed)) {
          setSavedQuotes(parsed);
        } else {
          console.warn("Saved quotes in localStorage is not an array");
          setSavedQuotes([]);
        }
      } catch (e) {
        console.error("Failed to parse saved quotes", e);
        setSavedQuotes([]);
      }
    }

    const loadedCompany = localStorage.getItem('companyData');
    if (loadedCompany) {
      try {
        setCompanyData(JSON.parse(loadedCompany));
      } catch (e) {
        console.error("Failed to parse company data", e);
      }
    }
  }, []);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: "danger" | "primary" | "success";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: "danger"
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void, type: "danger" | "primary" | "success" = "danger") => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      },
      type
    });
  };

  const resetForm = () => {
    const performReset = () => {
      setSiteAddress('');
      setDescription('');
      setCustomPrompt('');
      setClientName('');
      setQuote(null);
      setQuoteId(null);
      setQuoteName('');
      setError(null);
      setWbsDescriptions({});
      setWbsCategories([
        "Impianto di cantiere e sicurezza",
        "Demolizioni e rimozioni",
        "Opere edili",
        "Impianti",
        "Intonaci e finiture",
        "Infissi e porte"
      ]);
      setUploadedFiles([]);
      setIsModalOpen(false);
      setIsCompanyModalOpen(false);
    };

    if (quote || siteAddress || description) {
      showConfirm(
        "Nuovo Preventivo",
        "Sei sicuro di voler iniziare un nuovo preventivo? I dati non salvati andranno persi.",
        performReset
      );
    } else {
      performReset();
    }
  };

  const saveCompanyData = (data: CompanyData) => {
    setCompanyData(data);
    localStorage.setItem('companyData', JSON.stringify(data));
    setIsCompanyModalOpen(false);
  };

  useEffect(() => {
    if (quote) {
      const uniqueWbs = Array.from(new Set<string>(quote.items.map(item => item.wbs || 'Altro')));
      setWbsCategories(prev => {
        const combined = Array.from(new Set<string>([...prev, ...uniqueWbs]));
        return combined;
      });
    }
  }, [quote]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      let silenceTimer: any = null;

      recognitionRef.current.onresult = (event: any) => {
        const currentField = activeFieldRef.current;
        if (!currentField) return;

        // Clear existing timer
        if (silenceTimer) clearTimeout(silenceTimer);

        // Append new results to buffer
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal && i >= lastProcessedResultIndex.current) {
            lastProcessedResultIndex.current = i + 1;
            transcriptBufferRef.current += result[0].transcript.trim() + " ";
          }
        }

        // Set timer for 5 seconds
        silenceTimer = setTimeout(() => {
          if (transcriptBufferRef.current.trim()) {
            const transcript = transcriptBufferRef.current.trim();
            transcriptBufferRef.current = "";
            
            // Play beep
            try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                oscillator.connect(audioCtx.destination);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.1);
            } catch (e) {
                console.error("Beep error", e);
            }
            
            // Update state
            if (currentField === 'customPrompt') {
              setCustomPrompt(prev => {
                const currentText = prev || '';
                const formatted = `- ${transcript};`;
                const separator = currentText && !currentText.endsWith('\n') ? '\n' : '';
                const newText = currentText + separator + formatted + '\n';
                return newText;
              });
            } else if (currentField?.startsWith('wbs_')) {
              const wbsName = currentField.replace('wbs_', '');
              setWbsDescriptions(prev => {
                const currentText = prev[wbsName] || '';
                const formatted = `- ${transcript};`;
                const separator = currentText && !currentText.endsWith('\n') ? '\n' : '';
                const newText = currentText + separator + formatted + '\n';
                return { ...prev, [wbsName]: newText };
              });
            }
          }
        }, 5000);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setActiveDictationField(null);
      };

      recognitionRef.current.onend = () => {
        lastProcessedResultIndex.current = 0;
        transcriptBufferRef.current = "";
        // Only set to null if we aren't starting a new field
        setActiveDictationField(current => {
          if (recognitionRef.current && current) {
            // If it ended naturally, we might want to restart it if it's continuous,
            // but standard behavior is to let it stop.
            return null;
          }
          return current;
        });
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Auto-resize all textareas when content changes
  useEffect(() => {
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
  }, [customPrompt, wbsDescriptions, wbsCategories]);

  const toggleDictation = (fieldId: string) => {
    if (!recognitionRef.current) {
      setError("Il riconoscimento vocale non è supportato in questo browser o richiede permessi aggiuntivi.");
      return;
    }
    
    if (activeDictationField === fieldId) {
      recognitionRef.current.stop();
      setActiveDictationField(null);
    } else {
      if (activeDictationField) {
        recognitionRef.current.stop();
        // Wait a bit for the previous session to fully stop before starting a new one
        setTimeout(() => {
          setActiveDictationField(fieldId);
          try {
            recognitionRef.current.lang = getDictationLangTag(currentLang);
            recognitionRef.current?.start();
          } catch (e) {
            console.error(e);
          }
        }, 300);
      } else {
        setActiveDictationField(fieldId);
        try {
          recognitionRef.current.lang = getDictationLangTag(currentLang);
          recognitionRef.current.start();
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  const printRef = useRef<HTMLDivElement>(null);

  const getPriceHistory = (): PriceReference[] => {
    const history: Map<string, PriceReference> = new Map();
    
    // Process quotes from oldest to newest so that newer ones overwrite older ones,
    // ensuring the most recent price is the one preserved in the Map.
    savedQuotes.forEach(quote => {
      quote.data.items.forEach(item => {
        // Use description as key to keep the most recent price for each unique item
        history.set(item.description.toLowerCase().trim(), {
          description: item.description,
          unitPrice: item.unitPrice,
          unit: item.unit
        });
      });
    });
    
    return Array.from(history.values());
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Combine all WBS descriptions into one string with headers for the AI
    const combinedDescription = Object.entries(wbsDescriptions)
      .filter(([_, text]) => text.trim().length > 0)
      .map(([wbs, text]) => `### ${wbs}\n${text}`)
      .join('\n\n') || description;

    if (!siteAddress || (!combinedDescription && uploadedFiles.length === 0)) return;

    setIsLoading(true);
    setError(null);
    try {
      const priceHistory = getPriceHistory();
      
      const processedFiles: { mimeType: string, data: string }[] = [];
      let parsedFilesText = '';

      for (const file of uploadedFiles) {
        if (file.type === 'application/pdf') {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => {
              const base64String = (reader.result as string).split(',')[1];
              resolve(base64String);
            };
          });
          reader.readAsDataURL(file);
          const base64Data = await base64Promise;
          processedFiles.push({ mimeType: file.type, data: base64Data });
        }
      }

      const data = await generateQuote(combinedDescription, siteAddress, currentLang, customPrompt, priceHistory, processedFiles, parsedFilesText);
      
      if (!data) {
        throw new Error("L'AI non ha restituito alcun dato. Riprova.");
      }

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error("I dati restituiti dall'AI non sono validi (mancano le voci del preventivo).");
      }

      // Ensure all items have necessary fields to prevent render crashes
      data.items = data.items.map((item: any) => ({
        description: item.description || 'Nessuna descrizione',
        quantity: typeof item.quantity === 'number' ? item.quantity : 0,
        unit: item.unit || 'cad',
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
        total: typeof item.total === 'number' ? item.total : 0,
        wbs: item.wbs || 'Altro'
      }));

      data.clientInfo = { name: clientName || 'Spett.le Cliente', address: siteAddress };
      setQuote(data);
      setQuoteId(null);
      const defaultName = clientName ? `${clientName} - ${data.jobTitle}` : data.jobTitle;
      setQuoteName(defaultName || 'Nuovo Preventivo');

      // Scroll to result on mobile
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error(err);
      if (err.message === "RATE_LIMIT") {
        setError("Hai superato il limite di richieste gratuite. Riprova più tardi o controlla la tua quota API.");
      } else if (err.message === "INVALID_DATA" || err.name === "SyntaxError") {
        setError("L'Intelligenza Artificiale ha restituito dati non validi. Prova a riformulare la richiesta o a caricare file più piccoli.");
      } else {
        // Show the actual error message from the server if available
        const errorMessage = err.message || "Si è verificato un errore durante la generazione del preventivo. Riprova.";
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      
      // Check file sizes (max 3MB per file to avoid Vercel payload limits and browser crashes)
      const MAX_SIZE = 3 * 1024 * 1024;
      const oversizedFiles = filesArray.filter(f => f.size > MAX_SIZE);
      
      if (oversizedFiles.length > 0) {
        alert(`Alcuni file sono troppo grandi (massimo 3MB per file). Riduci le dimensioni o dividi i PDF.`);
        const validFiles = filesArray.filter(f => f.size <= MAX_SIZE);
        setUploadedFiles(prev => [...prev, ...validFiles]);
      } else {
        setUploadedFiles(prev => [...prev, ...filesArray]);
      }
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof QuoteItem, value: string | number) => {
    if (!quote) return;
    
    if (field === 'wbs' && value === 'NEW') {
      const newCat = prompt("Inserisci il nome della nuova categoria WBS:");
      if (newCat && newCat.trim()) {
        const trimmed = newCat.trim();
        setWbsCategories(prev => Array.from(new Set<string>([...prev, trimmed])));
        value = trimmed;
      } else {
        return; // Cancel
      }
    }

    const newItems = [...quote.items];
    const item = { ...newItems[index], [field]: value };
    
    // Recalculate total for this item
    if (field === 'quantity' || field === 'unitPrice') {
      item.total = Number(item.quantity) * Number(item.unitPrice);
    }
    
    newItems[index] = item;
    
    // Recalculate grand total
    const totalAmount = newItems.reduce((acc, curr) => acc + curr.total, 0);
    
    let updatedPdfData = quote.pdfData;
    if (updatedPdfData && updatedPdfData.items && updatedPdfData.items[index]) {
      const newPdfItems = [...updatedPdfData.items];
      const pdfItem = { ...newPdfItems[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        pdfItem.total = Number(pdfItem.quantity) * Number(pdfItem.unitPrice);
      }
      newPdfItems[index] = pdfItem;
      updatedPdfData = { ...updatedPdfData, items: newPdfItems };
    }

    setQuote({ ...quote, items: newItems, totalAmount, pdfData: updatedPdfData });
  };

  const addItem = (wbs?: string) => {
    if (!quote) return;
    const newItem: QuoteItem = {
      description: 'Nuova voce',
      quantity: 1,
      unit: 'cad',
      unitPrice: 0,
      total: 0,
      wbs: wbs || wbsCategories[0] || 'Altro'
    };
    
    let updatedPdfData = quote.pdfData;
    if (updatedPdfData && updatedPdfData.items) {
      updatedPdfData = {
        ...updatedPdfData,
        items: [...updatedPdfData.items, { ...newItem }]
      };
    }

    setQuote({
      ...quote,
      items: [...quote.items, newItem],
      pdfData: updatedPdfData
    });
  };

  const removeItem = (index: number) => {
    if (!quote) return;
    const newItems = quote.items.filter((_, i) => i !== index);
    const totalAmount = newItems.reduce((acc, curr) => acc + curr.total, 0);
    
    let updatedPdfData = quote.pdfData;
    if (updatedPdfData && updatedPdfData.items) {
      updatedPdfData = {
        ...updatedPdfData,
        items: updatedPdfData.items.filter((_, i) => i !== index)
      };
    }

    setQuote({ ...quote, items: newItems, totalAmount, pdfData: updatedPdfData });
  };

  const saveQuote = (asNew: boolean = false) => {
    if (!quote) return;
    let name = quoteName || quote.jobTitle;
    
    const isNew = asNew || !quoteId;
    const id = isNew ? `PRV-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}` : quoteId;
    
    let shortCode = '';
    if (isNew) {
      const currentYear = new Date().getFullYear();
      const yearSuffix = currentYear.toString();
      const quotesThisYear = savedQuotes.filter(q => {
        const qDate = new Date(q.date);
        return qDate.getFullYear() === currentYear;
      });
      
      let maxNum = 0;
      quotesThisYear.forEach(q => {
        if (q.shortCode && q.shortCode.includes('/')) {
          const num = parseInt(q.shortCode.split('/')[0]);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      shortCode = `${maxNum + 1}/${yearSuffix}`;
    } else {
      const existing = savedQuotes.find(q => q.id === quoteId);
      shortCode = existing?.shortCode || '';
    }

    const newQuote: SavedQuote = {
      id,
      shortCode,
      name,
      date: new Date().toISOString(),
      data: quote,
      inputs: {
        siteAddress,
        description,
        customPrompt,
        clientName,
        wbsCategories,
        wbsDescriptions
      }
    };

    // Update wbsCategories if there are new ones in the quote
    const uniqueWbs = Array.from(new Set<string>(quote.items.map(item => item.wbs || 'Altro')));
    setWbsCategories(prev => Array.from(new Set<string>([...prev, ...uniqueWbs])));

    let updated;
    if (isNew) {
      updated = [...savedQuotes, newQuote];
      setQuoteId(id);
    } else {
      updated = savedQuotes.map(q => q.id === quoteId ? newQuote : q);
    }
      
    setSavedQuotes(updated);
    localStorage.setItem('savedQuotes', JSON.stringify(updated));
    alert(asNew ? "Copia salvata con successo!" : "Preventivo salvato con successo!");
  };

  const loadQuote = (saved: SavedQuote) => {
    setQuote(saved.data);
    setQuoteId(saved.id);
    setQuoteName(saved.name);
    if (saved.inputs) {
      setSiteAddress(saved.inputs.siteAddress || '');
      setDescription(saved.inputs.description || '');
      setCustomPrompt(saved.inputs.customPrompt || saved.inputs.dimensions || '');
      setClientName(saved.inputs.clientName || '');
      if (saved.inputs.wbsCategories) {
        setWbsCategories(saved.inputs.wbsCategories);
      }
      if (saved.inputs.wbsDescriptions) {
        setWbsDescriptions(saved.inputs.wbsDescriptions);
      }
    }
    setIsModalOpen(false);
  };
  
  const deleteQuote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm(
      "Elimina Preventivo",
      "Sei sicuro di voler eliminare questo preventivo?",
      () => {
        const updated = savedQuotes.filter(q => q.id !== id);
        setSavedQuotes(updated);
        localStorage.setItem('savedQuotes', JSON.stringify(updated));
        if (quoteId === id) {
          setQuoteId(null);
          setQuoteName('');
        }
      }
    );
  };

  const exportDatabase = () => {
    const data = {
      savedQuotes,
      companyData,
      exportDate: new Date().toISOString(),
      version: "1.0"
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `database_preventivi_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.savedQuotes && Array.isArray(json.savedQuotes)) {
          // Proceed with import without blocking confirm for better compatibility in iframe
          setSavedQuotes(json.savedQuotes);
          localStorage.setItem('savedQuotes', JSON.stringify(json.savedQuotes));
          
          if (json.companyData) {
            setCompanyData(json.companyData);
            localStorage.setItem('companyData', JSON.stringify(json.companyData));
          }
          
          setError(null);
          // We use a temporary state or just console log since alert might be blocked
          console.log("Database importato con successo!");
          // Force a small notification in the UI if possible, or just close modal
          setIsModalOpen(false);
          resetForm(); // Reset to clear any stale state
        } else {
          setError("File non valido. Assicurati di caricare un file esportato correttamente.");
        }
      } catch (err) {
        console.error("Import error", err);
        setError("Errore durante la lettura del file JSON. Verifica il formato.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePrint = async () => {
    if (!quote) return;
    
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      const pdfQuote = (quote as any).pdfData || quote;
      
      // Header
      doc.setFontSize(22);
      doc.setTextColor(5, 150, 105); // Emerald 600
      doc.text("PREVENTIVO", 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const currentSaved = savedQuotes.find(q => q.id === quoteId);
      const displayCode = currentSaved?.shortCode ? `${currentSaved.shortCode} (${quoteId})` : (quoteId || 'NUOVO');
      doc.text(`Codice: ${displayCode}`, 14, 28);
      doc.text(`Data: ${new Date().toLocaleDateString('it-IT')}`, 14, 33);
      doc.text(`Provincia (rilevata): ${quote.province}`, 14, 38);
      
      // Esecutore & Destinatario
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("Esecutore:", 14, 50);
      doc.setFont("helvetica", "normal");
      
      const companyInfoLines = [];
      if (companyData.name) {
        companyInfoLines.push(companyData.name);
        if (companyData.vatNumber) companyInfoLines.push(`P.IVA/C.F.: ${companyData.vatNumber}`);
        if (companyData.address) companyInfoLines.push(companyData.address);
        if (companyData.phone) companyInfoLines.push(`Tel: ${companyData.phone}`);
        if (companyData.email) companyInfoLines.push(`Email: ${companyData.email}`);
        if (companyData.website) companyInfoLines.push(`Web: ${companyData.website}`);
      } else {
        companyInfoLines.push("Impresa Edile / Professionista");
        companyInfoLines.push("P.IVA: 00000000000");
        companyInfoLines.push("Indirizzo sede legale");
      }
      
      doc.text(companyInfoLines.join('\n'), 14, 55);
      
      doc.setFont("helvetica", "bold");
      doc.text("Destinatario:", 110, 50);
      doc.setFont("helvetica", "normal");
      const clientNameForPdf = quote.clientInfo?.name || 'Spett.le Cliente';
      doc.text(`${clientNameForPdf}\nIndirizzo cantiere: ${siteAddress}`, 110, 55);
      
      // Oggetto
      doc.setFont("helvetica", "bold");
      doc.text("Oggetto: ", 14, 90);
      const labelWidth = doc.getTextWidth("Oggetto: ");
      doc.setFont("helvetica", "normal");
      const objectText = quoteName || pdfQuote.jobTitle;
      const splitTitle = doc.splitTextToSize(objectText, 180 - labelWidth);
      doc.text(splitTitle, 14 + labelWidth, 90);
      
      let currentY = 90 + (splitTitle.length * 5) + 5;

      // Capitolato Descrittivo
      if (pdfQuote.specifications) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Capitolato Descrittivo dei Lavori:", 14, currentY);
        currentY += 5;
        
        // Split specifications by newlines to ensure each point starts on a new line
        const specLines = pdfQuote.specifications.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);

        autoTable(doc, {
          startY: currentY,
          body: specLines.map((line: string) => [line]),
          theme: 'plain',
          styles: { 
            fontSize: 9, 
            cellPadding: 1, 
            halign: 'justify',
            textColor: [50, 50, 50],
            font: 'helvetica',
            fontStyle: 'normal'
          },
          margin: { left: 14, right: 14 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }
      
      // Group items by WBS
      const groupedItems: { [key: string]: QuoteItem[] } = {};
      pdfQuote.items.forEach((item: QuoteItem) => {
        const category = item.wbs || 'Altro';
        if (!groupedItems[category]) groupedItems[category] = [];
        groupedItems[category].push(item);
      });

      // Ensure all categories present in the quote are included in the display list
      const allWbsInQuote = Array.from(new Set<string>(pdfQuote.items.map((item: QuoteItem) => item.wbs || 'Altro')));
      const displayCategories: string[] = Array.from(new Set<string>([...wbsCategories, ...allWbsInQuote]));

      const tableColumn = ["#", "Descrizione", "Quantità", "Unità", "Prezzo Un.", "Totale"];
      
      let globalItemCounter = 0;
      let groupCounter = 0;
      
      displayCategories.forEach((wbs: string) => {
        const items = groupedItems[wbs];
        if (!items || items.length === 0) return;

        groupCounter++;
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14); // Increased font size
        doc.setTextColor(5, 150, 105);
        doc.text(`${groupCounter}. ${wbs.toUpperCase()}`, 14, currentY);
        currentY += 8; // Increased spacing

        const tableRows = items.map((item) => {
          globalItemCounter++;
          return [
            globalItemCounter,
            item.description,
            item.quantity.toLocaleString('it-IT'),
            item.unit,
            `€ ${item.unitPrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`,
            `€ ${item.total.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`
          ];
        });

        autoTable(doc, {
          startY: currentY,
          head: [tableColumn],
          body: tableRows,
          theme: 'striped',
          headStyles: { fillColor: [5, 150, 105] },
          styles: { fontSize: 8, cellPadding: 3, halign: 'justify' },
          columnStyles: {
            0: { cellWidth: 10, halign: 'left' },
            1: { cellWidth: 'auto', halign: 'justify' },
            2: { cellWidth: 20, halign: 'right' },
            3: { cellWidth: 15, halign: 'center' },
            4: { cellWidth: 25, halign: 'right' },
            5: { cellWidth: 25, halign: 'right' },
          },
          margin: { left: 14, right: 14 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      });

      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }
      const finalY = currentY;
      
      const imponibile = quote.totalAmount;
      const iva = imponibile * (vatRate / 100);
      const totale = imponibile + iva;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Imponibile:`, 140, finalY + 10);
      doc.text(`€ ${imponibile.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 196, finalY + 10, { align: 'right' });
      
      doc.text(`IVA (${vatRate}%):`, 140, finalY + 16);
      doc.text(`€ ${iva.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 196, finalY + 16, { align: 'right' });
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`Totale:`, 140, finalY + 24);
      doc.text(`€ ${totale.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 196, finalY + 24, { align: 'right' });
      
      // Update currentY to be below the totals to avoid overlap
      currentY = finalY + 40;

      // Notes
      if (pdfQuote.estimatedDimensionsExplanation) {
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Nota sulle quantità stimate:", 14, currentY);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        const splitNotes = doc.splitTextToSize(pdfQuote.estimatedDimensionsExplanation, 180);
        doc.text(splitNotes, 14, currentY + 5);
        currentY += splitNotes.length * 5 + 15;
      }
      
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Note e Condizioni:", 14, currentY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      const splitConditions = doc.splitTextToSize(pdfQuote.notes, 180);
      doc.text(splitConditions, 14, currentY + 5);
      
      currentY += splitConditions.length * 5 + 20;
      
      // Signatures
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text("Firma del Professionista", 14, currentY);
      doc.line(14, currentY + 15, 70, currentY + 15);
      
      doc.text("Firma per Accettazione", 110, currentY);
      doc.line(110, currentY + 15, 166, currentY + 15);

      // Add page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Pagina ${i} di ${pageCount}`, 105, 290, { align: 'center' });
      }
      
      const safeTitle = quoteName ? quoteName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'preventivo';
      doc.save(`preventivo_${safeTitle}.pdf`);
    } catch (err) {
      console.error(err);
      setError("Si è verificato un errore durante la generazione del PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div>
      <ErrorBoundary>
        <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-emerald-100">
          <ConfirmModal 
            isOpen={confirmConfig.isOpen}
            title={confirmConfig.title}
            message={confirmConfig.message}
            onConfirm={confirmConfig.onConfirm}
            onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
            type={confirmConfig.type}
          />
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-50 print:hidden overflow-x-auto no-scrollbar">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between min-w-max sm:min-w-0">
          <div className="flex items-center gap-2 mr-4 sm:mr-0">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shrink-0">
              <Calculator size={18} />
            </div>
            <h1 className="text-lg font-semibold tracking-tight hidden sm:block">{getTranslation(currentLang, 'title')}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={exportDatabase}
              className="text-xs font-bold uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 px-2 sm:px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 sm:gap-2"
              title={getTranslation(currentLang, 'export')}
            >
              <Download size={14} /> <span className="hidden md:inline">{getTranslation(currentLang, 'export')}</span>
            </button>
            <label className="text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black hover:bg-black/5 px-2 sm:px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 sm:gap-2 cursor-pointer" title={getTranslation(currentLang, 'import')}>
              <Upload size={14} /> <span className="hidden md:inline">{getTranslation(currentLang, 'import')}</span>
              <input type="file" accept=".json" onChange={importDatabase} className="hidden" />
            </label>
            <select
              value={currentLang}
              onChange={(e) => {
                const lang = e.target.value as 'it' | 'ro' | 'ar' | 'sq';
                setCurrentLang(lang);
              }}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="it">Italiano</option>
              <option value="ro">Română</option>
              <option value="ar">العربية</option>
              <option value="sq">Shqip</option>
            </select>
            <div className="h-6 w-px bg-black/5 mx-1 sm:mx-2 shrink-0"></div>
            <button 
              onClick={resetForm}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 sm:gap-2 transition-colors bg-emerald-50 px-2 sm:px-3 py-1.5 rounded-lg whitespace-nowrap"
            >
              <Plus size={18} /> <span className="hidden sm:inline">{getTranslation(currentLang, 'newQuote')}</span>
            </button>
            <button 
              onClick={() => setIsCompanyModalOpen(true)}
              className="text-sm font-medium text-black/60 hover:text-black flex items-center gap-1 sm:gap-2 transition-colors p-2 sm:p-0 rounded-lg hover:bg-black/5 sm:hover:bg-transparent"
              title={getTranslation(currentLang, 'companyData')}
            >
              <Settings size={18} /> <span className="hidden sm:inline">{getTranslation(currentLang, 'companyData')}</span>
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="text-sm font-medium text-black/60 hover:text-black flex items-center gap-1 sm:gap-2 transition-colors p-2 sm:p-0 rounded-lg hover:bg-black/5 sm:hover:bg-transparent"
              title={getTranslation(currentLang, 'myQuotes')}
            >
              <FolderOpen size={18} /> <span className="hidden sm:inline">{getTranslation(currentLang, 'myQuotes')}</span>
            </button>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-wider hidden lg:inline-block">
              AI Powered
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-12">
          
          {/* Input Section */}
          <div className="lg:col-span-4 print:hidden">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-3xl font-light tracking-tight mb-2">{getTranslation(currentLang, 'createQuote')}</h2>
                <p className="text-black/50 text-sm">{getTranslation(currentLang, 'quoteDescription')}</p>
              </div>

              <form onSubmit={handleGenerate} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                      <MapPin size={12} /> {getTranslation(currentLang, 'siteAddressLabel')}
                    </label>
                    <input 
                      type="text"
                      placeholder={getTranslation(currentLang, 'siteAddressPlaceholder')}
                      value={siteAddress}
                      onChange={(e) => setSiteAddress(e.target.value)}
                      className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                      <FileText size={12} /> {getTranslation(currentLang, 'clientNameLabel')}
                    </label>
                    <input 
                      type="text"
                      placeholder={getTranslation(currentLang, 'clientNamePlaceholder')}
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                        <FileText size={12} /> {getTranslation(currentLang, 'workDescriptionPerCategory')}
                      </label>
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {wbsCategories.map((wbs, idx) => (
                        <div key={idx} className="space-y-2 group bg-white/40 p-3 rounded-xl border border-black/5 hover:border-emerald-500/20 transition-all">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xs font-black text-emerald-600 shrink-0">{idx + 1}.</span>
                              <input 
                                type="text"
                                value={wbs}
                                onChange={(e) => {
                                  const newName = e.target.value;
                                  if (!newName) return;
                                  setWbsCategories(prev => {
                                    const next = [...prev];
                                    next[idx] = newName;
                                    return next;
                                  });
                                  setWbsDescriptions(prev => {
                                    const next = { ...prev };
                                    if (next[wbs]) {
                                      next[newName] = next[wbs];
                                      delete next[wbs];
                                    }
                                    return next;
                                  });
                                  if (quote) {
                                    let updatedPdfData = quote.pdfData;
                                    if (updatedPdfData && updatedPdfData.items) {
                                      updatedPdfData = {
                                        ...updatedPdfData,
                                        items: updatedPdfData.items.map(item => item.wbs === wbs ? { ...item, wbs: newName } : item)
                                      };
                                    }
                                    setQuote({
                                      ...quote,
                                      items: quote.items.map(item => item.wbs === wbs ? { ...item, wbs: newName } : item),
                                      pdfData: updatedPdfData
                                    });
                                  }
                                }}
                                className="text-xs font-black uppercase tracking-tight text-black/70 bg-transparent border-none p-0 focus:ring-0 focus:text-emerald-600 transition-colors w-full"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                showConfirm(
                                  "Elimina Categoria",
                                  `Sei sicuro di voler eliminare la categoria "${wbs}"?`,
                                  () => {
                                    setWbsCategories(prev => prev.filter(c => c !== wbs));
                                    setWbsDescriptions(prev => {
                                      const next = { ...prev };
                                      delete next[wbs];
                                      return next;
                                    });
                                  }
                                );
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-black/20 hover:text-red-500 transition-all"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="relative">
                            <textarea 
                              placeholder={`${getTranslation(currentLang, 'wbsDescriptionPlaceholder')}${wbs.toLowerCase()}...`}
                              value={wbsDescriptions[wbs] || ''}
                              onChange={(e) => {
                                setWbsDescriptions(prev => ({ ...prev, [wbs]: e.target.value }));
                              }}
                              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none min-h-[80px] overflow-hidden"
                            />
                            <div className="absolute top-2 right-2">
                              <DictationButton 
                                isListening={activeDictationField === `wbs_${wbs}`}
                                onToggle={() => toggleDictation(`wbs_${wbs}`)}
                                onAppendText={() => {}} // Not used anymore since we handle it in the effect
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      <div className="pt-2">
                        {isAddingWbs ? (
                          <div className="flex gap-2">
                            <input 
                              autoFocus
                              type="text"
                              placeholder="Nome categoria..."
                              value={newWbsName}
                              onChange={(e) => setNewWbsName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newWbsName.trim()) {
                                    const trimmed = newWbsName.trim();
                                    setWbsCategories(prev => [...prev, trimmed]);
                                    setWbsDescriptions(prev => ({ ...prev, [trimmed]: '' }));
                                    setNewWbsName('');
                                    setIsAddingWbs(false);
                                  }
                                } else if (e.key === 'Escape') {
                                  setIsAddingWbs(false);
                                  setNewWbsName('');
                                }
                              }}
                              className="flex-1 bg-white border border-emerald-500 rounded-xl px-3 py-2 text-sm focus:outline-none ring-2 ring-emerald-500/10"
                            />
                            <button 
                              type="button"
                              onClick={() => {
                                if (newWbsName.trim()) {
                                  const trimmed = newWbsName.trim();
                                  setWbsCategories(prev => [...prev, trimmed]);
                                  setWbsDescriptions(prev => ({ ...prev, [trimmed]: '' }));
                                  setNewWbsName('');
                                  setIsAddingWbs(false);
                                }
                              }}
                              className="bg-emerald-600 text-white px-3 rounded-xl hover:bg-emerald-700 transition-colors"
                            >
                              <Plus size={18} />
                            </button>
                            <button 
                              type="button"
                              onClick={() => {
                                setIsAddingWbs(false);
                                setNewWbsName('');
                              }}
                              className="bg-black/5 text-black/40 px-3 rounded-xl hover:bg-black/10 transition-colors"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-center mt-2">
                            <button
                              type="button"
                              onClick={() => setIsAddingWbs(true)}
                              className="w-12 h-12 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-full flex items-center justify-center transition-all shadow-sm border border-emerald-100 hover:border-emerald-600"
                              title="Aggiungi Categoria WBS"
                            >
                              <Plus size={24} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                      <Upload size={12} /> {getTranslation(currentLang, 'documentsLabel')}
                    </label>
                    <div className="border-2 border-dashed border-black/10 rounded-xl p-4 hover:border-emerald-500/30 transition-all bg-white/50">
                      <input 
                        type="file" 
                        multiple 
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                        <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-1">
                          <Upload size={18} />
                        </div>
                        <p className="text-xs font-medium text-black/60 text-center">
                          {getTranslation(currentLang, 'dragDrop')}
                        </p>
                        <p className="text-[10px] text-black/40 text-center">
                          {getTranslation(currentLang, 'pdfOnly')}
                        </p>
                      </label>
                    </div>
                    {uploadedFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {uploadedFiles.map((f, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white border border-black/5 rounded-lg p-2 text-xs">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText size={14} className="text-emerald-600 shrink-0" />
                              <span className="truncate text-black/70 font-medium">{f.name}</span>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => removeFile(idx)}
                              className="text-black/30 hover:text-red-500 p-1 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                      <Settings size={12} /> {getTranslation(currentLang, 'aiInstructionsLabel')}
                    </label>
                    <div className="relative">
                      <textarea 
                        placeholder={getTranslation(currentLang, 'aiInstructionsPlaceholder')}
                        value={customPrompt}
                        onChange={(e) => {
                          setCustomPrompt(e.target.value);
                        }}
                        className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none min-h-[80px] overflow-hidden"
                      />
                      <div className="absolute top-2 right-2">
                        <DictationButton 
                          isListening={activeDictationField === 'customPrompt'}
                          onToggle={() => toggleDictation('customPrompt')}
                          onAppendText={() => {}}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-black/40 italic">{getTranslation(currentLang, 'aiInstructionsHint')}</p>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/10 active:scale-[0.98]",
                    isLoading && "opacity-70 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Generazione in corso...
                    </>
                  ) : (
                    <>
                      {getTranslation(currentLang, 'generateQuote')}
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </form>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <div className="bg-white/50 border border-black/5 p-6 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-black/30">{getTranslation(currentLang, 'howItWorks')}</h3>
                <ul className="space-y-3">
                  {[
                    getTranslation(currentLang, 'step1'),
                    getTranslation(currentLang, 'step2'),
                    getTranslation(currentLang, 'step3'),
                    getTranslation(currentLang, 'step4')
                  ].map((step, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-black/60">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>

          {/* Preview Section */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {quote ? (
                <motion.div
                  key="quote-preview"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                    <div className="flex flex-col gap-1 flex-1 max-w-md">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-black/30">Nome del Preventivo</h3>
                      <div className="relative group">
                        <input 
                          type="text"
                          value={quoteName}
                          onChange={(e) => setQuoteName(e.target.value)}
                          placeholder="Inserisci un nome per il preventivo..."
                          className="w-full bg-emerald-50 text-emerald-900 px-3 py-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 border border-emerald-100 transition-all"
                        />
                        <Edit2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 group-hover:text-emerald-600 transition-colors pointer-events-none" />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => saveQuote(false)}
                        className="p-2 hover:bg-white rounded-lg border border-black/5 transition-colors text-black/60 hover:text-black flex items-center gap-2 text-sm px-3"
                      >
                        <Save size={16} /> {quoteId ? 'Aggiorna' : 'Salva'}
                      </button>
                      {quoteId && (
                        <button 
                          onClick={() => saveQuote(true)}
                          className="p-2 hover:bg-white rounded-lg border border-black/5 transition-colors text-emerald-600 hover:text-emerald-700 flex items-center gap-2 text-sm px-3"
                          title="Salva come nuovo preventivo"
                        >
                          <Plus size={16} /> Salva come copia
                        </button>
                      )}
                      <button 
                        onClick={handlePrint}
                        disabled={isGeneratingPdf}
                        className="p-2 hover:bg-white rounded-lg border border-black/5 transition-colors text-black/60 hover:text-black flex items-center gap-2 text-sm px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 
                        {isGeneratingPdf ? 'Generazione...' : 'Scarica PDF'}
                      </button>
                    </div>
                  </div>

                  {/* The actual document */}
                  <div 
                    ref={printRef}
                    className="bg-white shadow-2xl shadow-black/5 border border-black/5 rounded-2xl overflow-hidden print:shadow-none print:border-none print:rounded-none"
                  >
                    {/* Document Header */}
                    <div className="p-8 border-b border-black/5 bg-neutral-50/50">
                      <div className="flex justify-between items-start mb-12">
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white">
                              <FileText size={20} />
                            </div>
                            <span className="text-xl font-bold tracking-tighter">PREVENTIVO</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-black/30">Oggetto:</p>
                            <h4 
                              contentEditable 
                              suppressContentEditableWarning
                              onBlur={(e) => {
                                if (quote) {
                                  const newTitle = e.currentTarget.innerText;
                                  let updatedPdfData = quote.pdfData;
                                  if (updatedPdfData) {
                                    updatedPdfData = { ...updatedPdfData, jobTitle: newTitle };
                                  }
                                  setQuote({ ...quote, jobTitle: newTitle, pdfData: updatedPdfData });
                                }
                              }}
                              className="text-xl font-medium focus:outline-none focus:bg-emerald-50 rounded px-1 -ml-1 flex-1"
                            >
                              {quote.jobTitle}
                            </h4>
                          </div>
                        </div>
                        <div className="text-right space-y-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Codice</p>
                            <p className="text-sm font-mono font-bold text-emerald-600">
                              {(() => {
                                const currentSaved = savedQuotes.find(q => q.id === quoteId);
                                return currentSaved?.shortCode ? `${currentSaved.shortCode}` : (quoteId ? 'SALVA PER GENERARE' : 'NUOVO');
                              })()}
                            </p>
                            {quoteId && (
                              <p className="text-[9px] font-mono text-black/20 mt-0.5">{quoteId}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Data</p>
                            <p className="text-sm font-medium">{new Date().toLocaleDateString('it-IT')}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Provincia (rilevata)</p>
                            <p className="text-sm font-medium">{quote.province}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-2">Esecutore</p>
                          <div className="text-sm space-y-1 text-black/70">
                            <p className="font-bold text-black">{companyData.name || 'Impresa Edile / Professionista'}</p>
                            <p>P.IVA/C.F.: {companyData.vatNumber || '00000000000'}</p>
                            <p>{companyData.address || 'Indirizzo sede legale'}</p>
                            {companyData.phone && <p>Tel: {companyData.phone}</p>}
                            {companyData.email && <p>Email: {companyData.email}</p>}
                            {companyData.website && <p>Web: {companyData.website}</p>}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-2">Destinatario</p>
                          <div className="text-sm space-y-1 text-black/70">
                            <p 
                              contentEditable 
                              suppressContentEditableWarning
                              onBlur={(e) => {
                                if (quote) {
                                  setQuote({
                                    ...quote,
                                    clientInfo: { ...quote.clientInfo, name: e.currentTarget.innerText }
                                  });
                                }
                              }}
                              className="font-bold text-black focus:outline-none focus:bg-emerald-50 rounded px-1 -ml-1"
                            >
                              {quote.clientInfo?.name || 'Spett.le Cliente'}
                            </p>
                            <p>Indirizzo cantiere: {siteAddress}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Capitolato Descrittivo */}
                    {quote.specifications && (
                      <div className="px-8 py-6 border-b border-black/5 bg-neutral-50/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-3">Capitolato Descrittivo dei Lavori</p>
                        <div 
                          contentEditable 
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            if (quote) {
                              const newSpec = e.currentTarget.innerText;
                              let updatedPdfData = quote.pdfData;
                              if (updatedPdfData) {
                                updatedPdfData = { ...updatedPdfData, specifications: newSpec };
                              }
                              setQuote({ ...quote, specifications: newSpec, pdfData: updatedPdfData });
                            }
                          }}
                          className="text-sm text-black/70 leading-relaxed whitespace-pre-wrap italic focus:outline-none focus:bg-emerald-50 rounded px-1 -ml-1"
                        >
                          {quote.specifications}
                        </div>
                      </div>
                    )}

                    {/* Table Grouped by WBS */}
                    <div className="p-8">
                      {(() => {
                        const grouped: { [key: string]: QuoteItem[] } = {};
                        quote.items.forEach(item => {
                          const category = item.wbs || 'Altro';
                          if (!grouped[category]) grouped[category] = [];
                          grouped[category].push(item);
                        });

                        let globalCounter = 0;
                        let visibleGroupCounter = 0;
                        
                        // Combine predefined categories with any new ones from the quote
                        const allWbsInQuote = Array.from(new Set<string>(quote.items.map(item => item.wbs || 'Altro')));
                        const displayCategories = Array.from(new Set<string>([...wbsCategories, ...allWbsInQuote]));

                        return displayCategories.map((wbs) => {
                          const items = grouped[wbs];
                          if (!items || items.length === 0) return null;
                          
                          visibleGroupCounter++;

                          return (
                            <div key={wbs} className={visibleGroupCounter > 1 ? "mt-20" : "mt-8"}>
                              <div className="flex items-center gap-4 mb-10">
                                <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-emerald-600/20">
                                  {visibleGroupCounter}
                                </div>
                                <div className="flex-1 flex items-center justify-between gap-4">
                                  <h3 
                                    contentEditable 
                                    suppressContentEditableWarning
                                    onBlur={(e) => {
                                      const newName = e.currentTarget.innerText.trim();
                                      if (!newName || newName === wbs) return;
                                      
                                      // Update categories list
                                      setWbsCategories(prev => prev.map(c => c === wbs ? newName : c));
                                      
                                      // Update items in quote
                                      if (quote) {
                                        let updatedPdfData = quote.pdfData;
                                        if (updatedPdfData && updatedPdfData.items) {
                                          updatedPdfData = {
                                            ...updatedPdfData,
                                            items: updatedPdfData.items.map(item => item.wbs === wbs ? { ...item, wbs: newName } : item)
                                          };
                                        }
                                        setQuote({
                                          ...quote,
                                          items: quote.items.map(item => item.wbs === wbs ? { ...item, wbs: newName } : item),
                                          pdfData: updatedPdfData
                                        });
                                      }
                                    }}
                                    className="text-2xl font-black uppercase tracking-tight text-emerald-600 focus:outline-none focus:bg-emerald-50 rounded px-2 py-1"
                                  >
                                    {wbs}
                                  </h3>
                                  <button 
                                    onClick={() => addItem(wbs)}
                                    className="w-10 h-10 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700 rounded-full transition-all shadow-lg shadow-emerald-600/20 print:hidden hide-in-pdf shrink-0"
                                    title={`Aggiungi voce a ${wbs}`}
                                  >
                                    <Plus size={20} />
                                  </button>
                                </div>
                                <div className="flex-1 h-px bg-emerald-600/10"></div>
                              </div>

                              <table className="w-full text-left border-collapse mb-8">
                                <thead>
                                  <tr className="border-b border-black/10">
                                    <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-black/30 w-12">#</th>
                                    <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-black/30">Descrizione</th>
                                    <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-black/30 text-right w-20">Quantità</th>
                                    <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-black/30 text-center w-16">Unità</th>
                                    <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-black/30 text-right w-24">Prezzo Un.</th>
                                    <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-black/30 text-right w-24">Totale</th>
                                    <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-black/30 w-10 print:hidden hide-in-pdf"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item, idx) => {
                                    const originalIdx = quote.items.findIndex(i => i === item);
                                    globalCounter++;
                                    return (
                                      <tr key={idx} className="group border-b border-black/5 hover:bg-neutral-50/50 transition-colors">
                                        <td className="py-4 text-sm text-black/40">{globalCounter}</td>
                                        <td className="py-4 min-w-[400px]">
                                          <div className="space-y-2">
                                            <div 
                                              contentEditable 
                                              suppressContentEditableWarning
                                              onBlur={(e) => updateItem(originalIdx, 'description', e.currentTarget.innerText)}
                                              className="text-sm font-medium focus:outline-none focus:bg-emerald-50 rounded px-1 -ml-1 whitespace-pre-wrap break-words leading-relaxed w-full text-justify"
                                            >
                                              {item.description}
                                            </div>
                                            <div className="flex items-center gap-2 print:hidden hide-in-pdf">
                                              <select
                                                value={item.wbs}
                                                onChange={(e) => updateItem(originalIdx, 'wbs', e.target.value)}
                                                className="text-[9px] font-bold uppercase tracking-widest bg-black/5 border-none rounded px-2 py-1 focus:ring-0 text-black/40 hover:text-emerald-600 transition-colors cursor-pointer"
                                              >
                                                {wbsCategories.map(cat => (
                                                  <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                                <option value="NEW">+ Nuova Categoria...</option>
                                              </select>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-4 text-right">
                                          <div 
                                            contentEditable 
                                            suppressContentEditableWarning
                                            onBlur={(e) => {
                                              const val = e.currentTarget.innerText.replace(/\./g, '').replace(',', '.');
                                              updateItem(originalIdx, 'quantity', parseFloat(val) || 0);
                                            }}
                                            className="w-full text-right text-sm bg-transparent focus:outline-none focus:bg-emerald-50 rounded px-1"
                                          >
                                            {item.quantity.toLocaleString('it-IT')}
                                          </div>
                                        </td>
                                        <td className="py-4 text-center">
                                          <div 
                                            contentEditable 
                                            suppressContentEditableWarning
                                            onBlur={(e) => updateItem(originalIdx, 'unit', e.currentTarget.innerText)}
                                            className="text-sm text-black/60 focus:outline-none focus:bg-emerald-50 rounded px-1"
                                          >
                                            {item.unit}
                                          </div>
                                        </td>
                                        <td className="py-4 text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            <span className="text-xs text-black/40">€</span>
                                            <div 
                                              contentEditable 
                                              suppressContentEditableWarning
                                              onBlur={(e) => {
                                                const val = e.currentTarget.innerText.replace(/\./g, '').replace(',', '.');
                                                updateItem(originalIdx, 'unitPrice', parseFloat(val) || 0);
                                              }}
                                              className="min-w-[60px] text-right text-sm bg-transparent focus:outline-none focus:bg-emerald-50 rounded px-1"
                                            >
                                              {item.unitPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-4 text-right text-sm font-semibold">
                                          € {item.total.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-4 text-right print:hidden hide-in-pdf">
                                          <button 
                                            onClick={() => removeItem(originalIdx)}
                                            className="p-1 text-black/20 hover:text-red-500 transition-all"
                                            title="Elimina voce"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        });
                      })()}


                       {/* Summary */}
                       <div className="mt-12 flex justify-end">
                         <div className="w-72 space-y-3 bg-neutral-50 p-6 rounded-2xl border border-black/5">
                           <div className="flex justify-between text-sm text-black/60">
                             <span>Imponibile</span>
                             <span className="font-medium text-black">€ {quote.totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                           </div>
                           <div className="flex justify-between items-center text-sm text-black/60">
                             <div className="flex items-center gap-2">
                               <span>IVA</span>
                               <div className="flex items-center bg-white border border-black/10 rounded px-1.5 py-0.5">
                                 <input 
                                   type="number"
                                   value={vatRate}
                                   onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                                   className="w-8 text-center text-xs bg-transparent focus:outline-none"
                                 />
                                 <span className="text-[10px] font-bold">%</span>
                               </div>
                             </div>
                             <span className="font-medium text-black">€ {(quote.totalAmount * (vatRate / 100)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                           </div>
                           <div className="pt-4 border-t border-black/10 flex justify-between items-center">
                             <span className="text-sm font-bold uppercase tracking-widest">Totale</span>
                             <span className="text-2xl font-bold tracking-tighter text-emerald-600">
                               € {(quote.totalAmount * (1 + vatRate / 100)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                             </span>
                           </div>
                         </div>
                       </div>
                    </div>

                    {/* Footer / Notes */}
                    <div className="p-8 bg-neutral-50/50 border-t border-black/5 space-y-6">
                      {quote.estimatedDimensionsExplanation && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Nota sulle quantità stimate</p>
                          <p 
                            contentEditable 
                            suppressContentEditableWarning
                            onBlur={(e) => {
                              if (quote) {
                                const newExp = e.currentTarget.innerText;
                                let updatedPdfData = quote.pdfData;
                                if (updatedPdfData) {
                                  updatedPdfData = { ...updatedPdfData, estimatedDimensionsExplanation: newExp };
                                }
                                setQuote({ ...quote, estimatedDimensionsExplanation: newExp, pdfData: updatedPdfData });
                              }
                            }}
                            className="text-xs text-black/50 italic leading-relaxed focus:outline-none focus:bg-emerald-50 rounded p-1 -ml-1"
                          >
                            {quote.estimatedDimensionsExplanation}
                          </p>
                        </div>
                      )}
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Note e Condizioni</p>
                        <div 
                          contentEditable 
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            if (quote) {
                              const newNotes = e.currentTarget.innerText;
                              let updatedPdfData = quote.pdfData;
                              if (updatedPdfData) {
                                updatedPdfData = { ...updatedPdfData, notes: newNotes };
                              }
                              setQuote({ ...quote, notes: newNotes, pdfData: updatedPdfData });
                            }
                          }}
                          className="text-xs text-black/60 leading-relaxed focus:outline-none focus:bg-emerald-50 rounded p-1 -ml-1"
                        >
                          {quote.notes}
                        </div>
                      </div>
                      <div className="pt-8 flex justify-between items-end">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Firma del Professionista</p>
                          <div className="h-12 w-48 border-b border-black/10"></div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Firma per Accettazione</p>
                          <div className="h-12 w-48 border-b border-black/10"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-black/5 rounded-3xl bg-white/30"
                >
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-black/20 mb-6">
                    <FileText size={32} />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Nessun preventivo generato</h3>
                  <p className="text-black/40 text-sm max-w-xs">
                    Compila il modulo a sinistra per generare un preventivo professionale basato sull'intelligenza artificiale.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-[1600px] mx-auto px-6 py-12 border-t border-black/5 print:hidden">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-black/40">© 2024 Preventivo Facile AI. Tutti i diritti riservati.</p>
          <div className="flex gap-8">
            <a href="#" className="text-xs text-black/40 hover:text-emerald-600 transition-colors">Termini di Servizio</a>
            <a href="#" className="text-xs text-black/40 hover:text-emerald-600 transition-colors">Privacy Policy</a>
            <a href="#" className="text-xs text-black/40 hover:text-emerald-600 transition-colors">Supporto</a>
          </div>
        </div>
      </footer>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-0 md:p-6 print:hidden"
          >
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-white w-full h-full md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 sm:p-6 border-b border-black/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                  <div className="flex items-center justify-between w-full sm:w-auto">
                    <h2 className="text-lg sm:text-xl font-semibold">I miei preventivi</h2>
                    <button onClick={() => setIsModalOpen(false)} className="sm:hidden p-2 hover:bg-black/5 rounded-full transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 sm:border-l sm:border-black/10 sm:pl-4 w-full sm:w-auto overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                    <button 
                      onClick={exportDatabase}
                      className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 px-3 py-2 rounded-xl transition-all whitespace-nowrap"
                      title="Esporta tutto il database in un file JSON"
                    >
                      <Download size={14} /> Esporta DB
                    </button>
                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black hover:bg-black/5 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap" title="Importa un database da un file JSON">
                      <Upload size={14} /> Importa DB
                      <input type="file" accept=".json" onChange={importDatabase} className="hidden" />
                    </label>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="hidden sm:block p-2 hover:bg-black/5 rounded-full transition-colors shrink-0">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6 border-b border-black/5 bg-neutral-50/50">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
                  <input 
                    type="text"
                    placeholder="Cerca per nome o cliente..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-black/10 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm sm:text-base"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {(() => {
                  const filtered = savedQuotes
                    .filter(q => {
                      const searchTerms = searchQuery.toLowerCase().trim().split(/\s+/);
                      if (searchTerms.length === 0 || (searchTerms.length === 1 && searchTerms[0] === '')) return true;

                      const client = (q.inputs?.clientName || q.data.clientInfo?.name || '').toLowerCase();
                      const job = q.data.jobTitle.toLowerCase();
                      const location = (q.inputs?.siteAddress || q.data.province || '').toLowerCase();
                      const date = new Date(q.date).toLocaleDateString('it-IT').toLowerCase();
                      const quoteName = q.name.toLowerCase();
                      const shortCode = (q.shortCode || '').toLowerCase();
                      const longId = q.id.toLowerCase();
                      
                      const combinedText = `${client} ${job} ${location} ${date} ${quoteName} ${shortCode} ${longId}`;
                      
                      // Every search term must be found in the combined text (AND logic)
                      return searchTerms.every(term => combinedText.includes(term));
                    })
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center text-black/40 py-12">
                        Nessun preventivo trovato.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {filtered.map(q => (
                        <div key={q.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 rounded-2xl border border-black/5 hover:border-emerald-500/30 hover:bg-emerald-50/30 transition-all group relative overflow-hidden gap-4">
                          <div className="flex items-start sm:items-center gap-4 sm:gap-6 flex-1 cursor-pointer w-full" onClick={() => loadQuote(q)}>
                            {/* Reference Index on the left */}
                            <div className="flex flex-col items-center justify-center bg-emerald-600 text-white rounded-xl w-14 h-14 sm:w-16 sm:h-16 shrink-0 shadow-lg shadow-emerald-600/20">
                              <span className="text-[10px] font-black uppercase tracking-tighter opacity-70">N.</span>
                              <span className="text-base sm:text-lg font-black leading-none">{q.shortCode?.split('/')[0] || '-'}</span>
                              <span className="text-[10px] font-bold opacity-70 mt-0.5">{q.shortCode?.split('/')[1] || '-'}</span>
                            </div>

                            <div className="flex-1 min-w-0 w-full">
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 sm:mb-2 gap-1 sm:gap-4">
                                <h4 className="font-bold text-black text-base sm:text-lg leading-tight truncate">
                                  <span className="text-emerald-600 font-black uppercase text-[10px] tracking-widest block mb-0.5">Committente</span>
                                  {q.inputs?.clientName || q.data.clientInfo?.name || 'N/D'}
                                </h4>
                                <div className="sm:text-right shrink-0">
                                  <p className="text-[10px] font-black uppercase text-black/30 tracking-widest leading-none mb-1">Totale</p>
                                  <p className="text-base sm:text-lg font-black text-emerald-600">€ {q.data.totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 sm:gap-y-4">
                                <div className="flex items-center gap-3 text-xs text-black/60">
                                  <div className="w-8 h-8 rounded-xl bg-black/5 flex items-center justify-center shrink-0">
                                    <Briefcase size={14} className="text-black/40" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="font-bold uppercase text-[10px] text-black/30 leading-none mb-1">Lavoro</p>
                                    <p className="truncate font-medium text-sm text-black/80">{q.data.jobTitle}</p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-3 text-xs text-black/60">
                                  <div className="w-8 h-8 rounded-xl bg-black/5 flex items-center justify-center shrink-0">
                                    <MapPin size={14} className="text-black/40" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="font-bold uppercase text-[10px] text-black/30 leading-none mb-1">Località</p>
                                    <p className="truncate font-medium text-sm text-black/80">{q.inputs?.siteAddress || q.data.province}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 text-xs text-black/60">
                                  <div className="w-8 h-8 rounded-xl bg-black/5 flex items-center justify-center shrink-0">
                                    <Calendar size={14} className="text-black/40" />
                                  </div>
                                  <div>
                                    <p className="font-bold uppercase text-[10px] text-black/30 leading-none mb-1">Data</p>
                                    <p className="font-medium text-sm text-black/80">{new Date(q.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 sm:ml-4 w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-black/5">
                            <button 
                              onClick={(e) => { e.stopPropagation(); loadQuote(q); }} 
                              className="w-10 h-10 flex items-center justify-center text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors shadow-sm"
                              title="Apri"
                            >
                              <FolderOpen size={18} />
                            </button>
                            <button 
                              onClick={(e) => deleteQuote(q.id, e)} 
                              className="w-10 h-10 flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shadow-sm"
                              title="Elimina"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Company Data Modal */}
      <AnimatePresence>
        {isCompanyModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCompanyModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">{getTranslation(currentLang, 'companyDataTitle')}</h3>
                    <p className="text-xs text-black/40 font-medium uppercase tracking-wider">{getTranslation(currentLang, 'companyDataSubtitle')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-black/5 flex items-center justify-center text-black/40 hover:text-black transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-black/40 ml-1">{getTranslation(currentLang, 'companyNameLabel')}</label>
                    <input 
                      type="text"
                      value={companyData.name}
                      onChange={(e) => setCompanyData({...companyData, name: e.target.value})}
                      placeholder={getTranslation(currentLang, 'companyNamePlaceholder')}
                      className="w-full bg-neutral-50 border border-black/5 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-black/40 ml-1">{getTranslation(currentLang, 'companyVatLabel')}</label>
                    <input 
                      type="text"
                      value={companyData.vatNumber}
                      onChange={(e) => setCompanyData({...companyData, vatNumber: e.target.value})}
                      placeholder={getTranslation(currentLang, 'companyVatPlaceholder')}
                      className="w-full bg-neutral-50 border border-black/5 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-black/40 ml-1">{getTranslation(currentLang, 'companyAddressLabel')}</label>
                  <input 
                    type="text"
                    value={companyData.address}
                    onChange={(e) => setCompanyData({...companyData, address: e.target.value})}
                    placeholder={getTranslation(currentLang, 'companyAddressPlaceholder')}
                    className="w-full bg-neutral-50 border border-black/5 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-black/40 ml-1">{getTranslation(currentLang, 'companyPhoneLabel')}</label>
                    <input 
                      type="text"
                      value={companyData.phone}
                      onChange={(e) => setCompanyData({...companyData, phone: e.target.value})}
                      placeholder={getTranslation(currentLang, 'companyPhonePlaceholder')}
                      className="w-full bg-neutral-50 border border-black/5 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-black/40 ml-1">{getTranslation(currentLang, 'companyEmailLabel')}</label>
                    <input 
                      type="email"
                      value={companyData.email}
                      onChange={(e) => setCompanyData({...companyData, email: e.target.value})}
                      placeholder={getTranslation(currentLang, 'companyEmailPlaceholder')}
                      className="w-full bg-neutral-50 border border-black/5 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-black/40 ml-1">{getTranslation(currentLang, 'companyWebsiteLabel')}</label>
                  <input 
                    type="text"
                    value={companyData.website}
                    onChange={(e) => setCompanyData({...companyData, website: e.target.value})}
                    placeholder={getTranslation(currentLang, 'companyWebsitePlaceholder')}
                    className="w-full bg-neutral-50 border border-black/5 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                  />
                </div>

                <div className="bg-emerald-50 rounded-2xl p-4 flex items-start gap-3 border border-emerald-100">
                  <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    {getTranslation(currentLang, 'companyDataDescription')}
                  </p>
                </div>
              </div>

              <div className="p-6 border-t border-black/5 bg-neutral-50 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="px-6 py-3 rounded-2xl text-sm font-bold text-black/40 hover:text-black transition-all"
                >
                  {getTranslation(currentLang, 'cancel')}
                </button>
                <button 
                  onClick={() => saveCompanyData(companyData)}
                  className="px-8 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
                >
                  <Save size={18} /> {getTranslation(currentLang, 'saveCompanyData')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:rounded-none { border-radius: 0 !important; }
          main { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          .lg\\:col-span-7 { width: 100% !important; }
        }
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
      `}} />
      </div>
    </ErrorBoundary>
    </div>
  );
}
