import { useRef, useState } from "react";

// Define the SOAP data structure
interface SOAPData {
  SOAP: {
    Subjective: {
      keluhan_utama: string | null;
      riwayat_keluhan: string | null;
      gejala_lain: string | null;
    };
    Objective: {
      pemeriksaan_fisik: string | null;
      tanda_vital: string | null;
      hasil_lab: string | null;
    };
    Assessment: {
      diagnosa: string | null;
      diagnosa_banding: string | null;
    };
    Plan: {
      tindakan: string | null;
      resep: string | null;
      anjuran: string | null;
    };
  };
}

// Define possible response structures from your API
interface ApiResponse {
  transcript?: string;
  data?: SOAPData;
  SOAP?: SOAPData["SOAP"];
}

// For direct SOAP responses or wrapped responses
type ApiResponseData = SOAPData | ApiResponse;

export default function App() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [transcript, setTranscript] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [responseJson, setResponseJson] = useState<ApiResponseData | null>(null);
  const [editableData, setEditableData] = useState<SOAPData | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [finalJson, setFinalJson] = useState<SOAPData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("Subjective");

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunks.current = [];

    // Clear previous recording
    setAudioBlob(null);
    setAudioUrl("");
    setTranscript("");
    setConfirmed(false);
    setResponseJson(null);
    setEditableData(null);
    setShowJsonPreview(false);
    setFinalJson(null);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      // Stop all tracks to release microphone
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const sendAudioToN8n = async () => {
    if (!audioBlob) return;

    setProcessing(true);
    const formData = new FormData();
    formData.append("data", audioBlob, "voice.mp3");

    try {
      const res = await fetch("http:/localhost:5678/webhook/stt", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      
      // Handle transcript if available
      if (json.transcript) {
        setTranscript(json.transcript);
      }
      
      setResponseJson(json);

      // Initialize editable data from response
      const soapData = extractSOAPData(json);
      setEditableData(soapData);
      setConfirmed(true);
      setShowJsonPreview(true);
    } catch (err) {
      console.error("Failed to send audio", err);
    } finally {
      setProcessing(false);
    }
  };

  const extractSOAPData = (json: any): SOAPData => {
    // If it's already in SOAP format
    if (json.SOAP) {
      return { SOAP: json.SOAP };
    }
    
    // If it's wrapped in data
    if (json.data?.SOAP) {
      return json.data;
    }
    
    // Create empty SOAP structure
    return createEmptySOAPData();
  };

  const createEmptySOAPData = (): SOAPData => ({
    SOAP: {
      Subjective: {
        keluhan_utama: null,
        riwayat_keluhan: null,
        gejala_lain: null,
      },
      Objective: {
        pemeriksaan_fisik: null,
        tanda_vital: null,
        hasil_lab: null,
      },
      Assessment: {
        diagnosa: null,
        diagnosa_banding: null,
      },
      Plan: {
        tindakan: null,
        resep: null,
        anjuran: null,
      },
    },
  });

  const confirmTranscript = () => {
    setConfirmed(true);
    if (responseJson) {
      const soapData = extractSOAPData(responseJson);
      setEditableData(soapData);
      setShowJsonPreview(true);
    }
  };

  const handleFieldChange = (
    section: keyof SOAPData["SOAP"],
    field: string,
    value: string
  ) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        SOAP: {
          ...prev.SOAP,
          [section]: {
            ...prev.SOAP[section],
            [field]: value || null,
          },
        },
      };
    });
  };

  const confirmJsonEdit = () => {
    if (editableData) {
      setFinalJson(editableData);
      setShowJsonPreview(false);
    }
  };

  const backToTranscript = () => {
    setShowJsonPreview(false);
    setConfirmed(false);
  };

  const startNewRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl("");
    setTranscript("");
    setConfirmed(false);
    setResponseJson(null);
    setEditableData(null);
    setShowJsonPreview(false);
    setFinalJson(null);
    setActiveSection("Subjective");
  };

  const sections = [
    { key: "Subjective", label: "Subjective", icon: "👤" },
    { key: "Objective", label: "Objective", icon: "🔍" },
    { key: "Assessment", label: "Assessment", icon: "📋" },
    { key: "Plan", label: "Plan", icon: "📝" },
  ];

  const renderSection = (sectionKey: keyof SOAPData["SOAP"]) => {
    if (!editableData) return null;
    
    const sectionData = editableData.SOAP[sectionKey];
    const fields = Object.keys(sectionData);

    return (
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
              {field.replace(/_/g, " ")}:
            </label>
            {field.includes("gejala") || field.includes("riwayat") || field.includes("anjuran") ? (
              <textarea
                value={(sectionData as any)[field] || ""}
                onChange={(e) => handleFieldChange(sectionKey, field, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 text-sm"
                placeholder={`Masukkan ${field.replace(/_/g, " ")}`}
              />
            ) : (
              <input
                type="text"
                value={(sectionData as any)[field] || ""}
                onChange={(e) => handleFieldChange(sectionKey, field, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder={`Masukkan ${field.replace(/_/g, " ")}`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 to-blue-200 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center p-8 bg-white rounded-xl shadow-lg">
        <h1 className="text-4xl font-bold mb-4 text-gray-800">
          Medical Voice Recorder
        </h1>
        <p className="text-gray-500 mb-6">
          Record medical consultation and get SOAP structured data
        </p>

        {!audioBlob ? (
          <div>
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`w-32 h-32 rounded-full flex flex-col items-center justify-center text-white focus:outline-none transition-all duration-200 shadow-lg ${
                recording
                  ? "bg-red-500 hover:bg-red-600 shadow-red-200"
                  : "bg-blue-500 hover:bg-blue-600 shadow-blue-200 hover:scale-105"
              }`}
            >
              <div className="text-3xl mb-1">{recording ? "⏹️" : "🎤"}</div>
              <div className="text-sm font-medium">
                {recording ? "Stop" : "Record"}
              </div>
            </button>
            <p className="mt-4 text-sm text-gray-500">
              {recording ? "Recording..." : "Press to start recording"}
            </p>
          </div>
        ) : !transcript ? (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-3 text-gray-700">
                Preview Recording:
              </h2>
              <audio
                src={audioUrl}
                controls
                className="w-full mb-4"
                preload="auto"
              />
              <div className="flex gap-2">
                <button
                  onClick={sendAudioToN8n}
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? "Processing..." : "Process Audio"}
                </button>
                <button
                  onClick={startNewRecording}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Record Again
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {transcript && !confirmed && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-2 text-gray-700">
              Edit Transcript:
            </h2>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your transcript will appear here..."
            />
            <button
              onClick={confirmTranscript}
              className="mt-4 w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              Process SOAP Data
            </button>
          </div>
        )}

        {showJsonPreview && editableData && (
          <div className="mt-6 text-left">
            <h2 className="text-lg font-semibold mb-4 text-gray-700 text-center">
              Edit SOAP Data:
            </h2>
            
            {/* Section Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
              {sections.map((section) => (
                <button
                  key={section.key}
                  onClick={() => setActiveSection(section.key)}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    activeSection === section.key
                      ? "bg-blue-500 text-white"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  <span className="mr-1">{section.icon}</span>
                  {section.label}
                </button>
              ))}
            </div>

            {/* Active Section Content */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              {renderSection(activeSection as keyof SOAPData["SOAP"])}
            </div>

            <div className="flex gap-2">
              <button
                onClick={backToTranscript}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Back to Transcript
              </button>
              <button
                onClick={confirmJsonEdit}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Confirm SOAP Data
              </button>
            </div>
          </div>
        )}

        {finalJson && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-2 text-gray-700">
              Final SOAP JSON:
            </h2>
            <div className="bg-gray-100 p-3 rounded-lg max-h-64 overflow-auto text-xs text-left">
              <pre>{JSON.stringify(finalJson, null, 2)}</pre>
            </div>
            <button
              onClick={startNewRecording}
              className="mt-4 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Record New Audio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}