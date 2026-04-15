import whisper
import numpy as np
from sklearn.model_selection import ParameterGrid
from jiwer import wer, cer
import json
import time
from datetime import datetime
import os

class WhisperGridSearch:
    def __init__(self, model_name="small", language="id"):
        """
        Initialize Whisper model untuk grid search
        
        Args:
            model_name: whisper model size (tiny, base, small, medium, large)
            language: target language code
        """
        print(f"Loading Whisper model: {model_name}")
        self.model = whisper.load_model(model_name)
        self.language = language
        self.best_params = None
        self.best_score = float('inf')
        self.results = []
        
    def transcribe_with_params(self, audio_path, params):
        """Transcribe audio dengan parameter tertentu"""
        try:
            start_time = time.perf_counter()
            result = self.model.transcribe(
                audio_path,
                language=self.language,
                temperature=params.get('temperature', 0.0),
                compression_ratio_threshold=params.get('compression_ratio_threshold', 2.4),
                logprob_threshold=params.get('logprob_threshold', -1.0),
                no_speech_threshold=params.get('no_speech_threshold', 0.6),
                condition_on_previous_text=params.get('condition_on_previous_text', True),
                initial_prompt=params.get('initial_prompt', None),
                beam_size=params.get('beam_size', 5),
                best_of=params.get('best_of', 5),
                patience=params.get('patience', 1.0),
                length_penalty=params.get('length_penalty', 1.0),
                word_timestamps=params.get('word_timestamps', False),
                fp16=params.get('fp16', True)
            )
            processing_time = time.perf_counter() - start_time
            return result['text'], processing_time
        except Exception as e:
            print(f"Error transcribing: {e}")
            return "", 0
    
    def calculate_metrics(self, reference, hypothesis):
        """
        Calculate WER (Word Error Rate) dan CER (Character Error Rate)
        Lower is better
        
        Returns:
            dict with detailed metrics
        """
        # Hitung WER dan CER
        word_error_rate = wer(reference, hypothesis)
        char_error_rate = cer(reference, hypothesis)
        
        # Hitung accuracy (inverse dari error rate)
        word_accuracy = (1 - word_error_rate) * 100
        char_accuracy = (1 - char_error_rate) * 100
        
        # Hitung jumlah kata dan karakter
        ref_words = len(reference.split())
        hyp_words = len(hypothesis.split())
        ref_chars = len(reference)
        hyp_chars = len(hypothesis)
        
        return {
            'wer': word_error_rate,
            'cer': char_error_rate,
            'word_accuracy': word_accuracy,
            'char_accuracy': char_accuracy,
            'ref_word_count': ref_words,
            'hyp_word_count': hyp_words,
            'ref_char_count': ref_chars,
            'hyp_char_count': hyp_chars
        }
    
    def grid_search_single_audio(self, audio_path, reference_text, param_grid, scoring='wer'):
        """
        Perform grid search untuk 1 audio file
        
        Args:
            audio_path: path ke audio file
            reference_text: ground truth transcription (bisa string atau path ke .txt file)
            param_grid: dictionary of parameters to search
            scoring: 'wer' or 'cer' (default: 'wer')
        
        Returns:
            best_params, best_score, all_results
        """
        # Load reference text jika berupa file path
        if os.path.isfile(reference_text):
            print(f"Loading reference text from: {reference_text}")
            with open(reference_text, 'r', encoding='utf-8') as f:
                reference = f.read().strip()
        else:   
            reference = reference_text.strip()
        
        print(f"\nReference text ({len(reference)} chars, {len(reference.split())} words):")
        print(f"{reference[:200]}..." if len(reference) > 200 else reference)
        
        # Generate all parameter combinations
        param_combinations = list(ParameterGrid(param_grid))
        total_combinations = len(param_combinations)
        
        print(f"\n{'='*70}")
        print(f"Starting Grid Search - Single Audio Mode")
        print(f"{'='*70}")
        print(f"Audio file: {audio_path}")
        print(f"Total parameter combinations: {total_combinations}")
        print(f"Scoring metric: {scoring.upper()}")
        print(f"{'='*70}\n")
        
        start_time = time.time()
        
        for idx, params in enumerate(param_combinations):
            print(f"\n{'─'*70}")
            print(f"[{idx+1}/{total_combinations}] Testing parameters:")
            print(json.dumps(params, indent=2))
            print(f"{'─'*70}")
            
            # Transcribe dengan params ini
            hypothesis, processing_time = self.transcribe_with_params(audio_path, params)
            
            # Calculate metrics
            metrics = self.calculate_metrics(reference, hypothesis)
            
            # Display hasil
            print(f"\n📊 RESULTS:")
            print(f"  Processing Time: {processing_time:.2f}s")
            print(f"  ─────────────────────────────────────")
            print(f"  Word Error Rate (WER): {metrics['wer']:.4f}")
            print(f"  Word Accuracy:         {metrics['word_accuracy']:.2f}%")
            print(f"  ─────────────────────────────────────")
            print(f"  Char Error Rate (CER): {metrics['cer']:.4f}")
            print(f"  Char Accuracy:         {metrics['char_accuracy']:.2f}%")
            print(f"  ─────────────────────────────────────")
            print(f"  Word Count: {metrics['hyp_word_count']} (ref: {metrics['ref_word_count']})")
            print(f"  Char Count: {metrics['hyp_char_count']} (ref: {metrics['ref_char_count']})")
            
            print(f"\n📝 Transcription preview:")
            print(f"  {hypothesis[:150]}..." if len(hypothesis) > 150 else f"  {hypothesis}")
            
            # Simpan hasil
            score = metrics[scoring]
            result = {
                'params': params,
                'score': score,
                'metrics': metrics,
                'hypothesis': hypothesis,
                'processing_time': processing_time
            }
            self.results.append(result)
            
            # Update best params
            if score < self.best_score:
                self.best_score = score
                self.best_params = params.copy()
                print(f"\n  ⭐ NEW BEST SCORE! {scoring.upper()}: {score:.4f}")
        
        total_time = time.time() - start_time
        
        print(f"\n{'='*70}")
        print(f"Grid Search Completed!")
        print(f"{'='*70}")
        print(f"Total time: {total_time/60:.2f} minutes ({total_time:.1f}s)")
        print(f"\n🏆 BEST CONFIGURATION:")
        print(json.dumps(self.best_params, indent=2))
        print(f"\nBest {scoring.upper()} Score: {self.best_score:.4f}")
        
        # Get best result metrics
        best_result = min(self.results, key=lambda x: x['score'])
        best_metrics = best_result['metrics']
        print(f"Best Word Accuracy: {best_metrics['word_accuracy']:.2f}%")
        print(f"Best Char Accuracy: {best_metrics['char_accuracy']:.2f}%")
        print(f"{'='*70}\n")
        
        return self.best_params, self.best_score, self.results
    
    def save_results(self, filepath='whisper_gridsearch_results.json', include_transcriptions=True):
        """Save all results ke JSON file"""
        results_to_save = self.results.copy()
        
        # Option untuk exclude transcription text (bikin file lebih kecil)
        if not include_transcriptions:
            for r in results_to_save:
                r.pop('hypothesis', None)
        
        output = {
            'best_params': self.best_params,
            'best_score': self.best_score,
            'best_metrics': min(self.results, key=lambda x: x['score'])['metrics'],
            'all_results': results_to_save,
            'total_combinations': len(self.results),
            'timestamp': datetime.now().isoformat()
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Results saved to: {filepath}")
        
    def print_top_results(self, top_n=5):
        """Print top N best results"""
        sorted_results = sorted(self.results, key=lambda x: x['score'])
        
        print(f"\n{'='*70}")
        print(f"TOP {min(top_n, len(sorted_results))} BEST CONFIGURATIONS")
        print(f"{'='*70}\n")
        
        for i, result in enumerate(sorted_results[:top_n]):
            metrics = result['metrics']
            print(f"{i+1}. Score: {result['score']:.4f} | "
                  f"Word Acc: {metrics['word_accuracy']:.2f}% | "
                  f"Char Acc: {metrics['char_accuracy']:.2f}%")
            print(f"   Time: {result['processing_time']:.2f}s")
            print(f"   Params: {json.dumps(result['params'], ensure_ascii=False)}")
            print()


# ============== EXAMPLE USAGE ==============

if __name__ == "__main__":
    # Setup
    searcher = WhisperGridSearch(model_name="small", language="id")
    
    # Path ke audio dan reference text
    audio_file = "../temp_audio/input.wav"  # GANTI dengan path audio kamu
    reference_file = "pure.txt"  # GANTI dengan path .txt ground truth kamu
    
    # Atau bisa langsung string:
    # reference_text = "ini adalah contoh transkripsi yang benar"
    
    # Define parameter grid untuk search
    # Start dengan range kecil dulu
    param_grid = {
        'temperature': [0.0, 0.2],
        'beam_size': [1, 2],
        'best_of': [1],
        'compression_ratio_threshold': [2.4, 2.6],
        'logprob_threshold': [-1.0, -0.5],
        'no_speech_threshold': [0.6],
        'condition_on_previous_text': [True],
        'fp16': [False],
    }
    
    # Run grid search
    best_params, best_score, all_results = searcher.grid_search_single_audio(
        audio_path=audio_file,
        reference_text=reference_file,
        param_grid=param_grid,
        scoring='wer'  # atau 'cer'
    )
    
    # Print top results
    searcher.print_top_results(top_n=5)
    
    # Save results
    searcher.save_results('whisper_tuning_results.json', include_transcriptions=True)