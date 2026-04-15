from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import tempfile
import os
import torch
import threading
import time
from datetime import datetime

app = Flask(__name__)
CORS(app)

torch.set_num_threads(4)  
torch.set_num_interop_threads(2)  

print("Loading Whisper model...")
model = whisper.load_model("small")
print("Model loaded successfully!")

# Lock global untuk sequential processing
transcribe_lock = threading.Lock()

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        with transcribe_lock:  # hanya 1 request yang boleh jalan di sini
            print(f"Request files: {list(request.files.keys())}")
            
            if 'audio' not in request.files:
                return jsonify({'error': 'No audio file provided'}), 400
            
            audio_file = request.files['audio']
            if audio_file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            
            # Simpan sementara
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                audio_file.save(temp_file.name)
                temp_filename = temp_file.name
            
            if not os.path.exists(temp_filename):
                return jsonify({'error': 'Failed to save temporary file'}), 500
            
            if os.path.getsize(temp_filename) == 0:
                os.unlink(temp_filename)
                return jsonify({'error': 'Empty audio file'}), 400
            
            #start_wall = datetime.now()
            start_perf = time.perf_counter()
            print("Starting transcription...", temp_filename)

            result = model.transcribe(temp_filename, language='id')
            
            end_perf = time.perf_counter()
            #end_wall = datetime.now()
            processing_seconds = end_perf - start_perf
            print("Transcription completed")
            print("Transcription processing time (seconds):", round(processing_seconds, 4))

            os.unlink(temp_filename)
            
            return jsonify({
                'text': result['text'],
                'language': result['language'],
                'segments': result['segments']
            })
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'model': 'whisper-small'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5891, debug=False)
