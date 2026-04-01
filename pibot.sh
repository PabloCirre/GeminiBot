#!/bin/bash
# PIBOT CLI Wrapper
# Usage: ./pibot <command>

node "$(dirname "$0")/developer/scripts/pibot.js" "$@"
