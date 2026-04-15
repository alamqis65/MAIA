# Configuration Guide

This service supports pluggable Large Language Model (LLM) providers and flexible prompt / generation settings.

## Configuration Options

### 1. Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

### 2. Provider & AI Model Configuration

Select a provider:
```
LLM_PROVIDER=gemini | openai | deepseek
```

Generic overrides (apply to any provider if set):

| Variable | Description |
|----------|-------------|
| `LLM_MODEL` | Overrides provider default model |
| `LLM_TEMPERATURE` | Temperature / randomness |
| `LLM_MAX_TOKENS` | Maximum output tokens (provider permitting) |
| `LLM_TOP_P` | Nucleus sampling (top-p) |
| `LLM_TOP_K` | Top-k (ignored by OpenAI / DeepSeek) |

Provider-specific variables (used if generic not set):

#### Gemini
- `GEMINI_API_KEY` (required when provider=gemini)
- `GEMINI_MODEL` (default: gemini-1.5-pro)
- `GEMINI_TEMPERATURE`, `GEMINI_MAX_TOKENS`, `GEMINI_TOP_P`, `GEMINI_TOP_K`

#### OpenAI
- `OPENAI_API_KEY` (required when provider=openai)
- `OPENAI_MODEL` (default: gpt-4o-mini)
- `OPENAI_TEMPERATURE`, `OPENAI_MAX_TOKENS`, `OPENAI_TOP_P`

#### DeepSeek
- `DEEPSEEK_API_KEY` (required when provider=deepseek)
- `DEEPSEEK_MODEL` (default: deepseek-chat)
- `DEEPSEEK_TEMPERATURE`, `DEEPSEEK_MAX_TOKENS`, `DEEPSEEK_TOP_P`

Fallback order for each parameter:
1. Generic `LLM_*`
2. Provider-specific env var
3. Built-in default

### 3. System Prompt Configuration

Two options for configuring the system prompt:

#### Option A: Environment Variable
```bash
SYSTEM_PROMPT="Your custom system prompt here"
```

#### Option B: External File (Recommended)
```bash
SYSTEM_PROMPT_FILE=./prompts/system-prompt.md
```

The file-based approach is recommended for:
- Version control of prompts
- Easy editing without code changes
- Multi-line prompts
- Collaborative prompt development

### 4. Prompt Development

1. Edit `prompts/system-prompt.md` for your custom prompt
2. Use markdown formatting for better readability
3. Test changes without redeploying code
4. Version control your prompt improvements

### 5. Runtime Configuration

The service logs its configuration on startup:
```
AI Configuration: {
  model: "gemini-1.5-pro",
  temperature: 0.1,
  maxTokens: undefined,
  promptSource: "file"
}
```

## Benefits

- **Flexibility**: Easy to modify AI behavior without code changes
- **Environment-specific**: Different prompts for dev/staging/production
- **Version Control**: Track prompt evolution
- **Hot Reload**: Restart service to apply new configurations
- **Collaboration**: Non-developers can improve prompts