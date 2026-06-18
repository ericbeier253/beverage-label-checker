"use client";

import { useState, useEffect, useRef } from "react";
import { ValidationResult } from "@/lib/validation";

type ProcessStatus = 'Needs Review' | 'Passed' | 'Not Found' | 'Error' | 'Certified';

interface ImageExtraction {
  url: string;
  filename: string;
  orientation: string;
  raw: any;
  mergedDataAfter?: any;
}

interface BottleGroup {
  unique_key: string;
  description: string;
  images: ImageExtraction[];
  mergedData: any;
  
  status: ProcessStatus;
  results: ValidationResult[] | null;
  discoveredFormId: string | null;
  discoveredHash: string | null;
  expectedForm: any | null;
  notFoundError: { hash: string, normalized: any } | null;
  
  overrides: Record<string, boolean>;
  analystComments: Record<string, string>;
  
  consoleLogs: string[];
  apiMessage: string | null;
  isApproving: boolean;
  isFuzzyMatch?: boolean;
}

interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'Queued' | 'Analyzing';
}

/**
 * Merges newly extracted label data into the existing cumulative bottle state.
 * It prioritizes previously extracted fields, only overwriting them if they are
 * currently blank, null, or "NaN". This ensures that the front label's primary
 * branding isn't accidentally overwritten by a generic back label.
 */
function mergeExtractions(existing: any, incoming: any) {
  const evaluateComplete = (data: any) => {
    const hasBrand = data.brandName && data.brandName !== "";
    const hasClass = data.classType && data.classType !== "";
    const hasAbv = (data.alcvol && data.alcvol !== "NaN") || (data.proof && data.proof !== "NaN");
    const hasNet = data.netContents && data.netContents !== "";
    const hasGov = data.governmentWarning && data.governmentWarning !== "";
    return !!(hasBrand && hasClass && hasAbv && hasNet && hasGov);
  };

  if (!existing) {
    const start = { ...incoming };
    start.isComplete = evaluateComplete(start);
    return start;
  }
  
  const merged = { ...existing };
  const fields = ['brandName', 'classType', 'alcvol', 'proof', 'netContents', 'governmentWarning'];
  
  for (const f of fields) {
    // Only update the field if the existing state is completely empty or unresolved ("NaN")
    if (!merged[f] || merged[f] === "NaN" || merged[f] === "") {
      // Ensure the incoming image actually has valid data to offer before overwriting
      if (incoming[f] && incoming[f] !== "NaN" && incoming[f] !== "") {
        merged[f] = incoming[f];
      }
    }
  }

  // Concatenate descriptions so the AI gets cumulative visual context
  if (incoming.description) {
    merged.description = `${merged.description}\n${incoming.description}`;
  }

  merged.isComplete = evaluateComplete(merged);

  return merged;
}

export default function Home() {
  const [uploadQueue, setUploadQueue] = useState<QueuedFile[]>([]);
  const [bottleGroups, setBottleGroups] = useState<Record<string, BottleGroup>>({});
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [globalLogs, setGlobalLogs] = useState<string[]>([]);
  
  const processingRef = useRef(false);

  const addGlobalLog = (msg: string) => {
    setGlobalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const processNextInQueue = async (currentQueue: QueuedFile[], currentGroups: Record<string, BottleGroup>) => {
    if (processingRef.current) return;
    
    const nextItem = currentQueue.find(item => item.status === 'Queued');
    if (!nextItem) return;

    processingRef.current = true;
    
    // Mark as analyzing
    setUploadQueue(prev => prev.map(item => item.id === nextItem.id ? { ...item, status: 'Analyzing' } : item));
    addGlobalLog(`[Queue] Pulled ${nextItem.file.name} for processing...`);

    const formData = new FormData();
    formData.append("file", nextItem.file);
    
    // Construct the context array sent to the Azure OpenAI extraction endpoint.
    // This provides the AI with a live snapshot of all discovered bottles, their
    // current merged data, and a deterministic "isComplete" flag to guide deductive reasoning.
    const contextArray = Object.values(currentGroups).map(g => {
      const md = g.mergedData || {};
      
      // Determine if the core TTB fields are completely populated.
      const hasBrand = md.brandName && md.brandName !== "";
      const hasClass = md.classType && md.classType !== "";
      const hasAbv = (md.alcvol && md.alcvol !== "NaN") || (md.proof && md.proof !== "NaN");
      const hasNet = md.netContents && md.netContents !== "";
      const hasGov = md.governmentWarning && md.governmentWarning !== "";
      
      const isComplete = hasBrand && hasClass && hasAbv && hasNet && hasGov;

      return {
        unique_key: g.unique_key,
        description: g.description, // Initial visual description of the first label (usually front)
        isComplete: !!isComplete, // Boolean flag to heavily deter the AI from merging onto finished bottles
        current_extracted_data: g.mergedData // Full merged state for gap-filling deduction
      };
    }).filter(ctx => {
      // HARD-BAN: If a bottle is fully populated, completely remove it from the AI's context.
      // This guarantees the AI can never accidentally merge a rogue label (or a duplicate 
      // label) onto a finished bottle, preventing cross-contamination in large batches.
      return !ctx.isComplete;
    });
    formData.append("context", JSON.stringify(contextArray));

    try {
      // STEP 1: EXTRACT
      addGlobalLog(`[Extractor] Calling AI Extractor with ${contextArray.length} known contexts...`);
      const extractRes = await fetch("/api/extract", { 
        method: "POST", 
        headers: {
          'x-access-key': localStorage.getItem('access_key') || ''
        },
        body: formData 
      });      const extractData = await extractRes.json();

      if (!extractRes.ok) {
        const detailMsg = extractData.details?.error?.message;
        throw new Error(detailMsg ? `Gemini API Error: ${detailMsg}` : (extractData.error || "Extraction failed"));
      }

      const raw = extractData.extracted;
      const key = raw.unique_key || `unknown_${Date.now()}`;
      
      addGlobalLog(`[Matcher] Extracted key: ${key}`);

      const existingGroup = currentGroups[key];
      const mergedData = mergeExtractions(existingGroup ? existingGroup.mergedData : null, raw);
      
      if (existingGroup) {
        addGlobalLog(`[Merger] Combined with existing group data for ${key}`);
      } else {
        addGlobalLog(`[Merger] Created new group for ${key}`);
      }

      let logs = existingGroup ? existingGroup.consoleLogs : [];
      logs.push(`\n[${new Date().toLocaleTimeString()}] [API/Extract] Analyzed ${nextItem.file.name}`);
      logs.push(`Detected Key: ${key}`);
      logs.push(`Raw Extraction:\n${JSON.stringify(raw, null, 2)}`);
      
      if (existingGroup) {
        logs.push(`Merged with existing group data.`);
      }

      // STEP 2: VALIDATE
      logs.push(`\n[${new Date().toLocaleTimeString()}] [API/Validate] Running DB lookup & validation on merged data...`);
      const valRes = await fetch("/api/validate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-access-key": localStorage.getItem("access_key") || ""
        },
        body: JSON.stringify({ mergedData })
      });
      const valData = await valRes.json();

      const newImage: ImageExtraction = {
        url: extractData.imageUrl,
        filename: nextItem.file.name,
        orientation: "Removed Schema Key",
        raw: raw,
        mergedDataAfter: mergedData
      };

      setBottleGroups(prev => {
        const group = prev[key] || {
          unique_key: key,
          description: raw.description,
          images: [],
          overrides: {},
          analystComments: {},
          isApproving: false
        };

        const updatedImages = [...group.images, newImage];

        if (!valRes.ok) {
          if (valRes.status === 404) {
            logs.push(`[Error] Database Lookup Failed. No form found for hash: ${valData.hash}`);
            
            const synthValidation = [
              { field: 'Brand Name', expected: 'Missing Form', actual: mergedData.brandName, match: false, isExactRule: false },
              { field: 'Class/Type', expected: 'Missing Form', actual: mergedData.classType, match: false, isExactRule: false },
              { field: 'ABV / Proof', expected: 'Missing Form', actual: mergedData.alcvol !== "NaN" ? mergedData.alcvol : mergedData.proof, match: false, isExactRule: false },
              { field: 'Net Contents', expected: 'Missing Form', actual: mergedData.netContents, match: false, isExactRule: false },
              { field: 'Government Warning', expected: 'Missing Form', actual: mergedData.governmentWarning, match: false, isExactRule: false }
            ];

            return {
              ...prev,
              [key]: {
                ...group,
                images: updatedImages,
                mergedData,
                status: 'Not Found',
                notFoundError: { hash: valData.hash, normalized: valData.normalized },
                results: synthValidation,
                apiMessage: null,
                consoleLogs: logs
              }
            };
          } else {
            logs.push(`[Error] Validation API failed.`);
            return {
              ...prev,
              [key]: {
                ...group,
                images: updatedImages,
                mergedData,
                status: 'Error',
                apiMessage: valData.error,
                consoleLogs: logs
              }
            };
          }
        }

        const allPassed = valData.validation.every((r: any) => r.match);
        logs.push(`[Success] Matched Application ID: ${valData.formId}`);
        logs.push(`Form Record Data:\n${JSON.stringify(valData.expectedForm, null, 2)}`);
        
        addGlobalLog(`[Validator] Match found! Application ${valData.formId} (${allPassed ? 'Passed' : 'Needs Review'})`);

        // If it was already Certified, keep it Certified
        const finalStatus = group.status === 'Certified' ? 'Certified' : (allPassed ? 'Passed' : 'Needs Review');

        return {
          ...prev,
          [key]: {
            ...group,
            images: updatedImages,
            mergedData,
            status: finalStatus,
            results: valData.validation,
            discoveredFormId: valData.formId,
            discoveredHash: valData.hash,
            expectedForm: valData.expectedForm,
            notFoundError: null,
            apiMessage: null,
            consoleLogs: logs,
            isFuzzyMatch: valData.isFuzzyMatch
          }
        };
      });

      // Auto-select the first newly created group if none active
      if (!activeGroupId) {
        setActiveGroupId(key);
      }

    } catch (error: any) {
      console.error(error);
      addGlobalLog(`[ERROR] ${nextItem.file.name} Pipeline Failed: ${error.message}`);
    } finally {
      setUploadQueue(prev => prev.filter(item => item.id !== nextItem.id));
      processingRef.current = false;
    }
  };

  useEffect(() => {
    processNextInQueue(uploadQueue, bottleGroups);
  }, [uploadQueue]);

  const addFilesToQueue = (files: FileList | File[]) => {
    const newItems: QueuedFile[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'Queued'
    }));
    setUploadQueue(prev => [...prev, ...newItems]);
  };

  const activeGroup = activeGroupId ? bottleGroups[activeGroupId] : null;

  const updateActiveGroup = (updates: Partial<BottleGroup>) => {
    if (!activeGroupId) return;
    setBottleGroups(prev => ({
      ...prev,
      [activeGroupId]: { ...prev[activeGroupId], ...updates }
    }));
  };

  const handleOverride = (field: string) => {
    if (!activeGroup) return;
    const newOverrides = { ...activeGroup.overrides, [field]: !activeGroup.overrides[field] };
    const isNowPassing = activeGroup.results?.every(r => r.match || newOverrides[r.field]);
    updateActiveGroup({ 
      overrides: newOverrides,
      status: activeGroup.status !== 'Certified' && isNowPassing ? 'Passed' : (activeGroup.status !== 'Certified' ? 'Needs Review' : 'Certified')
    });
  };

  const handleCertify = async () => {
    if (!activeGroup || !activeGroup.discoveredFormId) return;
    updateActiveGroup({ isApproving: true });
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-access-key": localStorage.getItem("access_key") || ""
        },
        body: JSON.stringify({ formId: activeGroup.discoveredFormId, imageUrl: activeGroup.images[0]?.url })
      });
      if (res.ok) {
        updateActiveGroup({
          status: 'Certified',
          isApproving: false,
          consoleLogs: [...activeGroup.consoleLogs, `\n[${new Date().toLocaleTimeString()}] [Success] Application ${activeGroup.discoveredFormId} Certified! Status set to Approved.`]
        });
      }
    } catch (error) {
      updateActiveGroup({ isApproving: false });
    }
  };

  const generateMailto = () => {
    if (!activeGroup || !activeGroup.expectedForm || !activeGroup.expectedForm.contactEmail || !activeGroup.results) return '#';
    
    const email = activeGroup.expectedForm.contactEmail;
    const subject = encodeURIComponent(`TTB Label Application Needs Review - ${activeGroup.discoveredFormId}`);
    
    let bodyText = `Hello,\n\nYour recent label application requires review due to the following discrepancies between the submitted application data and the extracted label text:\n\n`;
    
    activeGroup.results.forEach(res => {
      if (!res.match && !activeGroup.overrides[res.field]) {
        bodyText += `Field: ${res.field}\n`;
        bodyText += `Expected (Database): ${res.expected}\n`;
        bodyText += `Found (Label): ${res.actual || "Not detected"}\n\n`;
      }
    });
    
    bodyText += `Please correct the application data or provide an updated label image.\n\nThank you,\nTTB Analyst`;
    
    return `mailto:${email}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <div className="max-w-[1500px] mx-auto space-y-6">
        
        <header className="border-b pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">TTB Contextual Batch Processing</h1>
            <p className="text-gray-600 mt-2">Upload multiple images (e.g. front and back of the same bottle). The AI will automatically group them, merge the extracted data, and validate against the database.</p>
          </div>
          <a href="/forms" className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold py-2 px-4 rounded-lg shadow-sm transition-colors text-sm mb-2 shrink-0">
            🗄️ Manage Database
          </a>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* SIDEBAR QUEUE */}
          <section className="lg:col-span-1 space-y-4">
            
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) addFilesToQueue(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors bg-white ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
            >
              <div className="text-gray-500">
                <p className="mb-2 text-sm font-bold">Add to Batch</p>
                <input type="file" id="file" multiple className="hidden" onChange={(e) => { if (e.target.files) addFilesToQueue(e.target.files) }} accept="image/*" />
                <label htmlFor="file" className="cursor-pointer bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 text-sm font-medium inline-block transition-colors">Browse files</label>
              </div>
            </div>

            {uploadQueue.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 border-b font-bold text-xs text-gray-500 uppercase tracking-wider">
                  Pending Extraction Queue ({uploadQueue.length})
                </div>
                <div className="max-h-40 overflow-y-auto divide-y">
                  {uploadQueue.map(item => (
                    <div key={item.id} className="p-3 flex items-center gap-3 bg-white">
                      <img src={item.previewUrl} alt="thumb" className="w-8 h-8 object-cover rounded border" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{item.file.name}</p>
                        <span className={`text-[10px] uppercase font-bold ${item.status === 'Analyzing' ? 'text-blue-600 animate-pulse' : 'text-gray-400'}`}>{item.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 border-b font-bold text-sm text-gray-700 flex justify-between">
                <span>Discovered Bottles</span>
                <span>{Object.values(bottleGroups).length}</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto divide-y">
                {Object.keys(bottleGroups).length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">No bottles grouped yet</div>
                ) : (
                  Object.values(bottleGroups).map(group => (
                    <button 
                      key={group.unique_key} 
                      onClick={() => setActiveGroupId(group.unique_key)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${activeGroupId === group.unique_key ? 'bg-blue-50 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                    >
                      <div className="flex gap-2 mb-2 overflow-x-auto">
                        {group.images.map((img, i) => (
                          <img key={i} src={img.url} alt="thumb" className="w-12 h-12 object-cover rounded border bg-gray-100 shrink-0" />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{group.unique_key}</p>
                        <p className="text-xs text-gray-500 truncate mb-1">{group.images.length} images merged</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          group.status === 'Certified' ? 'bg-green-600 text-white' :
                          group.status === 'Passed' ? 'bg-green-100 text-green-700' :
                          group.status === 'Not Found' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {group.status}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* GLOBAL SYSTEM LOGS */}
            <div className="bg-black text-green-400 p-4 rounded-xl shadow-sm border border-gray-800 flex-col flex h-64">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 shrink-0 flex justify-between">
                <span>Global System Logs</span>
                <button onClick={() => setGlobalLogs([])} className="hover:text-white transition-colors">Clear</button>
              </div>
              <div className="flex-1 overflow-y-auto font-mono text-[10px] whitespace-pre-wrap flex flex-col justify-end">
                <div>
                  {globalLogs.length === 0 ? <span className="text-gray-600">Waiting for activity...</span> : globalLogs.map((log, idx) => <div key={idx} className={`mb-1 ${log.includes('[ERROR]') ? 'text-red-400' : ''}`}>{log}</div>)}
                </div>
              </div>
            </div>

          </section>

          {/* ACTIVE VIEWER SECTION */}
          <section className="lg:col-span-3">
            {!activeGroup ? (
              <div className="h-full min-h-[600px] flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl shadow-sm border border-dashed p-12">
                <span className="text-4xl mb-4">🗂️</span>
                <p className="font-medium text-lg text-gray-600">Select a Bottle Group from the sidebar</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* Viewer Left: Images & Logs */}
                <div className="space-y-6 flex flex-col h-full">
                  <div className="bg-white p-4 rounded-xl shadow-sm border">
                    <h3 className="text-sm font-bold mb-2">Grouped Images ({activeGroup.images.length})</h3>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {activeGroup.images.map((img, i) => (
                        <div key={i} className="flex-shrink-0 w-48">
                          <img src={img.url} alt="label" className="w-full h-48 object-contain bg-gray-100 rounded border" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <details className="bg-white p-4 rounded-xl shadow-sm border cursor-pointer group flex-1 overflow-y-auto">
                    <summary className="text-sm font-bold outline-none group-hover:text-blue-600 transition-colors">
                      🔍 Expand Merge Debugger
                    </summary>
                    <div className="mt-4 space-y-6">
                      {activeGroup.images.map((img, i) => (
                        <div key={i} className="space-y-2">
                          <div className="text-xs font-mono bg-gray-50 p-3 border rounded shadow-sm">
                             <strong className="text-blue-600 block mb-1">Image {i+1} Raw Extraction:</strong> 
                             {JSON.stringify(img.raw)}
                          </div>
                          <div className="text-xs font-mono bg-green-50 p-3 border border-green-200 rounded shadow-sm">
                            <strong className="text-green-700 block mb-1">Merged State After Image {i+1}:</strong> 
                            {JSON.stringify(img.mergedDataAfter)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>

                {/* Viewer Right: Validation Results */}
                <div>
                  {activeGroup.notFoundError && (
                    <div className="mb-6 p-6 bg-red-50 border border-red-200 text-red-900 rounded-xl shadow-sm">
                      <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><span>❌</span> Form Not Found</h2>
                      <p className="text-sm mb-4">The AI extracted and merged the label text, but we couldn't find a matching application in the database for the derived lookup hash.</p>
                      <div className="bg-white p-3 rounded border border-red-100 text-sm font-mono mb-2">
                        <span className="text-gray-500 block text-xs uppercase mb-1">Lookup Hash</span>
                        {activeGroup.notFoundError.hash}
                      </div>
                    </div>
                  )}

                  {activeGroup.status === 'Certified' ? (
                    <div className="bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden flex flex-col items-center justify-center p-12 text-center h-full min-h-[500px]">
                      <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center text-5xl mb-6 shadow-sm">✓</div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">Label Certified</h2>
                      <p className="text-gray-600">Application <strong>{activeGroup.discoveredFormId}</strong> approved.</p>
                    </div>
                  ) : activeGroup.results ? (
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col h-full max-h-[850px]">
                      <div className="bg-gray-100 px-6 py-4 border-b flex justify-between items-center shrink-0">
                        <h2 className="text-lg font-bold">Verification Results</h2>
                        <div className="text-right">
                          <span className="text-sm font-bold text-gray-700 block">ID: {activeGroup.discoveredFormId}</span>
                          <span className="text-xs text-gray-500 font-mono">Hash: {activeGroup.discoveredHash}</span>
                        </div>
                      </div>

                      {activeGroup.isFuzzyMatch && (
                        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-yellow-800 text-sm flex items-center gap-2 shrink-0">
                          <span className="text-lg">⚠️</span>
                          <p><strong>Exact lookup failed.</strong> Displaying closest match below. Please carefully review the mismatched fields.</p>
                        </div>
                      )}
                      
                      <div className="divide-y overflow-y-auto flex-1">
                        {activeGroup.results.map((res, idx) => {
                          const isPass = res.match || activeGroup.overrides[res.field];
                          return (
                            <div key={idx} className="p-5 transition-colors hover:bg-gray-50">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xl ${isPass ? 'text-green-500' : 'text-red-500'}`}>{isPass ? '✅' : '❌'}</span>
                                  <h3 className="font-bold text-gray-800">{res.field}</h3>
                                </div>
                                <label className="text-xs font-semibold text-gray-600 flex items-center gap-2 cursor-pointer bg-white px-2 py-1 rounded border shadow-sm hover:bg-gray-50">
                                  <input type="checkbox" checked={activeGroup.overrides[res.field] || false} onChange={() => handleOverride(res.field)} className="w-3 h-3 text-blue-600 rounded"/>
                                  Analyst Override
                                </label>
                              </div>
                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-gray-50 p-2 rounded border">
                                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Expected (Database)</span>
                                  <p className="text-xs text-gray-800 leading-relaxed">{res.expected}</p>
                                </div>
                                <div className={`p-2 rounded border ${res.match ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Found (AI Extraction)</span>
                                  <p className="text-xs font-medium text-gray-800 leading-relaxed">{res.actual || "Not detected"}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-5 bg-gray-50 border-t flex justify-end shrink-0 gap-3">
                        {(() => {
                          const allPassed = activeGroup.results.every(r => r.match || activeGroup.overrides[r.field]);
                          const hasUnresolvedErrors = activeGroup.results.some(r => !r.match && !activeGroup.overrides[r.field]);
                          return (
                            <>
                              {hasUnresolvedErrors && activeGroup.expectedForm?.contactEmail && (
                                <a
                                  href={generateMailto()}
                                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                                >
                                  ✉️ Email POC
                                </a>
                              )}
                              <button
                                onClick={handleCertify}
                                disabled={!allPassed || activeGroup.isApproving || !activeGroup.discoveredFormId}
                                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${allPassed && !activeGroup.isApproving && activeGroup.discoveredFormId ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                              >
                                {activeGroup.isApproving ? 'Certifying...' : 'Certify Label ✅'}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
}
