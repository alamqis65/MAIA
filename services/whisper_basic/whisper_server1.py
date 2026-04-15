from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import os
import subprocess
import multiprocessing

app = Flask(__name__)
CORS(app)

# Path ke whisper-cli.exe & model
WHISPER_CLI_EXE = "./whisper.cpp/build/bin/whisper-cli.exe"
MODEL_PATH = "./whisper.cpp/ggml-small.bin"

# Jumlah thread default = jumlah logical cores
NUM_THREADS = 4

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Simpan audio user ke temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.filename)[1]) as temp_audio:
            audio_file.save(temp_audio.name)
            temp_filename = temp_audio.name

        # File temp untuk hasil convert WAV mono 16kHz
        temp_wav = temp_filename + "_16k.wav"

        # Convert audio pakai ffmpeg
        subprocess.run([
            "ffmpeg", "-y", "-i", temp_filename,
            "-ac", "1", "-ar", "16000",
            temp_wav
        ], check=True)

        # Jalankan whisper-cli.exe
        cmd = [
            WHISPER_CLI_EXE,
            "-m", MODEL_PATH,
            "-f", temp_wav,
            "-l", "id",
            "-t", str(NUM_THREADS),
            "-otxt",
            "-of", "stdout"  # hasil langsung ke stdout
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)

        # Bersihkan file sementara
        os.unlink(temp_filename)
        os.unlink(temp_wav)

        if result.returncode != 0:
            return jsonify({'error': f'Whisper failed: {result.stderr}'}), 500

        # Ambil hasil transkrip dari stdout
        transcription = result.stdout.strip()

        return jsonify({
            "text": transcription,
            "language": "id"
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'engine': 'whisper.cpp',
        'model': 'ggml-small.bin',
        'threads': NUM_THREADS
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5891, debug=False)
