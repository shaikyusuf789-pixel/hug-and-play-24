## Speeding up Jerry (AI Assistant) with GPT-4o-mini

The goal is to make Jerry's responses significantly faster by switching to OpenAI's `gpt-4o-mini` model and optimizing the way context is loaded. Instead of reading the entire app biography and neural scheme on every request, Jerry will now use tools to fetch specific information only when needed.

### 1. Refactor AI Assistant Edge Function
- **Change Model**: Switch from Gemini to OpenAI's `gpt-4o-mini`. This model is extremely fast and cost-effective.
- **Slim Down System Prompt**: Remove the hardcoded Biography and Neural Scheme from the initial prompt to reduce latency and token usage.
- **Add Targeted Knowledge Tools**:
    - `get_app_biography`: Fetches the "app_biography" and "neural_scheme" from the database on demand.
    - `read_ui_spec`: Reads the `docs/UI_SPEC.md` file when the user asks about the app's structure or UI details.
    - `get_table_schema`: Provides summaries of the database tables when Jerry needs to answer questions about the data structure.
- **Update Logic**: Jerry will start with a minimal context and proactively call these tools if a question requires deep app knowledge.

### 2. Implementation Steps
- Update `supabase/functions/ai-assistant/index.ts`:
    - Switch the API endpoint to OpenAI.
    - Update the `requestBody` to follow OpenAI's format.
    - Add the new context-fetching tools to the `handleToolCall` logic.
    - Update the system prompt to instruct Jerry on when to use these new tools.
- Deploy the updated function.

### Technical Details
- **Model**: `gpt-4o-mini`
- **Secrets**: Uses `OPENAI_API_KEY` (already configured in the project).
- **Tooling**: Added `get_app_biography`, `read_ui_spec`, and `get_table_schema`.
