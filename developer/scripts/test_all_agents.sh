#!/bin/bash
# PIBOT Agent Test Suite (CLI)
# This script executes all agents found in the /agents/ directory via the agent_handler.js.

AGENTS_DIR="/Users/pablocirre/Desktop/GeminiBot/agents"
HANDLER="/Users/pablocirre/Desktop/GeminiBot/developer/src/agent_handler.js"

echo "🚀 Starting PIBOT Agent Mass Execution..."
echo "----------------------------------------"

for agent in $(ls "$AGENTS_DIR"); do
    agent_path="$AGENTS_DIR/$agent"
    if [ -d "$agent_path" ]; then
        echo "[RUNNING] Agent: $agent"
        # Run the handler with dummy ID-timestamp and the actual folder
        node "$HANDLER" "test_run_$(date +%s)" "$agent_path" "Verify autonomous health." | grep -E "status|findings"
        echo "----------------------------------------"
    fi
done

echo "✅ CLI Mass Execution Complete."
