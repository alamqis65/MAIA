from waitress import serve
from whisper_server import app
import os

if __name__ == '__main__':
    # Production configuration
    port = int(os.environ.get('PORT', 5891))
    host = os.environ.get('HOST', '0.0.0.0')
    
    print(f"Starting production server on {host}:{port}")
    print("Server ready for hospital deployment!")
    
    # Serve with Waitress (production WSGI server)
    serve(app, 
          host=host, 
          port=port,
          threads=4,  # Adjust based on your server capacity
          connection_limit=1000,
          cleanup_interval=30,
          channel_timeout=120)
