from fastapi import FastAPI

from app.models.schema import TranslationRequest, TranslationResult
from app.services.translator import translate_schema

app = FastAPI(title="Data Plier Schema Translator", version="0.1.0")


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"service": "schema-translator", "status": "ok"}


@app.post("/translate", response_model=TranslationResult)
def translate(request: TranslationRequest) -> TranslationResult:
    return translate_schema(request)

