from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import tempfile
import os
from pathlib import Path
import torch

app = Flask(__name__)
CORS(app)

torch.set_num_threads(4)  # Set number of threads for PyTorch
torch.set_num_interop_threads(4)  # Set number of interop threads for PyTorch

# Load Whisper model (choose size based on your needs)
# Models: tiny, base, small, medium, large
print("Loading Whisper model...")
model = whisper.load_model("small")  # Change to "large" for better accuracy
print("Model loaded successfully!")

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        print(f"Request files: {list(request.files.keys())}")
        print(f"Request form: {list(request.form.keys())}")
        
        # Check if file is in request
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        print(f"Audio file: {audio_file.filename}")
        
        # Check if file is empty
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            audio_file.save(temp_file.name)
            temp_filename = temp_file.name
            print(f"Saved to temp file: {temp_filename}")
        
        # Check if temp file exists and has content
        if not os.path.exists(temp_filename):
            return jsonify({'error': 'Failed to save temporary file'}), 500
            
        file_size = os.path.getsize(temp_filename)
        print(f"Temp file size: {file_size} bytes")
        
        if file_size == 0:
            os.unlink(temp_filename)
            return jsonify({'error': 'Empty audio file'}), 400
        
        # Transcribe with Indonesian language
        print("Starting transcription...")
        result = model.transcribe(temp_filename, language='id')
        print("Transcription completed")
        
        # Clean up temp file
        os.unlink(temp_filename)
        
        return jsonify({
            'text': result['text'],
            'language': result['language'],
            'segments': result['segments']
        })
    
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'model': 'whisper-base'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5891, debug=False)
    
