#!/usr/bin/env python3
"""
Whisper Model Download Script

This script handles downloading Whisper models to a specified cache directory.
It reads configuration from config.py and provides fallback options for SSL issues.
"""

import os
import sys
import ssl
import whisper
import urllib.request
import urllib.error
from pathlib import Path
from config import WHISPER_MODEL, WHISPER_CACHE_DIR


def manual_download_model(model_name, cache_dir):
    """Manually download model files using urllib with SSL disabled.

    Args:
        model_name (str): Name of the Whisper model to download
        cache_dir (str): Directory to cache the model

    Returns:
        bool: True if download successful, False otherwise
    """
    # Whisper model URLs
    model_urls = {
        "tiny": "https://openaipublic.azureedge.net/main/whisper/models/39ecf51c71d59ae5f5b4b2d8e95cb2d0cac095b08b7aa4cc6bbdf88c924a3f11/tiny.pt",
        "base": "https://openaipublic.azureedge.net/main/whisper/models/ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e/base.pt",
        "small": "https://openaipublic.azureedge.net/main/whisper/models/9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt",
        "medium": "https://openaipublic.azureedge.net/main/whisper/models/345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt",
        "large": "https://openaipublic.azureedge.net/main/whisper/models/e4b87e7e0bf463eb8e6956e646f1e277e901512310def2c24bf0e11bd3c28e9a/large.pt"
    }

    if model_name not in model_urls:
        print(f"Unknown model: {model_name}")
        return False

    url = model_urls[model_name]
    model_path = Path(cache_dir) / f"{model_name}.pt"

    print(f"Manually downloading {model_name} model from {url}")
    print(f"Saving to: {model_path}")

    try:
        # Create unverified SSL context
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        # Download with custom SSL context
        with urllib.request.urlopen(url, context=ssl_context) as response:
            with open(model_path, 'wb') as f:
                # Download in chunks to show progress
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                chunk_size = 8192

                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        progress = (downloaded / total_size) * 100
                        print(f"\rDownload progress: {progress:.1f}%", end='', flush=True)

                print()  # New line after progress

        print(f"Model downloaded successfully to {model_path}")
        return True

    except Exception as e:
        print(f"Manual download failed: {e}")
        return False

def download_whisper_model(with_ssl_fallback=True):
    """Download Whisper model with optional SSL fallback.

    Args:
        with_ssl_fallback (bool): Whether to try SSL-disabled download on failure

    Returns:
        bool: True if download successful, False otherwise
    """
    try:
        # Get configuration from config.py
        model_name = WHISPER_MODEL
        cache_dir = WHISPER_CACHE_DIR

        # Expand user directory if cache_dir starts with ~
        cache_dir = os.path.expanduser(cache_dir)

        # Create cache directory if it doesn't exist
        os.makedirs(cache_dir, exist_ok=True)

        print(f'Downloading Whisper model: {model_name}')
        print(f'Cache directory: {cache_dir}')

        # Set the cache directory environment variable for whisper
        os.environ['XDG_CACHE_HOME'] = cache_dir

        # Try downloading with SSL verification first
        try:
            model = whisper.load_model(model_name, download_root=cache_dir)
            print('Model downloaded successfully!')
            print(f'Model cached in: {cache_dir}')
            return True
        except Exception as ssl_error:
            if not with_ssl_fallback:
                raise ssl_error

            print(f'Download failed with SSL verification: {ssl_error}')
            print('Trying with SSL verification disabled...')

            # Save original SSL context
            original_context = ssl._create_default_https_context

            try:
                # Method 1: Disable SSL verification completely
                ssl._create_default_https_context = ssl._create_unverified_context
                # Also set SSL environment variables
                os.environ['PYTHONHTTPSVERIFY'] = '0'
                os.environ['CURL_CA_BUNDLE'] = ''
                model = whisper.load_model(model_name, download_root=cache_dir)
                print('Model downloaded successfully (with SSL workaround)!')
                print(f'Model cached in: {cache_dir}')
                print('Note: SSL verification was disabled for download. This is OK for local development.')
                return True
            except Exception as fallback_error:
                print(f'SSL workaround also failed: {fallback_error}')
                print('Trying alternative SSL context...')
                try:
                    # Method 2: Create custom SSL context with relaxed settings
                    def create_unverified_context():
                        context = ssl.create_default_context()
                        context.check_hostname = False
                        context.verify_mode = ssl.CERT_NONE
                        return context
                    ssl._create_default_https_context = create_unverified_context
                    model = whisper.load_model(model_name, download_root=cache_dir)
                    print('Model downloaded successfully (with alternative SSL workaround)!')
                    print(f'Model cached in: {cache_dir}')
                    print('Note: SSL verification was disabled for download. This is OK for local development.')
                    return True
                except Exception as final_error:
                    print(f'All SSL workarounds failed: {final_error}')
                    print('Trying manual download as final fallback...')
                    # Try manual download as last resort
                    if manual_download_model(model_name, cache_dir):
                        return True
                    else:
                        raise final_error
            finally:
                # Restore original SSL context
                ssl._create_default_https_context = original_context
                # Clean up environment variables
                os.environ.pop('PYTHONHTTPSVERIFY', None)
                os.environ.pop('CURL_CA_BUNDLE', None)

    except Exception as e:
        print(f'Download failed: {e}')
        print('\n🔧 Troubleshooting tips:')
        print('1. Check your internet connection')
        print('2. Try connecting to a different network (non-corporate)')
        print('3. Contact your network administrator about SSL certificate issues')
        print('4. You can also download the model manually from: https://github.com/openai/whisper')
        return False

def main():
    """Main function to handle command line execution."""
    try:
        success = download_whisper_model()
        if success:
            print('\n✅ Model download completed successfully!')
            sys.exit(0)
        else:
            print('\n❌ Model download failed!')
            print('Don\'t worry - the model will be downloaded automatically on first transcription')
            sys.exit(1)
    except KeyboardInterrupt:
        print('\n⚠️  Download interrupted by user')
        sys.exit(130)
    except Exception as e:
        print(f'\n❌ Unexpected error: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()
