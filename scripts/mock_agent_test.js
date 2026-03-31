/**
 * GeminiBot UI Mock Simulator
 * Paste this into Electron DevTools (Cmd+Option+I) to test the Shell UI.
 */
function simulateAgentAction() {
    const mockAgent = savedAgents.find(a => a.name === "UX Auditor") || savedAgents[0];
    if (!mockAgent) {
        console.error("No agents found. Click 'Initialize UX Demo' first!");
        return;
    }

    console.log("🚀 Simulating Proactive Agent Response for:", mockAgent.name);

    // Mock successful API response with SHELL and MEMORY tags
    const mockOutput = `
I have analyzed index.html and found that the padding in the header is inconsistent. 
I propose a fix using a simple shell command to back up the file.

<SHELL>cp index.html index.html.bak</SHELL>

<AGENT_MEMORY>
Memory updated: Working on UI tweaks and consistency.
</AGENT_MEMORY>
`;

    // Process like the real executeAgentJob() logic
    const memoryMatch = mockOutput.match(/<AGENT_MEMORY>([\s\S]*?)<\/AGENT_MEMORY>/i);
    const shellMatch = mockOutput.match(/<SHELL>([\s\S]*?)<\/SHELL>/i);

    if (shellMatch) {
       mockAgent.pendingCommand = shellMatch[1].trim();
       console.log("✅ Shell command detected:", mockAgent.pendingCommand);
    }
    
    // Save state
    mockAgent.lastOutput = "/Fake/Path/Report.md";
    localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
    
    // Refresh UI
    renderAgents();
    
    console.log("✨ UI Updated! Look at the agent card in the Agents panel.");
}

simulateAgentAction();
