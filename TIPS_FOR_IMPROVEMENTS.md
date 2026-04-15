### Operations & Performance Tips
	•	Run Whisper small for CPU; upgrade to medium/large if GPU is available.
	•	Limit audio size in frontend (e.g. ≤ 20 MB) or implement streaming chunks.
	•	Observability: add x-request-id in gateway, log transcribe/compose duration, and trace mapping between services.

⸻

### Endpoint Summary
	•	POST http://localhost:7010/transcriber/transcribe (multipart: audio, fields: language, publish)
	•	POST ${GATEWAY}/pipeline/soapi body:

{ "transcript": "...", "patient": { "displayId": "P-0001" }, "language": "id" }

⸻

### Security Checklist (initial)
	•	HTTPS on all hops; reverse proxy in front.
	•	Rate limiting & auth in gateway.
	•	Don't log PHI; use hashing for file ids.
	•	Separate RabbitMQ vhost per environment (dev/staging/prod).
