""" application entrypoint: constructs the Transcriber service app and router. """

import logging, sys

logging.basicConfig(
    level=logging.INFO,
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler("transcriber.log", encoding="utf-8"),
    ],
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from router import router as transcriber_router

def create_app() -> FastAPI:
    app = FastAPI(title="Transcriber")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(transcriber_router)
    return app

app = create_app()
