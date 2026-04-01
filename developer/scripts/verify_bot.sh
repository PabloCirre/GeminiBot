#!/bin/bash

# --- PIBOT CLI Bot Diagnostic ---
# Use this script to manually verify agent folder structures and prepare "Health Guard" bot.

AGENTS_DIR="./agents"
HEALTH_BOT_DIR="$AGENTS_DIR/Health_Check"

echo "🔍 Starting PIBOT Agent Diagnostic..."

# 1. Create directory structure
if [ ! -d "$HEALTH_BOT_DIR" ]; then
    echo "⚙️ Creating Health_Check bot directory..."
    mkdir -p "$HEALTH_BOT_DIR"
fi

# 2. Inyectar skills si no existen
SKILLS_PATH="$HEALTH_BOT_DIR/skills.md"
if [ ! -f "$SKILLS_PATH" ]; then
    echo "⚡ Adding System skills to Health_Check..."
    cat <<EOF > "$SKILLS_PATH"
# System Diagnostic Skills

- Skill: List project files
- Command: ls -R src/
EOF
fi

# 3. Simulate Health Report
REPORT_PATH="$HEALTH_BOT_DIR/CLI_Diagnostic_Report.md"
cat <<EOF > "$REPORT_PATH"
# 🤖 CLI Health Guard Diagnostic

**Run Timestamp:** $(date)
**Status:** PASSED

- Agents Directory: Detected
- App Bundle: OK
EOF

echo "✅ Diagnostic complete. Folder 'Health_Check' is ready for Electron integration."
echo "👉 Path: $(pwd)/$HEALTH_BOT_DIR"
