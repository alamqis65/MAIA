'use client';
import { useRef, useState } from 'react';

const GATEWAY = `http://${process.env.NEXT_PUBLIC_GATEWAY_HOST || 'localhost'}:${process.env.NEXT_PUBLIC_GATEWAY_PORT || '4000'}`;
const TRANSCRIBER_URL = `http://${process.env.NEXT_PUBLIC_TRANSCRIBER_HOST || 'localhost'}:${process.env.NEXT_PUBLIC_TRANSCRIBER_PORT || '4010'}`;
const COMPOSER_URL = `http://${process.env.NEXT_PUBLIC_COMPOSER_HOST || 'localhost'}:${process.env.NEXT_PUBLIC_COMPOSER_PORT || '4020'}`;

const DEFAULT_LANGUAGE = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE || 'id';
const DEFAULT_PATIENT_ID = process.env.NEXT_PUBLIC_DEFAULT_PATIENT_ID || 'P-0001';

// Helper function to render any object dynamically
function renderObjectContent(obj: any, depth: number = 0): React.ReactNode {
   if (obj === null || obj === undefined) return 'Not documented';

   if (
      typeof obj === 'string' ||
      typeof obj === 'number' ||
      typeof obj === 'boolean'
   ) {
      return obj.toString();
   }

   if (Array.isArray(obj)) {
      return (
         <ul style={{ paddingLeft: depth > 0 ? 20 : 0, margin: '4px 0' }}>
            {obj.map((item, index) => (
               <li key={index}>
                  {typeof item === 'object'
                     ? renderObjectContent(item, depth + 1)
                     : item}
               </li>
            ))}
         </ul>
      );
   }

   if (typeof obj === 'object') {
      return (
         <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            {Object.entries(obj).map(([key, value]) => (
               <div key={key} style={{ marginBottom: 8 }}>
                  <strong style={{ textTransform: 'capitalize' }}>
                     {key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str) => str.toUpperCase())}
                     :
                  </strong>{' '}
                  {typeof value === 'object' ? (
                     <div style={{ marginTop: 4 }}>
                        {renderObjectContent(value, depth + 1)}
                     </div>
                  ) : (
                     <span>{String(value)}</span>
                  )}
               </div>
            ))}
         </div>
      );
   }

   return obj.toString();
}

export default function Page() {
   const fileRef = useRef<HTMLInputElement | null>(null);

   const [startedAt, setStartedAt] = useState<string>('');
   const [processingSecs, setProcessingSecs] = useState<number>(0);
   const [transcript, setTranscript] = useState<string>('');

   const [soapi, setSoapi] = useState<any>(null);
   const [busy, setBusy] = useState(false);

   async function handleTranscribe() {
      const f = fileRef.current?.files?.[0];
      if (!f) return alert('Pilih file audio (wav/mp3/m4a)');

      // Kirim langsung ke transcriber service (port 4010)
      const form = new FormData();
      form.append('audio', f);
      form.append('language', DEFAULT_LANGUAGE);
      form.append('publish', 'true');

      setBusy(true);
      try {
         const res = await fetch(`${TRANSCRIBER_URL}/transcriber/transcribe`, {
            method: 'POST',
            body: form,
         });
         const data = await res.json();

         setStartedAt(data.meta.started_at || '');
         setProcessingSecs(data.meta.processing_seconds || 0);
         
         if (!res.ok) throw new Error(data.error || 'Transcribe gagal');
         setTranscript(data.transcript || '');
      } catch (e: any) {
         alert(`fetch: ${TRANSCRIBER_URL}/transcriber/transcribe\n${e.message}`);
      } finally {
         setBusy(false);
      }
   }

   async function handleCompose() {
      if (!transcript) return alert('Transkrip kosong');
      setBusy(true);
      try {
         const res = await fetch(`${COMPOSER_URL}/compose`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               transcript,
               patient: { displayId: DEFAULT_PATIENT_ID },
               language: DEFAULT_LANGUAGE,
            }),
         });
         const data = await res.json();
         if (!res.ok) throw new Error(data.error || 'Compose gagal');
         setSoapi(data);
      } catch (e: any) {
         alert(`fetch: ${COMPOSER_URL}/compose\n${e.message}`);
      } finally {
         setBusy(false);
      }
   }

   return (
      <main style={{ maxWidth: 800, margin: '24px auto', padding: 16 }}>
         <h1>SOAPI Generator Demo (Whisper → LLM)</h1>
         <p><b>Generate SOAPI</b> dari voice rekam medis.</p>
         <p><b>Prosedur</b></p>  
         <ol>
            <li>Siapkan file berisi voice hasil rekam medis (bisa format mp3).</li>
            <li>Upload file voice: tekan tombol <b>Browse</b> lalu pilih file voice.</li>
            <li>Transcribe voice ke text: tekan tombol <b>Transcribe</b> untuk memulai proses transcribe voice ke text, tunggu sampai muncul text hasil transcribe.</li>
            <li>Generate format SOAPI: tekan tombol <b>Compose SOAPI</b> untuk memulai proses generate SOAPI dari text hasil transcrbie, tunggu sampai muncul hasil SOAPI.</li>
         </ol>

         <div
            style={{
               marginTop: 16,
               border: '1px solid #ddd',
               padding: 16,
               borderRadius: 8,
            }}
         >
            <input type="file" accept="audio/*" ref={fileRef} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
               <button onClick={handleTranscribe} disabled={busy}>
                  Transcribe
               </button>
               <button onClick={handleCompose} disabled={busy || !transcript}>
                  Compose SOAPI
               </button>
            </div>
         </div>

         {transcript && (
            <section style={{ marginTop: 16 }}>
               <h3>Transcript</h3>
               <p>Started at: {startedAt}, Processing time: {processingSecs} seconds</p>
               <pre
                  style={{
                     whiteSpace: 'pre-wrap',
                     background: '#f9f9f9',
                     padding: 12,
                  }}
               >
                  {transcript}
               </pre>
            </section>
         )}

         {soapi && (
            <section style={{ marginTop: 16 }}>
               <h3>SOAPI (JSON)</h3>
               <pre
                  style={{
                     whiteSpace: 'pre-wrap',
                     background: '#f4f6f8',
                     padding: 12,
                  }}
               >
                  {JSON.stringify(soapi, null, 2)}
               </pre>
               <h3>SOAPI (View)</h3>
               <div style={{ border: '1px solid #eee', padding: 12 }}>
                  {soapi.soapi &&
                     Object.entries(soapi.soapi).map(([section, content]) => (
                        <div key={section} style={{ marginBottom: 16 }}>
                           <h4
                              style={{
                                 textTransform: 'capitalize',
                                 marginBottom: 8,
                              }}
                           >
                              <b>{section}:</b>
                           </h4>
                           <div
                              style={{
                                 paddingLeft: 12,
                                 border: '1px solid #f0f0f0',
                                 padding: 8,
                                 borderRadius: 4,
                              }}
                           >
                              {renderObjectContent(content)}
                           </div>
                        </div>
                     ))}
               </div>
            </section>
         )}
      </main>
   );
}
